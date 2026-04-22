import { useState, useRef } from "react";
import { Message } from "@/types";

export type KineticState = "idle" | "thinking" | "speaking" | "error";

export function useChatWidget(tenantId: string) {
  const [status, setStatus] = useState<KineticState>("idle");
  const [messages, setMessages] = useState<Message[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const sendMessage = async (input: string) => {
    // 1. Interruption Logic
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }

    setStatus("thinking"); // Trigger Rapid Gold Spin

    try {
      // 2. Pillar 1 & 2: Unified API Request
      const response = await fetch("/api/chat/voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: input, tenantId }),
      });

      if (!response.ok) throw new Error("Engine Timeout");

      const data = await response.json();

      // 3. Update UI Text
      setMessages((prev) => [
        ...prev,
        { role: "user", content: input },
        { role: "assistant", content: data.text },
      ]);

      // 4. Play Unified Voice using Orpheus TTS audio
      if (data.audioBase64) {
        setStatus("speaking"); // Trigger Harmonic Pulse
        const audio = new Audio(`data:audio/wav;base64,${data.audioBase64}`);
        audioRef.current = audio;
        audio.onended = () => setStatus("idle");
        await audio.play();
      } else {
        setStatus("idle");
      }
    } catch {
      setStatus("error"); // Trigger 1.2s Red Glow
      setTimeout(() => setStatus("idle"), 1200);
    }
  };

  return { status, messages, sendMessage };
}
