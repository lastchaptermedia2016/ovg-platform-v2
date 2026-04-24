"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import PodPanel from "@/features/widget/components/PodPanel";

export interface PodBubbleProps {
  tenantId: string;
  brandingColor?: string;
  voiceId?: string | null;
  name?: string;
}

export default function PodBubble({
  tenantId,
  brandingColor = "#0097b2",
  voiceId,
  name,
}: PodBubbleProps) {
  const [isOpen, setIsOpen] = useState(false);

  // Production Excellence: Portal the bubble to document.body
  const bubbleContent = (
    <button
      onClick={() => setIsOpen(!isOpen)}
      aria-label={isOpen ? "Close Chat" : "Open Chat"}
      style={{
        position: "fixed",
        bottom: "2rem",
        right: "2rem",
        zIndex: 9999,
        width: "64px",
        height: "64px",
        backgroundColor: brandingColor,
        borderRadius: "22px",
        boxShadow: `0 4px 20px rgba(0,0,0,0.3), 0 0 30px ${brandingColor}66, 0 0 0 2px rgba(212,175,55,0.3)`,
        border: "none",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        animation: "pod-pulse 3s ease-in-out infinite",
        transition: "transform 0.3s ease, box-shadow 0.3s ease",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "scale(1.1) translateY(-4px)";
        e.currentTarget.style.boxShadow = `0 8px 30px rgba(0,0,0,0.4), 0 0 40px ${brandingColor}88, 0 0 0 3px rgba(212,175,55,0.5)`;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "scale(1) translateY(0)";
        e.currentTarget.style.boxShadow = `0 4px 20px rgba(0,0,0,0.3), 0 0 30px ${brandingColor}66, 0 0 0 2px rgba(212,175,55,0.3)`;
      }}
      onMouseDown={(e) => {
        e.currentTarget.style.transform = "scale(0.95)";
      }}
      onMouseUp={(e) => {
        e.currentTarget.style.transform = "scale(1.1) translateY(-4px)";
      }}
    >
      {/* Premium Glow Ring */}
      <div
        style={{
          position: "absolute",
          inset: "-4px",
          borderRadius: "26px",
          background: `linear-gradient(135deg, ${brandingColor}44, transparent, #D4AF3733)`,
          zIndex: -1,
          animation: "spin-slow 8s linear infinite",
        }}
      />

      {/* Lightning Icon */}
      <div
        style={{
          position: "relative",
          zIndex: 10,
          transition: "all 0.5s ease",
          opacity: isOpen ? 0 : 1,
          transform: isOpen ? "scale(0.5) rotate(-90deg)" : "scale(1) rotate(0deg)",
        }}
      >
        <svg
          width="28"
          height="28"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#D4AF37"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
        </svg>
      </div>

      {/* Close Icon */}
      <div
        style={{
          position: "absolute",
          zIndex: 10,
          transition: "all 0.5s ease",
          opacity: isOpen ? 1 : 0,
          transform: isOpen ? "scale(1) rotate(0deg)" : "scale(0.5) rotate(90deg)",
        }}
      >
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="white"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </div>
    </button>
  );

  return (
    <>
      <PodPanel
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        tenantId={tenantId}
        voiceId={voiceId}
        name={name}
      />

      {/* Portal the bubble to document.body */}
      {typeof document !== "undefined" &&
        createPortal(bubbleContent, document.body)}
    </>
  );
}
