"use client";

import { useEffect, useState } from "react";
import { getTenantData } from "@/lib/actions/tenant";
import { useTenant } from "@/providers/tenant-provider";
import { Tenant } from "@/types";

export default function Home() {
  const urlParams = new URLSearchParams(
    typeof window !== "undefined" ? window.location.search : "",
  );
  const tenantSlug = urlParams.get("tenant");
  const [tenantData, setTenantData] = useState<Tenant | null>(null);
  const [loadingTenant, setLoadingTenant] = useState(!!tenantSlug);
  const { setTenantData: setGlobalTenantData } = useTenant();

  useEffect(() => {
    if (tenantSlug) {
      getTenantData(tenantSlug).then((data) => {
        setTenantData(data);
        setGlobalTenantData(data);
        setLoadingTenant(false);
      });
    }
  }, [tenantSlug, setGlobalTenantData]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8">
      <h1 className="text-[var(--primary-gold)] text-4xl font-bold mb-8">
        OVG Platform v2: Phoenix Rising
      </h1>

      {loadingTenant && (
        <div className="mt-6 text-[var(--deep-blue)]">
          Loading tenant data...
        </div>
      )}

      {tenantData && (
        <div className="mt-8 p-6 rounded-lg border-2 border-[var(--primary-gold)] bg-[rgba(212, 175, 55, 0.1)]">
          <h2 className="text-2xl font-bold text-[var(--primary-gold)] mb-4">
            Tenant Information
          </h2>
          <div className="space-y-2">
            <p className="text-white">
              <span className="font-semibold text-[var(--deep-blue)]">
                Tenant Name:
              </span>{" "}
              {tenantData.name}
            </p>
            <p className="text-white">
              <span className="font-semibold text-[var(--deep-blue)]">
                AI Name:
              </span>{" "}
              {tenantData.branding?.aiName}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
