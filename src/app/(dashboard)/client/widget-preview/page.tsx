"use client";

import { TenantProvider } from "@/providers/tenant-provider";
import PodBubble from "@/components/widget/PodBubble";

export default function WidgetPreviewPage() {
  return (
    <TenantProvider>
      <div className="min-h-screen p-8 bg-slate-900">
        <h1 className="text-4xl font-bold mb-8 text-white">Widget Preview</h1>
        <p className="text-slate-400 mb-4">
          The floating bubble should appear in the bottom-right corner.
        </p>
        <PodBubble tenantId="demo" />
      </div>
    </TenantProvider>
  );
}
