"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function CallbackClientPage() {
  const router = useRouter();

  useEffect(() => {
    const run = async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/join?error=auth_failed"); return; }

      const { data: settings } = await supabase
        .from("platform_settings")
        .select("total_users, free_slots")
        .eq("id", 1)
        .single();

      const totalUsers = settings?.total_users ?? 0;
      const freeSlots = settings?.free_slots ?? 20;

      if (totalUsers < freeSlots) {
        await supabase.from("profiles").upsert({ id: user.id });
        await supabase.rpc("increment_total_users");
        router.push("/onboarding");
      } else {
        router.push("/waitlist");
      }
    };
    run();
  }, [router]);

  return (
    <main style={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", backgroundColor: "var(--n0)" }}>
      <p style={{ color: "var(--n6)", fontFamily: "var(--font-saira), sans-serif", fontSize: 16 }}>
        Setting up your account…
      </p>
    </main>
  );
}
