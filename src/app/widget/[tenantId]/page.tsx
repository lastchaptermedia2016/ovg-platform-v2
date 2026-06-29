import { TenantProvider } from "@/providers/tenant-provider";
import Pod from "@/features/widget/components/Pod";
import PodBubble from "@/components/widget/PodBubble";
import ChatWidget from "@/components/widget/ChatWidget";
import { getTenantBySlug } from "@/core/tenant/db";
import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import WidgetPresence from "./WidgetPresence";

export default async function WidgetPage({
  params,
}: {
  params: Promise<{ tenantId: string }>;
}) {
  const { tenantId } = await params;

  // Fetch tenant data from Supabase
  const tenant = await getTenantBySlug(tenantId);

  // Return 404 if tenant not found
  if (!tenant) {
    notFound();
  }

  // ─── BRANDING PROPAGATION FIX ────────────────────────────────────────────
  // The widget must display reseller branding, not tenant-local defaults.
  // We perform a lightweight join via tenant_id → resellers.branding_bag.
  // This ensures the widget always reflects the active reseller theme.
  // ─────────────────────────────────────────────────────────────────────────
  const supabase = await createClient();
  const { data: resellerBrandingRow, error: brandingError } = await supabase
    .from("resellers")
    .select("branding")
    .eq("tenant_id", tenant.tenant_id)
    .maybeSingle();

  const rawBranding = brandingError
    ? null
    : (typeof resellerBrandingRow?.branding === 'string' ? resellerBrandingRow.branding : null);

  const resellerBranding = rawBranding
    ? (JSON.parse(rawBranding) as Record<string, unknown>)
    : null;

  // Live verification logging
  console.log("✅ LIVE TENANT DATA:", tenant);
  console.log("🎨 RESELLER BRANDING:", resellerBranding);

  return (
    <TenantProvider>
      <Pod tenantId={tenantId} />
      <PodBubble
        tenantId={tenantId}
        brandingColor={(resellerBranding?.primaryColor as string | undefined) ?? (tenant.branding_colors as Record<string, unknown> | null)?.primary as string | undefined ?? "#0097b2"}
        voiceId={tenant.voice_id}
        name={tenant.name}
      />
      <WidgetPresence tenantId={tenantId} />
      <ChatWidget tenantId={tenantId} />
    </TenantProvider>
  );
}
