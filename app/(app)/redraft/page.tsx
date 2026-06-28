import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import RedraftClient from "./redraft-client";
import { ROUND_IDS, RO32_PRIMARY_POOL_SIZE } from "@/lib/constants";

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

  // RO32 re-draft window must be open for this league.
  const { data: win } = await supabase
    .from("redraft_windows")
    .select("status, closes_at")
    .eq("league_id", leagueId)
    .eq("round_id", ROUND_IDS.ro32)
    .maybeSingle();

  const windowOpen =
    !!win &&
    win.status === "open" &&
    (!win.closes_at || new Date() < new Date(win.closes_at as string));

  // Survivor pools, ordered by FIFA ranking.
  const { data: survivorsRaw } = await supabase
    .from("nations")
    .select("id, name, fifa_ranking")
    .eq("eliminated", false)
    .order("fifa_ranking", { ascending: true });
  const survivors = (survivorsRaw ?? []) as Nation[];
  const primaryPool = survivors.slice(0, RO32_PRIMARY_POOL_SIZE);
  const secondaryPool = survivors.slice(RO32_PRIMARY_POOL_SIZE);

  // Current holding for RO32 (if already submitted) else the original picks.
  const { data: held } = await supabase
    .from("member_round_teams")
    .select("primary_nation_id, secondary_nation_id")
    .eq("league_member_id", membership.id)
    .eq("round_id", ROUND_IDS.ro32)
    .maybeSingle();

  const originalPrimary = membership.primary_nation_id as number | null;
  const originalSecondary = membership.secondary_nation_id as number | null;
  const currentPrimary = (held?.primary_nation_id as number | null) ?? originalPrimary;
  const currentSecondary = (held?.secondary_nation_id as number | null) ?? originalSecondary;

  // A pre-selected secondary is only valid if it is still in the secondary pool
  // (e.g. Mexico moved to the primary pool → forced free repick).
  const secondaryPoolIds = new Set(secondaryPool.map((n) => n.id));
  const presetSecondary = currentSecondary != null && secondaryPoolIds.has(currentSecondary) ? currentSecondary : null;

  return (
    <RedraftClient
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
