'use client';

import { useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { isInvalidSlug } from '@/lib/utils/guard';

export default function ClientRedirectPage() {
  const router = useRouter();
  const params = useParams();
  // CRITICAL: Use String() runtime coercion, not TypeScript's compile-time `as string`.
  // useParams() can return a Proxy object during SSR/hydration that hasn't resolved
  // to a primitive string yet. String() ensures a primitve is always passed downstream.
  const resellerSlug = String(params.resellerSlug ?? '');

  // 🔷 Production Excellence: Detect Next.js hydration issues with route params
  if (isInvalidSlug(resellerSlug)) {
    console.error('%c[Pierre] ❌ Route parameter failed to resolve (client redirect):', 'color: #0097b2; font-weight: bold;', { resellerSlug, params });
  }

  useEffect(() => {
    // Hannah Hook: Notify about wrong turn before redirect
    if (resellerSlug && !isInvalidSlug(resellerSlug)) {
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
