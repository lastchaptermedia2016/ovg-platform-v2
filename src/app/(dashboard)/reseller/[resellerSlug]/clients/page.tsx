'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { isInvalidSlug } from '@/lib/utils/guard';
import { ClientsGrid } from '@/components/reseller/ClientsGrid';
import { DeploymentModal } from '@/components/ai-intelligence/DeploymentModal';
import { MasterpieceHeader } from '@/components/reseller/MasterpieceHeader';
import { useAICommand } from '@/hooks/use-ai-command';
import { useVoiceCommand } from '@/hooks/use-voice-command';
import { useResilientVoice } from '@/hooks/use-resilient-voice';
import { CaptionsHUD } from '@/components/voice/CaptionsHUD';
import LiveTelemetryFeed from '@/components/dashboard/LiveTelemetryFeed';
import { formatCurrency } from '@/utils/formatters';
import { SYSTEM_CAPABILITIES } from '@/core/ai/system-capabilities';
import { useHannah } from "@/contexts/HannahContext";
import type { CommandCapability } from '@/core/ai/system-capabilities';

// Type definitions
interface BulkConfirmation {
  show: boolean;
  count: number;
  targetIds: string[];
  payload: Record<string, unknown>;
}

interface AICommandResponse {
  actionType: string;
  targetIds?: string[];
  payload?: Record<string, unknown>;
  summary: string;
  success?: boolean;
}

// Memoized to prevent unnecessary re-renders
const useCategoryMap = () => useMemo(() => ({
  ALL: 'ALL',
  AUTOMOTIVE: 'AUTOMOTIVE',
  GENERAL_BUSINESS: 'GENERAL BUSINESS',
  RETAIL: 'RETAIL',
  HEALTHCARE: 'HEALTHCARE',
  INSURANCE: 'INSURANCE',
  SIGNAL_ANALYTICS: 'SIGNAL ANALYTICS', // Existing filter
  AI_AUTOMATION: 'AI AUTOMATION', // New filter
  OFFLINE_ONLY: 'OFFLINE'
}), []);

