"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createClient as createBrowserClient } from "@/lib/supabase/client";

type PresenceStatus = "online" | "offline" | "interacting";

interface UseWidgetPresenceOptions {
  heartbeatIntervalMs?: number;
  staleTimeoutMs?: number;
}

export function useWidgetPresence(
  tenantId: string | null,
  options: UseWidgetPresenceOptions = {}
) {
  const { heartbeatIntervalMs = 10000, staleTimeoutMs = 45000 } = options;

  const [status, setStatus] = useState<PresenceStatus>(tenantId ? "offline" : "offline");
  const lastEventRef = useRef<{ type: string; timestamp: number } | null>(null);
  const staleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartbeatTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTimers = useCallback(() => {
    if (staleTimerRef.current) {
      clearTimeout(staleTimerRef.current);
      staleTimerRef.current = null;
    }
    if (heartbeatTimerRef.current) {
      clearInterval(heartbeatTimerRef.current);
      heartbeatTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!tenantId) {
      return;
    }

    const supabase = createBrowserClient();
    const channel = supabase.channel(`presence:${tenantId}`);

    const scheduleStaleFallback = () => {
      clearTimers();
      staleTimerRef.current = setTimeout(() => {
        setStatus("offline");
      }, staleTimeoutMs);
    };

    const heartbeat = () => {
      channel.send({
        type: "broadcast",
        event: "heartbeat",
        payload: { timestamp: Date.now() },
      });
    };

    let isActive = true;

    channel.on("broadcast", { event: "status_change" }, (payload) => {
      if (!isActive) return;
      const eventType = (payload as { status?: string }).status || "online";
      lastEventRef.current = { type: eventType, timestamp: Date.now() };

      if (eventType === "interacting") {
        setStatus("interacting");
      } else if (eventType === "online") {
        setStatus("online");
      } else {
        setStatus("offline");
      }

      scheduleStaleFallback();
    });

    channel.subscribe((statusSub) => {
      if (!isActive) return;
      if (statusSub === "SUBSCRIBED") {
        setStatus("online");
        lastEventRef.current = { type: "online", timestamp: Date.now() };
        scheduleStaleFallback();
        heartbeatTimerRef.current = setInterval(heartbeat, heartbeatIntervalMs);
      }
    });

    return () => {
      isActive = false;
      clearTimers();
      supabase.removeChannel(channel);
    };
  }, [tenantId, heartbeatIntervalMs, staleTimeoutMs, clearTimers]);

  return status;
}