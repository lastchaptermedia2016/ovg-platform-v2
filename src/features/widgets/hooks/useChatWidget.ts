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
      // 2. Pillar 1 & 2: Unified API Request with streaming
      const res = await fetch("/api/chat/voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: input, tenantId, voice: "hannah" }),
      });

      if (!res.ok) throw new Error("Engine Timeout");

      // Add user message
      setMessages((prev) => [...prev, { role: "user", content: input }]);

      // 3. Stream response line-by-line
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader!.read();
        if (done) break;

        const text = decoder.decode(value, { stream: true });
        buffer += text;

        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) continue;
          const trimmed = line.trim();
          if (!trimmed) continue;

          try {
            if (!trimmed.startsWith("{")) continue;
            console.log("Parsing line:", trimmed.substring(0, 50));

            const parsed = JSON.parse(trimmed);

            if (parsed.type === "text") {
              setMessages((prev) => {
                const last = prev[prev.length - 1];
                if (last?.role === "assistant") {
                  last.content += parsed.content;
                  return [...prev];
                } else {
                  return [
                    ...prev,
                    { role: "assistant", content: parsed.content },
                  ];
                }
              });
            }

            if (parsed.type === "audio") {
              setStatus("speaking");
              const binaryString = atob(parsed.audioBase64);
              const bytes = new Uint8Array(binaryString.length);
              for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
              }
              const blob = new Blob([bytes], { type: "audio/wav" });
              const audio = new Audio(URL.createObjectURL(blob));
              audioRef.current = audio;
              audio.onended = () => setStatus("idle");
              await audio.play();
            }

            if (parsed.type === "error") {
              console.error(parsed.message);
              setStatus("error");
              setTimeout(() => setStatus("idle"), 1200);
            }
          } catch {
            console.error("Failed to parse stream chunk:", trimmed);
          }
        }
      }
    } catch (err) {
      console.error("Error sending message:", err);
      setStatus("error"); // Trigger 1.2s Red Glow
      setTimeout(() => setStatus("idle"), 1200);
    }
  };

  return { status, messages, sendMessage };
}
