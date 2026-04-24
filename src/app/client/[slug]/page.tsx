import { getRouteContext } from "@/lib/url-resolver";

/**
 * Client Dashboard Page
 * URL: /client/[slug]
 * Displays white-label dashboard for the client
 * Branding inherited from parent reseller if not set
 */
export default async function ClientDashboardPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  // Fetch branding data server-side
  const context = await getRouteContext(`/client/${slug}`);

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8">
        <h1
          className="text-3xl font-bold mb-2"
          style={{ color: context.branding?.primaryColor }}
        >
          {context.branding?.name} Dashboard
        </h1>
        <p className="text-gray-600">
          Manage your voice AI widget and view analytics
        </p>
      </div>

      {/* Client Dashboard Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <DashboardCard
          title="Widget Status"
          value="Active"
          color={context.branding?.primaryColor || "#0097b2"}
        />
        <DashboardCard
          title="Conversations Today"
          value="156"
          color={context.branding?.accentColor || "#D4AF37"}
        />
      </div>
    </div>
  );
}

function DashboardCard({
  title,
  value,
  color,
}: {
  title: string;
  value: string;
  color: string;
}) {
  return (
    <div
      className="p-6 rounded-lg border-2"
      style={{ borderColor: `${color}40` }}
    >
      <h3 className="text-sm font-medium text-gray-600 mb-1">{title}</h3>
      <p className="text-3xl font-bold" style={{ color }}>
        {value}
      </p>
    </div>
  );
}
