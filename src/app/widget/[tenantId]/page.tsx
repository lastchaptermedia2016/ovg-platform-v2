import { TenantProvider } from "@/providers/tenant-provider";
import Pod from "@/features/widget/components/Pod";
import PodBubble from "@/features/widget/components/PodBubble";

export default async function WidgetPage({
  params,
}: {
  params: Promise<{ tenantId: string }>;
}) {
  const { tenantId } = await params;

  return (
    <TenantProvider>
      <Pod tenantId={tenantId} />
      <PodBubble tenantId={tenantId} />
    </TenantProvider>
  );
}
