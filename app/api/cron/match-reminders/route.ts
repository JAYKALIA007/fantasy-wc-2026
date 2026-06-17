import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT!,
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
);

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const windowStart = new Date(now.getTime() + 45 * 60 * 1000).toISOString();
  const windowEnd = new Date(now.getTime() + 75 * 60 * 1000).toISOString();

  // Find matches starting in the next 45–75 minutes that haven't been reminded yet
  const { data: matches, error } = await supabaseAdmin
    .from("matches")
    .select("id, kickoff_time, home_nation:home_nation_id(name, flag_code), away_nation:away_nation_id(name, flag_code)")
    .eq("status", "scheduled")
    .gte("kickoff_time", windowStart)
    .lte("kickoff_time", windowEnd)
    .is("reminder_sent_at", null);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  if (!matches || matches.length === 0) {
    return Response.json({ sent: 0, message: "No matches in window" });
  }

  // Fetch all push subscriptions
  const { data: subscriptions } = await supabaseAdmin
    .from("push_subscriptions")
    .select("subscription");

  const subs = subscriptions ?? [];

  let totalSent = 0;

  for (const match of matches) {
    const home = Array.isArray(match.home_nation) ? match.home_nation[0] : match.home_nation;
    const away = Array.isArray(match.away_nation) ? match.away_nation[0] : match.away_nation;
    const homeCode = (home as { flag_code: string } | null)?.flag_code ?? "";
    const awayCode = (away as { flag_code: string } | null)?.flag_code ?? "";
    const homeName = (home as { name: string } | null)?.name ?? "";
    const awayName = (away as { name: string } | null)?.name ?? "";

    const payload = JSON.stringify({
      title: "Match starting in 1 hour ⚽",
      body: `${homeCode} ${homeName} vs ${awayCode} ${awayName} — lock in your prediction!`,
      url: "/predict",
    });

    await Promise.allSettled(
      subs.map((row) =>
        webpush.sendNotification(row.subscription as webpush.PushSubscription, payload)
      )
    );

    // Mark reminder as sent
    await supabaseAdmin
      .from("matches")
      .update({ reminder_sent_at: new Date().toISOString() })
      .eq("id", match.id);

    totalSent++;
  }

  return Response.json({ sent: totalSent });
}
