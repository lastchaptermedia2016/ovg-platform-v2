'use client';

import { useState, useEffect } from 'react';
import { getIndustryProfile, getIndustryFeatureLabel } from '@/core/industries/registry';
import { formatCurrency } from '@/utils/formatters';
import { Sparkline } from './Sparkline';
import { AIInsightBadge } from './AIInsightBadge';
import { StatusDot } from './StatusDot';
import { SignalWave } from './SignalWave';

interface Tenant {
  id: string;
  name: string;
  email: string;
  category: string;
  category_config?: any;
  created_at: string;
  signal_count?: number;
  signal_trend?: number[];
  ai_insight?: string;
  last_seen?: string;
  total_revenue?: number;
  total_leads?: number;
}

interface ClientCardProps {
  tenant: Tenant;
  pulseCardId: string | null;
  pulseType: 'standard' | 'critical';
  successGlow: string | null;
  onDiagnosticClick: (tenantId: string) => void;
  onFeatureToggle: (tenantId: string, feature: string, event: React.MouseEvent) => void;
  onModuleAction?: (clientId: string, actionType: 'ai' | 'sms' | 'vin' | 'signal') => void;
  selectedClientId?: string | null;
  onExecuteCommand?: (tenantId: string, command: string) => Promise<void>;
  onSTTResult?: (tenantId: string, text: string) => void;
  isHovered?: boolean;
  useSimpleStyle?: boolean;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  categoryMap?: Record<string, string>;
}

