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
    <div className="fixed bottom-20 right-4 w-96 h-96 bg-white rounded-lg shadow-lg border border-gray-200">
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
