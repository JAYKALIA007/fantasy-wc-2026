import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import RedraftClient from "./redraft-client";
import { ROUND_IDS, RO32_PRIMARY_POOL_SIZE } from "@/lib/constants";
import { holdingForRound, type HoldingRow } from "@/lib/server/holdings";

type Nation = { id: number; name: string; fifa_ranking: number | null };

export default async function RedraftPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/join");

  const { data: membership } = await supabase
    .from("league_members")
    .select("id, league_id, primary_nation_id, secondary_nation_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!membership) redirect("/onboarding");

  const leagueId = membership.league_id as string;

  // Pick whichever re-draft window is currently open, preferring the later round.
  const { data: windows } = await supabase
    .from("redraft_windows")
    .select("round_id, status, closes_at")
    .eq("league_id", leagueId)
    .eq("status", "open");
  const isOpen = (w: { closes_at: string | null }) => !w.closes_at || new Date() < new Date(w.closes_at);
  const r16Win = (windows ?? []).find((w) => w.round_id === ROUND_IDS.r16 && isOpen(w));
  const ro32Win = (windows ?? []).find((w) => w.round_id === ROUND_IDS.ro32 && isOpen(w));
  const activeRound: "r16" | "ro32" = r16Win ? "r16" : "ro32";
  const win = r16Win ?? ro32Win ?? null;
  const windowOpen = !!win;

  // Survivor pool, ordered by FIFA ranking.
  const { data: survivorsRaw } = await supabase
    .from("nations")
    .select("id, name, fifa_ranking")
    .eq("eliminated", false)
    .order("fifa_ranking", { ascending: true });
  const survivors = (survivorsRaw ?? []) as Nation[];

  const originalPrimary = membership.primary_nation_id as number | null;
  const originalSecondary = membership.secondary_nation_id as number | null;

  // --- R16: single team, any survivor, −5 to switch to a team you didn't hold ---
  if (activeRound === "r16") {
    const { data: holdings } = await supabase
      .from("member_round_teams")
      .select("round_id, primary_nation_id, secondary_nation_id")
      .eq("league_member_id", membership.id);
    // Team carried into R16 = sticky holding (RO32 primary, or an explicit R16 pick).
    const carried = holdingForRound(
      { primary_nation_id: originalPrimary, secondary_nation_id: originalSecondary },
      (holdings ?? []) as HoldingRow[],
      ROUND_IDS.r16
    );
    return (
      <RedraftClient
        round="r16"
        leagueId={leagueId}
        windowOpen={windowOpen}
        closesAt={(win?.closes_at as string | null) ?? null}
        primaryPool={survivors}
        secondaryPool={[]}
        originalPrimary={carried.primary_nation_id}
        currentPrimary={carried.primary_nation_id}
        presetSecondary={null}
        secondaryInvalidated={false}
      />
    );
  }

  // --- RO32: two pools (primary top-12, secondary rest), secondary switch free ---
  const primaryPool = survivors.slice(0, RO32_PRIMARY_POOL_SIZE);
  const secondaryPool = survivors.slice(RO32_PRIMARY_POOL_SIZE);

  const { data: held } = await supabase
    .from("member_round_teams")
    .select("primary_nation_id, secondary_nation_id")
    .eq("league_member_id", membership.id)
    .eq("round_id", ROUND_IDS.ro32)
    .maybeSingle();

  const currentPrimary = (held?.primary_nation_id as number | null) ?? originalPrimary;
  const currentSecondary = (held?.secondary_nation_id as number | null) ?? originalSecondary;
  const secondaryPoolIds = new Set(secondaryPool.map((n) => n.id));
  const presetSecondary = currentSecondary != null && secondaryPoolIds.has(currentSecondary) ? currentSecondary : null;

  return (
    <RedraftClient
      round="ro32"
      leagueId={leagueId}
      windowOpen={windowOpen}
      closesAt={(win?.closes_at as string | null) ?? null}
      primaryPool={primaryPool}
      secondaryPool={secondaryPool}
      originalPrimary={originalPrimary}
      currentPrimary={currentPrimary}
      presetSecondary={presetSecondary}
      secondaryInvalidated={currentSecondary != null && presetSecondary === null}
    />
  );
}
