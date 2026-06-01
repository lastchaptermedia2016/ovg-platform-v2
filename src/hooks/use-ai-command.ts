'use client';

import { useState, useCallback } from 'react';

interface TenantContext {
  tenantId?: string;
  category?: string;
}

interface AICommandResponse {
  success: boolean;
  actionType: 'SINGLE' | 'BULK' | 'NO_MATCH' | 'DELETE_CLIENT';
  targetIds?: string[];
  clientName?: string;
  payload?: Record<string, unknown>;
  summary: string;
  metadata: {
    processedAt: string;
    resellerId: string;
    model: string;
  };
}

interface UseAICommandReturn {
  isAnalyzing: boolean;
  isModalOpen: boolean;
  isDeploying: boolean;
  isDeleting: boolean;
  deleteResult: { success: boolean; clientName?: string; clientId?: string } | null;
  technicalSummary: string;
  configPatch: Record<string, unknown> | null;
  targetTenantId: string | null;
  error: string | null;
  handleCommandSubmit: (command: string, currentConfig: Record<string, unknown>, tenantContext: TenantContext, resellerId: string, onResponse?: (response: AICommandResponse) => void) => Promise<AICommandResponse | undefined>;
  handleConfirmDeployment: () => Promise<void>;
  openModal: () => void;
  closeModal: () => void;
  resetState: () => void;
}

interface ApiErrorResponse {
  error?: string;
  details?: string;
  message?: string;
}

interface ApiSuccessResponse {
  actionType?: 'SINGLE' | 'BULK';
  targetIds?: string[];
  payload?: Record<string, unknown>;
  configPatch?: Record<string, unknown>;
  summary?: string;
  technicalSummary?: string;
  metadata?: {
    processedAt: string;
    resellerId: string;
    model: string;
  };
}

