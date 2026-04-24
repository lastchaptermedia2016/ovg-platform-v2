import { 
  getResellerClients, 
  getResellerBySlug, 
  getResellerClientCount 
} from "@/lib/db/reseller-clients";
import { ClientInventoryTable } from "@/components/reseller/client-inventory-table";
import { EmptyState } from "@/components/reseller/empty-state";
import { getRouteContext } from "@/lib/url-resolver";
import { Users, TrendingUp, Clock, Plus } from "lucide-react";
import Link from "next/link";

/**
 * Reseller Client Inventory Page
 * 
 * URL: /reseller/[resellerSlug]
 * 
 * Displays all tenants/clients belonging to this reseller with:
 * - Strict database-level isolation (.eq('reseller_id', id))
 * - Professional data table with sorting/filtering
 * - Empty state with "Create Your First Agent" CTA
 * - Stats cards showing key metrics
 */
export default async function ResellerClientInventoryPage({
  params,
}: {
  params: Promise<{ resellerSlug: string }>;
}) {
  const { resellerSlug } = await params;

  // Fetch reseller data to get the UUID
  const reseller = await getResellerBySlug(resellerSlug);

  if (!reseller) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            Reseller Not Found
          </h2>
          <p className="text-gray-500">
            The reseller "{resellerSlug}" does not exist or is inactive.
          </p>
        </div>
      </div>
    );
  }

  // STRICT ISOLATION: Query at database level, never filter in frontend
  // This ensures we only get clients where reseller_id matches exactly
  const [clients, clientCount, branding] = await Promise.all([
    getResellerClients(reseller.id),
    getResellerClientCount(reseller.id),
    getRouteContext(`/reseller/${resellerSlug}`),
  ]);

  const primaryColor = branding.branding?.primaryColor || "#0097b2";
  const accentColor = branding.branding?.accentColor || "#D4AF37";

  return (
    <div className="max-w-7xl mx-auto">
      {/* Page Header */}
      <div className="mb-8">
        <h1 
          className="text-3xl font-bold mb-2"
          style={{ color: primaryColor }}
        >
          {reseller.name} - Client Inventory
        </h1>
        <p className="text-gray-600">
          Manage all AI agents and businesses under your reseller account
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <StatCard
          title="Total Clients"
          value={clientCount.toString()}
          icon={Users}
          color={primaryColor}
        />
        <StatCard
          title="Active Agents"
          value={clients.filter(c => c.is_active).length.toString()}
          icon={TrendingUp}
          color={accentColor}
        />
        <StatCard
          title="Latest Created"
          value={clients[0] ? new Date(clients[0].created_at).toLocaleDateString() : "-"}
          icon={Clock}
          color={primaryColor}
        />
      </div>

      {/* Action Bar */}
      {clients.length > 0 && (
        <div className="flex justify-between items-center mb-6">
          <div className="text-sm text-gray-500">
            Showing {clients.length} {clients.length === 1 ? "client" : "clients"}
          </div>
          <Link
            href={`/reseller/${resellerSlug}/clients/new`}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-white transition-all duration-200 hover:shadow-lg hover:scale-105 active:scale-95"
            style={{ backgroundColor: primaryColor }}
          >
            <Plus className="w-4 h-4" />
            Create New Agent
          </Link>
        </div>
      )}

      {/* Content: Table or Empty State */}
      {clients.length === 0 ? (
        <EmptyState
          primaryColor={primaryColor}
          accentColor={accentColor}
          resellerSlug={resellerSlug}
        />
      ) : (
        <ClientInventoryTable
          clients={clients}
          primaryColor={primaryColor}
          accentColor={accentColor}
        />
      )}
    </div>
  );
}

function StatCard({
  title,
  value,
  icon: Icon,
  color,
}: {
  title: string;
  value: string;
  icon: typeof Users;
  color: string;
}) {
  return (
    <div 
      className="p-6 rounded-xl border-2 transition-all duration-200 hover:shadow-lg"
      style={{ borderColor: `${color}30`, backgroundColor: `${color}08` }}
    >
      <div className="flex items-center justify-between mb-4">
        <div
          className="p-2 rounded-lg"
          style={{ backgroundColor: `${color}20` }}
        >
          <Icon className="w-5 h-5" style={{ color }} />
        </div>
      </div>
      <p className="text-3xl font-bold text-gray-900 mb-1">{value}</p>
      <p className="text-sm text-gray-500">{title}</p>
    </div>
  );
}
