import { createClient } from "@/lib/supabase/server";
import { ROUND_IDS, RO32_PRIMARY_POOL_SIZE } from "@/lib/constants";
import { computeRedraft, type RedraftRound } from "@/lib/server/redraft";

const REDRAFT_ROUNDS: RedraftRound[] = ["ro32", "r16", "qf", "sf", "final"];

interface RedraftBody {
  league_id: string;
  round: RedraftRound;
  primary_nation_id: number;
  secondary_nation_id?: number | null;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: RedraftBody;
  try {
    body = (await request.json()) as RedraftBody;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { league_id: leagueId, round, primary_nation_id, secondary_nation_id } = body;
  if (!leagueId || !round || typeof primary_nation_id !== "number") {
    return Response.json({ error: "league_id, round, and primary_nation_id are required" }, { status: 400 });
  }
  if (!REDRAFT_ROUNDS.includes(round)) {
    return Response.json({ error: "Invalid round" }, { status: 400 });
  }
  const roundId = ROUND_IDS[round];

  // Window must be open and not past its close time.
  const { data: win } = await supabase
    .from("redraft_windows")
    .select("status, closes_at")
    .eq("league_id", leagueId)
    .eq("round_id", roundId)
    .maybeSingle();
  if (!win || win.status !== "open") {
    return Response.json({ error: "Re-draft window is not open" }, { status: 403 });
  }
  if (win.closes_at && new Date() >= new Date(win.closes_at as string)) {
    return Response.json({ error: "Re-draft window has closed" }, { status: 403 });
  }

  const { data: member } = await supabase
    .from("league_members")
    .select("id, primary_nation_id, secondary_nation_id")
    .eq("league_id", leagueId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!member) {
    return Response.json({ error: "Not a member of this league" }, { status: 403 });
  }

  // Pools: survivors ordered by FIFA ranking. Top N = primary pool, rest = secondary.
  const { data: survivors } = await supabase
    .from("nations")
    .select("id, fifa_ranking")
    .eq("eliminated", false)
    .order("fifa_ranking", { ascending: true });
  const survivorIds = (survivors ?? []).map((n) => n.id as number);
  const primaryPool = new Set(survivorIds.slice(0, RO32_PRIMARY_POOL_SIZE));
  const secondaryPool = new Set(survivorIds.slice(RO32_PRIMARY_POOL_SIZE));

  // Baseline: at RO32 it is the original onboarding picks; at later rounds it is
  // the team carried in from the previous round's holding.
  let baseline = { primary_nation_id: member.primary_nation_id as number | null, secondary_nation_id: member.secondary_nation_id as number | null };
  let pools: { primary: Set<number>; secondary?: Set<number> } = { primary: primaryPool, secondary: secondaryPool };
  if (round !== "ro32") {
    // The penalty baseline is the team carried INTO this round, which must be
    // IMMUTABLE across re-submissions — never the current round's own (mutable)
    // holding, or the reference drifts on every save (switch-back stops being free,
    // and the −5 can be dodged by re-saving the same team).
    const survivorSet = new Set(survivorIds);
    let carried: number | null;
    if (round === "r16") {
      // Collapse: the surviving RO32-held team — primary if alive, else the
      // surviving secondary. Derived from RO32 holdings + eliminations, so stable.
      const { data: ro32Row } = await supabase
        .from("member_round_teams")
        .select("primary_nation_id, secondary_nation_id")
        .eq("league_member_id", member.id)
        .eq("round_id", ROUND_IDS.ro32)
        .maybeSingle();
      const ro32Primary = (ro32Row?.primary_nation_id as number | null) ?? (member.primary_nation_id as number | null);
      const ro32Secondary = (ro32Row?.secondary_nation_id as number | null) ?? (member.secondary_nation_id as number | null);
      carried =
        ro32Primary != null && survivorSet.has(ro32Primary)
          ? ro32Primary
          : ro32Secondary != null && survivorSet.has(ro32Secondary)
            ? ro32Secondary
            : ro32Primary;
    } else {
      // QF onward: the single team carried from the PREVIOUS round (latest holding
      // from any round other than this one — the current round's row is mutable).
      const { data: prior } = await supabase
        .from("member_round_teams")
        .select("primary_nation_id")
        .eq("league_member_id", member.id)
        .neq("round_id", roundId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      carried = (prior?.primary_nation_id as number | null) ?? (member.primary_nation_id as number | null);
    }
    baseline = { primary_nation_id: carried, secondary_nation_id: null };
    pools = { primary: survivorSet };
  }

  const result = computeRedraft(round, baseline, { primary_nation_id, secondary_nation_id }, pools);
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: 400 });
  }

  const now = new Date().toISOString();
  const { error: holdErr } = await supabase.from("member_round_teams").upsert(
    {
      league_member_id: member.id,
      round_id: roundId,
      primary_nation_id: result.holding.primary_nation_id,
      secondary_nation_id: result.holding.secondary_nation_id,
      primary_swapped: result.holding.primary_swapped,
      secondary_swapped: result.holding.secondary_swapped,
      updated_at: now,
    },
    { onConflict: "league_member_id,round_id" }
  );
  if (holdErr) {
    return Response.json({ error: holdErr.message }, { status: 500 });
  }

  // End-state diff: clear this round's penalties and re-write from the result.
  await supabase.from("swap_penalties").delete().eq("league_member_id", member.id).eq("round_id", roundId);
  if (result.penalties.length > 0) {
    const { error: penErr } = await supabase.from("swap_penalties").insert(
      result.penalties.map((p) => ({
        league_member_id: member.id,
        round_id: roundId,
        pick_type: p.pick_type,
        amount: p.amount,
      }))
    );
    if (penErr) {
      return Response.json({ error: penErr.message }, { status: 500 });
    }
  }

  return Response.json({ success: true, penalties: result.penalties, holding: result.holding }, { status: 200 });
}
