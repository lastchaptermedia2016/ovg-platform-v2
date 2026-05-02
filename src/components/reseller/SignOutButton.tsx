"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client"; // Using our Singleton pattern

export function SignOutButton() {
  const router = useRouter();
  const supabase = createClient();
  const [isSigningOut, setIsSigningOut] = useState(false);

  const handleSignOut = async () => {
    console.log("OVG-PLATFORM-V2: Initiating secure sign-out...");
    
    // Production Excellence: Prevent flash states with loading state
    setIsSigningOut(true);
    
    try {
      const { error } = await supabase.auth.signOut();
      
      if (error) {
        console.error("OVG-PLATFORM-V2: Sign-out error", error);
        setIsSigningOut(false);
        return;
      }

      console.log("OVG-PLATFORM-V2: Sign-out successful, redirecting to auth");
      
      // Direct path back to the gatekeeper
      router.push("/auth");
      router.refresh(); // Clears any server-side cached segments
    } catch (error) {
      console.error("OVG-PLATFORM-V2: Unexpected sign-out error:", error);
      setIsSigningOut(false);
    }
  };

  return (
    <button 
      onClick={handleSignOut}
      disabled={isSigningOut}
      className={`px-3 py-1 text-[9px] font-medium tracking-wider uppercase transition-all duration-300 rounded-lg backdrop-blur-md border ${
        isSigningOut
          ? 'text-white/40 border-white/10 bg-white/5 cursor-not-allowed'
          : 'text-gray-300 hover:text-white border-white/10 hover:border-white/20 hover:bg-white/10'
      }`}
    >
      {isSigningOut ? (
        <span className="flex items-center gap-2">
          <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          SIGNING OUT...
        </span>
      ) : (
        'SIGN OUT'
      )}
    </button>
  );
}
