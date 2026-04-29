'use client';

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
  isHovered = false,
  useSimpleStyle = false,
  onMouseEnter,
  onMouseLeave,
  categoryMap
}: ClientCardProps) {
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
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div className="flex-1">
          {/* Header with Status, Name, Industry, AI Insight, Diagnostics */}
          <div className="flex items-center gap-3 mb-2 flex-wrap relative z-[60]">
            <span className="text-lg">{getCategoryIcon(tenant.category)}</span>
            <div className="flex items-center gap-2 flex-wrap">
              <StatusDot lastSeen={tenant.last_seen} />
              <h3 className="text-sm font-medium text-white">{tenant.name}</h3>
            </div>
            <span className="px-2 py-0.5 text-[10px] tracking-[0.1em] bg-cyan-500/10 border border-cyan-500/20 rounded text-cyan-300 uppercase min-w-[60px] text-center">
              {categoryLabel}
            </span>
            <AIInsightBadge 
              insight={tenant.ai_insight || 'Signals are stable. Engagement is trending positively.'} 
              isPulsing={pulseCardId === tenant.id}
            />
            {/* Diagnostics Button - Always present */}
            <button
              onClick={() => onDiagnosticClick(tenant.id)}
              className="!opacity-100 !mix-blend-normal backdrop-blur-none w-6 h-6 rounded-lg bg-white/5 border border-white/20 flex items-center justify-center hover:bg-white/10 hover:border-[#00E5FF] transition-all duration-300 shadow-[0_0_10px_rgba(0,229,255,0.3)]"
              title="View Diagnostics"
              style={{ 
                filter: 'drop-shadow(0 0 2px rgba(0, 151, 178, 0.3))',
                transform: 'translateZ(0)'
              }}
            >
              <svg 
                className="w-3 h-3" 
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
                style={{ color: '#00E5FF' }}
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </button>
            {/* Management/Users Button - Always present */}
            <div className="relative !opacity-100 !visible z-50 force-glow-icon">
              <button
                className="!opacity-100 !mix-blend-normal backdrop-blur-none relative z-10 w-6 h-6 rounded-lg bg-white/5 border border-white/20 flex items-center justify-center hover:bg-white/10 hover:border-[#00E5FF] transition-all duration-300 shadow-[0_0_10px_rgba(0,229,255,0.3)]"
                title="Manage Users"
                style={{ 
                  filter: 'drop-shadow(0 0 2px rgba(0, 151, 178, 0.3))',
                  transform: 'translateZ(0)'
                }}
              >
                <svg 
                  className="w-3 h-3 text-[#0097b2] opacity-100" 
                  fill="currentColor" 
                  viewBox="0 0 20 20" 
                  aria-hidden="true"
                >
                  <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z"></path>
                </svg>
              </button>
            </div>
          </div>
          <div className="text-xs text-white/40">{tenant.email}</div>
          
          {/* Metrics Row - Twin Standardization: All values use font-bold */}
          <div className="mt-2 flex flex-col md:flex-row md:items-center gap-2 md:gap-4 text-[10px] tracking-widest uppercase">
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 w-full md:flex md:gap-4">
              <span className="text-white/60">Active: <span className="text-white font-bold">Yes</span></span>
              <span className="text-white/60">Leads: <span className="text-[#FFD700] font-bold font-black">{leads}</span></span>
              <span className="text-white/60">Revenue: <span className="text-[#FFD700] font-bold font-black">{formatCurrency(revenue)}</span></span>
              <span className="text-white/60 flex items-center gap-2">
                Signals: <span className="text-[#0097b2] font-bold font-black">{tenant.signal_count ?? 0}</span>
                {tenant.signal_trend && tenant.signal_trend.length > 0 && (
                  <Sparkline data={tenant.signal_trend} width={40} height={12} />
                )}
              </span>
            </div>
          </div>

          {/* Feature Toggles - Tightened vertical spacing for twin consistency */}
          <div className="mt-2 flex items-center gap-2">
            {['ai', 'sms', 'vin', 'signal'].map((feature) => {
              const isActive = tenant.category_config?.super_functions?.includes(feature === 'ai' ? 'ai_omni_chat' : feature);
              return (
                <button
                  key={feature}
                  onClick={(e) => onFeatureToggle(tenant.id, feature, e)}
                  className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-300 ${
                    isActive 
                      ? 'bg-[#0097b2]/20 border border-[#0097b2]/50 shadow-[0_0_10px_rgba(0,151,178,0.3)]' 
                      : 'bg-white/5 border border-white/10 opacity-40 hover:opacity-60'
                  }`}
                  title={`Activate/Deactivate ${feature.toUpperCase()}`}
                >
                  <span className="text-[10px] uppercase font-bold text-white/80">
                    {feature === 'ai' ? 'AI' : feature.toUpperCase()}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Automotive-Specific Inventory Section - Harmonized */}
        {isAutomotive && (
          <div className="flex flex-col gap-2 min-w-[150px] justify-center">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-cyan-500/50" />
              <span className="text-[10px] text-white/60 tracking-[0.1em] uppercase">
                Inventory: <span className="text-white font-bold">0</span>
              </span>
            </div>
          </div>
        )}
      </div>

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
    </div>
    </>
  );
}
