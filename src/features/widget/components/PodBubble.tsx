"use client";

import { useState } from "react";
import PodPanel from "@/features/widget/components/PodPanel";

export default function PodBubble() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <PodPanel isOpen={isOpen} onClose={() => setIsOpen(false)} />

      {/* Pod Bubble */}
      <div className="fixed bottom-10 right-10 z-[10001] animate-pod-breath group">
        <button
          className="pod-bubble w-16 h-16 rounded-[22px] flex items-center justify-center cursor-pointer overflow-hidden shadow-xl bg-[rgba(0,26,44,0.85)] backdrop-blur-md border border-[var(--primary-gold)]/30 transition-all duration-400 ease-[cubic-bezier(0.175,0.885,0.32,1.275)] animate-gold-heartbeat [animation-duration:3s] hover:border-[var(--primary-gold)] hover:scale-110 hover:-translate-y-1 hover:shadow-[0_10px_25px_-5px_rgba(0,0,0,0.3),0_0_30px_rgba(212,175,55,0.5)] hover:[animation-duration:1.5s] active:scale-95"
          onClick={() => setIsOpen(!isOpen)}
          aria-label={isOpen ? "Close Chat" : "Open Chat"}
        >
          {/* Reactor Core */}
          <div className="reactor-core absolute inset-0 opacity-20 pointer-events-none animate-reactor-spin">
            <svg
              viewBox="0 0 100 100"
              className="w-full h-full stroke-[var(--primary-gold)] fill-none"
            >
              <circle cx="50" cy="50" r="40" strokeDasharray="20 10" />
            </svg>
          </div>

          {/* Lightning Icon */}
          <div
            className={`relative z-10 transition-all duration-500 ${
              isOpen
                ? "opacity-0 scale-50 -rotate-90"
                : "opacity-100 scale-100 rotate-0"
            }`}
          >
            <svg
              className="w-8 h-8 text-[var(--primary-gold)]"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.5"
                d="M13 10V3L4 14h7v7l9-11h-7z"
              />
            </svg>
          </div>

          {/* Close Icon */}
          <div
            className={`absolute z-10 transition-all duration-500 ${
              isOpen
                ? "opacity-100 scale-100 rotate-0"
                : "opacity-0 scale-50 rotate-90"
            }`}
          >
            <svg
              className="w-7 h-7 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </div>
        </button>
      </div>
    </>
  );
}
