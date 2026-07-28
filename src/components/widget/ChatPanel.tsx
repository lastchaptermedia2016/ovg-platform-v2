"use client";

import { useState } from "react";
import { Message } from "@/types";

interface ChatPanelProps {
  isOpen: boolean;
}

export default function ChatPanel({ isOpen }: ChatPanelProps) {
  const [messages] = useState<Message[]>([]);
  const [input, setInput] = useState("");

  if (!isOpen) return null;

  return (
    <div className="fixed bottom-4 right-4 sm:bottom-20 sm:right-4 w-[calc(100vw-2rem)] sm:w-96 h-[80vh] sm:h-[480px] max-h-[600px] overflow-hidden shadow-2xl z-50 bg-white rounded-lg border border-gray-200">
      <div className="p-4 border-b">
        <h2 className="font-bold">Chat</h2>
      </div>
      <div className="p-4 h-64 overflow-y-auto">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`mb-2 ${msg.role === "user" ? "text-right" : "text-left"}`}
          >
            <span className="inline-block px-3 py-1 rounded bg-gray-100">
              {msg.content}
            </span>
          </div>
        ))}
      </div>
      <div className="p-4 border-t">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          className="w-full px-3 py-2 border rounded"
          placeholder="Type a message..."
        />
      </div>
    </div>
  );
}
