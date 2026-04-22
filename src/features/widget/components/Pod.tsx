"use client";

import PodBubble from "./PodBubble";

export interface PodProps {
  tenantId: string;
}

export default function Pod({ tenantId }: PodProps) {
  return <PodBubble tenantId={tenantId} />;
}
