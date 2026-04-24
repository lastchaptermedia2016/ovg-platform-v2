import { BrandedHeader } from "@/components/branding/branded-header";
import { BrandedFooter } from "@/components/branding/branded-header";

/**
 * Client Layout - White-label dashboard for clients
 * URL pattern: /client/[slug]/...
 * Branding is inherited from parent reseller if not explicitly set
 */
export default function ClientLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { slug: string };
}) {
  return (
    <div className="min-h-screen flex flex-col">
      <BrandedHeader />
      <main className="flex-1 p-6">{children}</main>
      <BrandedFooter />
    </div>
  );
}
