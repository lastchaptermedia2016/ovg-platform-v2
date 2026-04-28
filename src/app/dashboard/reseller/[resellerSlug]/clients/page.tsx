'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { ClientsGrid } from '@/components/reseller/ClientsGrid';
import { DeploymentModal } from '@/components/ai-intelligence/DeploymentModal';
import { useAICommand } from '@/hooks/use-ai-command';

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
  const commandInputRef = useRef<HTMLInputElement>(null);

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
    <div className="w-full px-4">
      <div className="flex flex-wrap justify-center gap-2 mb-6">
        {['All', 'Automotive', 'General', 'Retail', 'Healthcare', 'Insurance'].map((filter) => (
          <button
            key={filter}
            onClick={() => handleFilterChange(filter)}
            className={`backdrop-blur-xl border px-4 py-1 rounded-full text-xs tracking-widest uppercase transition-all duration-300 whitespace-nowrap ${
              activeFilter === filter.toUpperCase()
                ? 'border-[#0097b2] bg-[#0097b2]/10 text-[#D4AF37] border-b-2 shadow-[0_0_8px_rgba(0,151,178,0.8)]'
                : 'border-white/10 bg-white/5 text-white/40 hover:text-[#D4AF37] hover:border-white/20'
            }`}
          >
            {filter}
          </button>
        ))}

        {/* Offline Only Button */}
        <button
          onClick={toggleOfflineOnly}
          className={`backdrop-blur-xl border px-4 py-1 rounded-full text-xs tracking-widest uppercase transition-all duration-300 whitespace-nowrap ml-4 ${
            showOfflineOnly
              ? 'border-[#DC143C] bg-[#DC143C]/10 text-[#DC143C]'
              : 'border-white/10 bg-white/5 text-white/40 hover:text-[#DC143C] hover:border-white/20'
          }`}
        >
          Offline Only
        </button>
      </div>

      {/* Green Pulse Command Center - Positioned under Add New Client */}
      <div className="w-full mb-6 px-4">
        <div className="max-w-4xl mx-auto">
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

            {/* Command Input with High Contrast */}
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
                    ? 'border-green-500 bg-black/30 text-white animate-pulse placeholder:text-white/60 backdrop-blur-lg'
                    : inputFlash
                    ? 'border-green-400 bg-green-500/20 text-white placeholder:text-white/70 shadow-[0_0_30px_rgba(34,197,94,0.6)]'
                    : 'border-green-500 bg-black/40 text-white placeholder:text-white/60 focus:bg-black/50 focus:shadow-[0_0_20px_rgba(34,197,94,0.4)]'
                }`}
              />
              {/* Outer Glow Only - Behind the input */}
              {selectedTenantId && !isAnalyzing && (
                <div className="absolute -inset-1 rounded-lg bg-green-500/20 blur-md -z-10 pointer-events-none" />
              )}
            </div>

            {/* RUN Button with Green Accents */}
            <button
              onClick={handleCommandExecute}
              disabled={isAnalyzing || !selectedTenantId || !commandInput.trim()}
              className={`px-6 py-3 rounded-lg backdrop-blur-xl border text-xs tracking-widest uppercase transition-all duration-300 font-medium ${
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
                {/* SYSTEM ARMED Badge - Glassmorphism */}
                <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/40 backdrop-blur-md border border-green-500 shadow-[0_0_15px_rgba(34,197,94,0.3)]">
                  {/* Pulsing AI Heartbeat */}
                  <span className="text-[10px] font-black text-green-500 tracking-tighter animate-pulse drop-shadow-[0_0_8px_rgba(34,197,94,0.8)]">
                    AI
                  </span>
                  <span className="text-[10px] font-bold text-slate-100 tracking-[0.2em] uppercase drop-shadow-[0_0_8px_rgba(0,0,0,1)]">
                    SYSTEM ARMED
                  </span>
                </span>
                {/* Target ID */}
                <span className="text-[10px] text-green-500/70 tracking-widest font-medium">
                  TARGET: {selectedTenantId.slice(0, 8).toUpperCase()}...
                </span>
              </>
            ) : (
              /* STANDBY Badge - Glassmorphism */
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

      <ClientsGrid
        resellerSlug={resellerSlug}
        filter={activeFilter}
        showOfflineOnly={showOfflineOnly}
        categoryMap={CATEGORY_MAP}
        onSelectTenant={handleSelectTenant}
      />

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
    </div>
  );
}
