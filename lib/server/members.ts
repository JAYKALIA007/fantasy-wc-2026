// Shared league-member map building.
//
// Several leaderboard-style views need the same three lookups off the raw
// `league_members` rows: translate a league_member.id → user_id (nation bonus
// points are keyed by member id), find a member's info by user_id, and list the
// member ids for an `.in(...)` query. This was duplicated identically in
// computeLeaderboard and the home page; both now call buildMemberMaps.
//
// The admin (league creator) is excluded — they never appear on leaderboards.

export interface LeagueMemberRow {
  id: string;
  user_id: string;
  profile_name: string;
  joined_at: string;
  primary_nation_id?: number | null;
}

export interface MemberMaps<T extends LeagueMemberRow = LeagueMemberRow> {
  // Admin-excluded member rows, in source order.
  members: T[];
  // league_member.id → auth user_id
  memberIdToUserId: Map<string, string>;
  // user_id → full member row
  memberInfoByUserId: Map<string, T>;
  // league_member.id list (for `.in("league_member_id", memberIds)`)
  memberIds: string[];
}

export function buildMemberMaps<T extends LeagueMemberRow>(
  rawMembers: T[] | null | undefined,
  adminUserId: string | null
): MemberMaps<T> {
  const members = (rawMembers ?? []).filter((m) => m.user_id !== adminUserId);

  const memberIdToUserId = new Map<string, string>();
  const memberInfoByUserId = new Map<string, T>();
  for (const m of members) {
    memberIdToUserId.set(m.id, m.user_id);
    memberInfoByUserId.set(m.user_id, m);
  }

  return {
    members,
    memberIdToUserId,
    memberInfoByUserId,
    memberIds: Array.from(memberIdToUserId.keys()),
  };
}
