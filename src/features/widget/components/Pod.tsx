"use client";

import PodBubble from "@/components/widget/PodBubble";

export interface PodProps {
  tenantId: string;
}

export default function Pod({ tenantId }: PodProps) {
  return <PodBubble tenantId={tenantId} />;
}
