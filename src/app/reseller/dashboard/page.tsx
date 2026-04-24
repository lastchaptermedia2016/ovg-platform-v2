import { BrandKit } from '@/components/reseller/BrandKit';
import { ClientPolicyManager } from '@/components/reseller/ClientPolicyManager';
import { getResellerClients, getResellerClientCount, seedTestReseller } from '@/lib/db/reseller-clients';
import { Users, Activity, Heart, Settings } from 'lucide-react';
import DashboardClient from './DashboardClient';

interface MetricCardProps {
  title: string;
  value: string;
  icon: typeof Users;
  color: string;
}

function MetricCard({ title, value, icon: Icon, color }: MetricCardProps) {
  return (
    <div
      className="p-6 rounded-xl border-2 transition-all duration-200 hover:shadow-lg"
      style={{ borderColor: `${color}30`, backgroundColor: `${color}08` }}
    >
      <div className="flex items-center justify-between mb-4">
        <div
          className="p-3 rounded-lg"
          style={{ backgroundColor: `${color}20` }}
        >
          <Icon className="w-6 h-6" style={{ color }} />
        </div>
      </div>
      <p className="text-3xl font-bold text-gray-900 mb-1">{value}</p>
      <p className="text-sm text-gray-500">{title}</p>
    </div>
  );
}

export default async function ResellerDashboard() {
  // Fetch or seed a valid reseller ID for development
  const resellerId = await seedTestReseller();

  // Fetch live data from Supabase
  const clients = await getResellerClients(resellerId);
  const totalClients = await getResellerClientCount(resellerId);
  const activeSubscriptions = clients.filter(c => c.is_active).length;

  const metrics = {
    totalClients: totalClients.toString(),
    activeSubscriptions: activeSubscriptions.toString(),
    systemHealth: '98%',
  };

  return (
    <DashboardClient
      initialClients={clients}
      initialMetrics={metrics}
      resellerId={resellerId}
    />
  );
}
