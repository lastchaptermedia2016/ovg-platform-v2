"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Integration, UpdateIntegrationPayload } from "@/types/integrations";

export function useIntegrations() {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const initialized = useRef(false);

  const fetchIntegrations = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/integrations");
      if (!response.ok) throw new Error("Failed to fetch integrations data.");
      const data: Integration[] = await response.json();
      setIntegrations(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unknown error occurred");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const updateIntegration = useCallback(async (id: string, payload: UpdateIntegrationPayload) => {
    setError(null);
    try {
      const response = await fetch("/api/integrations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...payload }),
      });

      if (!response.ok) throw new Error("Failed to update integration configuration.");

      const updated: Integration = await response.json();
      setIntegrations((prev) =>
        prev.map((item) => (item.id === id ? updated : item))
      );
      return updated;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Mutation failed");
      throw err;
    }
  }, []);

  useEffect(() => {
    if (!initialized.current) {
      initialized.current = true;
      fetchIntegrations();
    }
  }, [fetchIntegrations]);

  return { integrations, isLoading, error, refetch: fetchIntegrations, updateIntegration };
}
