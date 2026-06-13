import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(`${origin}/join?error=no_code`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(`${origin}/join?error=auth_failed`);
  }

  // Check platform_settings to decide if user is auto-approved or waitlisted
  const { data: settings } = await supabase
    .from("platform_settings")
    .select("total_users, free_slots")
    .eq("id", 1)
    .single();

  const totalUsers = settings?.total_users ?? 0;
  const freeSlots = settings?.free_slots ?? 20;

  if (totalUsers < freeSlots) {
    // Auto-approve: upsert profile and increment total_users
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      await supabase.from("profiles").upsert({ id: user.id });
      await supabase.rpc("increment_total_users");
    }

    return NextResponse.redirect(`${origin}/onboarding`);
  }

  // Waitlisted
  return NextResponse.redirect(`${origin}/waitlist`);
}
