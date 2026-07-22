import { createClient } from '@/lib/supabase/server';
import { resolveTenantId } from '@/lib/resolveTenantId';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  let tenantId: string | null = null;
  if (user?.id) {
    const resolved = await resolveTenantId(user.id, supabase);
    if (resolved.data) {
      tenantId = resolved.data;
    }
  }

  const payload = user
    ? {
        tenantId,
        user: {
          id: user.id,
          email: user.email || undefined,
        },
      }
    : null;

  if (!payload) {
    return <>{children}</>;
  }

  return (
    <>
      {children}
      <script
        id="__INITIAL_SESSION__"
        type="application/json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(payload) }}
      />
    </>
  );
}
