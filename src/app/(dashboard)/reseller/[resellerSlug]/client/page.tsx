'use client';

import { useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';

export default function ClientRedirectPage() {
  const router = useRouter();
  const params = useParams();
  const resellerSlug = params.resellerSlug as string;

  useEffect(() => {
    // Hannah Hook: Notify about wrong turn before redirect
    if (resellerSlug) {
      // Set a flag in sessionStorage for Hannah to detect
      sessionStorage.setItem('hannah_wrong_turn', 'true');
      sessionStorage.setItem('hannah_welcome_back', 'true');
      
      // Redirect from /reseller/[slug]/client to /reseller/[slug]/clients
      router.replace(`/reseller/${resellerSlug}/clients`);
    }
  }, [resellerSlug, router]);

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-white/60">Redirecting to clients...</div>
    </div>
  );
}
