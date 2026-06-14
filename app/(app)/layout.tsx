import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BottomTabBar } from "@/components/bottom-tab-bar";
import { NotificationPrompt } from "@/components/notification-prompt";
import { IosInstallPrompt } from "@/components/ios-install-prompt";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/join");
  }

  return (
    <div
      className="flex h-full flex-col"
      style={{ backgroundColor: "var(--bg)" }}
    >
      <main className="flex-1 overflow-y-auto">{children}</main>
      <BottomTabBar />
      <NotificationPrompt />
      <IosInstallPrompt />
    </div>
  );
}