export default function ClientsPage() {
  // Consume Hannah state from global context — Must be first to establish scope
  const { isHannahAwake, currentBriefing, setCurrentBriefing, setActiveCommands, agentMode, setAgentMode, appendConversationHistory } = useHannah();

  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();

  // CRITICAL: Use String() runtime coercion for route safety
  const resellerSlug = String(params.resellerSlug ?? '');
  
  // 🔷 Production Excellence: Hydration Guard for route params
  if (isInvalidSlug(resellerSlug)) {
    console.error('%c[Pierre] ❌ Route parameter failed to resolve:', 'color: #0097b2; font-weight: bold;', { resellerSlug, params });
  }
  
  const categoryParam = (searchParams.get('category') || 'ALL').toUpperCase();
  const CATEGORY_MAP = useCategoryMap();

  // ── Initialization: State ──────────────────────────────────────────
  const [activeFilter, setActiveFilter] = useState(categoryParam);
  const [showOfflineOnly, setShowOfflineOnly] = useState(false);
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null);
  const [selectedClientName, setSelectedClientName] = useState<string>('');
  const [commandInput, setCommandInput] = useState('');
  const [inputFlash, setInputFlash] = useState(false);
  const [bulkConfirmation, setBulkConfirmation] = useState<BulkConfirmation | null>(null);
  const [successRipple, setSuccessRipple] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [isAwaitingVoiceConfirm, setIsAwaitingVoiceConfirm] = useState(false);
  const [helpCommands, setHelpCommands] = useState<string[] | null>(null);

  // Portfolio Stats State (lifted from ClientsGrid for unified telemetry)
  const [portfolioStats, setPortfolioStats] = useState({
    totalClients: 0,
    totalMRR: 0,
    totalSignals: 0,
    aiEfficiency: 0,
    criticalAlerts: 0,
    loading: true
  });

  // ── Initialization: Refs ───────────────────────────────────────────
  const confirmationTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const commandInputRef = useRef<HTMLInputElement>(null);
  const hasProcessedRef = useRef(false);
  // Stable ref for handleFilterChange to avoid temporal dead zone in transcript callback
  const handleFilterChangeRef = useRef<(newFilter: string) => void>(() => {});

  // ── Initialization: Command Capabilities ───────────────────────────────
  const CLIENTS_COMMANDS = useMemo<CommandCapability[]>(() => [
    {
      key: 'DELETE_CLIENT',
      name: 'Delete client [name]',
      description: 'Removes a client tenant from your portfolio. Hannah will confirm the client name before executing.',
      examples: ['Delete BMW Test', 'Remove client John Doe Motors', 'Deactivate ABC Services']
    },
    {
      key: 'SYSTEM_FILTER_GRID',
      name: 'Filter clients by [sector]',
      description: 'Filters the client grid to show only clients in a specific industry sector.',
      examples: ['Filter by automotive', 'Show only retail clients', 'Switch to healthcare', 'Filter insurance']
    },
    {
      key: 'SIGNAL_RESET',
      name: 'Reset signals for [client]',
      description: 'Resets signal count and tracking for a specific client.',
      examples: ['Reset signals for Tesla', 'Clear signals on Acme Corp']
    },
    {
      key: 'INDUSTRY_FILTER',
      name: 'Show me [industry] clients',
      description: 'Display all clients belonging to a specific industry category.',
      examples: ['Show me automotive clients', 'Show retail clients', 'Show healthcare', 'Show insurance clients']
    }
], []);
   
  // ── Lifecycle: Register Client Commands on Mount ───────────────────────
  useEffect(() => {
    setActiveCommands(CLIENTS_COMMANDS);
    return () => {
      setActiveCommands([]);
    };
  }, [setActiveCommands, CLIENTS_COMMANDS]);

  // ── Logic: Hannah Briefing Telemetry ─────────────────────────────────
  useEffect(() => {
    if (isHannahAwake && !portfolioStats.loading && portfolioStats.totalClients > 0 && !currentBriefing) {
      setCurrentBriefing(`System ready: ${portfolioStats.totalClients} unique tenant detected.`);
    }
  }, [isHannahAwake, portfolioStats.loading, portfolioStats.totalClients, currentBriefing, setCurrentBriefing]);

  // AI Command Integration
  const {
    isAnalyzing,
    isModalOpen,
    isDeploying,
    isDeleting,
    deleteResult,
    technicalSummary,
    handleCommandSubmit,
    handleConfirmDeployment,
    closeModal,
    error,
  } = useAICommand();

  // ✅ FIX: Stable ref prevents handleTranscript recreation on every render
  const handleCommandSubmitRef = useRef(handleCommandSubmit);
  useEffect(() => {
    handleCommandSubmitRef.current = handleCommandSubmit;
  }, [handleCommandSubmit]);

  // Resilient 4-phase Voice Integration — must be above handleTranscript
  const { isPlaying: isVoicePlaying, isSilentMode, captions, playVoice: speakVoice } = useResilientVoice();
  const speakVoiceRef = useRef(speakVoice);
  const isVoicePlayingRef = useRef(false);
  useEffect(() => { speakVoiceRef.current = speakVoice; }, [speakVoice]);
  useEffect(() => { isVoicePlayingRef.current = isVoicePlaying; }, [isVoicePlaying]);

  // 🔷 Production Excellence: Track TTS communication state for HUD
  const isCommunicating = isVoicePlaying;

  // Dismiss the SYSTEM_HELP popover
  const dismissHelpPopover = useCallback(() => {
    setHelpCommands(null);
  }, []);

  // Handle bulk confirmation — must be above handleTranscript
  const handleBulkConfirm = useCallback(async () => {
    if (!bulkConfirmation) return;
    try {
      const response = await fetch('/api/tenants/bulk-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetIds: bulkConfirmation.targetIds,
          payload: bulkConfirmation.payload,
        }),
      });
      if (response.ok) {
        setSuccessRipple(true);
        setTimeout(() => setSuccessRipple(false), 1000);
        speakVoiceRef.current(`Update complete. Applied changes to ${bulkConfirmation.count} clients.`);
      }
    } catch (err) {
      console.error('Bulk update failed:', err);
    } finally {
      setBulkConfirmation(null);
    }
  }, [bulkConfirmation]);

  const handleBulkCancel = useCallback(() => {
    setBulkConfirmation(null);
    setIsAwaitingVoiceConfirm(false);
    if (confirmationTimeoutRef.current) {
      clearTimeout(confirmationTimeoutRef.current);
      confirmationTimeoutRef.current = null;
    }
    speakVoiceRef.current('Bulk action cancelled.');
  }, []);

  // Stable transcript handler — must be useCallback to prevent useVoiceCommand
  // from recreating processAudioPipeline on every parent render.
  const handleTranscript = useCallback((text: string) => {
    // Guard must be first — to block double-invocation
    if (hasProcessedRef.current) return;
    if (!text || text.trim().length < 3) return;
    setVoiceError(null);

    setCommandInput(text);
    hasProcessedRef.current = true;
    setTimeout(() => { hasProcessedRef.current = false; }, 3000);
    const lowerText = text.toLowerCase().trim();

    // ── STRICT PTT: No automatic mic re-opening after any action ──
    // The user must explicitly press the mic button again to record.

    if (isAwaitingVoiceConfirm && bulkConfirmation?.show) {
      if (confirmationTimeoutRef.current) {
        clearTimeout(confirmationTimeoutRef.current);
        confirmationTimeoutRef.current = null;
      }
      const confirmWords = ['yes', 'confirm', 'do it', 'go ahead', 'proceed', 'ok', 'yeah', 'sure'];
      const cancelWords = ['no', 'cancel', 'stop', 'abort', 'wait', 'hold on'];
      const isConfirm = confirmWords.some(word => lowerText.includes(word));
      const isCancel = cancelWords.some(word => lowerText.includes(word));
      if (isConfirm) {
        setIsAwaitingVoiceConfirm(false);
        handleBulkConfirm();
        return;
      } else if (isCancel) {
        setIsAwaitingVoiceConfirm(false);
        handleBulkCancel();
        return;
      }
    }

    let activeSlug = resellerSlug;
    if (!activeSlug || activeSlug.includes('[') || activeSlug.includes(']') || activeSlug.includes('%5B')) {
      const segments = window.location.pathname.split('/');
      const resellerIndex = segments.indexOf('reseller');
      if (resellerIndex !== -1 && segments[resellerIndex + 1]) {
        activeSlug = segments[resellerIndex + 1];
        console.log('%c[Pierre] 🚀 Extracted slug from URL path:', 'color: #0097b2; font-weight: bold;', activeSlug);
      }
    }

    console.log('%c[Pierre] 🚀 Submission triggered with resolved slug:', 'color: #0097b2; font-weight: bold;', activeSlug);

    handleCommandSubmitRef.current(
      text,
      { theme: { primary: '#0097b2' }, behavior: { prompt: 'Default' } },
      selectedTenantId ? { tenantId: selectedTenantId, category: activeFilter } : { category: activeFilter },
      activeSlug,
      (response: AICommandResponse | undefined) => {
        // 🔷 NO_MATCH: Neutral command — speak correction only.
        // The user must press the mic button again to retry.
        if (response?.actionType === 'NO_MATCH') {
          const correctionMsg = response.summary || "I didn't catch a valid command. Please try again.";
          speakVoiceRef.current(correctionMsg);
          return;
        }

        // 🔷 SYSTEM_BULK_CONFIRM: User confirmed bulk action
        if (response?.actionType === 'SYSTEM_BULK_CONFIRM') {
          speakVoiceRef.current(response.summary || 'Confirmed. Applying bulk updates now.');
          handleBulkConfirm();
          return;
        }

        // 🔷 SYSTEM_BULK_CANCEL: User cancelled bulk action
        if (response?.actionType === 'SYSTEM_BULK_CANCEL') {
          speakVoiceRef.current(response.summary || 'Cancelled. No changes were made.');
          handleBulkCancel();
          return;
        }

        // 🔷 SYSTEM_FILTER_GRID: User wants to filter the client grid
        if (response?.actionType === 'SYSTEM_FILTER_GRID' && response?.payload?.category_filter) {
          const category = response.payload.category_filter as string;
          console.log('%c[Pierre] 🎯 SYSTEM_FILTER_GRID: Applying category filter:', 'color: #0097b2; font-weight: bold;', category);
          handleFilterChangeRef.current(category);
          speakVoiceRef.current(response.summary || `Filtering grid to ${category} clients.`);
          return;
        }

        // 🔷 SYSTEM_HELP: Show command popover
        if (response?.actionType === 'SYSTEM_HELP') {
          const commands = response?.payload?.availableCommands as string[] | undefined;
          if (commands && commands.length > 0) {
            setHelpCommands(commands);
          }
          speakVoiceRef.current('I am your system orchestrator. I can help you manage clients, filter the dashboard, or perform bulk updates. What would you like to do?');
          return;
        }

        // 🔷 SYSTEM_EXPLAIN: Read-only capability explanation
        if (response?.actionType === 'SYSTEM_EXPLAIN') {
          const explanation = response.summary || 'Let me help you understand what I can do.';
          speakVoiceRef.current(explanation);
          const contextKey = (response as unknown as Record<string, unknown>)?.contextKey as string | undefined;
          if (contextKey && SYSTEM_CAPABILITIES[contextKey]) {
            const capability = SYSTEM_CAPABILITIES[contextKey];
            if (!helpCommands) {
              setHelpCommands([
                capability.name,
                ...capability.examples.map((ex: string) => `› ${ex}`),
              ]);
            }
          } else {
            if (!helpCommands) {
              setHelpCommands(Object.keys(SYSTEM_CAPABILITIES));
            }
          }
          return;
        }

        // 🔷 SYSTEM_NOTE: Conversational/ambiguous input
        if (response?.actionType === 'SYSTEM_NOTE') {
          speakVoiceRef.current(response.summary || 'I heard you. How can I help?');
          return;
        }

        // 🔷 SYSTEM_DISARM: Reset staged state
        if (response?.actionType === 'SYSTEM_DISARM') {
          setSelectedTenantId(null);
          setSelectedClientName('');
          setHelpCommands(null);
          setCommandInput('');
          setBulkConfirmation(null);
          setIsAwaitingVoiceConfirm(false);
          speakVoiceRef.current(response.summary || 'System disarmed. Returning to standby.');
          return;
        }

        // 🔷 BULK: Requires voice confirmation before execution
        if (response?.actionType === 'BULK' && response?.targetIds && response.targetIds.length > 1) {
          setBulkConfirmation({
            show: true,
            count: response.targetIds.length,
            targetIds: response.targetIds,
            payload: response.payload || {},
          });
          if (response.summary) {
            speakVoiceRef.current(`I've identified ${response.targetIds.length} clients. Should I proceed with the update?`);
          }
          // ── STRICT PTT: No auto-re-listen. User must re-press the mic button to confirm. ──
          // This is deliberate: it forces an explicit confirm/cancel gesture from the user.
          return;
        } else if (response?.success) {
          setSuccessRipple(true);
          setTimeout(() => setSuccessRipple(false), 1000);
          speakVoiceRef.current('Update applied successfully.');
        }
      }
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAwaitingVoiceConfirm, bulkConfirmation, resellerSlug, selectedTenantId, activeFilter]);

  // ─── STRICT PTT: Voice Command Integration ─────────────────────────
  // The mic is ONLY opened by an explicit user gesture (mousedown/touchstart
  // on the mic button). No auto-restart, no silence detection, no idle timeout.
  const {
    isRecording,
    isProcessing,
    volumeLevel: _volumeLevel,
    transcript: voiceTranscript,
    startListening,
    stopListeningAndProcess,
    abortRecording,
    resetState: _resetState,
  } = useVoiceCommand({
    resellerId: resellerSlug,
    tenantContext: selectedTenantId ? { tenantId: selectedTenantId, category: activeFilter } : { category: activeFilter },
    currentConfig: { theme: { primary: '#0097b2' }, behavior: { prompt: 'Default' } },
    skipAIPipeline: true,
    onTranscript: handleTranscript,
    onError: (err) => {
      console.error('Voice command error:', err);
      setVoiceError(err);
      speakVoiceRef.current("I didn't catch that. Please try again.");
    },
  });

  const handleCommandInputKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    const input = e.currentTarget;
    const isInputFocused = document.activeElement === input;
    if (isInputFocused) {
      e.stopPropagation();
    }
  }, []);

  // Sync voice hook TTS playing state to isAwaitingVoiceConfirm timeout
  useEffect(() => {
    if (!isAwaitingVoiceConfirm) return;
    if (confirmationTimeoutRef.current) {
      clearTimeout(confirmationTimeoutRef.current);
    }
    confirmationTimeoutRef.current = setTimeout(() => {
      setIsAwaitingVoiceConfirm(false);
    }, 3000);
    return () => {
      if (confirmationTimeoutRef.current) {
        clearTimeout(confirmationTimeoutRef.current);
      }
    };
  }, [isAwaitingVoiceConfirm]);

  // 🔷 DELETE_CLIENT: Watch for successful deletion and trigger UI feedback
  useEffect(() => {
    if (!deleteResult?.success) return;

    const successTimeout = setTimeout(() => {
      setSuccessRipple(true);
    }, 0);

    const rippleClearTimeout = setTimeout(() => {
      setSuccessRipple(false);
    }, 1000);

    speakVoiceRef.current(`${deleteResult.clientName || 'Client'} has been removed successfully.`);

    return () => {
      clearTimeout(successTimeout);
      clearTimeout(rippleClearTimeout);
    };
  }, [deleteResult]);

  // Cleanup confirmation timeout on unmount
  useEffect(() => {
    return () => {
      if (confirmationTimeoutRef.current) {
        clearTimeout(confirmationTimeoutRef.current);
      }
    };
  }, []);

  // Unified system action handler
  const handleExecuteSystemAction = useCallback(async (clientId: string, actionType: 'ai' | 'sms' | 'vin' | 'signal') => {
    if (actionType !== 'ai') return;

    console.log('%c[Pierre] 🎙️ Unified system action received:', 'color: #0097b2; font-weight: bold;', { clientId, actionType });

    // 1. Set selected tenant for UI
    setSelectedTenantId(clientId);

    // 2. Speak the canonical TTS announcement
    const announcement = `AI control active. Use voice commands to manage this client.`;
    speakVoiceRef.current(announcement);

    // 3. Trigger input flash for visual feedback
    setInputFlash(true);
    setTimeout(() => setInputFlash(false), 600);
    // Autofocus command input
    setTimeout(() => {
      commandInputRef.current?.focus();
    }, 100);
  }, []);

  // Ref to debounce the offline toggle
  const offlineToggleTimeout = useRef<NodeJS.Timeout | null>(null);

  const handleFilterChange = useCallback((newFilter: string) => {
    const upperFilter = newFilter.toUpperCase();
    if (upperFilter === activeFilter) return;

    setActiveFilter(upperFilter);
    setShowOfflineOnly(false);

    const newSearchParams = new URLSearchParams(searchParams.toString());
    if (upperFilter === 'ALL') {
      newSearchParams.delete('category');
    } else {
      newSearchParams.set('category', upperFilter.toLowerCase());
    }

    router.push(`?${newSearchParams.toString()}`, { scroll: false });
  }, [activeFilter, searchParams, router]);

  const toggleOfflineOnly = useCallback(() => {
    if (offlineToggleTimeout.current) {
      clearTimeout(offlineToggleTimeout.current);
    }

    offlineToggleTimeout.current = setTimeout(() => {
      setShowOfflineOnly(prev => !prev);
    }, 50);
  }, []);

  // Keep filter change ref in sync for SYSTEM_FILTER_GRID access from transcript callback
  useEffect(() => { handleFilterChangeRef.current = handleFilterChange; }, [handleFilterChange]);

  // Stable callback for tenant selection
  const handleSelectTenant = useCallback((tenantId: string, clientName?: string, _category?: string) => {
    setSelectedTenantId(tenantId);
    if (clientName) {
      setSelectedClientName(clientName);
    }
    // Trigger green flash animation
    setInputFlash(true);
    setTimeout(() => setInputFlash(false), 600);
    // Auto-focus command input when tenant is selected
    setTimeout(() => {
      commandInputRef.current?.focus();
    }, 100);
  }, []);

  const handleCommandExecute = useCallback(() => {
    if (!selectedTenantId || !commandInput.trim()) {
      console.error('No tenant selected or empty command');
      return;
    }
    let activeSlug = resellerSlug;
    if (!activeSlug || activeSlug.includes('[') || activeSlug.includes(']') || activeSlug.includes('%5B')) {
      const segments = window.location.pathname.split('/');
      const resellerIndex = segments.indexOf('reseller');
      if (resellerIndex !== -1 && segments[resellerIndex + 1]) {
        activeSlug = segments[resellerIndex + 1];
        console.log('%c[Pierre] 🚀 Extracted slug from URL path (manual execute):', 'color: #0097b2; font-weight: bold;', activeSlug);
      }
    }
    const text = commandInput;
    appendConversationHistory({ role: 'user', content: text });
    handleCommandSubmitRef.current(
      text,
      { theme: { primary: '#0097b2' }, behavior: { prompt: 'Default' } },
      { tenantId: selectedTenantId, category: activeFilter },
      activeSlug,
      (response) => {
        if (response?.summary) {
          appendConversationHistory({ role: 'assistant', content: response.summary });
        }
      }
    );
    setCommandInput('');
  }, [selectedTenantId, commandInput, activeFilter, resellerSlug, appendConversationHistory]);

  return (
    <div className="w-full">
      {/* Production Excellence: Synchronized Global Header - Naked Wrapper */}
      <header className="sticky top-0 left-0 right-0 z-[50]">
        <MasterpieceHeader 
          isRecording={isRecording}
          onStartRecording={startListening}
          onStopListeningAndProcess={stopListeningAndProcess}
          onAbortRecording={abortRecording}
          isProcessing={isProcessing}
          isAwaitingVoiceConfirm={isAwaitingVoiceConfirm}
          transcribedText={voiceTranscript}
          isCommunicating={isCommunicating}
          playVoice={speakVoice}
        />
        
        {/* Main Navigation Tabs - Compact Grid Layout */}
        <div className="w-full">
          <div className="px-6">
            <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2 py-2 mb-2">
              {(() => {
                const pathSegments = typeof window !== 'undefined' ? window.location.pathname.split('/') : [];
                const resellerIdx = pathSegments.indexOf('reseller');
                const currentSlug = (resellerIdx !== -1 && pathSegments[resellerIdx + 1]) 
                  ? pathSegments[resellerIdx + 1] 
                  : (resellerSlug || 'dashboard');
                const navItems = [
                  { label: 'CLIENTS', path: `/reseller/${currentSlug}/clients`, active: true },
                  { label: 'BRANDING', path: `/reseller/${currentSlug}/branding`, active: false },
                  { label: 'REVENUE', path: `/reseller/${currentSlug}/revenue`, active: false },
                  { label: 'AI ENGINE', path: `/reseller/${currentSlug}/ai-engine`, active: false },
                  { label: 'SIGNAL', path: `/reseller/${currentSlug}/signal`, active: false },
                ];
                return navItems.map((item) => (
                  <button
                    key={item.label}
                    onClick={() => {
                      if (!item.active && typeof window !== 'undefined') {
                        if (currentSlug.includes('[') || currentSlug.includes('%5B')) {
                          console.log('%c[Pierre] ⏳ Navigation delayed - waiting for hydration...', 'color: #0097b2; font-weight: bold;');
                          return;
                        }
                        router.push(item.path);
                      }
                    }}
                    style={{ display: 'inline-flex', width: '100%', padding: '4px 8px' }}
                    className={`relative rounded-lg text-[10px] font-bold tracking-wider uppercase transition-all duration-300 ease-out whitespace-nowrap overflow-hidden
                      backdrop-blur-md bg-black/10 border border-white/10
                      hover:-translate-y-1 hover:backdrop-blur-xl hover:border-white/20 transition-colors duration-200
                      ${item.active
                        ? '!text-[#00e5ff] border-[#00e5ff] bg-[#0097b2]/10 shadow-[0_0_8px_rgba(0,229,255,0.4)]'
                        : '!text-white hover:!text-white hover:font-semibold hover:bg-black/20'
                      }`}
                  >
                    {/* Shimmer effect for active tab */}
                    {item.active && (
                      <div className="absolute inset-0 overflow-hidden pointer-events-none">
                        <div className="absolute inset-0 animate-tab-shimmer">
                          <div className="w-full h-full bg-gradient-to-r from-transparent via-white/20 to-transparent transform -skew-x-12" />
                        </div>
                      </div>
                    )}
                    <span className={`relative z-20 ${item.active ? 'drop-shadow-[0_0_8px_rgba(0,229,255,0.4)]' : ''}`} style={{ textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}>{item.label}</span>
                  </button>
                ));
              })()}
            </div>
          </div>
        </div>
        
        {/* Hannah Mode Toggle */}
        <div className="w-full">
          <div className="px-6">
            <div className="flex items-center justify-between w-full my-2 px-2">
              <span className="text-[10px] font-bold text-white/70 tracking-widest uppercase">Hannah Mode</span>
              <button
                onClick={() => setAgentMode(agentMode === 'executor' ? 'conversational' : 'executor')}
                className={`px-3 py-1.5 rounded-lg border text-[10px] font-semibold tracking-wider uppercase transition-all duration-200 ${
                  agentMode === 'executor'
                    ? 'border-emerald-500 text-emerald-300 bg-emerald-500/10'
                    : 'border-cyan-500 text-cyan-300 bg-cyan-500/10'
                }`}
              >
                {agentMode === 'executor' ? 'Executor' : 'Conversational'}
              </button>
            </div>
          </div>
        </div>

        {/* Industry Filter Tabs - Compact Grid Layout */}
        <div className="w-full">
          <div className="px-6">
            <div className="flex flex-wrap gap-2 items-center w-full my-3 px-2">
              {(() => {
                const FILTER_LABELS = Object.entries(CATEGORY_MAP)
                  .filter(([key]) => key !== 'ALL' && key !== 'OFFLINE_ONLY')
                  .map(([key]) => ({
                    label: key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
                    value: key,
                  }));
                return [{ label: 'All', value: 'ALL' }, ...FILTER_LABELS].map(({ label, value }) => (
                <button
                    key={value}
                    onClick={() => handleFilterChange(value)}
                    style={{ display: 'inline-flex', padding: '4px 8px' }}
                    className={`relative rounded-lg text-[10px] font-medium tracking-wider uppercase transition-all duration-300 ease-out whitespace-nowrap overflow-hidden
                      backdrop-blur-md bg-black/10 border border-white/10
                      hover:-translate-y-0.5 hover:backdrop-blur-xl hover:border-white/20 transition-colors duration-200
                      ${activeFilter === value.toUpperCase()
                        ? '!text-[#FFD700] bg-[#FFD700]/10 border-[#FFD700]/30'
                        : '!text-[#94a3b8] hover:!text-white hover:font-semibold hover:bg-black/20'
                      }`}
                  >
                    <span className={`relative z-20 ${activeFilter === value.toUpperCase() ? 'drop-shadow-[0_0_6px_rgba(255,215,0,0.3)]' : ''}`} style={{ textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}>{label}</span>
                  </button>
                ))})()}

              <div className="w-px h-4 bg-[#0097b2]/30 mx-1" />

              <button
                onClick={toggleOfflineOnly}
                style={{ display: 'inline-flex', padding: '4px 8px' }}
                className={`relative rounded-lg text-[10px] font-medium tracking-wider uppercase transition-all duration-300 ease-out whitespace-nowrap overflow-hidden
                  backdrop-blur-md bg-black/10 border border-white/10
                  hover:-translate-y-0.5 hover:backdrop-blur-xl hover:border-white/20 transition-colors duration-200
                  ${showOfflineOnly
                    ? '!text-[#FFD700] bg-[#FFD700]/10 border-[#FFD700]/30'
                    : '!text-[#94a3b8] hover:!text-white hover:font-semibold hover:bg-black/20'
                  }`}
              >
                <span className={`relative z-20 ${showOfflineOnly ? 'drop-shadow-[0_0_6px_rgba(255,215,0,0.3)]' : ''}`} style={{ textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}>Offline</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="relative w-full min-h-screen">
        {/* Hero Spacer */}
        <div className="h-[40px] w-full" />

        {/* Action Anchor: ExecuteBar */}
        <div className="w-full px-4 relative z-40">
          <div className="max-w-3xl mx-auto">
            <div className="relative p-[1px] rounded-xl bg-gradient-to-r from-transparent via-[#0097b2]/50 to-transparent">
              <div className="absolute inset-0 rounded-xl bg-[#0097b2]/20 blur-xl -z-10" />
              <div className="relative bg-black/40 backdrop-blur-2xl border border-white/10 rounded-xl p-4">
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full">
                  {/* Green Pulse Indicator */}
                  <div className="relative">
                    {selectedTenantId ? (
                      <>
                        <span className="absolute inset-0 rounded-full bg-green-500/30 animate-ping" />
                        <span className="relative flex h-3 w-3 rounded-full bg-green-500 shadow-[0_0_10px_#22c55e]" />
                      </>
                    ) : (
                      <span className="flex h-3 w-3 rounded-full bg-white/20" />
                    )}
                  </div>

                  {/* Command Input */}
                  <div className="flex-1 relative">
                    <input
                      ref={commandInputRef}
                      type="text"
                      value={commandInput}
                      onChange={(e) => setCommandInput(e.target.value)}
                      onKeyDown={(e) => {
                        handleCommandInputKeyDown(e);
                        if (e.key === 'Enter') handleCommandExecute();
                      }}
                      disabled={!selectedTenantId || isAnalyzing}
                      placeholder={selectedTenantId
                        ? `I'm listening. What should we change for ${selectedClientName || 'this client'}?`
                        : "Step 1: Select a client card to begin..."
                      }
                      className={`w-full px-4 py-3 rounded-lg border text-sm tracking-widest uppercase outline-none transition-all duration-300 font-medium backdrop-blur-md ${
                        !selectedTenantId
                          ? 'border-white/20 bg-white/10 text-white/40 cursor-not-allowed placeholder:text-white/30'
                          : isAnalyzing
                          ? 'border-green-500 bg-green-500/10 text-white animate-pulse placeholder:text-white/60'
                          : inputFlash
                          ? 'border-green-400 bg-green-500/20 text-white placeholder:text-white/70 shadow-[0_0_30px_rgba(34,197,94,0.6)]'
                          : 'border-green-500 bg-white/10 text-white placeholder:text-white/60 focus:bg-white/15 focus:shadow-[0_0_20px_rgba(34,197,94,0.4)]'
                      }`}
                    />
                  </div>

                  {/* EXECUTE Button */}
                  <button
                    onClick={handleCommandExecute}
                    disabled={isAnalyzing || !selectedTenantId || !commandInput.trim()}
                    className={`px-6 py-3 rounded-lg backdrop-blur-xl border text-xs tracking-widest uppercase transition-all duration-300 font-medium whitespace-nowrap ${
                      isAnalyzing || !selectedTenantId || !commandInput.trim()
                        ? 'border-white/10 bg-white/5 text-white/30 cursor-not-allowed'
                        : 'border-green-500 bg-green-500/20 text-green-400 hover:bg-green-500/30 hover:shadow-[0_0_20px_rgba(34,197,94,0.5)] hover:text-white'
                    }`}
                  >
                    {isAnalyzing ? (
                      <span className="flex items-center gap-2">
                        <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        EXECUTING
                      </span>
                    ) : (
                      'EXECUTE'
                    )}
                  </button>
                </div>

                {/* Status Line */}
                <div className="mt-3 flex items-center gap-3">
                  {isDeleting ? (
                    <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-500/10 backdrop-blur-md border-t border-white/20 border-b border-red-500/50 shadow-[0_0_15px_rgba(239,68,68,0.3)] transition-all duration-300">
                      <span className="text-[10px] font-black text-red-400 tracking-tighter animate-pulse">
                        AI
                      </span>
                      <span className="text-[10px] font-bold text-red-300 tracking-[0.2em] uppercase">
                        EXECUTING DELETION...
                      </span>
                    </span>
                  ) : voiceError ? (
                    <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-500/10 backdrop-blur-md border-t border-white/20 border-b border-red-500/50 shadow-[0_0_15px_rgba(239,68,68,0.3)] transition-all duration-300">
                      <span className="text-[10px] font-black text-red-400 tracking-tighter animate-pulse">ERR</span>
                      <span className="text-[10px] font-bold text-red-300 tracking-[0.2em] uppercase">HOLD MIC TO RETRY</span>
                    </span>
                  ) : selectedTenantId && isRecording ? (
                    <>
                      <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/10 backdrop-blur-md border-t border-white/20 border-b border-green-500/50 shadow-[0_0_15px_rgba(34,197,94,0.3)] transition-all duration-300 hover:-translate-y-0.5">
                        <span className="text-[10px] font-black text-green-500 tracking-tighter animate-pulse">
                          AI
                        </span>
                        <span className="text-[10px] font-bold text-slate-100 tracking-[0.2em] uppercase">
                          RECORDING...
                        </span>
                      </span>
                      <span className="text-[10px] text-green-500/70 tracking-widest font-medium">
                        TARGET: {selectedTenantId.slice(0, 8).toUpperCase()}...
                      </span>
                    </>
                  ) : selectedTenantId ? (
                    <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-cyan-500/10 backdrop-blur-md border-t border-white/20 border-b border-cyan-500/50 shadow-[0_0_15px_rgba(0,229,255,0.2)] transition-all duration-300 hover:-translate-y-0.5">
                      <span className="text-[10px] font-black text-cyan-400 tracking-tighter animate-pulse">
                        AI
                      </span>
                      <span className="text-[10px] font-bold text-cyan-300/80 tracking-[0.2em] uppercase">
                        HOLD TO TALK
                      </span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/10 backdrop-blur-md border-t border-white/20 border-b border-white/30 transition-all duration-300 hover:-translate-y-0.5">
                      <span className="text-[10px] font-black text-white/40 tracking-tighter">
                        AI
                      </span>
                      <span className="text-[10px] font-bold text-white/70 tracking-[0.2em] uppercase">
                        STANDBY - SELECT CLIENT
                      </span>
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Portfolio Container: Unified Title + Stats Card Row */}
        <div className="w-full px-4 mt-12 mb-8">
          <div className="max-w-6xl mx-auto">
            <div className="flex flex-col md:flex-row items-stretch gap-4 md:gap-6">
              {/* Client Portfolio Title Card */}
              <div className="md:w-[280px] backdrop-blur-[8px] saturate-[180%] bg-white/[0.05] border border-white/10 rounded-xl p-5 flex flex-col justify-center">
                <h2 className="text-xl md:text-2xl font-black uppercase tracking-tight text-white">
                  Client Portfolio
                </h2>
                <div className="flex items-center gap-2 text-sm text-white/80 mt-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#0097b2] animate-pulse shadow-[0_0_8px_#0097b2]" />
                  <span className="font-medium">{portfolioStats.totalClients} active clients</span>
                </div>
                <div className="flex items-center gap-2 mt-2 px-2 py-1 rounded bg-emerald-500/10 border border-emerald-500/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_6px_rgba(52,211,153,0.6)]" />
                  <span className="text-[9px] font-bold tracking-widest text-emerald-300 uppercase drop-shadow-[0_0_4px_rgba(52,211,153,0.4)]">
                    SYSTEM READY: {portfolioStats.totalClients} UNIQUE TENANT{portfolioStats.totalClients !== 1 ? 'S' : ''} DETECTED
                  </span>
                </div>
              </div>

              {/* Stats HUD - Unified Card */}
              <div className="flex-1 backdrop-blur-md bg-white/5 border border-white/10 rounded-xl px-6 py-4 flex flex-wrap items-center justify-between gap-4">
                {portfolioStats.loading ? (
                  <>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] tracking-[0.15em] text-white/60 uppercase">Total MRR</span>
                      <div className="w-20 h-5 bg-white/10 rounded animate-pulse" />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] tracking-[0.15em] text-white/60 uppercase">Signals</span>
                      <div className="w-16 h-5 bg-white/10 rounded animate-pulse" />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] tracking-[0.15em] text-white/60 uppercase">AI Efficiency</span>
                      <div className="w-14 h-5 bg-white/10 rounded animate-pulse" />
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] tracking-[0.15em] text-white/60 uppercase">Total MRR</span>
                      <span className="text-base font-bold text-[#D4AF37]">{formatCurrency(portfolioStats.totalMRR)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] tracking-[0.15em] text-white/60 uppercase">Total Signals</span>
                      <span className="text-base font-bold text-[#0097b2]">{portfolioStats.totalSignals.toLocaleString()}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] tracking-[0.15em] text-white/60 uppercase">AI Efficiency</span>
                      <span className="text-base font-bold text-white">{portfolioStats.aiEfficiency}%</span>
                    </div>
                    {portfolioStats.criticalAlerts > 0 && (
                      <div className="flex items-center gap-2 px-3 py-1 bg-[#DC143C]/20 border border-[#DC143C]/30 rounded-lg animate-pulse">
                        <span className="text-[11px] tracking-[0.15em] text-[#DC143C] uppercase">Critical</span>
                        <span className="text-base font-bold text-[#DC143C]">{portfolioStats.criticalAlerts}</span>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Live Telemetry — streams the selected client's action log + chat history */}
        {selectedTenantId && (
          <div className="w-full px-4 mt-8 mb-4">
            <div className="max-w-6xl mx-auto">
              <LiveTelemetryFeed tenantId={selectedTenantId} clientName={selectedClientName} />
            </div>
          </div>
        )}

      {/* Bulk Confirmation Banner */}
      {bulkConfirmation?.show && (
        <div className="fixed top-32 md:top-36 left-1/2 -translate-x-1/2 z-[60] px-6 py-4 rounded-xl bg-black/90 backdrop-blur-xl border border-emerald-500/50 shadow-[0_0_30px_rgba(16,185,129,0.3)]">
          <div className="flex items-center gap-4">
            <span className="text-emerald-400 font-bold text-sm">
              BULK ACTION: Update {bulkConfirmation.count} clients?
            </span>
            <button
              onClick={handleBulkConfirm}
              className="px-4 py-1.5 rounded-lg bg-emerald-500/20 border border-emerald-500/50 text-emerald-300 text-xs font-semibold hover:bg-emerald-500/30 transition-colors"
            >
              CONFIRM
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                window.speechSynthesis.cancel();
                handleBulkCancel();
              }}
              className="px-4 py-1.5 rounded-lg bg-white/10 border border-white/20 text-white/60 text-xs font-semibold hover:bg-white/20 transition-colors"
            >
              CANCEL
            </button>
          </div>
        </div>
      )}

        {/* Client Cards Grid - z-30 */}
        <section className={`relative z-30 px-4 pb-20 transition-all duration-300 ${successRipple ? 'ring-4 ring-emerald-500 shadow-[0_0_60px_rgba(16,185,129,0.5)]' : ''}`}>
          {/* Radar Scan Effect - Global Processing */}
          {isProcessing && !selectedTenantId && (
            <div className="absolute inset-0 pointer-events-none z-20 overflow-hidden rounded-lg">
              <div className="absolute w-full h-1 bg-gradient-to-r from-transparent via-emerald-400 to-transparent animate-radar-scan shadow-[0_0_20px_rgba(16,185,129,0.8)]" />
            </div>
          )}
          {/* ClientsGrid is always mounted — CSS masks it during loading to preserve internal Refs */}
          <div className={isAnalyzing ? 'opacity-50 pointer-events-none' : ''}>
          
          <ClientsGrid
            key={resellerSlug}
            resellerSlug={resellerSlug}
            filter={activeFilter}
            showOfflineOnly={showOfflineOnly}
            categoryMap={CATEGORY_MAP}
            onSelectTenant={handleSelectTenant}
            activeTenantId={selectedTenantId}
            isProcessing={isProcessing || isAnalyzing}
            isGlobalScanning={isProcessing && !selectedTenantId}
            onStatsUpdate={setPortfolioStats}
            onExecuteSystemAction={handleExecuteSystemAction}
          />
          </div>
        </section>
      </main>

      {/* Deployment Modal */}
      <DeploymentModal
        isOpen={isModalOpen}
        onClose={closeModal}
        technicalSummary={technicalSummary}
        isDeploying={isDeploying}
        onDeploy={handleConfirmDeployment}
        onDeploySuccess={(summary) => {
          setSuccessRipple(true);
          setTimeout(() => setSuccessRipple(false), 1000);
          speakVoiceRef.current(summary || 'All settings saved successfully.');
        }}
      />

      {/* Error Display */}
      {error && (
        <div className="fixed bottom-20 left-6 z-40 px-4 py-2 rounded-lg bg-red-500/20 border border-red-500/30 text-red-300 text-xs">
          {error}
        </div>
      )}

      {/* SYSTEM_HELP Popover */}
      {helpCommands && helpCommands.length > 0 && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center"
          onClick={dismissHelpPopover}
        >
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div
            className="relative max-w-md w-full mx-4 rounded-xl bg-slate-900/80 backdrop-blur-xl border border-white/10 shadow-2xl shadow-black/50 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#00e5ff] animate-pulse shadow-[0_0_8px_rgba(0,229,255,0.6)]" />
                <span className="text-[10px] font-bold tracking-[0.2em] uppercase text-[#00e5ff] drop-shadow-[0_0_6px_rgba(0,229,255,0.3)]">
                  Available Commands
                </span>
              </div>
              <button
                onClick={dismissHelpPopover}
                className="text-white/40 hover:text-white/80 transition-colors text-sm leading-none"
                aria-label="Close help popover"
              >
                ✕
              </button>
            </div>
            <div className="px-4 py-4 space-y-2">
              {helpCommands.map((cmd, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-white/[0.03] border border-white/5 hover:bg-white/[0.06] hover:border-white/10 transition-all duration-200 group"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-[#0097b2]/60 group-hover:bg-[#00e5ff] transition-colors duration-200 flex-shrink-0" />
                  <span className="text-[11px] font-medium text-white/80 group-hover:text-white tracking-wide">
                    {cmd}
                  </span>
                  <span className="ml-auto text-[7px] text-white/20 tracking-wider uppercase flex-shrink-0">
                    Voice
                  </span>
                </div>
              ))}
            </div>
            <div className="px-5 py-3 border-t border-white/5 flex items-center justify-between">
              <span className="text-[8px] text-white/30 tracking-wider">
                Click outside or press Esc to dismiss
              </span>
              <span className="text-[8px] text-[#0097b2]/60 tracking-wider font-medium">
                {helpCommands.length} command{helpCommands.length !== 1 ? 's' : ''} available
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Silent Mode Captions HUD */}
      <CaptionsHUD text={captions} isVisible={isSilentMode} />
    </div>
  );
}