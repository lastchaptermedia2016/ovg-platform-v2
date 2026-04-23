"use client";

import { createContext, useContext, useState, ReactNode } from "react";
import { useBranding } from "@/lib/hooks/useBranding";
import { Tenant } from "@/types";

interface TenantContextType {
  tenantData: Tenant | null;
  setTenantData: (data: Tenant | null) => void;
}

const TenantContext = createContext<TenantContextType | undefined>(undefined);

export function TenantProvider({ children }: { children: ReactNode }) {
  const [tenantData, setTenantData] = useState<Tenant | null>(null);

  useBranding(tenantData ? { primaryColor: tenantData.branding_color } : null);

  return (
    <TenantContext.Provider value={{ tenantData, setTenantData }}>
      {children}
    </TenantContext.Provider>
  );
}

export function useTenant() {
  const context = useContext(TenantContext);
  if (context === undefined) {
    return { tenantData: null, setTenantData: () => {} };
  }
  return context;
}
