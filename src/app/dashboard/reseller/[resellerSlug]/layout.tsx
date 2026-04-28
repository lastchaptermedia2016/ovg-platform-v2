import { ReactNode } from "react";
import { BrandingFooter } from "@/components/reseller/BrandingFooter";
import { MasterpieceHeader } from "@/components/reseller/MasterpieceHeader";
import SovereignNav from "@/components/reseller/SovereignNav";

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
      <div className="w-full flex flex-col items-center overflow-x-hidden relative h-screen">
        <div className="relative z-10 flex flex-col h-full w-full gap-4">
          {/* Header & Nav Section */}
          <div className="w-full flex justify-center">
            <div className="w-full max-w-[1200px] flex flex-col items-center px-6">
              <MasterpieceHeader />
              
              <div className="fixed md:static top-[112px] left-0 right-0 z-[99]">
                <div className="w-full max-w-[1200px] mx-auto px-6">
                  <SovereignNav slug="acme-corp" />
                </div>
              </div>
            </div>
          </div>

          {/* Main Content */}
          <main className="w-full flex justify-center overflow-y-auto pt-[280px] md:pt-[280px] relative z-0">
            <div className="w-full max-w-[1200px] flex flex-col items-center px-6">
              {children}
            </div>
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
