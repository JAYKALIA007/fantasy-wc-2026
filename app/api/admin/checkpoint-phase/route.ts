import { createClient } from "@/lib/supabase/server";
import { scoreLiveCheckpoint } from "@/lib/server/liveCheckpoint";

type Phase = "h1" | "h2" | "et" | "pens";
type PhaseStatus = "pending" | "open" | "closed" | "scored";

const PHASE_PUSH_LABEL: Record<Phase, string> = {
  h1: "Half-time",
  h2: "2nd-half",
  et: "Extra-time",
  pens: "Penalties",
};

// Fire a push when a live checkpoint window opens. Mirrors the cron's push.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fireWindowOpenPush(supabase: any, matchId: number, phase: Phase) {
  const { data: match } = await supabase
    .from("matches")
    .select("home_nation:home_nation_id(name), away_nation:away_nation_id(name)")
    .eq("id", matchId)
    .maybeSingle();
  const home = Array.isArray(match?.home_nation) ? match?.home_nation[0]?.name : match?.home_nation?.name;
  const away = Array.isArray(match?.away_nation) ? match?.away_nation[0]?.name : match?.away_nation?.name;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://fantasy-wc-2026-ashy.vercel.app";
  void fetch(`${siteUrl}/api/push/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` },
    body: JSON.stringify({
      title: `⚽ ${PHASE_PUSH_LABEL[phase]} predictions open`,
      body: `${home ?? "Match"} vs ${away ?? ""} — predict the next checkpoint now.`,
      url: "/predict",
    }),
  }).catch(() => {});
}

interface CheckpointPhaseBody {
  match_id: number;
  phase: Phase;
  action: "open" | "close" | "score";
  // Required when action === "score"
  actual_home?: number;
  actual_away?: number;
}

export async function POST(request: Request) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Only league creators (admins) may manage phases
  const { data: league } = await supabase
    .from("leagues")
    .select("id")
    .eq("creator_id", user.id)
    .maybeSingle();

  if (!league) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: CheckpointPhaseBody;
  try {
    body = (await request.json()) as CheckpointPhaseBody;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { match_id, phase, action, actual_home, actual_away } = body;

  if (
    typeof match_id !== "number" ||
    !["h1", "h2", "et", "pens"].includes(phase) ||
    !["open", "close", "score"].includes(action)
  ) {
    return Response.json({ error: "Invalid body" }, { status: 400 });
  }

  if (action === "score") {
    if (typeof actual_home !== "number" || typeof actual_away !== "number") {
      return Response.json({ error: "actual_home and actual_away required for score action" }, { status: 400 });
    }
  }

  const now = new Date().toISOString();

  if (action === "open") {
    // Only push if this is a genuine open transition (not a re-open of an
    // already-open window) and it's a LIVE window (h2/et/pens, never h1).
    const { data: prev } = await supabase
      .from("match_checkpoint_phases")
      .select("status")
      .eq("match_id", match_id)
      .eq("phase", phase)
      .maybeSingle();
    const wasOpen = prev?.status === "open";

    const { error } = await supabase
      .from("match_checkpoint_phases")
      .upsert(
        { match_id, phase, status: "open" as PhaseStatus, opened_at: now, updated_at: now },
        { onConflict: "match_id,phase" }
      );
    if (error) return Response.json({ error: error.message }, { status: 500 });

    if (!wasOpen && phase !== "h1") {
      await fireWindowOpenPush(supabase, match_id, phase);
    }
    return Response.json({ ok: true });
  }

  if (action === "close") {
    const { error } = await supabase
      .from("match_checkpoint_phases")
      .update({ status: "closed" as PhaseStatus, closed_at: now, updated_at: now })
      .eq("match_id", match_id)
      .eq("phase", phase);
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ ok: true });
  }

  // action === "score": set actual, close if not already, score all predictions
  const { error: phaseUpdateError } = await supabase
    .from("match_checkpoint_phases")
    .upsert(
      {
        match_id,
        phase,
        status: "scored" as PhaseStatus,
        actual_home: actual_home!,
        actual_away: actual_away!,
        closed_at: now,
        updated_at: now,
      },
      { onConflict: "match_id,phase" }
    );
  if (phaseUpdateError) return Response.json({ error: phaseUpdateError.message }, { status: 500 });

  // Fetch all predictions for this (match, phase)
  const { data: picks, error: picksError } = await supabase
    .from("live_checkpoint_predictions")
    .select("id, predicted_home, predicted_away")
    .eq("match_id", match_id)
    .eq("phase", phase);

  if (picksError) return Response.json({ error: picksError.message }, { status: 500 });

  // Score each prediction (idempotent — overwrites any prior points value)
  for (const pick of picks ?? []) {
    const points = scoreLiveCheckpoint(
      { predicted_home: pick.predicted_home as number, predicted_away: pick.predicted_away as number },
      { actual_home: actual_home!, actual_away: actual_away! }
    );
    const { error: updateError } = await supabase
      .from("live_checkpoint_predictions")
      .update({ points, updated_at: now })
      .eq("id", pick.id as string);
    if (updateError) return Response.json({ error: updateError.message }, { status: 500 });
  }

  return Response.json({ ok: true, scored: (picks ?? []).length });
}
