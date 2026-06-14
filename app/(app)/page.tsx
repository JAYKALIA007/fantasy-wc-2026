import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { FifaCard } from "@/components/fifa-card";
import type { CardType } from "@/components/fifa-card";

interface Nation {
  id: number;
  name: string;
  flag_code: string;
}

interface Match {
  id: number;
  kickoff_time: string;
  home_nation: Nation;
  away_nation: Nation;
}

function toIST(utcDate: string): string {
  const d = new Date(utcDate);
  const istMs = d.getTime() + 5.5 * 60 * 60 * 1000;
  const ist = new Date(istMs);
  const hh = ist.getUTCHours().toString().padStart(2, "0");
  const mm = ist.getUTCMinutes().toString().padStart(2, "0");
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${ist.getUTCDate()} ${months[ist.getUTCMonth()]} · ${hh}:${mm} IST`;
}

function formatCountdown(kickoffUtc: string): string {
  const diff = new Date(kickoffUtc).getTime() - Date.now();
  const totalMin = Math.floor(diff / 1000 / 60);
  if (totalMin <= 0) return "Starting soon";
  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  if (hours >= 24) {
    return `${Math.floor(hours / 24)}d ${hours % 24}h`;
  }
  return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
}

function FlagChip({ code }: { code: string }) {
  return (
    <div
      style={{
        padding: "5px 10px",
        borderRadius: 8,
        background: "rgba(255,255,255,0.12)",
        borderLeft: "3px solid var(--g3)",
        fontFamily: "var(--font-saira), sans-serif",
        fontWeight: 800,
        fontSize: 14,
        color: "#fff",
        letterSpacing: 1,
      }}
    >
      {code}
    </div>
  );
}

export default async function HomePage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/join");
  }

  // Check if onboarded
  const { data: membership } = await supabase
    .from("league_members")
    .select("league_id, profile_name, avatar_id, avatars(initials, position, card_type, rating, footballer_name, nation)")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership) {
    redirect("/onboarding");
  }

  const leagueId = membership.league_id as string;

  // Check if user is league creator
  const { data: leagueData } = await supabase
    .from("leagues")
    .select("creator_id")
    .eq("id", leagueId)
    .maybeSingle();

  const isCreator = leagueData?.creator_id === user.id;

  // Get next upcoming match
  const thirtyMinFromNow = new Date(Date.now() + 30 * 60 * 1000).toISOString();

  const { data: nextMatchRaw } = await supabase
    .from("matches")
    .select(
      `id, kickoff_time,
       home_nation:home_nation_id(id, name, flag_code),
       away_nation:away_nation_id(id, name, flag_code)`
    )
    .eq("status", "scheduled")
    .gt("kickoff_time", thirtyMinFromNow)
    .order("kickoff_time", { ascending: true })
    .limit(1)
    .maybeSingle();

  const nextMatch: Match | null = nextMatchRaw
    ? {
        id: nextMatchRaw.id as number,
        kickoff_time: nextMatchRaw.kickoff_time as string,
        home_nation: Array.isArray(nextMatchRaw.home_nation)
          ? (nextMatchRaw.home_nation[0] as Nation)
          : (nextMatchRaw.home_nation as Nation),
        away_nation: Array.isArray(nextMatchRaw.away_nation)
          ? (nextMatchRaw.away_nation[0] as Nation)
          : (nextMatchRaw.away_nation as Nation),
      }
    : null;

  // Get open matches that need predictions
  const { data: openMatchesRaw } = await supabase
    .from("matches")
    .select(
      `id, kickoff_time,
       home_nation:home_nation_id(id, name, flag_code),
       away_nation:away_nation_id(id, name, flag_code)`
    )
    .eq("status", "scheduled")
    .gt("kickoff_time", thirtyMinFromNow)
    .order("kickoff_time", { ascending: true })
    .limit(5);

  const openMatches: Match[] = (openMatchesRaw ?? []).map((m) => ({
    id: m.id as number,
    kickoff_time: m.kickoff_time as string,
    home_nation: Array.isArray(m.home_nation)
      ? (m.home_nation[0] as Nation)
      : (m.home_nation as Nation),
    away_nation: Array.isArray(m.away_nation)
      ? (m.away_nation[0] as Nation)
      : (m.away_nation as Nation),
  }));

  // Get existing predictions count for these open matches
  const openMatchIds = openMatches.map((m) => m.id);
  let predictedCount = 0;
  if (openMatchIds.length > 0) {
    const { count } = await supabase
      .from("predictions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("league_id", leagueId)
      .in("match_id", openMatchIds);
    predictedCount = count ?? 0;
  }
  const unpredictedCount = openMatches.length - predictedCount;

  // Get prediction rank
  const { data: predScore } = await supabase
    .from("prediction_round_scores")
    .select("total_points")
    .eq("user_id", user.id)
    .eq("league_id", leagueId)
    .eq("round_id", "a0000000-0000-0000-0000-000000000002")
    .maybeSingle();

  const { count: higherCount } = await supabase
    .from("prediction_round_scores")
    .select("id", { count: "exact", head: true })
    .eq("league_id", leagueId)
    .eq("round_id", "a0000000-0000-0000-0000-000000000002")
    .gt("total_points", predScore?.total_points ?? -1);

  const predRank = predScore ? (higherCount ?? 0) + 1 : null;

  const { count: totalMembers } = await supabase
    .from("league_members")
    .select("id", { count: "exact", head: true })
    .eq("league_id", leagueId);

  // Get fantasy rank
  const { data: fantasyScore } = await supabase
    .from("fantasy_round_scores")
    .select("total_points")
    .eq("user_id", user.id)
    .eq("league_id", leagueId)
    .eq("round_id", "a0000000-0000-0000-0000-000000000002")
    .maybeSingle();

  const { count: fantasyHigherCount } = await supabase
    .from("fantasy_round_scores")
    .select("id", { count: "exact", head: true })
    .eq("league_id", leagueId)
    .eq("round_id", "a0000000-0000-0000-0000-000000000002")
    .gt("total_points", fantasyScore?.total_points ?? -1);

  const fantasyRank = fantasyScore ? (fantasyHigherCount ?? 0) + 1 : null;

  // Avatar
  type AvatarFields = { initials: string; position: string; card_type: string; rating: number; footballer_name: string; nation: string };
  const avatarRaw = membership.avatars as unknown;
  const avatar =
    avatarRaw && !Array.isArray(avatarRaw)
      ? (avatarRaw as AvatarFields)
      : Array.isArray(avatarRaw) && (avatarRaw as unknown[]).length > 0
      ? (avatarRaw as AvatarFields[])[0]
      : null;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflowY: "auto",
      }}
    >
      {/* App header */}
      <div
        style={{
          background: "var(--n0)",
          padding: "14px 16px 16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              background: "var(--g3)",
              borderRadius: 8,
              padding: "4px 8px",
              fontFamily: "var(--font-anton), sans-serif",
              fontSize: 15,
              color: "#fff",
              letterSpacing: 1,
            }}
          >
            WC
          </div>
          <span
            style={{
              fontFamily: "var(--font-saira), sans-serif",
              fontWeight: 800,
              fontSize: 16,
              color: "#fff",
            }}
          >
            FantasyWC
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "5px 10px",
              borderRadius: 20,
              background: "rgba(255,255,255,0.1)",
              fontFamily: "var(--font-saira), sans-serif",
              fontWeight: 600,
              fontSize: 12,
              color: "rgba(255,255,255,0.85)",
            }}
          >
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: "var(--g3)",
                display: "inline-block",
              }}
            />
            Jay&apos;s League
          </div>
          {isCreator && (
            <Link
              href="/admin"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 34,
                height: 34,
                borderRadius: "50%",
                background: "rgba(255,255,255,0.1)",
                color: "rgba(255,255,255,0.7)",
                textDecoration: "none",
                fontSize: 16,
              }}
              aria-label="Admin settings"
            >
              ⚙
            </Link>
          )}
          {avatar && (
            <FifaCard
              initials={avatar.initials}
              rating={avatar.rating}
              position={avatar.position}
              nation={avatar.nation}
              footballerName={avatar.footballer_name}
              cardType={(avatar.card_type as CardType) ?? "gold"}
              size="sm"
            />
          )}
        </div>
      </div>

      <div style={{ padding: "16px 16px 0", display: "flex", flexDirection: "column", gap: 14 }}>
        {/* Matchday hero card */}
        {nextMatch && (
          <div
            style={{
              background: "var(--n1)",
              borderRadius: 16,
              padding: "18px 16px",
              boxShadow: "var(--sh-md)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 14,
              }}
            >
              <span
                style={{
                  fontFamily: "var(--font-saira), sans-serif",
                  fontWeight: 700,
                  fontSize: 12,
                  color: "rgba(255,255,255,0.5)",
                  textTransform: "uppercase",
                  letterSpacing: 0.8,
                }}
              >
                Round of 16 · Next match
              </span>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                  padding: "3px 9px",
                  borderRadius: 20,
                  background: "rgba(226,59,72,0.18)",
                  color: "var(--r3)",
                  fontFamily: "var(--font-saira), sans-serif",
                  fontWeight: 700,
                  fontSize: 11,
                }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: "var(--r2)",
                    display: "inline-block",
                  }}
                />
                {formatCountdown(nextMatch.kickoff_time)}
              </div>
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 16,
                marginBottom: 16,
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                <FlagChip code={nextMatch.home_nation.flag_code} />
                <span
                  style={{
                    fontFamily: "var(--font-saira), sans-serif",
                    fontWeight: 700,
                    fontSize: 13,
                    color: "rgba(255,255,255,0.8)",
                  }}
                >
                  {nextMatch.home_nation.name}
                </span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                <span
                  style={{
                    fontFamily: "var(--font-anton), sans-serif",
                    fontSize: 28,
                    color: "#fff",
                  }}
                >
                  VS
                </span>
                <span
                  style={{
                    fontFamily: "var(--font-inter), sans-serif",
                    fontSize: 11,
                    color: "rgba(255,255,255,0.4)",
                  }}
                >
                  {toIST(nextMatch.kickoff_time)}
                </span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                <FlagChip code={nextMatch.away_nation.flag_code} />
                <span
                  style={{
                    fontFamily: "var(--font-saira), sans-serif",
                    fontWeight: 700,
                    fontSize: 13,
                    color: "rgba(255,255,255,0.8)",
                  }}
                >
                  {nextMatch.away_nation.name}
                </span>
              </div>
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <Link
                href="/predict"
                style={{
                  flex: 1,
                  padding: "12px 0",
                  borderRadius: 12,
                  background: "var(--g3)",
                  color: "#fff",
                  fontFamily: "var(--font-saira), sans-serif",
                  fontWeight: 700,
                  fontSize: 14,
                  textDecoration: "none",
                  textAlign: "center",
                }}
              >
                Predict score
              </Link>
              <Link
                href="/squad"
                style={{
                  flex: 1,
                  padding: "12px 0",
                  borderRadius: 12,
                  border: "1.5px solid rgba(255,255,255,0.2)",
                  background: "transparent",
                  color: "rgba(255,255,255,0.8)",
                  fontFamily: "var(--font-saira), sans-serif",
                  fontWeight: 700,
                  fontSize: 14,
                  textDecoration: "none",
                  textAlign: "center",
                }}
              >
                My squad
              </Link>
            </div>
          </div>
        )}

        {/* Rank tiles */}
        <div style={{ display: "flex", gap: 10 }}>
          <Link
            href="/ranks"
            style={{
              flex: 1,
              background: "var(--surf)",
              borderRadius: 14,
              padding: "14px 14px",
              boxShadow: "var(--sh-sm)",
              textDecoration: "none",
            }}
          >
            <div
              style={{
                fontFamily: "var(--font-inter), sans-serif",
                fontSize: 12,
                color: "var(--n5)",
                marginBottom: 6,
              }}
            >
              Prediction
            </div>
            <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
              <span
                style={{
                  fontFamily: "var(--font-anton), sans-serif",
                  fontSize: 28,
                  color: "var(--n0)",
                  lineHeight: 1,
                }}
              >
                {predRank !== null ? `#${predRank}` : "--"}
              </span>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "flex-end",
                  gap: 2,
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--font-inter), sans-serif",
                    fontSize: 12,
                    color: "var(--n5)",
                  }}
                >
                  /{totalMembers ?? "--"} players
                </span>
              </div>
            </div>
          </Link>
          <Link
            href="/ranks"
            style={{
              flex: 1,
              background: "var(--surf)",
              borderRadius: 14,
              padding: "14px 14px",
              boxShadow: "var(--sh-sm)",
              textDecoration: "none",
            }}
          >
            <div
              style={{
                fontFamily: "var(--font-inter), sans-serif",
                fontSize: 12,
                color: "var(--n5)",
                marginBottom: 6,
              }}
            >
              Fantasy
            </div>
            <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
              <span
                style={{
                  fontFamily: "var(--font-anton), sans-serif",
                  fontSize: 28,
                  color: "var(--n0)",
                  lineHeight: 1,
                }}
              >
                {fantasyRank !== null ? `#${fantasyRank}` : "--"}
              </span>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "flex-end",
                  gap: 2,
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--font-inter), sans-serif",
                    fontSize: 12,
                    color: "var(--n5)",
                  }}
                >
                  /{totalMembers ?? "--"} players
                </span>
              </div>
            </div>
          </Link>
        </div>

        {/* Needs attention */}
        {unpredictedCount > 0 && openMatches.length > 0 && (
          <div
            style={{
              background: "var(--surf)",
              borderRadius: 14,
              padding: "14px 14px",
              boxShadow: "var(--sh-sm)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 10,
              }}
            >
              <span
                style={{
                  fontFamily: "var(--font-saira), sans-serif",
                  fontWeight: 700,
                  fontSize: 13,
                  color: "var(--n0)",
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                }}
              >
                Needs attention
              </span>
              <div
                style={{
                  padding: "3px 9px",
                  borderRadius: 20,
                  background: "var(--n2)",
                  color: "var(--n7)",
                  fontFamily: "var(--font-saira), sans-serif",
                  fontWeight: 700,
                  fontSize: 11,
                }}
              >
                {unpredictedCount}
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              {openMatches.slice(0, 3).map((m, idx) => (
                <div
                  key={m.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "10px 0",
                    borderBottom: idx < Math.min(openMatches.length, 3) - 1 ? "1px solid var(--n9)" : "none",
                  }}
                >
                  <div
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: idx === 0 ? "var(--r2)" : "var(--gold)",
                      flexShrink: 0,
                    }}
                  />
                  <div style={{ flex: 1 }}>
                    <div
                      style={{
                        fontFamily: "var(--font-saira), sans-serif",
                        fontWeight: 600,
                        fontSize: 14,
                        color: "var(--n0)",
                      }}
                    >
                      {m.home_nation.flag_code} v {m.away_nation.flag_code} · predict
                    </div>
                    <div
                      style={{
                        fontFamily: "var(--font-inter), sans-serif",
                        fontSize: 12,
                        color: "var(--n5)",
                        marginTop: 2,
                      }}
                    >
                      Closes in {formatCountdown(m.kickoff_time)} · {toIST(m.kickoff_time)}
                    </div>
                  </div>
                  <Link
                    href="/predict"
                    style={{
                      padding: "6px 12px",
                      borderRadius: 8,
                      background: "var(--g3)",
                      color: "#fff",
                      fontFamily: "var(--font-saira), sans-serif",
                      fontWeight: 700,
                      fontSize: 12,
                      textDecoration: "none",
                      flexShrink: 0,
                    }}
                  >
                    Go
                  </Link>
                </div>
              ))}
              {openMatches.length > 3 && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "10px 0 0",
                  }}
                >
                  <div
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: "var(--gold)",
                      flexShrink: 0,
                    }}
                  />
                  <div
                    style={{
                      flex: 1,
                      fontFamily: "var(--font-saira), sans-serif",
                      fontSize: 14,
                      fontWeight: 500,
                      color: "var(--n0)",
                    }}
                  >
                    {openMatches.length - 3} more prediction{openMatches.length - 3 > 1 ? "s" : ""} due
                  </div>
                  <span style={{ color: "var(--n6)", fontSize: 16 }}>›</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
