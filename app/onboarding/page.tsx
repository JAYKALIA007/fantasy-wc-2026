import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import OnboardingClient from "./onboarding-client";

export default async function OnboardingPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/join");
  }

  // Check if already onboarded
  const { data: membership } = await supabase
    .from("league_members")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (membership) {
    redirect("/");
  }

  // Fetch league
  const { data: league } = await supabase
    .from("leagues")
    .select("id, name, max_players")
    .eq("invite_code", "wc2026")
    .single();

  // Fetch all avatars
  const { data: avatars } = await supabase
    .from("avatars")
    .select("id, footballer_name, initials, nation, position")
    .order("footballer_name");

  // Fetch taken avatar IDs in this league
  const { data: takenRows } = await supabase
    .from("league_members")
    .select("avatar_id")
    .eq("league_id", league?.id ?? "");

  const takenAvatarIds = new Set(
    (takenRows ?? []).map((r) => r.avatar_id as string)
  );

  const { data: memberCount } = await supabase
    .from("league_members")
    .select("id", { count: "exact" })
    .eq("league_id", league?.id ?? "");

  return (
    <OnboardingClient
      userEmail={user.email ?? ""}
      userId={user.id}
      league={league ?? { id: "", name: "Jay's League", max_players: 15 }}
      avatars={avatars ?? []}
      initialTakenAvatarIds={Array.from(takenAvatarIds)}
      memberCount={memberCount?.length ?? 0}
    />
  );
}
