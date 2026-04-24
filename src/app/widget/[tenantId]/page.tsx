import { TenantProvider } from "@/providers/tenant-provider";
import Pod from "@/features/widget/components/Pod";
import PodBubble from "@/features/widget/components/PodBubble";
import { getTenantBySlug } from "@/lib/db/tenants";
import { notFound } from "next/navigation";

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

  // Live verification logging
  console.log("✅ LIVE TENANT DATA:", tenant);
  console.log("🎨 BRANDING COLOR:", tenant.branding_colors);

  return (
    <TenantProvider>
      <Pod tenantId={tenantId} />
      <PodBubble
        tenantId={tenantId}
        brandingColor={tenant.branding_colors?.primary}
        voiceId={tenant.voice_id}
        name={tenant.name}
      />
    </TenantProvider>
  );
}
