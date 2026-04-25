import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { ActivityStream } from "@/components/reseller/ActivityStream";
import { TopPerformers } from "@/components/reseller/TopPerformers";
import { TrendChart } from "@/components/reseller/TrendChart";
import { ActivityMap } from "@/components/reseller/ActivityMap";
import { AIInsight } from "@/components/reseller/AIInsight";
import { BrandKit } from "@/components/reseller/BrandKit";
import { LivePreview } from "@/components/reseller/LivePreview";
import { BrandKitProvider } from "@/contexts/BrandKitContext";
import Link from "next/link";
import { Users, Plus } from "lucide-react";

const trendData = [
  { name: "Mon", mrr: 12000, leads: 45 },
  { name: "Tue", mrr: 15000, leads: 52 },
  { name: "Wed", mrr: 13500, leads: 48 },
  { name: "Thu", mrr: 18000, leads: 61 },
  { name: "Fri", mrr: 22000, leads: 73 },
  { name: "Sat", mrr: 19000, leads: 55 },
  { name: "Sun", mrr: 21000, leads: 68 },
];

export default async function ResellerDashboard() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/sign-in");

  const resellerSlug = user.user_metadata?.reseller_slug || "acme-corp";

  // Fetch reseller from DB
  const { data: reseller } = await supabase
    .from("resellers")
    .select("*")
    .eq("slug", resellerSlug)
    .single();

  const resellerId = reseller?.id || "";
  const headerUrl = reseller?.branding_assets?.header_url || null;
  const footerUrl = reseller?.branding_assets?.footer_url || null;

  return (
    <BrandKitProvider>
      <div 
        className="min-h-screen p-6 relative"
        style={{
          backgroundImage: 'url(/reseller-bg.jpg)',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundAttachment: 'fixed',
        }}
      >
        {/* Dark overlay so glass cards are readable */}
        <div className="absolute inset-0 bg-[#001A2C]/20" />
        
        {/* Content sits above overlay */}
        <div className="relative z-10">

        {/* Page Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white mb-1">
              {reseller?.name || "Reseller"} Dashboard
            </h1>
            <p className="text-white/60">
              Welcome back! Here's what's happening with your account.
            </p>
          </div>
          <Link
            href={`/reseller/${resellerSlug}/clients`}
            className="inline-flex items-center gap-2 px-4 py-2 bg-[#0097b2] hover:bg-[#007a8f] text-white rounded-lg font-medium transition-colors"
          >
            <Users className="w-4 h-4" />
            View Clients
          </Link>
        </div>

        {/* Main Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          {/* Left - 2/3 */}
          <div className="lg:col-span-2 space-y-6">
            {/* Trend Chart */}
            <div className="bg-black/30 backdrop-blur-md border border-white/20 rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white">Revenue & Lead Trends</h3>
                <span className="text-xs text-white/40">Last 7 days</span>
              </div>
              <div className="h-[200px] w-full">
                <TrendChart data={trendData} />
              </div>
            </div>

            {/* Activity Stream */}
            <ActivityStream />

            {/* Brand Kit */}
            {resellerId && (
              <div className="bg-black/30 backdrop-blur-md border border-white/20 rounded-xl p-6">
                <BrandKit
                  resellerId={resellerId}
                  initialHeaderUrl={headerUrl}
                  initialFooterUrl={footerUrl}
                />
              </div>
            )}
          </div>

          {/* Right - 1/3 */}
          <div className="space-y-6">
            <AIInsight />
            <TopPerformers />
            <ActivityMap />
          </div>
        </div>

        {/* Live Preview floating button */}
        <LivePreview />
      </div>
      </div>
    </BrandKitProvider>
  );
}
