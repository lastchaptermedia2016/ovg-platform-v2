"use client";

import dynamic from "next/dynamic";

const ChatWidget = dynamic(() => import("@/components/widget/ChatWidget"), {
  ssr: false,
  loading: () => (
    <div className="fixed bottom-6 right-6 z-[10000] h-14 w-14 rounded-full bg-gray-800 animate-pulse" />
  ),
});

export default ChatWidget;
