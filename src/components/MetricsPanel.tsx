import { createClient } from '@/lib/supabase/server'

export interface MetricsData {
  totalActiveResellers: number
  pendingProvisioning: number
  systemHealth: string
}

async function fetchMetrics(): Promise<MetricsData> {
  const supabase = await createClient()

  try {
    const { data: resellers, error } = await supabase
      .from('resellers')
      .select('id, is_active, status, tenant_id')

    if (error || !resellers) {
      return {
        totalActiveResellers: 0,
        pendingProvisioning: 0,
        systemHealth: 'unknown',
      }
    }

    const totalActiveResellers = resellers.filter((r) => r.is_active === true).length
    const { count: pendingCount } = await supabase
      .from('user_resellers')
      .select('*', { count: 'exact', head: true })

    const hasPending = resellers.some((r) => r.status === 'Pending')
    const provisionedWithoutLink = resellers.length - (pendingCount ?? 0)
    const pendingProvisioning = hasPending ? Math.max(0, provisionedWithoutLink) : 0

    const connectedCount = resellers.length
    const systemHealth = connectedCount > 0 ? 'Operational' : 'Degraded'

    return {
      totalActiveResellers,
      pendingProvisioning,
      systemHealth,
    }
  } catch {
    return {
      totalActiveResellers: 0,
      pendingProvisioning: 0,
      systemHealth: 'error',
    }
  }
}

export default async function MetricsPanel() {
  const metrics = await fetchMetrics()

  const healthColor =
    metrics.systemHealth === 'Operational'
      ? 'text-green-400'
      : metrics.systemHealth === 'misconfigured'
        ? 'text-red-400'
        : 'text-yellow-400'

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
        <p className="text-sm text-gray-400 mb-1">Total Active Resellers</p>
        <p className="text-3xl font-bold text-white">{metrics.totalActiveResellers}</p>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
        <p className="text-sm text-gray-400 mb-1">Pending Provisioning</p>
        <p className="text-3xl font-bold text-white">{metrics.pendingProvisioning}</p>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
        <p className="text-sm text-gray-400 mb-1">System Health</p>
        <p className={`text-3xl font-bold ${healthColor}`}>{metrics.systemHealth}</p>
      </div>
    </div>
  )
}