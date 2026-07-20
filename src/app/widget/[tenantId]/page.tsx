
import { TenantProvider } from "@/providers/tenant-provider";
import { getPublicWidgetConfig } from "@/core/tenant/db";
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

  // ─── PUBLIC EMBED LOADER ───────────────────────────────────────────────────
  // Anonymous visitors have no session, so the server anon client cannot read
  // `tenants` directly (RLS only grants authenticated resellers). The
  // SECURITY DEFINER RPC `get_public_widget_config` returns ONLY the `branding`
  // and `suggestedActions` subtrees of widget_config — never PII, integration
  // secrets, or AI prompts. Unknown tenant_id → 404.
  // ─────────────────────────────────────────────────────────────────────────
  const publicCfg = await getPublicWidgetConfig(tenantId);
  console.log("DEBUG WIDGET ROUTE RESULT:", {
    param: tenantId,
    found: !!publicCfg,
  });

  if (!publicCfg) {
    notFound();
  }

  const rawWidgetConfig = publicCfg.widget_config;

  const canonicalConfig = rawWidgetConfig
    ? migrateLegacyBranding(rawWidgetConfig)
    : null;

  const canonicalBranding: CanonicalBranding | null =
    canonicalConfig?.branding ?? null;

  const suggestedActions = canonicalConfig?.suggestedActions ?? [];

  const greeting = canonicalConfig?.greeting ?? "";

  // Live verification logging
  console.log("🎨 WIDGET_CONFIG BRANDING:", rawWidgetConfig);
  console.log("🔧 CANONICAL BRANDING:", canonicalBranding);

  return (
    <TenantProvider>
      <WidgetProviders tenantId={tenantId}>
        <WidgetPresence tenantId={tenantId} widgetPosition={canonicalBranding?.widgetPosition} />
        <ChatWidget tenantId={tenantId} branding={canonicalBranding} widgetPosition={canonicalBranding?.widgetPosition} suggestedActions={suggestedActions} greeting={greeting} />
      </WidgetProviders>
    </TenantProvider>
  );
}
