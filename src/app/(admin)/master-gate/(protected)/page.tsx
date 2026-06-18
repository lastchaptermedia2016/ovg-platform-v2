import MetricsPanel from '@/components/MetricsPanel'
import TenantRegistryTable from '@/components/TenantRegistryTable'

export default function MasterGatePage() {
  return (
    <div className="min-h-screen bg-gray-950 text-white p-6 md:p-12">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl md:text-4xl font-bold mb-2 text-white">Master Admin Console</h1>
        <p className="text-gray-400 mb-8">System overview and reseller registry.</p>

        <div className="mb-8">
          <MetricsPanel />
        </div>

        <TenantRegistryTable />
      </div>
    </div>
  )
}
