'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { ClientsGrid } from '@/components/reseller/ClientsGrid';
import { DeploymentModal } from '@/components/ai-intelligence/DeploymentModal';
import { useAICommand } from '@/hooks/use-ai-command';
import { useVoiceCommand } from '@/hooks/use-voice-command';
import { useResilientVoice } from '@/hooks/use-resilient-voice';
import { CaptionsHUD } from '@/components/voice/CaptionsHUD';
import { formatCurrency } from '@/utils/formatters';

// Memoized to prevent unnecessary re-renders
const useCategoryMap = () => useMemo(() => ({
  ALL: 'ALL',
  AUTOMOTIVE: 'AUTOMOTIVE',
  GENERAL: 'GENERAL BUSINESS',
  RETAIL: 'RETAIL',
  HEALTHCARE: 'HEALTHCARE',
  INSURANCE: 'INSURANCE',
  OFFLINE_ONLY: 'OFFLINE'
}), []);

export default function ClientsPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();

  const resellerSlug = params.resellerSlug as string;
  const categoryParam = (searchParams.get('category') || 'ALL').toUpperCase();
  const CATEGORY_MAP = useCategoryMap();

  const [activeFilter, setActiveFilter] = useState(categoryParam);
  const [showOfflineOnly, setShowOfflineOnly] = useState(false);
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null);
  const [selectedClientName, setSelectedClientName] = useState<string>('');
  const [commandInput, setCommandInput] = useState('');
  const [inputFlash, setInputFlash] = useState(false);
  const [bulkConfirmation, setBulkConfirmation] = useState<{ show: boolean; count: number; targetIds: string[]; payload: any } | null>(null);
  const [successRipple, setSuccessRipple] = useState(false);
  const [isAwaitingVoiceConfirm, setIsAwaitingVoiceConfirm] = useState(false);
  const confirmationTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const commandInputRef = useRef<HTMLInputElement>(null);

  // Portfolio Stats State (lifted from ClientsGrid)
  const [portfolioStats, setPortfolioStats] = useState({
    totalClients: 0,
    totalMRR: 0,
    totalSignals: 0,
    aiEfficiency: 0,
    criticalAlerts: 0,
    loading: true
  });

  // AI Command Integration
  const {
    isAnalyzing,
    isModalOpen,
    isDeploying,
    technicalSummary,
    handleCommandSubmit,
    handleConfirmDeployment,
    closeModal,
    error,
  } = useAICommand();

  // Voice Command Integration
  const {
    isListening,
    isProcessing,
    volumeLevel,
    transcript: voiceTranscript,
    startListening,
    stopListening,
  } = useVoiceCommand({
    onTranscript: (text) => {
      const lowerText = text.toLowerCase().trim();
      
      // Intent filtering for bulk confirmation state
      if (isAwaitingVoiceConfirm && bulkConfirmation?.show) {
        // Clear the timeout since we got a response
        if (confirmationTimeoutRef.current) {
          clearTimeout(confirmationTimeoutRef.current);
          confirmationTimeoutRef.current = null;
        }
        
        // Check for confirmation intents
        const confirmWords = ['yes', 'confirm', 'do it', 'go ahead', 'proceed', 'ok', 'yeah', 'sure'];
        const cancelWords = ['no', 'cancel', 'stop', 'abort', 'wait', 'hold on'];
        
        const isConfirm = confirmWords.some(word => lowerText.includes(word));
        const isCancel = cancelWords.some(word => lowerText.includes(word));
        
        if (isConfirm) {
          setIsAwaitingVoiceConfirm(false);
          stopListening();
          handleBulkConfirm();
          return;
        } else if (isCancel) {
          setIsAwaitingVoiceConfirm(false);
          stopListening();
          handleBulkCancel();
          return;
        }
        // If neither, continue listening within the 3-second window
      }
      
      // Normal flow - auto-submit to AI when transcript is received
      handleCommandSubmit(
        text,
        { theme: { primary: '#0097b2' }, behavior: { prompt: 'Default' } },
        selectedTenantId ? { tenantId: selectedTenantId, category: activeFilter } : { category: activeFilter },
        resellerSlug,
        (response: { actionType: string; targetIds: string[]; payload: any; summary: string; success?: boolean } | undefined) => {
          // Handle bulk command response
          if (response?.actionType === 'BULK' && response?.targetIds?.length > 1) {
            setBulkConfirmation({
              show: true,
              count: response.targetIds.length,
              targetIds: response.targetIds,
              payload: response.payload,
            });
            // Voice handshake with 4-phase TTS and auto-listen
            if (response.summary) {
              speakVoice(`I've identified ${response.targetIds.length} clients. Should I proceed with the update?`);
              // Auto-reactivate after voice finishes
              setTimeout(() => {
                setIsAwaitingVoiceConfirm(true);
                startListening();
                confirmationTimeoutRef.current = setTimeout(() => {
                  setIsAwaitingVoiceConfirm(false);
                  stopListening();
                }, 3000);
              }, 2000);
            }
          } else if (response?.success) {
            // Single tenant success - trigger ripple and voice
            setSuccessRipple(true);
            setTimeout(() => setSuccessRipple(false), 1000);
            speakVoice('Update applied successfully.');
          }
        }
      );
    },
    onError: (err) => console.error('Voice command error:', err),
  });

  // Resilient 4-phase Voice Integration (Groq → ElevenLabs → Browser → Silent)
  const { isPlaying: isVoicePlaying, isSilentMode, captions, playVoice: speakVoice, stopVoice, clearCaptions } = useResilientVoice();

  // Handle bulk confirmation
  const handleBulkConfirm = async () => {
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
        speakVoice(`Update complete. Applied changes to ${bulkConfirmation.count} clients.`);
      }
    } catch (err) {
      console.error('Bulk update failed:', err);
    } finally {
      setBulkConfirmation(null);
    }
  };

  const handleBulkCancel = () => {
    setBulkConfirmation(null);
    setIsAwaitingVoiceConfirm(false);
    if (confirmationTimeoutRef.current) {
      clearTimeout(confirmationTimeoutRef.current);
      confirmationTimeoutRef.current = null;
    }
    speakVoice('Bulk action cancelled.');
  };

  // Cleanup confirmation timeout on unmount
  useEffect(() => {
    return () => {
      if (confirmationTimeoutRef.current) {
        clearTimeout(confirmationTimeoutRef.current);
      }
    };
  }, []);

  // Ref to debounce the offline toggle
  const offlineToggleTimeout = useRef<NodeJS.Timeout | null>(null);

  // Sync URL to state - ONLY for category
  useEffect(() => {
    if (categoryParam !== activeFilter) {
      setActiveFilter(categoryParam);
      setShowOfflineOnly(false);
    }
  }, [categoryParam]);

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
    // Clear any pending toggle
    if (offlineToggleTimeout.current) {
      clearTimeout(offlineToggleTimeout.current);
    }

    // Debounce the toggle
    offlineToggleTimeout.current = setTimeout(() => {
      setShowOfflineOnly(prev => !prev);
    }, 50); // Small debounce to prevent double clicks
  }, []);

  // Stable callback for tenant selection
  const handleSelectTenant = useCallback((tenantId: string, clientName?: string) => {
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
    handleCommandSubmit(
      commandInput,
      { theme: { primary: '#0097b2' }, behavior: { prompt: 'Default' } },
      { tenantId: selectedTenantId, category: activeFilter },
      resellerSlug
    );
    setCommandInput('');
  }, [selectedTenantId, commandInput, activeFilter, resellerSlug]);

  return (
    <div className="w-full">
      {/* Header Isolation: MasterpieceHeader ONLY - z-[100] */}
      <header className="fixed top-0 left-0 right-0 z-[100]">
        {/* Tier 1: Masterpiece Glassmorphic Bar (Clean & Minimal) */}
        <nav className="w-full flex justify-between items-center px-6 py-5 backdrop-blur-md bg-white/[0.01] border border-white/5 rounded-2xl shadow-[0_4px_24px_rgba(0,0,0,0.1)]">
          {/* Left: POWERED BY PIERRE */}
          <div className="text-[9px] font-bold tracking-[0.6em] text-white/40 uppercase animate-pulse">
            POWERED BY PIERRE
          </div>

          {/* Center: Voice Intelligence Hub (Integrated into Masterpiece) */}
          <div className="flex items-center gap-4">
            {/* Mic Icon with AI Pulse */}
            <button
              onClick={isListening ? stopListening : startListening}
              disabled={!selectedTenantId || isProcessing || isAwaitingVoiceConfirm}
              className={`relative w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300 ${
                !selectedTenantId
                  ? 'bg-white/5 text-white/30 cursor-not-allowed'
                  : isAwaitingVoiceConfirm
                  ? 'bg-emerald-500/20 text-emerald-400 animate-pulse'
                  : isListening
                  ? 'bg-[#FFD700]/20 text-[#FFD700] shadow-[0_0_15px_rgba(255,215,0,0.4)]'
                  : 'bg-white/10 text-white/60 hover:bg-[#FFD700]/20 hover:text-[#FFD700]'
              }`}
            >
              {(isListening || isAwaitingVoiceConfirm) && (
                <span className="absolute inset-0 rounded-full border border-[#FFD700] animate-ping opacity-40" />
              )}
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                  d={isListening 
                    ? "M21 12a9 9 0 11-18 0 9 9 0 0118 0z M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" 
                    : "M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"} 
                />
              </svg>
            </button>

            {/* Voice Transcript HUD */}
            <span className="hidden md:block text-xs text-white/50 max-w-[180px] truncate">
              {voiceTranscript || (isListening ? 'Listening...' : 'Voice Ready')}
            </span>
          </div>

          {/* Right: AI | RESELLER DASHBOARD */}
          <div className="flex items-center">
            <span className="text-[#FFD700] font-black text-xl animate-pulse">AI</span>
            <div className="h-4 w-[1px] bg-white/20 mx-6" />
            <span className="text-white/90 font-light tracking-[0.4em] text-[10px] uppercase">RESELLER DASHBOARD</span>
          </div>
        </nav>
      </header>

      {/* Main Content Area */}
      <main className="relative w-full min-h-screen">
        {/* Buffer: MasterpieceHeader ONLY (~80px) */}
        <div className="h-[80px] w-full shrink-0" aria-hidden="true" />
        
        {/* Hero Spacer: Reduced for tighter Industry placement ~120-130px from top */}
        <div className="h-[40px] md:h-[60px] w-full" />

        {/* Industry Filters: Centered, ~120-130px from top */}
        <div className="w-full px-4 relative z-40 -mt-2">
          <div className="max-w-4xl mx-auto">
            <div className="flex items-center justify-center px-4 py-3 bg-black/40 backdrop-blur-xl border border-white/10 rounded-full">
              <div className="flex items-center gap-1 md:gap-3 overflow-x-auto no-scrollbar">
                {['All', 'Automotive', 'General', 'Retail', 'Healthcare', 'Insurance'].map((filter) => (
                  <button
                    key={filter}
                    onClick={() => handleFilterChange(filter)}
                    className={`px-3 md:px-5 py-1.5 rounded-full text-[10px] md:text-xs tracking-widest uppercase transition-all duration-300 whitespace-nowrap border ${
                      activeFilter === filter.toUpperCase()
                        ? 'border-[#FFD700]/60 bg-[#FFD700]/10 text-[#FFD700]'
                        : 'border-transparent bg-transparent text-white/50 hover:text-white/80 hover:bg-white/5'
                    }`}
                  >
                    {filter}
                  </button>
                ))}

                <div className="w-px h-4 bg-white/10 mx-2" />

                <button
                  onClick={toggleOfflineOnly}
                  className={`px-3 md:px-5 py-1.5 rounded-full text-[10px] md:text-xs tracking-widest uppercase transition-all duration-300 whitespace-nowrap border ${
                    showOfflineOnly
                      ? 'border-[#DC143C]/60 bg-[#DC143C]/10 text-[#DC143C]'
                      : 'border-transparent bg-transparent text-white/50 hover:text-[#DC143C]/70'
                  }`}
                >
                  Offline
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Generous Gap: Industry Row → Execute Bar (mt-16 = 64px) */}
        <div className="mt-16 w-full" />

        {/* Action Anchor: ExecuteBar - Centered with Neon Blue Glow */}
        <div className="w-full px-4 relative z-40">
          <div className="max-w-3xl mx-auto">
            {/* Outer Glow Container - Neon Blue */}
            <div className="relative p-[1px] rounded-xl bg-gradient-to-r from-transparent via-[#0097b2]/50 to-transparent">
              <div className="absolute inset-0 rounded-xl bg-[#0097b2]/20 blur-xl -z-10" />
              <div className="relative bg-black/60 backdrop-blur-xl border border-[#0097b2]/30 rounded-xl p-4 md:p-6">
                <div className="flex items-center gap-3">
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
                      onKeyDown={(e) => e.key === 'Enter' && handleCommandExecute()}
                      disabled={!selectedTenantId || isAnalyzing}
                      placeholder={selectedTenantId 
                        ? `I'm listening. What should we change for ${selectedClientName || 'this client'}?`
                        : "Step 1: Select a client card to begin..."
                      }
                      className={`w-full px-4 py-3 rounded-lg border text-sm tracking-widest uppercase outline-none transition-all duration-300 font-medium backdrop-blur-md ${
                        !selectedTenantId
                          ? 'border-white/20 bg-black/40 text-white/40 cursor-not-allowed placeholder:text-white/30'
                          : isAnalyzing
                          ? 'border-green-500 bg-black/30 text-white animate-pulse placeholder:text-white/60'
                          : inputFlash
                          ? 'border-green-400 bg-green-500/20 text-white placeholder:text-white/70 shadow-[0_0_30px_rgba(34,197,94,0.6)]'
                          : 'border-green-500 bg-black/40 text-white placeholder:text-white/60 focus:bg-black/50 focus:shadow-[0_0_20px_rgba(34,197,94,0.4)]'
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

                {/* Status Line - High-Tech Military Badge */}
                <div className="mt-3 flex items-center gap-3">
                  {selectedTenantId ? (
                    <>
                      <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/40 backdrop-blur-md border border-green-500 shadow-[0_0_15px_rgba(34,197,94,0.3)]">
                        <span className="text-[10px] font-black text-green-500 tracking-tighter animate-pulse">
                          AI
                        </span>
                        <span className="text-[10px] font-bold text-slate-100 tracking-[0.2em] uppercase">
                          SYSTEM ARMED
                        </span>
                      </span>
                      <span className="text-[10px] text-green-500/70 tracking-widest font-medium">
                        TARGET: {selectedTenantId.slice(0, 8).toUpperCase()}...
                      </span>
                    </>
                  ) : (
                    <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/40 backdrop-blur-md border border-white/30">
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
              onClick={handleBulkCancel}
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
          
          <ClientsGrid
            resellerSlug={resellerSlug}
            filter={activeFilter}
            showOfflineOnly={showOfflineOnly}
            categoryMap={CATEGORY_MAP}
            onSelectTenant={handleSelectTenant}
            activeTenantId={selectedTenantId}
            isProcessing={isProcessing || isAnalyzing}
            isGlobalScanning={isProcessing && !selectedTenantId}
            onStatsUpdate={setPortfolioStats}
          />
        </section>
      </main>

      {/* Deployment Modal */}
      <DeploymentModal
        isOpen={isModalOpen}
        onClose={closeModal}
        technicalSummary={technicalSummary}
        isDeploying={isDeploying}
        onDeploy={handleConfirmDeployment}
      />

      {/* Error Display */}
      {error && (
        <div className="fixed bottom-20 left-6 z-40 px-4 py-2 rounded-lg bg-red-500/20 border border-red-500/30 text-red-300 text-xs">
          {error}
        </div>
      )}

      {/* Silent Mode Captions HUD */}
      <CaptionsHUD text={captions} isVisible={isSilentMode} />
    </div>
  );
}
