'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

export type CommandIntent =
  | 'list_capabilities'
  | 'view_status'
  | 'get_help'
  | 'show_analytics';

export interface DetectedCommand {
  intent: CommandIntent;
  tenantId?: string;
  raw?: unknown;
}

export function useCommandListener(tenantId?: string) {
  const [commands, setCommands] = useState<DetectedCommand[]>([]);
  const latestRef = useRef<DetectedCommand | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handler = (event: Event) => {
      if (!(event instanceof MessageEvent)) return;

      let payload: unknown;
      try {
        payload = JSON.parse(event.data);
      } catch {
        return;
      }

      if (
        typeof payload === 'object' &&
        payload !== null &&
        'type' in payload &&
        typeof (payload as Record<string, unknown>).type === 'string'
      ) {
        const type = (payload as Record<string, unknown>).type as string;
        if (type === 'hannah:intent-command') {
          const data = (payload as Record<string, unknown>).data as Record<string, unknown> | undefined;
          const intentRaw = data?.intent;
          if (typeof intentRaw === 'string') {
            const intent = intentRaw as CommandIntent;
            const detected: DetectedCommand = {
              intent,
              tenantId: typeof data?.tenantId === 'string' ? (data.tenantId as string) : tenantId,
              raw: data,
            };
            latestRef.current = detected;
            setCommands((prev) => [...prev, detected]);
          }
        }
      }
    };

    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [tenantId]);

  const clear = useCallback(() => {
    setCommands([]);
    latestRef.current = null;
  }, []);

  return {
    commands,
    clear,
    reset: () => {
      latestRef.current = null;
      setCommands([]);
    },
  };
}
