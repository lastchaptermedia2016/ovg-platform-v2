
import { TenantProvider } from "@/providers/tenant-provider";
import { getTenantBySlug } from "@/core/tenant/db";
import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import WidgetPresence from "./WidgetPresence";
import ChatWidget from "./ChatWidgetClient";
import WidgetProviders from "./WidgetProviders";
import { migrateLegacyBranding } from "@/lib/schemas/tenant-config.canonical";
import type { CanonicalBranding } from "@/lib/schemas/tenant-config.canonical";

export default async function WidgetPage({
  params,
}: {
  params: Promise<{ tenantId: string }>;
}) {
  const { tenantId } = await params;

  console.log("DEBUG WIDGET ROUTE:", { param: tenantId });

  // Fetch tenant data from Supabase
  const tenant = await getTenantBySlug(tenantId);
  console.log("DEBUG WIDGET ROUTE RESULT:", { param: tenantId, tenant, error: tenant ? null : 'NOT_FOUND' });

  // Return 404 if tenant not found
  if (!tenant) {
    notFound();
  }

  // ─── BRANDING PROPAGATION ──────────────────────────────────────────────────
  // Branding is authoritative on the tenant row itself: tenants.widget_config
  // (canonical `branding`, with legacy `widget_studio.branding` fallback). The
  // full widget_config is passed through migrateLegacyBranding so nested
  // header/footer layers, logo, and custom CSS are preserved per its contract.
  // `widget_config` is not part of the parsed `Tenant` type, so we read it
  // directly from the tenants row by the resolved id (matches the canonical
  // pipeline's explicit `.select('widget_config')` pattern).
  // ─────────────────────────────────────────────────────────────────────────
  const supabase = await createClient();
  const { data: widgetConfigRow, error: widgetConfigError } = await supabase
    .from("tenants")
    .select("widget_config")
    .eq("id", tenant.id)
    .maybeSingle();

  const rawWidgetConfig = widgetConfigError
    ? null
    : ((widgetConfigRow?.widget_config as
        | Partial<import("@/lib/schemas/tenant-config.canonical").CanonicalWidgetConfig>
        | null) ?? null);

  const canonicalConfig = rawWidgetConfig
    ? migrateLegacyBranding(rawWidgetConfig)
    : null;

  const canonicalBranding: CanonicalBranding | null =
    canonicalConfig?.branding ?? null;

  // Live verification logging
  console.log("✅ LIVE TENANT DATA:", tenant);
  console.log("🎨 WIDGET_CONFIG BRANDING:", rawWidgetConfig);
  console.log("🔧 CANONICAL BRANDING:", canonicalBranding);

  return (
    <TenantProvider>
      <WidgetProviders tenantId={tenantId}>
        <WidgetPresence tenantId={tenantId} widgetPosition={canonicalBranding?.widgetPosition} />
        <ChatWidget tenantId={tenantId} branding={canonicalBranding} widgetPosition={canonicalBranding?.widgetPosition} />
      </WidgetProviders>
    </TenantProvider>
  );
}
