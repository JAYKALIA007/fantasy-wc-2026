import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ESPN name overrides — only add entries where ESPN's displayName actually differs from our DB name
// Verified against ESPN scoreboard API June 2026: Türkiye, Ivory Coast, Bosnia-Herzegovina, United States all match our DB names directly
const ESPN_NAME_MAP: Record<string, string> = {
  "Congo DR": "DR Congo", // unconfirmed — verify when Congo DR plays
};

function toEspnName(name: string): string {
  return ESPN_NAME_MAP[name] ?? name;
}

interface Nation {
  name: string;
}

interface Match {
  id: number;
  kickoff_time: string;
  home_nation: Nation | Nation[] | null;
  away_nation: Nation | Nation[] | null;
}

interface EspnCompetitor {
  team: { displayName: string; shortDisplayName: string };
  homeAway: string;
  score: string;
}

interface EspnEvent {
  competitions: Array<{
    competitors: EspnCompetitor[];
    status: { type: { completed: boolean } };
  }>;
}

function toDateStr(d: Date): string {
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
}

async function fetchEspnEvents(dateStr: string): Promise<EspnEvent[]> {
  const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=${dateStr}`;
  try {
    const res = await fetch(url, { headers: { "User-Agent": "fantasy-wc-2026/1.0" } });
    if (!res.ok) return [];
    const data = await res.json() as { events?: EspnEvent[] };
    return data.events ?? [];
  } catch {
    return [];
  }
}

function findScoreInEvents(
  events: EspnEvent[],
  espnHome: string,
  espnAway: string
): { home: number; away: number } | null {
  for (const event of events) {
    for (const competition of event.competitions ?? []) {
      if (!competition.status?.type?.completed) continue;

      const competitors = competition.competitors ?? [];
      const home = competitors.find((c) => c.homeAway === "home");
      const away = competitors.find((c) => c.homeAway === "away");
      if (!home || !away) continue;

      const homeName = (home.team.displayName ?? home.team.shortDisplayName ?? "").toLowerCase();
      const awayName = (away.team.displayName ?? away.team.shortDisplayName ?? "").toLowerCase();

      if (homeName.includes(espnHome) || espnHome.includes(homeName)) {
        if (awayName.includes(espnAway) || espnAway.includes(awayName)) {
          return {
            home: parseInt(home.score, 10),
            away: parseInt(away.score, 10),
          };
        }
      }
    }
  }
  return null;
}

async function fetchEspnScore(
  homeTeam: string,
  awayTeam: string,
  kickoffDate: string
): Promise<{ home: number; away: number } | null> {
  const d = new Date(kickoffDate);
  const espnHome = toEspnName(homeTeam).toLowerCase();
  const espnAway = toEspnName(awayTeam).toLowerCase();

  // Try the UTC kickoff date first, then the previous day — ESPN sometimes lists
  // early-UTC matches (e.g. 02:00 UTC) under the prior calendar day in US local time.
  const datesToTry = [toDateStr(d), toDateStr(new Date(d.getTime() - 24 * 60 * 60 * 1000))];

  for (const dateStr of datesToTry) {
    const events = await fetchEspnEvents(dateStr);
    const score = findScoreInEvents(events, espnHome, espnAway);
    if (score) return score;
  }

  return null;
}

serve(async (_req: Request) => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceKey) {
    return new Response(JSON.stringify({ error: "Missing env vars" }), { status: 500 });
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  const now = new Date();
  // Find matches where kickoff + 2h15m has passed and not yet finished
  const cutoff = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString();

  const { data: matches, error } = await supabase
    .from("matches")
    .select(`
      id, kickoff_time,
      home_nation:home_nation_id(name),
      away_nation:away_nation_id(name)
    `)
    .neq("status", "finished")
    .lte("kickoff_time", cutoff);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  if (!matches || matches.length === 0) {
    return new Response(JSON.stringify({ message: "No matches to score", processed: 0 }), { status: 200 });
  }

  const results: Array<{ match_id: number; result: string }> = [];

  for (const match of matches as Match[]) {
    const homeNation = Array.isArray(match.home_nation) ? match.home_nation[0] : match.home_nation;
    const awayNation = Array.isArray(match.away_nation) ? match.away_nation[0] : match.away_nation;

    if (!homeNation || !awayNation) {
      results.push({ match_id: match.id, result: "skipped: missing nation data" });
      continue;
    }

    const score = await fetchEspnScore(homeNation.name, awayNation.name, match.kickoff_time);

    if (!score) {
      results.push({ match_id: match.id, result: "skipped: score not available on ESPN yet" });
      continue;
    }

    if (isNaN(score.home) || isNaN(score.away)) {
      results.push({ match_id: match.id, result: "skipped: invalid score from ESPN" });
      continue;
    }

    // Apply the same scoring logic as the admin API
    const { error: updateErr } = await supabase
      .from("matches")
      .update({ home_score: score.home, away_score: score.away, status: "finished", auto_fetched: true })
      .eq("id", match.id);

    if (updateErr) {
      results.push({ match_id: match.id, result: `error: ${updateErr.message}` });
      continue;
    }

    // Score predictions
    const { data: predictions } = await supabase
      .from("predictions")
      .select("id")
      .eq("match_id", match.id);

    for (const pred of predictions ?? []) {
      await supabase.rpc("score_prediction", { p_id: pred.id as string });
    }

    // Nation bonus points — fetch all leagues and their members
    const { data: leagues } = await supabase.from("leagues").select("id");

    for (const league of leagues ?? []) {
      const { data: leagueMembers } = await supabase
        .from("league_members")
        .select("id, primary_nation_id, secondary_nation_id")
        .eq("league_id", league.id as string);

      const { data: matchRow } = await supabase
        .from("matches")
        .select("home_nation_id, away_nation_id")
        .eq("id", match.id)
        .single();

      if (!matchRow) continue;

      const homeNationId = matchRow.home_nation_id as number;
      const awayNationId = matchRow.away_nation_id as number;
      const homeWin = score.home > score.away;
      const awayWin = score.away > score.home;
      const draw = score.home === score.away;
      const homePoints = homeWin ? 3 : draw ? 1 : 0;
      const awayPoints = awayWin ? 3 : draw ? 1 : 0;

      await supabase.from("nation_bonus_points").delete().eq("match_id", match.id);

      const bonusRecords: { league_member_id: string; match_id: number; nation_id: number; pick_type: string; points: number }[] = [];
      for (const member of leagueMembers ?? []) {
        const primary = member.primary_nation_id as number | null;
        const secondary = member.secondary_nation_id as number | null;

        if (primary !== null) {
          const pts = primary === homeNationId ? homePoints : primary === awayNationId ? awayPoints : 0;
          if (pts > 0) bonusRecords.push({ league_member_id: member.id, match_id: match.id, nation_id: primary, pick_type: "primary", points: pts });
        }
        if (secondary !== null) {
          const pts = secondary === homeNationId ? homePoints * 2 : secondary === awayNationId ? awayPoints * 2 : 0;
          if (pts > 0) bonusRecords.push({ league_member_id: member.id, match_id: match.id, nation_id: secondary, pick_type: "secondary", points: pts });
        }
      }

      if (bonusRecords.length > 0) {
        await supabase.from("nation_bonus_points").insert(bonusRecords);
      }
    }

    results.push({ match_id: match.id, result: `scored ${score.home}-${score.away}` });
  }

  return new Response(JSON.stringify({ processed: results.length, results }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
