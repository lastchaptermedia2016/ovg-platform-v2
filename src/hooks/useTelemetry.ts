'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';

export interface TelemetryMetrics {
  totalCalls: number;
  avgResponse: number;
  successRate: number;
}

/**
 * Fetches and aggregates live performance telemetry for a tenant from
 * action_logs. PostgREST cannot express `avg(success::int) * 100` directly,
 * so a single filtered query returns the raw `success` / `duration_ms`
 * columns and the aggregation is computed client-side (equivalent result,
 * no extra RPC migration required).
 */
export function useTelemetry(tenantId: string) {
  const [metrics, setMetrics] = useState<TelemetryMetrics>({
    totalCalls: 0,
    avgResponse: 0,
    successRate: 0,
  });
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const initialized = useRef(false);

  const fetchTelemetry = useCallback(async () => {
    console.log('[useTelemetry] tenantId:', tenantId);

    if (!tenantId) return;

    setIsLoading(true);
    setError(null);

    try {
      const supabase = createClient();
      const { data, error: queryError } = await supabase
        .from('action_logs')
        .select('success, duration_ms')
        .eq('tenant_id', tenantId);

      if (queryError) {
        console.error('[useTelemetry] supabase query error', JSON.stringify(queryError, null, 2));
        throw queryError;
      }

      const rows = data ?? [];
      const totalCalls = rows.length;

      const avgResponse =
        totalCalls > 0
          ? rows.reduce((sum, r) => sum + (Number(r.duration_ms) || 0), 0) / totalCalls
          : 0;

      const successRate =
        totalCalls > 0
          ? (rows.filter((r) => r.success === true).length / totalCalls) * 100
          : 0;

      setMetrics({ totalCalls, avgResponse, successRate });
    } catch (err) {
      console.error('[useTelemetry] query failed', JSON.stringify(err, Object.getOwnPropertyNames(err), 2));
      setError(err instanceof Error ? err.message : 'Failed to load telemetry');
    } finally {
      setIsLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    if (!initialized.current) {
      if (tenantId) {
        initialized.current = true; // only latch once a real tenant resolves
      }
      fetchTelemetry(); // logs tenantId ('' or UUID); early-returns when empty
    }
  }, [tenantId, fetchTelemetry]);

  return { metrics, isLoading, error, refetch: fetchTelemetry };
}
