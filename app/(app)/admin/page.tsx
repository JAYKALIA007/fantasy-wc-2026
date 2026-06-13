import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AdminClient } from "./admin-client";

interface LeagueMember {
  id: string;
  user_id: string;
  profile_name: string;
  joined_at: string;
  avatars: { initials: string; position: string } | null;
}

interface TransferWindow {
  id: string;
  round_id: string;
  window_number: number;
  opens_at: string;
  closes_at: string;
  manually_triggered: boolean;
}

export default async function AdminPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/join");
  }

  // Find the league this user created
  const { data: league } = await supabase
    .from("leagues")
    .select("id, name, invite_code, invite_closed, creator_id")
    .eq("creator_id", user.id)
    .maybeSingle();

  if (!league) {
    redirect("/");
  }

  // Get members
  const { data: membersRaw } = await supabase
    .from("league_members")
    .select("id, user_id, profile_name, joined_at, avatars(initials, position)")
    .eq("league_id", league.id)
    .order("joined_at", { ascending: true });

  const members: LeagueMember[] = (membersRaw ?? []).map((m) => {
    const avatarRaw = m.avatars as unknown;
    const avatar =
      avatarRaw && !Array.isArray(avatarRaw)
        ? (avatarRaw as { initials: string; position: string })
        : Array.isArray(avatarRaw) && (avatarRaw as unknown[]).length > 0
        ? (avatarRaw as { initials: string; position: string }[])[0]
        : null;
    return {
      id: m.id as string,
      user_id: m.user_id as string,
      profile_name: m.profile_name as string,
      joined_at: m.joined_at as string,
      avatars: avatar,
    };
  });

  // Get transfer windows for R16
  const R16_ROUND_ID = "a0000000-0000-0000-0000-000000000002";
  const { data: windowsRaw } = await supabase
    .from("transfer_windows")
    .select("id, round_id, window_number, opens_at, closes_at, manually_triggered")
    .eq("round_id", R16_ROUND_ID)
    .order("opens_at", { ascending: true });

  const windows: TransferWindow[] = (windowsRaw ?? []) as TransferWindow[];

  const now = new Date();
  const activeWindow = windows.find(
    (w) => new Date(w.opens_at) <= now && new Date(w.closes_at) >= now
  );

  // inviteUrl is computed client-side in AdminClient using window.location.origin
  const inviteCodePath = `/join?code=${league.invite_code}`;

  return (
    <AdminClient
      league={{
        id: league.id as string,
        name: league.name as string,
        invite_code: league.invite_code as string,
        invite_closed: league.invite_closed as boolean,
        creator_id: league.creator_id as string,
      }}
      members={members}
      activeWindow={activeWindow ?? null}
      r16RoundId={R16_ROUND_ID}
      currentUserId={user.id}
      inviteUrl={inviteCodePath}
    />
  );
}
