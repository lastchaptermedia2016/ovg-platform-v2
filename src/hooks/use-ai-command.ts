'use client';

import { useState, useCallback } from 'react';

interface TenantContext {
  tenantId?: string;
  category?: string;
}

interface AICommandResponse {
  success: boolean;
  actionType: 'SINGLE' | 'BULK';
  targetIds: string[];
  payload: Record<string, any>;
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
  technicalSummary: string;
  configPatch: Record<string, any> | null;
  targetTenantId: string | null;
  error: string | null;
  handleCommandSubmit: (command: string, currentConfig: Record<string, any>, tenantContext: TenantContext, resellerId: string, onResponse?: (response: AICommandResponse) => void) => Promise<AICommandResponse | undefined>;
  handleConfirmDeployment: () => Promise<void>;
  openModal: () => void;
  closeModal: () => void;
  resetState: () => void;
}

export function useAICommand(): UseAICommandReturn {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeploying, setIsDeploying] = useState(false);
  const [technicalSummary, setTechnicalSummary] = useState('');
  const [configPatch, setConfigPatch] = useState<Record<string, any> | null>(null);
  const [targetTenantId, setTargetTenantId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const resetState = useCallback(() => {
    setIsAnalyzing(false);
    setIsModalOpen(false);
    setIsDeploying(false);
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
    currentConfig: Record<string, any>,
    tenantContext: TenantContext,
    resellerId: string,
    onResponse?: (response: AICommandResponse) => void
  ): Promise<AICommandResponse | undefined> => {
    setIsAnalyzing(true);
    setError(null);
    if (tenantContext.tenantId) {
      setTargetTenantId(tenantContext.tenantId);
    }

    // 🔷 Production Excellence: Validate all inputs before sending
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

    console.log('useAICommand: Sending request:', requestBody);

    try {
      const response = await fetch('/api/ai/process-command', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      const data = await response.json();

      if (!response.ok) {
        // 🔷 Production Excellence: Capture full error details for debugging
        console.error('%c[useAICommand] ❌ API Error Response:', 'color: #dc2626; font-weight: bold;', {
          status: response.status,
          statusText: response.statusText,
          error: data?.error || 'Unknown error',
          details: data?.details || null,
          fullResponse: data,
          requestBody: requestBody,
        });
        throw new Error(data?.error || data?.details || `Failed to process command (HTTP ${response.status})`);
      }

      // Transform new API response format
      const transformedResponse: AICommandResponse = {
        success: true,
        actionType: data.actionType || 'SINGLE',
        targetIds: data.targetIds || [tenantContext.tenantId],
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
      setConfigPatch(transformedResponse.payload);

      // Call the callback with transformed response
      onResponse?.(transformedResponse);

      // Only open modal for SINGLE actions
      if (transformedResponse.actionType === 'SINGLE') {
        setIsModalOpen(true);
      }

      return transformedResponse;
    } catch (err: any) {
      const errorMessage = err.message || 'An unexpected error occurred';
      setError(errorMessage);
      console.error('AI Command Error:', err);
      console.error('Error details:', {
        message: err.message,
        stack: err.stack,
        name: err.name,
      });
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

    // Validation Log
    console.log("ACTUAL UUID BEING SENT:", targetTenantId);
    console.log("Committing to Tenant ID:", targetTenantId);
    console.log("Config patch:", JSON.stringify(configPatch, null, 2));
    
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
        const errorData = await response.json().catch(() => ({}));
        console.error('Deployment API Error:', errorData);
        throw new Error(errorData.error || errorData.message || `Failed to apply configuration (HTTP ${response.status})`);
      }

      // Log successful response
      const successData = await response.json();
      console.log('Deployment successful:', successData);

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

    } catch (err: any) {
      setError(err.message || 'Deployment failed');
      setIsDeploying(false);
      console.error('Deployment Error:', err);
    }
  }, [targetTenantId, configPatch, resetState]);

  return {
    isAnalyzing,
    isModalOpen,
    isDeploying,
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
