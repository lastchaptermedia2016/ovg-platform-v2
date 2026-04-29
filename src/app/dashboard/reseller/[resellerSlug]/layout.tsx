import { ReactNode } from "react";
import { BrandingFooter } from "@/components/reseller/BrandingFooter";

export default function ResellerLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <>
      {/* Fixed Background Lock */}
      <div 
        className="fixed top-0 left-0 w-[100vw] h-[100vh] z-[-10]"
        style={{
          backgroundImage: "url('/reseller-bg.jpg')",
          backgroundSize: 'cover',
          backgroundPosition: 'center -450px',
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
