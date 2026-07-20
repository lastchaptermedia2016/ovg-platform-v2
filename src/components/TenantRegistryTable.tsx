import { createClient } from '@/lib/supabase/server'

import type { ResellerRecord } from '@/types/database'

export { ResellerRecord }

function StatusBadge({ isActive }: { isActive: boolean }) {
  const color = isActive ? 'bg-green-500/20 text-green-400 border-green-500/30' : 'bg-red-500/20 text-red-400 border-red-500/30'
  return <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${color}`}>{isActive ? 'Active' : 'Inactive'}</span>
}

export default async function TenantRegistryTable() {
  const supabase = await createClient()

  const { data: resellers, error } = await supabase
    .from('resellers')
    .select('id, tenant_id, name, owner_email, is_active, created_at, updated_at, branding_colors, branding_assets')
    .order('created_at', { ascending: false })

  if (error) {
    return <div className="text-red-400">Failed to load reseller registry: {error.message}</div>
  }

  const records: ResellerRecord[] = (resellers ?? []).map((r) => ({
    ...r,
    branding_assets: (r as ResellerRecord).branding_assets ?? {
      header_url: null,
      footer_url: null,
    },
  }))

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-white">Tenant Registry</h2>
        <p className="text-sm text-gray-500">All resellers seeded through the master console.</p>
      </div>

      <div className="overflow-x-auto bg-gray-900 border border-gray-800 rounded-lg">
        <table className="min-w-full divide-y divide-gray-800">
          <thead className="bg-gray-800/50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Name</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Slug</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Owner Email</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Stripe Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Created At</th>
            </tr>
          </thead>
          <tbody className="bg-gray-900 divide-y divide-gray-800">
            {records.map((r) => (
              <tr key={r.id} className="hover:bg-gray-800/40">
                <td className="px-6 py-4 whitespace-nowrap text-sm text-white">{r.name}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300 font-mono">{r.tenant_id}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{r.owner_email}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300"><StatusBadge isActive={r.is_active} /></td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{r.stripe_account_id ? 'Connected' : 'Not connected'}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{r.created_at ? new Date(r.created_at).toLocaleString() : '—'}</td>
              </tr>
            ))}
            {records.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-8 text-center text-sm text-gray-500">No resellers provisioned yet.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  )
}