export function ClientCard({ 
  tenant, 
  pulseCardId, 
  pulseType, 
  successGlow, 
  onDiagnosticClick,
  onFeatureToggle,
  onModuleAction,
  selectedClientId,
  onExecuteCommand,
  onSTTResult,
  isHovered = false,
  useSimpleStyle = false,
  onMouseEnter,
  onMouseLeave,
  categoryMap
}: ClientCardProps) {
  const isArmed = selectedClientId === tenant.id;
  const [commandInput, setCommandInput] = useState('');
  const [isExecuting, setIsExecuting] = useState(false);

  // Listen for STT results via custom event
  useEffect(() => {
    const handleSTTResult = (e: any) => {
      const { tenantId, text } = e.detail;
      // Logic: Even if 'isArmed' is briefly false during a re-render,
      // if the ID matches, we should capture the text.
      if (tenantId === tenant.id) {
        console.log('🎙️ [ClientCard] Match Found. Updating Command:', text);
        setCommandInput(text); // Inject into the 'I\'M LISTENING' bar
      }
    };

    window.addEventListener('stt-result', handleSTTResult);
    return () => window.removeEventListener('stt-result', handleSTTResult);
  }, [tenant.id, isArmed]);

  const handleExecute = async () => {
    if (!commandInput.trim() || !onExecuteCommand) return;
    setIsExecuting(true);
    try {
      await onExecuteCommand(tenant.id, commandInput.trim());
      setCommandInput('');
    } catch (error) {
      console.error('Command execution failed:', error);
    } finally {
      setIsExecuting(false);
    }
  };

  const categoryProfile = getIndustryProfile(tenant.category);
  const isAutomotive = tenant.category === 'automotive';
  
  // Get display label from categoryMap or use tenant.category directly
  const categoryLabel = categoryMap?.[tenant.category?.toUpperCase()] || tenant.category;

  // Zero-State Default - Force zero-baseline to prevent ghost values
  const revenue = tenant.total_revenue ?? 0;
  const leads = tenant.total_leads ?? 0;

  const getCategoryIcon = (category: string) => {
    switch (category?.toLowerCase()) {
      case 'automotive':
        return '🚗';
      case 'retail':
        return '🏪';
      case 'insurance':
        return '🛡️';
      case 'healthcare':
        return '🏥';
      case 'real_estate':
        return '🏠';
      case 'hospitality':
        return '🏨';
      default:
        return '🏢';
    }
  };

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        .force-glow-icon {
          opacity: 1 !important;
          color: #00E5FF !important;
          filter: drop-shadow(0 0 40px #00E5FF) !important brightness(2) !important;
          visibility: visible !important;
        }
      `}} />
      <div
        className={`${useSimpleStyle && !isHovered ? '' : 'backdrop-blur-xl'} bg-gradient-to-br from-white/5 via-white/[0.02] to-[#0097b2]/5 border border-white/10 rounded-lg p-4 hover:bg-white/[0.08] hover:border-[#0097b2]/50 hover:shadow-[0_0_20px_rgba(0,151,178,0.2)] transition-all duration-300 group relative mb-6 w-full min-h-[200px] overflow-visible ${
          successGlow === tenant.id ? 'shadow-[0_0_30px_rgba(0,151,178,0.5)] border-[#0097b2]' : ''
        } ${
          pulseCardId === tenant.id 
            ? pulseType === 'critical' 
              ? 'animate-signal-throb-amber' 
              : 'animate-signal-throb'
            : ''
        }`}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      >
      {/* STRICT GRID STRUCTURE - Mobile Structural Lock */}
      <div className="grid grid-cols-1 gap-3">
        {/* HEADER GRID: 2-Row Lock on Mobile */}
        <div className="grid grid-rows-2 gap-2">
          {/* Row 1: [Icon + Name + Status Dot] */}
          <div className="grid grid-cols-[auto_1fr_auto] gap-3 items-center">
            <span className="text-lg w-6 text-center">{getCategoryIcon(tenant.category)}</span>
            <div className="flex items-center gap-2 overflow-hidden">
              <StatusDot lastSeen={tenant.last_seen} />
              <h3 className="text-sm font-medium text-white truncate">{tenant.name}</h3>
            </div>
            <AIInsightBadge 
              insight={tenant.ai_insight || 'Signals are stable. Engagement is trending positively.'} 
              isPulsing={pulseCardId === tenant.id}
            />
          </div>
          
          {/* Row 2: [Industry Tag] + [Action Icons - Fixed Width Right] */}
          <div className="grid grid-cols-[1fr_auto] gap-3 items-center">
            {/* Fixed Width Industry Tag - Cannot be pushed by text length */}
            <span className="px-2 py-1 text-[10px] tracking-[0.1em] bg-cyan-500/10 border border-cyan-500/20 rounded text-cyan-300 uppercase min-w-[120px] w-fit text-center">
              {categoryLabel}
            </span>
            {/* Action Icons - Fixed Width Container with Justify-End */}
            <div className="flex items-center gap-2 w-[72px] justify-end">
              {/* Diagnostics Button */}
              <button
                onClick={() => onDiagnosticClick(tenant.id)}
                className="!opacity-100 !mix-blend-normal backdrop-blur-none w-7 h-7 rounded-lg bg-white/5 border border-white/20 flex items-center justify-center hover:bg-white/10 hover:border-[#00E5FF] transition-all duration-300 shadow-[0_0_10px_rgba(0,229,255,0.3)]"
                title="View Diagnostics"
                style={{ 
                  filter: 'drop-shadow(0 0 2px rgba(0, 151, 178, 0.3))',
                  transform: 'translateZ(0)'
                }}
              >
                <svg 
                  className="w-3.5 h-3.5" 
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                  style={{ color: '#00E5FF' }}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </button>
              {/* Management/Users Button */}
              <div className="relative !opacity-100 !visible z-50 force-glow-icon">
                <button
                  className="!opacity-100 !mix-blend-normal backdrop-blur-none relative z-10 w-7 h-7 rounded-lg bg-white/5 border border-white/20 flex items-center justify-center hover:bg-white/10 hover:border-[#00E5FF] transition-all duration-300 shadow-[0_0_10px_rgba(0,229,255,0.3)]"
                  title="Manage Users"
                  style={{ 
                    filter: 'drop-shadow(0 0 2px rgba(0, 151, 178, 0.3))',
                    transform: 'translateZ(0)'
                  }}
                >
                  <svg 
                    className="w-3.5 h-3.5 text-[#0097b2] opacity-100" 
                    fill="currentColor" 
                    viewBox="0 0 20 20" 
                    aria-hidden="true"
                  >
                    <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z"></path>
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>
        
        <div className="text-xs text-white/40 truncate">{tenant.email}</div>
          
          {/* METRICS GRID: Strict 2-Column Lock - Identical X-Coordinates on Every Card */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[10px] tracking-widest uppercase grid-flow-row">
            <div className="flex items-center gap-1">
              <span className="text-white/60">Active:</span>
              <span className="text-white font-bold">Yes</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-white/60">Leads:</span>
              <span className="text-[#FFD700] font-bold font-black">{leads}</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-white/60">Revenue:</span>
              <span className="text-[#FFD700] font-bold font-black">{formatCurrency(revenue)}</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-white/60">Signals:</span>
              <span className="text-[#0097b2] font-bold font-black">{tenant.signal_count ?? 0}</span>
              {tenant.signal_trend && tenant.signal_trend.length > 0 && (
                <Sparkline data={tenant.signal_trend} width={32} height={10} />
              )}
            </div>
          </div>

          {/* Feature Toggles - Fixed spacing, hardcoded gap */}
          <div 
            className="flex items-center gap-3"
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {['ai', 'sms', 'vin', 'signal'].map((feature) => {
              const isActive = tenant.category_config?.super_functions?.includes(feature === 'ai' ? 'ai_omni_chat' : feature);
              const isAI = feature === 'ai';
              return (
                <button
                  key={feature}
                  data-client-id={tenant.id}
                  data-action={feature}
                  onClick={(e) => {
                    console.log('--- DEBUG START ---');
                    console.log('Action:', feature);
                    console.log('Is onModuleAction a function?:', typeof onModuleAction); 
                    console.log('Tenant ID:', tenant.id);
                    
                    e.stopPropagation();
                    
                    if (typeof onModuleAction === 'function') {
                      onModuleAction(tenant.id, feature as 'ai' | 'sms' | 'vin' | 'signal');
                    } else {
                      console.error('❌ ERROR: onModuleAction is UNDEFINED. The Grid did not plug in the wire!');
                    }
                  }}
                  style={{ pointerEvents: 'auto', zIndex: 9999 }}
                  className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-300 transition-transform active:scale-90 cursor-pointer ${
                    isActive 
                      ? 'bg-[#0097b2]/20 border border-[#0097b2]/50 shadow-[0_0_10px_rgba(0,151,178,0.3)]' 
                      : 'bg-white/5 border border-white/10 opacity-40 hover:opacity-60'
                  } ${isAI ? 'border-2 border-red-500' : ''}`}
                  title={`Activate/Deactivate ${feature.toUpperCase()}`}
                >
                  <span className="text-[10px] uppercase font-bold text-white/80">
                    {feature === 'ai' ? 'AI' : feature.toUpperCase()}
                  </span>
                </button>
              );
            })}
          </div>

          {/* AI COMMAND INPUT BAR - Shows when Armed */}
          {isArmed && (
            <div className="mt-3 pt-3 border-t border-white/10">
              <div className="flex items-center gap-2">
                <div className="flex-1 flex items-center gap-2 bg-black/40 border border-[#22c55e]/50 rounded-lg p-2">
                  <div className="w-2 h-2 rounded-full bg-[#22c55e] animate-pulse" />
                  <input
                    type="text"
                    placeholder="I'M LISTENING..."
                    value={commandInput}
                    onChange={(e) => setCommandInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && commandInput.trim() && handleExecute()}
                    className="flex-1 bg-transparent text-white/90 text-xs placeholder-white/40 outline-none"
                  />
                </div>
                <button
                  onClick={handleExecute}
                  disabled={isExecuting || !commandInput.trim()}
                  className={`px-4 py-2 rounded-lg text-xs tracking-widest uppercase transition-all duration-300 font-medium whitespace-nowrap ${
                    isExecuting || !commandInput.trim()
                      ? 'border-white/10 bg-white/5 text-white/30 cursor-not-allowed'
                      : 'border-green-500 bg-green-500/20 text-green-400 hover:bg-green-500/30 hover:shadow-[0_0_20px_rgba(34,197,94,0.5)] hover:text-white'
                  }`}
                >
                  {isExecuting ? 'EXECUTING' : 'EXECUTE'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Automotive-Specific Inventory Section - Grid Aligned */}
        {isAutomotive && (
          <div className="grid grid-cols-1 gap-2 min-w-[150px]">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-cyan-500/50" />
              <span className="text-[10px] text-white/60 tracking-[0.1em] uppercase">
                Inventory: <span className="text-white font-bold">0</span>
              </span>
            </div>
          </div>
        )}
      </div>
      {/* End Strict Grid Structure */}

      {/* Active Features - Always present */}
      <div className="mt-3 pt-3 border-t border-white/10">
        <div className="flex flex-wrap gap-2">
          {tenant.category_config?.features?.slice(0, 3).map((feature: string) => (
            <span
              key={feature}
              className="px-2 py-0.5 text-[10px] tracking-[0.1em] bg-white/5 border border-white/10 rounded text-white/50"
            >
              {getIndustryFeatureLabel(feature)}
            </span>
          ))}
          {tenant.category_config?.features?.length > 3 && (
            <span className="text-[10px] text-white/30">
              +{tenant.category_config.features.length - 3} more
            </span>
          )}
        </div>
      </div>

      {/* SignalWave Animation */}
      <SignalWave />
    </>
  );
}
