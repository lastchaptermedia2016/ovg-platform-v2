'use client';

import { useEffect, useState, useRef, useMemo, memo, startTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createClient as createSupabaseClient } from '@/lib/supabase/client';
import { getIndustryProfile, getIndustryFeatureLabel } from '@/core/industries/registry';
import { AddClientModal } from './modals/AddClientModal';
import { AddClientAction } from './AddClientAction';
import { ParallaxStream } from './ParallaxStream';
import { formatCurrency } from '@/utils/formatters';
import { checkClientStatus } from '@/utils/heartbeat';
import { DiagnosticPanel } from './DiagnosticPanel';
import { ClientCard } from './ClientCard';
import { UniversalCommandModal } from './modals/UniversalCommandModal';

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

export function ClientsGridInternal({ 
  resellerSlug, 
  filter = 'all', 
  showOfflineOnly = false, 
  categoryMap,
  onSelectTenant 
}: { 
  resellerSlug: string; 
  filter?: string; 
  showOfflineOnly?: boolean; 
  categoryMap?: Record<string, string>;
  onSelectTenant?: (tenantId: string, clientName?: string) => void;
}) {
  // Props change tracking removed for production
  
  const router = useRouter();
  const [allTenants, setAllTenants] = useState<Tenant[]>([]);
  const isSubscribed = useRef(false);
  const [loading, setLoading] = useState(true);
  const [successGlow, setSuccessGlow] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchExpanded, setSearchExpanded] = useState(false);
  const [revenuePopup, setRevenuePopup] = useState<{ x: number; y: number; amount: number } | null>(null);
  const [pulseCardId, setPulseCardId] = useState<string | null>(null);
  const [pulseType, setPulseType] = useState<'standard' | 'critical'>('standard');
  const [diagnosticTenantId, setDiagnosticTenantId] = useState<string | null>(null);
  const [hoveredCardId, setHoveredCardId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'name' | 'revenue' | 'leads'>('name');
  const [showAddClientModal, setShowAddClientModal] = useState(false);
  
  // HUD State
  const [hudStats, setHudStats] = useState({
    totalMRR: 0,
    totalSignals: 0,
    aiEfficiency: 0
  });
  const [hudLoading, setHudLoading] = useState(true);
  const [criticalAlertsCount, setCriticalAlertsCount] = useState(0);

  // Buffer for coalescing rapid tenant updates
  const tenantUpdateBuffer = useRef<{ updated: Tenant[]; inserted: Tenant[]; removedIds: Set<string>; timer: any }>({
    updated: [], inserted: [], removedIds: new Set(), timer: null
  });

  // Throttle refs for pulse and alerts
  const lastPulseAt = useRef<Record<string, number>>({});
  const PULSE_THROTTLE_MS = 800;
  const lastAlertAt = useRef(0);
  const ALERT_THROTTLE_MS = 500;

  // Filter clients using useMemo to preserve master list
  const visibleClients = useMemo(() => {
    if (!allTenants || allTenants.length === 0) return [];
    
    const OFFLINE_THRESHOLD = 86400000; // 24 hours in milliseconds
    
    return allTenants.filter((tenant: Tenant) => {
      if (!tenant) return false;
      
      const matchesSearch = 
        tenant.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        tenant.email.toLowerCase().includes(searchQuery.toLowerCase());
      
      // First, check Category match
      const activeFilter = filter.toLowerCase().trim();
      const clientCategory = (tenant.category || '').toLowerCase().trim();
      
      let categoryMatch = false;
      if (activeFilter === 'all') {
        categoryMatch = true;
      } else if (activeFilter === 'general') {
        categoryMatch = clientCategory.includes('general') || clientCategory.includes('business');
      } else {
        categoryMatch = clientCategory.includes(activeFilter);
      }
      
      // Second, if Offline is toggled, it acts as a SECONDARY strainer
      if (showOfflineOnly) {
        const isOffline = !tenant.last_seen || 
                          (new Date().getTime() - new Date(tenant.last_seen).getTime() > OFFLINE_THRESHOLD);
        return matchesSearch && categoryMatch && isOffline;
      }

      return matchesSearch && categoryMatch;
    }).sort((a: Tenant, b: Tenant) => {
      switch (sortBy) {
        case 'revenue':
          return (b.total_revenue ?? 0) - (a.total_revenue ?? 0);
        case 'leads':
          return (b.total_leads ?? 0) - (a.total_leads ?? 0);
        case 'name':
        default:
          return a.name.localeCompare(b.name);
      }
    });
  }, [allTenants, filter, showOfflineOnly, searchQuery, sortBy]);

  useEffect(() => {
    fetchTenants({ offlineOnly: false, filterParam: 'ALL', resellerSlugParam: resellerSlug });
    fetchDashboardStats();
    fetchCriticalAlerts();
  }, []);

  // Refetch when offline toggle or filter changes
  useEffect(() => {
    fetchTenants({ offlineOnly: !!showOfflineOnly, filterParam: filter, resellerSlugParam: resellerSlug });
  }, [showOfflineOnly, filter, resellerSlug]);

  // Realtime subscription - runs once on mount with proper cleanup
  useEffect(() => {
    // Atomic Guard: Prevent double-subscription
    if (isSubscribed.current) return;
    isSubscribed.current = true;
    
    const supabase = createSupabaseClient();
    
    const channel = supabase
      .channel('tenants-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tenants'
        },
        (payload) => {
          // Push into buffer
          if (payload.eventType === 'UPDATE') tenantUpdateBuffer.current.updated.push(payload.new as Tenant);
          if (payload.eventType === 'INSERT') tenantUpdateBuffer.current.inserted.push(payload.new as Tenant);
          if (payload.eventType === 'DELETE') tenantUpdateBuffer.current.removedIds.add(payload.old.id);

          // Schedule flush
          if (!tenantUpdateBuffer.current.timer) {
            tenantUpdateBuffer.current.timer = setTimeout(() => {
              const buf = tenantUpdateBuffer.current;
              startTransition(() => {
                setAllTenants(prev => {
                  let next = prev.slice();
                  // apply removals
                  if (buf.removedIds.size) next = next.filter(t => !buf.removedIds.has(t.id));
                  // apply updates
                  if (buf.updated.length) {
                    const byId = new Map(buf.updated.map((u: Tenant) => [u.id, u]));
                    next = next.map(t => byId.has(t.id) ? { ...t, ...byId.get(t.id) } : t);
                  }
                  // apply inserts (prepend, dedupe)
                  if (buf.inserted.length) {
                    const ids = new Set(next.map(t => t.id));
                    next = [...buf.inserted.filter((u: Tenant) => !ids.has(u.id)), ...next];
                  }
                  return next;
                });
              });
              // clear buffer
              clearTimeout(buf.timer);
              tenantUpdateBuffer.current = { updated: [], inserted: [], removedIds: new Set(), timer: null };
            }, 150);
          }

          // Throttled pulse animation
          if (payload.eventType === 'UPDATE') {
            const updatedTenant = payload.new as Tenant;
            const now = Date.now();
            if (!lastPulseAt.current[updatedTenant.id] || now - lastPulseAt.current[updatedTenant.id] > PULSE_THROTTLE_MS) {
              lastPulseAt.current[updatedTenant.id] = now;
              setPulseCardId(updatedTenant.id);
              setPulseType('standard');
              setTimeout(() => setPulseCardId(null), 3000);
            }
          } else if (payload.eventType === 'INSERT') {
            const newTenant = payload.new as Tenant;
            const now = Date.now();
            if (!lastPulseAt.current[newTenant.id] || now - lastPulseAt.current[newTenant.id] > PULSE_THROTTLE_MS) {
              lastPulseAt.current[newTenant.id] = now;
              setPulseCardId(newTenant.id);
              setPulseType('critical');
              setTimeout(() => setPulseCardId(null), 3000);
            }
          }
        }
      )
      .subscribe();

    // Also subscribe to tenant_logs for critical alerts
    const logsChannel = supabase
      .channel('tenant-logs-global')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'tenant_logs'
        },
        (payload) => {
          const newLog = payload.new as any;
          if (newLog.error_type === 'error' || newLog.error_type === 'critical') {
            const t = Date.now();
            if (t - lastAlertAt.current > ALERT_THROTTLE_MS) {
              lastAlertAt.current = t;
              setCriticalAlertsCount(prev => prev + 1);
            }
          }
        }
      )
      .subscribe();

    // CLEANUP: Remove channels on unmount
    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(logsChannel);
    };
  }, []); // Empty array ensures this only runs ONCE on mount

  const fetchCriticalAlerts = async () => {
    try {
      // Initialization Gate
      const supabase = createSupabaseClient();
      if (!supabase || !process.env.NEXT_PUBLIC_SUPABASE_URL) {
        console.warn('SYSTEM: Supabase not initialized. Skipping fetch.');
        return;
      }

      // Connection Guard
      if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
        console.error("SYSTEM ERROR: Supabase Environment Variables Missing");
        setCriticalAlertsCount(0);
        return;
      }

      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      
      console.log('DEBUG: Attempting fetch from table tenant_logs...');
      
      const { count, error } = await supabase
        .from('tenant_logs')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', oneHourAgo)
        .in('error_type', ['error', 'critical']);

      if (error) {
        console.debug('SYSTEM DIAGNOSTIC RAW:', error.toString());
        console.debug('STATUS CODE:', (error as any)?.status || 'NO STATUS');
        console.debug('FULL ERROR STRINGIFIED:', JSON.stringify(error, Object.getOwnPropertyNames(error)));
        setCriticalAlertsCount(0);
        return;
      }
      
      setCriticalAlertsCount(prev => {
        const newCount = count || 0;
        return prev === newCount ? prev : newCount;
      });
    } catch (error: any) {
      console.debug('CRITICAL SYSTEM ALERT RAW:', String(error));
      console.dir(error);
      setCriticalAlertsCount(0);
    }
  };

  const fetchDashboardStats = async () => {
    try {
      const supabase = createSupabaseClient();
      
      // Fetch total MRR from tenants
      const { data: tenantsData, error: tenantsError } = await supabase
        .from('tenants')
        .select('mrr, total_leads, total_revenue, signal_count');

      if (tenantsError) throw tenantsError;

      const totalMRR = tenantsData?.reduce((sum, tenant) => sum + (Number(tenant.mrr) || 0), 0) ?? 0;
      const totalLeads = tenantsData?.reduce((sum, tenant) => sum + (Number(tenant.total_leads) || 0), 0) ?? 0;
      const totalRevenue = tenantsData?.reduce((sum, tenant) => sum + (Number(tenant.total_revenue) || 0), 0) ?? 0;
      
      // Calculate total signals from signal_count or fallback to placeholder
      const totalSignals = tenantsData?.reduce((sum, tenant) => sum + (Number(tenant.signal_count) || 0), 0) ?? (tenantsData?.length * 50 || 0);
      
      // Calculate AI Efficiency based on signal-to-success ratio
      // Placeholder: 98% efficiency for now, in production this would be calculated from actual signal data
      const successfulSignals = Math.floor(totalSignals * 0.98);
      const aiEfficiency = totalSignals > 0 ? Math.round((successfulSignals / totalSignals) * 100) : 0;

      setHudStats(prev => {
        // Only update if values actually changed
        if (prev.totalMRR === totalMRR && 
            prev.totalSignals === totalSignals && 
            prev.aiEfficiency === aiEfficiency) {
          return prev;
        }
        return { totalMRR, totalSignals, aiEfficiency };
      });
    } catch (error: any) {
      console.error('Database Error:', error.message || error);
    } finally {
      setHudLoading(false);
    }
  };

  const OFFLINE_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24 hours
  
  const fetchTenants = async ({ offlineOnly = false, filterParam = 'ALL', resellerSlugParam }: {
    offlineOnly?: boolean; filterParam?: string; resellerSlugParam?: string;
  } = {}) => {
    try {
      setLoading(true);
      const supabase = createSupabaseClient();

      const cutoffIso = new Date(Date.now() - OFFLINE_THRESHOLD_MS).toISOString();

      // 1) Get reseller UUID from slug
      let resellerId: string | null = null;
      if (resellerSlugParam) {
        const { data: rData, error: rErr } = await supabase
          .from('resellers')
          .select('id')
          .eq('slug', resellerSlugParam)
          .maybeSingle();
        console.log('Reseller lookup:', { resellerSlugParam, rData, rErr: rErr?.message });
        if (rData?.id) resellerId = rData.id;
      }

      // 2) Build tenants query
      let q = supabase
        .from('tenants')
        .select('*')
        .order('created_at', { ascending: false });

      // Filter by reseller
      if (resellerId) q = q.eq('reseller_id', resellerId);

      if (filterParam && filterParam.toUpperCase() !== 'ALL') {
        const category = categoryMap?.[filterParam.toUpperCase()];
        if (category) q = q.ilike('category', `%${category}%`);
      }

      // Temporarily disabled for debugging
      // if (offlineOnly) q = q.or(`last_seen.is.null,last_seen.lt.${cutoffIso}`);

      const { data, error } = await q;
      console.log('fetchTenants response:', { cutoffIso, filterParam, resellerSlugParam, dataLength: data?.length ?? 0, error });

      if (error) throw error;

      setAllTenants(prev => {
        const newData = data || [];
        if (prev.length === newData.length &&
            prev.every((t, i) => t.id === newData[i]?.id)) {
          const hasChanges = newData.some((newTenant, i) => {
            const prevTenant = prev[i];
            return Object.keys(newTenant).some(
              key => (prevTenant as any)?.[key] !== (newTenant as any)[key]
            );
          });
          if (!hasChanges) {
            console.log('setAllTenants: no changes, skipping update');
            return prev;
          }
        }
        console.log('setAllTenants applied, count:', newData.length);
        return newData;
      });
    } catch (err: any) {
      console.error('Error fetching tenants:', {
        message: err?.message,
        code: err?.code,
        status: err?.status,
        details: err?.details
      });
    } finally {
      setLoading(false);
    }
  };

  const handleClientAdded = () => {
    fetchTenants({ offlineOnly: !!showOfflineOnly, filterParam: filter, resellerSlugParam: resellerSlug });
  };

  const handleImpersonate = (tenantId: string) => {
    router.push(`/dashboard/client/${tenantId}`);
  };

  const handleFeatureToggle = async (tenantId: string, feature: string, event: React.MouseEvent) => {
    // Trigger success glow
    setSuccessGlow(tenantId);
    
    // Trigger revenue popup
    const rect = event.currentTarget.getBoundingClientRect();
    setRevenuePopup({
      x: rect.left + rect.width / 2,
      y: rect.top,
      amount: Math.floor(Math.random() * 5000) + 1000 // Random revenue between R 1,000 and R 6,000
    });
    
    setTimeout(() => setSuccessGlow(null), 1000);
    setTimeout(() => setRevenuePopup(null), 2000);
    
    // TODO: Implement optimistic UI update and Supabase update
    console.log('Toggle feature:', feature, 'for tenant:', tenantId);
  };

  const getCategoryIcon = (category: string) => {
    switch (category?.toLowerCase()) {
      case 'automotive':
        return '🚗';
      case 'retail':
        return '🏪';
      case 'healthcare':
        return '🏥';
      case 'insurance':
        return '🛡️';
      case 'real_estate':
        return '🏠';
      case 'hospitality':
        return '🏨';
      default:
        return '🏢';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-xs text-white/40 tracking-[0.2em] uppercase">Loading clients...</div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-[1200px] flex flex-col items-center space-y-6 relative pb-20">
      {/* Parallax Stream */}
      <ParallaxStream />

      {/* Revenue Popup */}
      {revenuePopup && (
        <div
          className="fixed pointer-events-none z-50 text-[#D4AF37] font-bold text-sm tracking-wider animate-bounce"
          style={{
            left: `${revenuePopup.x}px`,
            top: `${revenuePopup.y - 20}px`,
            transform: 'translateX(-50%)',
            textShadow: '0 0 10px rgba(212, 175, 55, 0.8)',
          }}
        >
          +R {revenuePopup.amount.toLocaleString()}
        </div>
      )}

      {/* Header with Stats Bar */}
      <div className="flex flex-col md:flex-row justify-between items-stretch relative z-10 gap-4 md:gap-8 w-full h-fit">
        <div className="backdrop-blur-[8px] saturate-[180%] bg-white/[0.05] border border-white/10 rounded-xl p-4 flex flex-col gap-1 w-full md:w-[320px]">
          <h2 className="text-[22px] font-black uppercase tracking-tight animate-gold-sweep">
            Client Portfolio
          </h2>
          <div className="flex items-center gap-2 text-xs text-white/90">
            <span className="w-2.5 h-2.5 rounded-full bg-[#0097b2] animate-pulse shadow-[0_0_8px_#0097b2]" />
            {allTenants.length} active clients
          </div>
        </div>

        {/* Portfolio Health HUD - Original Vertical State */}
        <div className="w-full flex flex-wrap items-center gap-3 md:gap-6 backdrop-blur-md bg-white/5 border border-white/10 rounded-xl px-3 md:px-6 py-3 md:py-4 overflow-hidden">
          {hudLoading ? (
            <>
              <div className="flex items-center gap-2 min-w-fit">
                <span className="text-[10px] tracking-[0.15em] text-white/60 uppercase">Total MRR</span>
                <div className="w-16 h-4 bg-white/10 rounded animate-pulse" />
              </div>
              <div className="w-px h-6 bg-white/10 hidden md:block" />
              <div className="flex items-center gap-2 min-w-fit">
                <span className="text-[10px] tracking-[0.15em] text-white/60 uppercase">Total Signals</span>
                <div className="w-12 h-4 bg-white/10 rounded animate-pulse" />
              </div>
              <div className="w-px h-6 bg-white/10 hidden md:block" />
              <div className="flex items-center gap-2 min-w-fit">
                <span className="text-[10px] tracking-[0.15em] text-white/60 uppercase">AI Efficiency</span>
                <div className="w-10 h-4 bg-white/10 rounded animate-pulse" />
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 min-w-fit">
                <span className="text-[10px] tracking-[0.15em] text-white/60 uppercase">Total MRR</span>
                <span className="text-sm md:text-sm font-bold text-[#D4AF37]">{formatCurrency(hudStats.totalMRR)}</span>
              </div>
              <div className="w-px h-6 bg-white/10 hidden md:block" />
              <div className="flex items-center gap-2 min-w-fit">
                <span className="text-[10px] tracking-[0.15em] text-white/60 uppercase">Total Signals</span>
                <span className="text-sm md:text-sm font-bold text-[#0097b2]">{hudStats.totalSignals.toLocaleString()}</span>
              </div>
              <div className="w-px h-6 bg-white/10 hidden md:block" />
              <div className="flex items-center gap-2 min-w-fit">
                <span className="text-[10px] tracking-[0.15em] text-white/60 uppercase">AI Efficiency</span>
                <span className="text-sm md:text-sm font-bold text-white">{hudStats.aiEfficiency}%</span>
              </div>
              <div className="w-px h-6 bg-white/10 hidden md:block" />
              
              {/* Critical Alerts Badge */}
              {criticalAlertsCount > 0 && (
                <div className="flex items-center gap-2 min-w-fit px-3 py-1 bg-[#DC143C]/20 border border-[#DC143C]/30 rounded-lg animate-pulse">
                  <span className="text-[10px] tracking-[0.15em] text-[#DC143C] uppercase">Critical Alerts</span>
                  <span className="text-sm font-bold text-[#DC143C]">{criticalAlertsCount}</span>
                </div>
              )}
            </>
          )}
          <div className="w-px h-6 bg-white/10 hidden md:block" />
          
          {/* Sort Dropdown */}
          <div className="relative">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'name' | 'revenue' | 'leads')}
              className="appearance-none bg-transparent text-xs text-white/60 uppercase tracking-[0.1em] outline-none cursor-pointer pr-6"
            >
              <option value="name" className="bg-gray-900">Name</option>
              <option value="revenue" className="bg-gray-900">Revenue</option>
              <option value="leads" className="bg-gray-900">Leads</option>
            </select>
            <svg className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 text-white/40 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
          
          {/* Search Input */}
          <div className={`flex items-center backdrop-blur-xl bg-white/5 border border-white/10 rounded-lg transition-all duration-300 ${
            searchExpanded ? 'w-48 px-3' : 'w-8 h-8 justify-center'
          }`}>
            {searchExpanded ? (
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search clients..."
                className="bg-transparent text-xs text-white placeholder-white/40 outline-none w-full"
                autoFocus
                onBlur={() => setSearchExpanded(false)}
              />
            ) : (
              <button
                onClick={() => setSearchExpanded(true)}
                className="w-full h-full flex items-center justify-center text-white/60 hover:text-white transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Add Client Action Pane */}
      <AddClientAction onClientAdded={handleClientAdded} />

      {/* Grid */}
      {(() => {
        if (visibleClients.length === 0) {
          return (
            <div className="backdrop-blur-xl bg-white/[0.05] border border-white/10 rounded-lg p-12 text-center">
              <div className="text-xs text-white/40 tracking-[0.2em] uppercase mb-2">
                {filter === 'all' || filter === 'ALL' 
                  ? 'No clients yet' 
                  : `No ${filter.charAt(0).toUpperCase() + filter.slice(1).toLowerCase()} Clients Onboarded`
                }
              </div>
              <div className="text-xs text-white/20 mb-4">
                {filter === 'all' || filter === 'ALL' 
                  ? 'Add your first client to get started' 
                  : 'Expand your portfolio in this category'
                }
              </div>
              <button
                onClick={() => setShowAddClientModal(true)}
                className="px-6 py-2 bg-[#0097b2]/20 border border-[#0097b2]/50 rounded-full text-xs tracking-widest uppercase text-[#0097b2] hover:bg-[#0097b2]/30 hover:border-[#0097b2] transition-all duration-300"
              >
                {filter === 'all' || filter === 'ALL' 
                  ? 'Add Your First Client' 
                  : `Add Your First ${filter.charAt(0).toUpperCase() + filter.slice(1).toLowerCase()} Client`
                }
              </button>
            </div>
          );
        }
        return (
          <div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(300px,1fr))] w-full px-4 sm:px-0">
            {visibleClients.map((tenant) => (
              <div
                key={tenant.id}
                onClick={() => {
                  console.log('ClientCard clicked, selecting tenant:', tenant.id, 'name:', tenant.name);
                  onSelectTenant?.(tenant.id, tenant.name);
                }}
                className={`cursor-pointer transition-all duration-200 ${
                  onSelectTenant ? 'hover:ring-2 hover:ring-[#0097b2]/50' : ''
                }`}
              >
                <ClientCard
                  tenant={tenant}
                  pulseCardId={pulseCardId}
                  pulseType={pulseType}
                  successGlow={successGlow}
                  onDiagnosticClick={setDiagnosticTenantId}
                  onFeatureToggle={handleFeatureToggle}
                  isHovered={hoveredCardId === tenant.id}
                  useSimpleStyle={visibleClients.length > 20}
                  onMouseEnter={() => setHoveredCardId(tenant.id)}
                  onMouseLeave={() => setHoveredCardId(null)}
                  categoryMap={categoryMap}
                />
              </div>
            ))}
        </div>
        );
      })()}

      {diagnosticTenantId && (
        <DiagnosticPanel
          tenantId={diagnosticTenantId}
          isOpen={!!diagnosticTenantId}
          onClose={() => setDiagnosticTenantId(null)}
        />
      )}

      {showAddClientModal && (
        <UniversalCommandModal onClose={() => setShowAddClientModal(false)} />
      )}
    </div>
  );
}

export const ClientsGrid = memo(ClientsGridInternal, (prev, next) => {
  const isSame =
    prev.resellerSlug === next.resellerSlug &&
    prev.filter === next.filter &&
    prev.onSelectTenant === next.onSelectTenant &&
    prev.showOfflineOnly === next.showOfflineOnly &&
    prev.categoryMap === next.categoryMap;

  return isSame;
});
