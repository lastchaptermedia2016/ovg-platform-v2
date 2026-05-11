import { ReactNode } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BrandingFooter } from "@/components/reseller/BrandingFooter";

// Production Excellence: Critical Security - Server-side Authorization Check
async function verifyResellerAccess(resellerSlug: string) {
  try {
    const supabase = await createClient();
    
    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      console.error("OVG-PLATFORM-V2: AUTH ERROR - No authenticated user found");
      return { authorized: false, redirectTo: "/auth" };
    }
    
    // Extract user's reseller_slug from metadata
    const userResellerSlug = user.user_metadata?.reseller_slug;
    
    if (!userResellerSlug) {
      console.log("OVG-PLATFORM-V2: User missing reseller_slug metadata - redirecting to fix");
      console.log("OVG-PLATFORM-V2: User needs metadata fix, redirecting to auth");
      return { authorized: false, redirectTo: "/auth" };
    }
    
    // Hierarchy-First Auth: Compare URL slug with user's authorized slug
    if (userResellerSlug !== resellerSlug) {
      console.error("OVG-PLATFORM-V2: SECURITY BREACH ATTEMPT - User", user.id, 
        "tried to access reseller", resellerSlug, "but is authorized for", userResellerSlug);
      return { authorized: false, redirectTo: `/reseller/${userResellerSlug}/clients` };
    }
    
    // Establish Identity: If slugs match, user is authorized as Reseller Admin
    // Grant access directly without checking tenants table (decoupled from tenant data)
    console.log("OVG-PLATFORM-V2: Hierarchy-First Auth passed for user", user.id, "reseller", resellerSlug);
    return { authorized: true, redirectTo: null };
    
  } catch (error) {
    console.error("OVG-PLATFORM-V2: CRITICAL SECURITY ERROR:", error);
    return { authorized: false, redirectTo: "/auth" };
  }
}

export default async function ResellerLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ resellerSlug: string }>;
}) {
  // Production Excellence: Execute security check before any rendering
  const { resellerSlug } = await params;
  const securityCheck = await verifyResellerAccess(resellerSlug);
  
  // Critical Security: Redirect unauthorized access immediately
  if (!securityCheck.authorized && securityCheck.redirectTo) {
    redirect(securityCheck.redirectTo);
  }
  
  return (
    <>
      {/* Fixed Background Lock - Original Background */}
      <div 
        className="fixed top-0 left-0 w-[100vw] h-[100vh] z-[-10]"
        style={{
          backgroundImage: "url('/reseller-bg.jpg')",
          backgroundSize: 'cover',
          backgroundPosition: 'center top 20%',
          backgroundRepeat: 'no-repeat',
          backgroundAttachment: 'fixed',
          backgroundColor: '#000',
        }}
      />
      
      {/* Dashboard Spine */}
      <div className="w-full flex flex-col items-center overflow-x-hidden relative min-h-screen">
        <div className="relative z-10 flex flex-col w-full">
          {/* Main Content - Page handles its own header */}
          <main className="w-full">
            {children}
          </main>
          
          {/* Footer */}
          <div className="w-full flex justify-center">
            <BrandingFooter />
          </div>
        </div>
      </div>
    </>
  );
}
