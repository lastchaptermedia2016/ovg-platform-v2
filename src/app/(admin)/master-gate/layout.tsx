export const dynamic = 'force-dynamic'

export default async function MasterGateLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <div className="min-h-screen bg-gray-950 text-white">{children}</div>
}