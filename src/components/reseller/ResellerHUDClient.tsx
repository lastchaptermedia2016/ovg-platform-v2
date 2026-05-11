
'use client';

import { useSyncExternalStore } from 'react';
import { MasterpieceHeader } from './MasterpieceHeader';

export interface Reseller {
  id: string;
  name: string;
  slug: string;
  [key: string]: unknown;
}

export interface ClientBasic {
  id: string;
  name: string;
  [key: string]: unknown;
}

export interface BrandingData {
  logo_url?: string;
  primary_color?: string;
  [key: string]: unknown;
}

interface ResellerHUDClientProps {
  reseller: Reseller;
  clients: ClientBasic[];
  clientCount: number;
  branding: BrandingData;
}

function useHydrated() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
}

export function ResellerHUDClient(props: ResellerHUDClientProps) {
  const { reseller, clients, clientCount, branding } = props;
  const isMounted = useHydrated();

  if (!reseller || !clients || !clientCount || !branding) return null;

  if (!isMounted) {
    return <div className="fixed inset-0 z-[99999]" />;
  }

  return (
    <div className="fixed inset-0 overflow-hidden">
      <MasterpieceHeader />
      <div className="absolute top-32 left-12 right-12 bottom-12 z-10">
      </div>
    </div>
  );
}
