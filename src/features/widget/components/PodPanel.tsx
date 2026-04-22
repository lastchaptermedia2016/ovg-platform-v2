"use client";

import { useState, useRef, useEffect } from "react";
import { useTenant } from "@/providers/tenant-provider";
import { dispatchVoice } from "@/lib/audio/dispatcher";
import { Message } from "@/types";

export default function PodPanel({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const { tenantData } = useTenant();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState<
    "ready" | "speaking" | "error"
  >("ready");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const aiName = tenantData?.branding?.aiName || "Orpheus AI";

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  const handleSendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: userMessage }]);
    setIsLoading(true);

    try {
      const response = await fetch("/api/chat/voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMessage,
          tenantId: "demo", // This should come from URL or context
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Orpheus is recalibrating...");
      }

      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.text },
      ]);

      // Play Orpheus TTS audio from unified response
      if (data.audioBase64) {
        setVoiceStatus("speaking");
        const audio = new Audio(`data:audio/wav;base64,${data.audioBase64}`);
        audio.onended = () => setVoiceStatus("ready");
        await audio.play();
      } else {
        setVoiceStatus("ready");
      }
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Orpheus is recalibrating...";
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: errorMessage },
      ]);
      setVoiceStatus("error");
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed bottom-32 right-10 w-80 h-96 bg-slate-800 rounded-2xl border border-white/10 shadow-2xl flex flex-col overflow-hidden z-[10000] transition-all duration-400 ease-out">
      {/* Header */}
      <div className="p-4 bg-[var(--deep-blue)] border-b border-[var(--primary-gold)]/30 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <span className="text-[var(--primary-gold)] font-bold">{aiName}</span>
          <span className="text-[10px] text-white/60">
            {voiceStatus === "ready" && "Orpheus Engine Ready"}
            {voiceStatus === "speaking" && "Speaking..."}
            {voiceStatus === "error" && "Voice Error"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div
            className={`w-2 h-2 rounded-full ${
              voiceStatus === "ready"
                ? "bg-green-500 animate-pulse"
                : voiceStatus === "speaking"
                  ? "bg-yellow-500"
                  : "bg-red-500"
            }`}
          />
          <button
            onClick={onClose}
            className="text-white/60 hover:text-white transition-colors"
            aria-label="Close"
          >
            <svg
              className="w-4 h-4"
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
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 p-4 overflow-y-auto space-y-3">
        {messages.length === 0 ? (
          <div className="text-slate-400 text-sm italic text-center mt-8">
            Systems initialized... Ready for input.
          </div>
        ) : (
          messages.map((msg, index) => (
            <div
              key={index}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[80%] px-3 py-2 rounded-lg text-sm ${
                  msg.role === "user"
                    ? "bg-[var(--primary-gold)] text-black"
                    : "bg-slate-700 text-white"
                }`}
              >
                {msg.content}
              </div>
            </div>
          ))
        )}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-slate-700 px-3 py-2 rounded-lg text-sm text-white">
              <div className="flex gap-1">
                <div className="w-2 h-2 bg-white/60 rounded-full animate-bounce" />
                <div className="w-2 h-2 bg-white/60 rounded-full animate-bounce delay-100" />
                <div className="w-2 h-2 bg-white/60 rounded-full animate-bounce delay-200" />
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-white/10">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Type your message..."
            className="flex-1 bg-[var(--deep-blue)] border border-[var(--primary-gold)] rounded-lg px-3 py-2 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-[var(--primary-gold)]/50"
            disabled={isLoading}
          />
          <button
            onClick={handleSendMessage}
            disabled={isLoading || !input.trim()}
            className="bg-[var(--primary-gold)] text-black px-4 py-2 rounded-lg font-semibold hover:bg-[#c9a030] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