export function useAICommand(): UseAICommandReturn {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeploying, setIsDeploying] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteResult, setDeleteResult] = useState<{ success: boolean; clientName?: string; clientId?: string } | null>(null);
  const [technicalSummary, setTechnicalSummary] = useState('');
  const [configPatch, setConfigPatch] = useState<Record<string, unknown> | null>(null);
  const [targetTenantId, setTargetTenantId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const resetState = useCallback(() => {
    setIsAnalyzing(false);
    setIsModalOpen(false);
    setIsDeploying(false);
    setIsDeleting(false);
    setDeleteResult(null);
    setTechnicalSummary('');
    setConfigPatch(null);
    setTargetTenantId(null);
    setError(null);
  }, []);

  const openModal = useCallback(() => {
    setIsModalOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    if (!isDeploying) {
      setIsModalOpen(false);
    }
  }, [isDeploying]);

  const handleCommandSubmit = useCallback(async (
    command: string,
    currentConfig: Record<string, unknown>,
    tenantContext: TenantContext,
    resellerId: string,
    onResponse?: (response: AICommandResponse) => void
  ): Promise<AICommandResponse | undefined> => {
    setIsAnalyzing(true);
    setError(null);
    if (tenantContext.tenantId) {
      setTargetTenantId(tenantContext.tenantId);
    }

    // Validate all inputs before sending
    if (!resellerId || resellerId.trim() === '') {
      console.error('%c[useAICommand] ❌ Missing resellerId', 'color: #0097b2; font-weight: bold;');
      setError('Missing reseller ID');
      setIsAnalyzing(false);
      return;
    }

    if (!command || command.trim() === '') {
      console.error('%c[useAICommand] ❌ Missing userCommand', 'color: #0097b2; font-weight: bold;');
      setError('Missing command');
      setIsAnalyzing(false);
      return;
    }

    // Guard clause: tenantContext must be valid object
    if (!tenantContext || typeof tenantContext !== 'object') {
      console.error('%c[useAICommand] ❌ tenantContext is null or undefined', 'color: #0097b2; font-weight: bold;', { tenantContext });
      setError('Missing tenant context');
      setIsAnalyzing(false);
      return;
    }

    // Prepare request body with defaults
    const requestBody = {
      resellerId: resellerId.trim(),
      userCommand: command.trim(),
      currentConfig: currentConfig || {},
      tenantContext: {
        tenantId: tenantContext.tenantId,
        category: tenantContext.category || 'GENERAL',
      },
    };

    try {
      const response = await fetch('/api/ai/process-command', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      // ── Diagnostic instrumentation: capture raw body before parsing ──────
      // response.text() never throws on empty bodies; response.json() does.
      // This lets us distinguish infrastructure-level failures (empty body,
      // HTML error page) from route-level JSON error responses.
      const rawBody = await response.text();

      if (!response.ok) {
        console.error('%c[useAICommand] ❌ Transport failure:', 'color: #dc2626; font-weight: bold;', {
          status: response.status,
          statusText: response.statusText,
          rawBody: rawBody.trim() || 'EMPTY',
          // First 200 chars to catch HTML error pages without flooding the console
          bodyPreview: rawBody.slice(0, 200) || 'EMPTY',
        });
        // Attempt to extract a structured error message if the body is JSON
        let errorMessage = `HTTP ${response.status} ${response.statusText}`;
        try {
          const errJson = JSON.parse(rawBody) as ApiErrorResponse;
          errorMessage = errJson.error || errJson.details || errJson.message || errorMessage;
        } catch {
          // Body is not JSON (HTML error page, empty string, plain text) — use raw snippet
          if (rawBody.trim()) {
            errorMessage = `${errorMessage} — ${rawBody.slice(0, 120)}`;
          }
        }
        throw new Error(errorMessage);
      }

      // Body is confirmed OK — safe to parse
      const data = JSON.parse(rawBody) as ApiSuccessResponse & ApiErrorResponse;

      // Transform new API response format
      const transformedResponse: AICommandResponse = {
        success: true,
        actionType: data.actionType || 'SINGLE',
        targetIds: data.targetIds || [tenantContext.tenantId].filter(Boolean) as string[],
        payload: data.payload || data.configPatch || {},
        summary: data.summary || data.technicalSummary || 'Changes applied',
        metadata: data.metadata || {
          processedAt: new Date().toISOString(),
          resellerId,
          model: 'llama-3.3-70b-versatile',
        },
      };

      // Legacy support - still set these for modal
      setTechnicalSummary(transformedResponse.summary);
      if (transformedResponse.payload) {
        setConfigPatch(transformedResponse.payload);
      }

      // Call the callback with transformed response
      onResponse?.(transformedResponse);

      // 🔷 DELETE_CLIENT: Execute deletion immediately using the resolved UUID
      if (transformedResponse.actionType === 'DELETE_CLIENT') {
        const targetId = transformedResponse.targetIds?.[0];
        if (!targetId) {
          setError('Delete command missing target client ID');
          return transformedResponse;
        }

        setIsDeleting(true);
        setError(null);

        try {
          const deleteResponse = await fetch('/api/ai/delete-client-by-id', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              tenantId: targetId,
              resellerSlug: resellerId.trim(),
            }),
          });

          const deleteData = await deleteResponse.json();

          if (!deleteResponse.ok) {
            throw new Error(deleteData?.error || `Failed to delete client (HTTP ${deleteResponse.status})`);
          }

          setDeleteResult({
            success: true,
            clientName: deleteData.clientName,
            clientId: deleteData.clientId,
          });

          setTechnicalSummary(`${deleteData.clientName} has been removed.`);
        } catch (deleteErr: unknown) {
          const deleteErrorMessage = deleteErr instanceof Error ? deleteErr.message : 'Deletion failed';
          setError(deleteErrorMessage);
          console.error('[useAICommand] ❌ Delete execution failed:', deleteErr);
        } finally {
          setIsDeleting(false);
        }

        return transformedResponse;
      }

      // Only open modal for SINGLE actions (DELETE_CLIENT handled above, no modal needed)
      if (transformedResponse.actionType === 'SINGLE') {
        setIsModalOpen(true);
      }

      return transformedResponse;
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred';
      setError(errorMessage);
      console.error('AI Command Error:', err);
    } finally {
      setIsAnalyzing(false);
    }
  }, []);

  const handleConfirmDeployment = useCallback(async () => {
    if (!targetTenantId || !configPatch) {
      setError('Missing deployment data');
      return;
    }

    setIsDeploying(true);

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(targetTenantId)) {
      console.error('WARNING: targetTenantId does not appear to be a valid UUID:', targetTenantId);
    }

    try {
      // Update tenant configuration in Supabase
      const response = await fetch('/api/tenants/update-config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tenantId: targetTenantId,
          configPatch,
        }),
      });

      // Capture error body for detailed logging
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({} as Record<string, unknown>));
        console.error('Deployment API Error:', errorData);
        throw new Error((errorData as ApiErrorResponse).error || (errorData as ApiErrorResponse).message || `Failed to apply configuration (HTTP ${response.status})`);
      }

      // Show success state briefly before closing
      setTechnicalSummary('Changes Initiated');

      // Wait 2 seconds then close and reset
      setTimeout(() => {
        setIsModalOpen(false);
        setIsDeploying(false);
        // Reset state after modal closes
        setTimeout(() => {
          resetState();
        }, 300);
      }, 2000);

    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Deployment failed');
      setIsDeploying(false);
      console.error('Deployment Error:', err);
    }
  }, [targetTenantId, configPatch, resetState]);

  return {
    isAnalyzing,
    isModalOpen,
    isDeploying,
    isDeleting,
    deleteResult,
    technicalSummary,
    configPatch,
    targetTenantId,
    error,
    handleCommandSubmit,
    handleConfirmDeployment,
    openModal,
    closeModal,
    resetState,
  };
}