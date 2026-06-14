import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import OnboardingClient from "./onboarding-client";

export default async function OnboardingPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/join");

  const { data: membership } = await supabase
    .from("league_members")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (membership) redirect("/");

  const inviteCode = process.env.NEXT_PUBLIC_LEAGUE_INVITE_CODE ?? "";
  const { data: league } = await supabase
    .from("leagues")
    .select("id, name, max_players")
    .eq("invite_code", inviteCode)
    .single();

  const { data: nations } = await supabase
    .from("nations")
    .select("id, name, fifa_ranking")
    .order("fifa_ranking", { ascending: true });

  const { data: memberRows } = await supabase
    .from("league_members")
    .select("id, secondary_nation_id", { count: "exact" })
    .eq("league_id", league?.id ?? "");

  const takenWildcardIds = (memberRows ?? [])
    .map((m) => m.secondary_nation_id as number | null)
    .filter((id): id is number => id !== null);

  return (
    <OnboardingClient
      userEmail={user.email ?? ""}
      userId={user.id}
      league={league ?? { id: "", name: "WC 2026 League", max_players: 15 }}
      nations={nations ?? []}
      memberCount={memberRows?.length ?? 0}
      takenWildcardIds={takenWildcardIds}
    />
  );
}
