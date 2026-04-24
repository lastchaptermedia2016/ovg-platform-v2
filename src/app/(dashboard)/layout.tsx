import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { Header } from "@/components/dashboard/Header";
import { ResellerProvider } from "@/providers/reseller-provider";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = createClient();

  // 1. Authenticate the User
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  // 2. Fetch User Profile & Role
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, tenant_id")
    .eq("id", user.id)
    .single();

  if (!profile) redirect("/onboarding");

  // 3. Get reseller slug from user metadata for branding
  const resellerSlug = user.user_metadata?.reseller_slug || "acme-corp";

  return (
    <ResellerProvider resellerSlug={resellerSlug}>
      <div className="flex h-screen bg-[#000B14]">
        {/* 4. Role-Aware Sidebar */}
        <Sidebar role={profile.role} />

        <main className="flex-1 flex flex-col overflow-hidden">
          <Header user={user} />

          <div className="flex-1 overflow-y-auto p-6">{children}</div>
        </main>

        {/* 5. Live Widget Preview (Only for Clients) */}
        {profile.role === "client" && (
          <div className="fixed bottom-8 right-8 z-50">
            {/* This allows clients to test their kinetic core in real-time */}
            <div className="text-[10px] text-gold-500/50 mb-2 text-right">
              LIVE PREVIEW
            </div>
            <iframe
              src={`/widget/${profile.tenant_id}`}
              className="w-[100px] h-[100px] border-none overflow-hidden"
            />
          </div>
        )}
      </div>
    </ResellerProvider>
  );
}
