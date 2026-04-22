import { TenantProvider } from "@/providers/tenant-provider";
import Pod from "@/features/widget/components/Pod";

export default function WidgetPage({
  params,
}: {
  params: { tenantId: string };
}) {
  return (
    <TenantProvider>
      <Pod tenantId={params.tenantId} />
    </TenantProvider>
  );
}
