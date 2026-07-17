"use client";

import { useWidgetPresence } from "@/hooks/useWidgetPresence";
import { cornerStyle } from "@/lib/branding/widget-position";

const STATUS_STYLES: Record<string, React.CSSProperties> = {
  online: {
    width: "10px",
    height: "10px",
    borderRadius: "50%",
    backgroundColor: "#00f0ff",
    boxShadow: "0 0 10px rgba(0, 240, 255, 0.5)",
    animation: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
  },
  interacting: {
    width: "10px",
    height: "10px",
    borderRadius: "50%",
    backgroundColor: "#FFD700",
    boxShadow: "0 0 10px rgba(255, 215, 0, 0.7)",
    animation: "pulse 1s cubic-bezier(0.4, 0, 0.6, 1) infinite",
  },
  offline: {
    width: "10px",
    height: "10px",
    borderRadius: "50%",
    backgroundColor: "rgba(255, 255, 255, 0.25)",
    boxShadow: "none",
  },
};

export default function WidgetPresence({
  tenantId,
  widgetPosition,
}: {
  tenantId: string;
  widgetPosition?: string;
}) {
  const status = useWidgetPresence(tenantId, {
    heartbeatIntervalMs: 10000,
    staleTimeoutMs: 45000,
  });

  return (
    <div
      style={{
        ...cornerStyle(widgetPosition as Parameters<typeof cornerStyle>[0]),
        zIndex: 9998,
        display: "inline-flex",
        alignItems: "center",
        gap: "8px",
        padding: "6px 12px",
        borderRadius: "9999px",
        backdropFilter: "blur(12px)",
        backgroundColor: "rgba(0, 0, 0, 0.35)",
        border: "1px solid rgba(255, 255, 255, 0.1)",
        boxShadow: "0 4px 20px rgba(0, 0, 0, 0.25)",
      }}
      title={`Widget status: ${status}`}
      aria-live="polite"
    >
      <span style={STATUS_STYLES[status]} aria-hidden="true" />
      <span
        style={{
          color: "rgba(255, 255, 255, 0.85)",
          fontSize: "11px",
          fontWeight: 600,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
        }}
      >
        {status}
      </span>
    </div>
  );
}