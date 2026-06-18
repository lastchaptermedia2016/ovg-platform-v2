import { getAuthenticatedUser } from '@/lib/auth/server'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function MasterGateLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { user, error } = await getAuthenticatedUser()

  if (error || !user || user.app_metadata?.role !== 'super_admin') {
    redirect('/master-gate/login')
  }

  return <div className="min-h-screen bg-gray-950 text-white">{children}</div>
}