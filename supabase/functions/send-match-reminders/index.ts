import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

interface PushSubscription {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

interface PushPayload {
  title: string;
  body: string;
  url: string;
}

// Placeholder — real VAPID signing requires Web Crypto + JWT.
// Wire this up once VAPID keys are set in Supabase secrets.
async function sendPushNotification(
  subscription: PushSubscription,
  payload: PushPayload,
  _vapidPublicKey: string,
  _vapidPrivateKey: string
): Promise<void> {
  console.log("[send-match-reminders] Would send push to", subscription.endpoint, "payload:", JSON.stringify(payload));
  // TODO: implement real VAPID-signed web push when keys are configured:
  // 1. Sign a JWT with the VAPID private key (ES256)
  // 2. Encrypt the payload using the subscription's p256dh and auth keys
  // 3. POST to subscription.endpoint with the Authorization and Encryption headers
}

function toIST(utcDate: string): string {
  const d = new Date(utcDate);
  const istMs = d.getTime() + 5.5 * 60 * 60 * 1000;
  const ist = new Date(istMs);
  const hh = ist.getUTCHours().toString().padStart(2, "0");
  const mm = ist.getUTCMinutes().toString().padStart(2, "0");
  return `${hh}:${mm} IST`;
}

serve(async (_req: Request) => {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY");
    const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({ error: "Missing Supabase env vars" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!vapidPublicKey || !vapidPrivateKey) {
      console.warn("[send-match-reminders] VAPID keys not configured, notifications will be logged only");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const now = new Date();
    const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000).toISOString();
    const twoHoursFromNow = new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString();

    // Fetch matches starting in 1–2 hours that are still scheduled
    const { data: matches, error: matchesError } = await supabase
      .from("matches")
      .select(`
        id, kickoff_time, round_id,
        home_nation:home_nation_id(name, flag_code),
        away_nation:away_nation_id(name, flag_code)
      `)
      .eq("status", "scheduled")
      .gte("kickoff_time", oneHourFromNow)
      .lte("kickoff_time", twoHoursFromNow);

    if (matchesError) {
      return new Response(
        JSON.stringify({ error: matchesError.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!matches || matches.length === 0) {
      return new Response(
        JSON.stringify({ message: "No upcoming matches in 1–2 hour window", sent: 0 }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    let totalSent = 0;

    for (const match of matches) {
      const homeNation = Array.isArray(match.home_nation)
        ? match.home_nation[0]
        : match.home_nation;
      const awayNation = Array.isArray(match.away_nation)
        ? match.away_nation[0]
        : match.away_nation;

      if (!homeNation || !awayNation) continue;

      const homeFlag = (homeNation as { flag_code: string }).flag_code;
      const awayFlag = (awayNation as { flag_code: string }).flag_code;
      const homeName = (homeNation as { name: string }).name;
      const awayName = (awayNation as { name: string }).name;
      const kickoffIST = toIST(match.kickoff_time as string);

      // Find league members who haven't submitted a prediction for this match
      const { data: leagues } = await supabase
        .from("leagues")
        .select("id");

      if (!leagues) continue;

      for (const league of leagues) {
        const leagueId = league.id as string;

        // Get all members of this league
        const { data: members } = await supabase
          .from("league_members")
          .select("user_id")
          .eq("league_id", leagueId);

        if (!members) continue;

        // Get user_ids that already predicted this match in this league
        const { data: predictors } = await supabase
          .from("predictions")
          .select("user_id")
          .eq("league_id", leagueId)
          .eq("match_id", match.id);

        const predictorIds = new Set((predictors ?? []).map((p: { user_id: string }) => p.user_id));
        const unpredictedMembers = members.filter(
          (m: { user_id: string }) => !predictorIds.has(m.user_id)
        );

        if (unpredictedMembers.length === 0) continue;

        // Get push subscriptions for unpredicted members
        const userIds = unpredictedMembers.map((m: { user_id: string }) => m.user_id);
        const { data: subscriptions } = await supabase
          .from("push_subscriptions")
          .select("subscription")
          .in("user_id", userIds);

        if (!subscriptions) continue;

        for (const row of subscriptions) {
          const subscription = row.subscription as PushSubscription;

          const payload: PushPayload = {
            title: "⚽ Match starting soon",
            body: `${homeFlag} ${homeName} vs ${awayFlag} ${awayName} at ${kickoffIST}`,
            url: "/predict",
          };

          await sendPushNotification(
            subscription,
            payload,
            vapidPublicKey ?? "",
            vapidPrivateKey ?? ""
          );
          totalSent++;
        }
      }
    }

    return new Response(
      JSON.stringify({ message: "Match reminders processed", sent: totalSent }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
