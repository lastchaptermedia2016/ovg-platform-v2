import { useEffect, useState, useRef, useMemo, memo, startTransition, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient as createSupabaseClient } from '@/lib/supabase/client';
import { AddClientAction } from './AddClientAction';
import { isInvalidSlug } from '@/lib/utils/guard';
import { resolveResellerId } from '@/lib/supabase/resolve-reseller-id';
import { ParallaxStream } from './ParallaxStream';
import { DiagnosticPanel } from './DiagnosticPanel';
import { ClientCard } from './ClientCard';
import { UniversalCommandModal } from './modals/UniversalCommandModal';
import { TenantPricingModal } from './TenantPricingModal';

// Removed unused imports: getIndustryProfile, getIndustryFeatureLabel, AddClientModal, formatCurrency, checkClientStatus
// Capability Map: Dynamic industry-to-action permissions
const CAPABILITY_MAP: Record<string, Set<string>> = {
  automotive: new Set(['ai', 'sms', 'vin', 'signal']),
  retail: new Set(['ai', 'sms', 'signal']),
  healthcare: new Set(['ai', 'sms', 'signal']),
  insurance: new Set(['ai', 'sms', 'signal']),
  'GENERAL BUSINESS': new Set(['ai', 'sms', 'signal']),
  default: new Set(['ai', 'sms', 'signal']),
};

/**
 * Resolve the effective capability category for a tenant.
 * Priority 1: automotive override (industry or category)
 * Priority 2: general/business mapping
 * Priority 3: fallback to 'GENERAL BUSINESS' — never undefined.
 * This decouples UI industry labels from legacy database strings.
 */
function resolveEffectiveCategory(tenant: { industry?: string; category?: string }): string {
  const industry = (tenant.industry || '').toLowerCase();
  const category = (tenant.category || '').toLowerCase();

  // Priority 1: automotive (most restrictive vertical)
  if (industry.includes('automotive') || category.includes('automotive')) {
    return 'automotive';
  }

  // Priority 2: general/business mapping
  if (industry.includes('general') || category.includes('general') ||
      industry.includes('business') || category.includes('business')) {
    return 'GENERAL BUSINESS';
  }

  // Priority 3: exact or partial key match against CAPABILITY_MAP
  const search = industry || category;
  if (search) {
    const matchedKey = Object.keys(CAPABILITY_MAP).find(
      key => key.toLowerCase().includes(search) || search.includes(key.toLowerCase())
    );
    if (matchedKey) return matchedKey;
  }

  // Priority 4: safe default
  return 'GENERAL BUSINESS';
}

// Status Indicator Types
type IndicatorStatus = 'active' | 'inactive' | 'error';

interface Indicators {
  ai: IndicatorStatus;
  sms: IndicatorStatus;
  vin: IndicatorStatus;
  signal: IndicatorStatus;
}

interface Tenant {
  id: string;
  name: string;
  email: string;
  category: string;
  industry?: string;
  category_config?: Record<string, unknown>;
  created_at: string;
  signal_count?: number;
  signal_trend?: number[];
  ai_insight?: string;
  last_seen?: string;
  total_revenue?: number;
  total_leads?: number;
  mrr?: number;
  is_active?: boolean;
  permission_level?: 'standard' | 'readonly' | string;
  indicators?: Indicators;
}

export function ClientsGridInternal({ 
  resellerSlug, 
  filter = 'all', 
  showOfflineOnly = false, 
  categoryMap,
  onSelectTenant,
  activeTenantId,
  isProcessing,
  onStatsUpdate,
  onExecuteSystemAction, // Unified parent callback — replaces grid-level STT/TTS
}: { 
  resellerSlug: string; 
  filter?: string; 
  showOfflineOnly?: boolean; 
  categoryMap?: Record<string, string>;
  onSelectTenant?: (tenantId: string, clientName?: string, _category?: string) => void;
  activeTenantId?: string | null;
  isProcessing?: boolean;
  isGlobalScanning?: boolean;
  onStatsUpdate?: (stats: {
    totalClients: number;
    totalMRR: number;
    totalSignals: number;
    aiEfficiency: number;
    criticalAlerts: number;
    loading: boolean;
  }) => void;
  onExecuteSystemAction?: (clientId: string, actionType: 'ai' | 'sms' | 'vin' | 'signal') => void;
}) {
  // Debug: fires only on true mount, not on every parent re-render
  useEffect(() => {
    console.log('OVG-PLATFORM-V2: ClientsGrid mounted with resellerSlug:', {
      resellerSlug,
      type: typeof resellerSlug,
      isEmpty: !resellerSlug,
      isUndefined: resellerSlug === undefined,
      isNull: resellerSlug === null,
      length: resellerSlug?.length
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  
  const router = useRouter();
  const [allTenants, setAllTenants] = useState<Tenant[]>([]);
  const isSubscribed = useRef(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [hasSession, setHasSession] = useState(false); // Renamed from _hasSession
  const supabase = useRef(createSupabaseClient());
  const [pulseCardId, setPulseCardId] = useState<string | null>(null);
  const [pulseType, setPulseType] = useState<'standard' | 'critical'>('standard');
  const [diagnosticTenantId, setDiagnosticTenantId] = useState<string | null>(null);
  const [hoveredCardId, setHoveredCardId] = useState<string | null>(null);
  const [showAddClientModal, setShowAddClientModal] = useState(false);
  const [pricingTenant, setPricingTenant] = useState<Tenant | null>(null);
  const [successGlow, _setSuccessGlow] = useState<string | null>(null);

  // HUD State
  const [hudStats, setHudStats] = useState({
    totalMRR: 0,
    totalSignals: 0,
    aiEfficiency: 0
  });
  const [hudLoading, setHudLoading] = useState(true);
  const [criticalAlertsCount, setCriticalAlertsCount] = useState(0);
  
  // State for search and sort
  const [searchQuery, _setSearchQuery] = useState('');
  const [sortBy, _setSortBy] = useState<'name' | 'revenue' | 'leads'>('name');

  
  // --- MOVED UP: Callback Definitions to resolve TDZ (Temporal Dead Zone) ---

  const fetchDashboardStats = useCallback(async () => {
    try {
      const supabase = createSupabaseClient();
      const { data: tenantsData, error: tenantsError } = await supabase
        .from('tenants')
        .select('mrr, total_leads, total_revenue, signal_count');

      if (tenantsError) throw tenantsError;

      const totalMRR = tenantsData?.reduce((sum, tenant) => sum + (Number(tenant.mrr) || 0), 0) ?? 0;
      const totalSignals = tenantsData?.reduce((sum, tenant) => sum + (Number(tenant.signal_count) || 0), 0) ?? (tenantsData?.length * 50 || 0);
      const aiEfficiency = totalSignals > 0 ? Math.round((Math.floor(totalSignals * 0.98) / totalSignals) * 100) : 0;

      setHudStats(prev => (prev.totalMRR === totalMRR && prev.totalSignals === totalSignals && prev.aiEfficiency === aiEfficiency) ? prev : { totalMRR, totalSignals, aiEfficiency });
    } catch (error: unknown) {
      console.error('Database Error:', error instanceof Error ? error.message : String(error));
    } finally {
      setHudLoading(false);
    }
  }, []);

  const fetchCriticalAlerts = useCallback(async () => {
    try {
      if (!resellerSlug || resellerSlug.startsWith('[') || resellerSlug === 'undefined') return;
      const supabase = createSupabaseClient();
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      
      // Sequential resolution: try slug first, then tenant_id
      const resolvedId = await resolveResellerId(supabase, resellerSlug);
      let tenantIds: string[] = [];
      
      if (resolvedId) {
        const { data: tData } = await supabase.from('tenants').select('id').eq('reseller_id', resolvedId);
        if (tData) tenantIds = tData.map(t => t.id);
      }
      
      let query = supabase.from('tenant_logs').select('*', { count: 'exact', head: true }).gte('created_at', oneHourAgo).in('error_type', ['error', 'critical']);
      if (tenantIds.length > 0) query = query.in('tenant_id', tenantIds);

      const { count, error } = await query;
      if (error) return;
      setCriticalAlertsCount(count || 0);
    } catch (error: unknown) {
      console.error('Critical Alerts Error:', String(error));
    }
  }, [resellerSlug]);

  const fetchTenants = useCallback(async ({ filterParam = 'ALL', resellerSlugParam }: {
    filterParam?: string; resellerSlugParam?: string;
  } = {}) => {
    try {
      if (!resellerSlugParam || isInvalidSlug(resellerSlugParam)) return;
      setLoading(true);
      const supabase = createSupabaseClient();

      // Sequential resolution: try slug first, then tenant_id
      const resolvedId = await resolveResellerId(supabase, resellerSlugParam);
      if (!resolvedId) {
        setError(`Reseller "${resellerSlugParam}" not found.`);
        setLoading(false);
        return;
      }

      let q = supabase.from('tenants').select('*').eq('reseller_id', resolvedId).order('created_at', { ascending: false });
      if (filterParam && filterParam.toUpperCase() !== 'ALL') {
        const category = categoryMap?.[filterParam.toUpperCase()];
        if (category) q = q.or(`category.ilike.%${category}%,industry.ilike.%${category}%`);
      }

      const { data, error } = await q;
      if (error) throw error;

      const uniqueTenantMap = new Map<string, Tenant>();
      (data || []).forEach((tenant: Tenant) => {
        if (!uniqueTenantMap.has(tenant.id)) uniqueTenantMap.set(tenant.id, tenant);
      });

      const uniqueTenants = Array.from(uniqueTenantMap.values());
      setAllTenants(uniqueTenants);
    } catch (err: unknown) {
      console.error('Fetch Tenants Error:', err);
      setAllTenants([]);
    } finally {
      setLoading(false);
    }
  }, [categoryMap]);

  // --- END MOVED UP ---

  // Report stats to parent
  useEffect(() => {
    onStatsUpdate?.({
      totalClients: allTenants.length,
      totalMRR: hudStats.totalMRR,
      totalSignals: hudStats.totalSignals,
      aiEfficiency: hudStats.aiEfficiency,
      criticalAlerts: criticalAlertsCount,
      loading: hudLoading
    });
  }, [allTenants.length, hudStats, criticalAlertsCount, hudLoading, onStatsUpdate]);

  // Buffer for coalescing rapid tenant updates
  const tenantUpdateBuffer = useRef<{ updated: Tenant[]; inserted: Tenant[]; removedIds: Set<string>; timer: ReturnType<typeof setTimeout> | null }>({
    updated: [], inserted: [], removedIds: new Set(), timer: null
  });

  // Throttle refs for pulse and alerts
  const lastPulseAt = useRef<Record<string, number>>({});
  const PULSE_THROTTLE_MS = 800;
  const lastAlertAt = useRef(0);
  
  // State for selected client for AI commands
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);

  const ALERT_THROTTLE_MS = 500;

  // ENTERPRISE DISPATCHER: Centralized action handler for scale
  const gridContainerRef = useRef<HTMLDivElement>(null);
  
  // Feature toggle handler - memoized for stable refs
  const handleFeatureToggle = useCallback((
    tenantId: string, 
    feature: string, 
    e: { stopPropagation: () => void }) => {
    e.stopPropagation();
    console.log(`[Grid] Feature toggle: ${feature} for ${tenantId}`);
  }, []);

  // STRICT TYPE GUARDS: Runtime validation for data attributes
  const isValidActionType = (value: string | null): value is 'ai' | 'sms' | 'vin' | 'signal' => {
    return value === 'ai' || value === 'sms' || value === 'vin' || value === 'signal';
  };

  // AI Command Execution Handler
  const handleExecuteCommand = useCallback(async (tenantId: string, command: string) => {
    if (!resellerSlug || !command.trim()) {
      console.error('Missing resellerSlug or command');
      return;
    }

    console.log('🚀 [AI Command] Executing:', { tenantId, command, resellerSlug });

    try {
      const response = await fetch('/api/ai/process-command', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          resellerId: resellerSlug,
          userCommand: command.trim(),
          currentConfig: { theme: { primary: '#0097b2' }, behavior: { prompt: 'Default' } },
          tenantContext: {
            tenantId,
            category: allTenants.find(t => t.id === tenantId)?.category || 'GENERAL',
          },
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        console.error('AI Command API Error:', data);
        throw new Error(data.error || 'Failed to process command');
      }

      console.log('✅ [AI Command] Success:', data);

      // Apply configuration changes if returned
      if (data.payload || data.configPatch) {
        console.log('📝 [AI Command] Applying config patch:', data.payload || data.configPatch);
        // TODO: Apply config changes to tenant state
      }

    } catch (error) {
      console.error('❌ [AI Command] Execution failed:', error);
    }
  }, [resellerSlug, allTenants]);

  // Module action handler — delegates AI trigger to parent orchestrator via onExecuteSystemAction
  const handleModuleAction = useCallback(async (clientId: string, actionType: 'ai' | 'sms' | 'vin' | 'signal') => {
    // ENTRY LOG: First line to verify signal reception
    console.log('[Dispatcher] Received signal for:', clientId, actionType);

    // TYPE SAFETY: Validate actionType at runtime
    if (!isValidActionType(actionType)) {
      console.error(`[Dispatcher] Invalid actionType: ${actionType}`);
      return;
    }

    // Database-First Guard: Verify from cached state
    const tenant = allTenants.find(t => t.id === clientId);
    if (!tenant) {
      console.warn(`[Dispatcher] Client ${clientId} not found in cache`);
      return;
    }
    
    // Check is_active status (if field exists)
    if (tenant.is_active === false) {
      console.warn(`[Dispatcher] Client ${clientId} is inactive`);
      return;
    }
    
    // Check permission_level (if field exists)
    const permissionLevel = tenant.permission_level || 'standard';
    if (permissionLevel === 'readonly') {
      console.warn(`[Dispatcher] Client ${clientId} has readonly permissions`);
      return;
    }
    
    // Universal Capability Guard: Resolve effective category from industry + category
    const effectiveCategory = resolveEffectiveCategory(tenant);
    const tenantCapabilities = CAPABILITY_MAP[effectiveCategory] || CAPABILITY_MAP['default'];
    console.log(`[Dispatcher] Authorized: ${actionType} for Effective Category: "${effectiveCategory}" (client ${clientId})`);
    if (!tenantCapabilities.has(actionType)) {
      console.warn(`[Dispatcher] Action ${actionType} not in capability map for effective category "${effectiveCategory}" (client ${clientId})`);
      return;
    }
    
    // AI ARMING MODE: Delegate to page-level orchestrator via unified callback
    if (actionType === 'ai') {
      console.log('🚀 [Dispatcher] Delegating AI SYSTEM activation for:', clientId);
      setSelectedClientId(clientId);
      onExecuteSystemAction?.(clientId, actionType);
      return;
    }
    
    // Type guard: actionType is now 'sms' | 'vin' | 'signal' after AI early return
    const nonAiActionType: 'sms' | 'vin' | 'signal' = actionType;
    
    // Check indicator status from cached indicators with type safety
    const indicatorStatus = tenant.indicators?.[nonAiActionType];
    if (indicatorStatus === 'inactive') {
      console.warn(`[Dispatcher] Action ${actionType} is inactive for client ${clientId}`);
      return;
    }
    
    // Execute action based on type (AI already handled above with early return)
    switch (nonAiActionType) {
      case 'sms':
        console.log(`[Dispatcher] Opening SMS Gateway for:`, clientId);
        break;
      case 'vin':
        console.log(`[Dispatcher] VIN Scanner Activating for:`, clientId);
        break;
      case 'signal':
        console.log(`[Dispatcher] Signal Analysis Starting for:`, clientId);
        break;
    }
    
    // Trigger feature toggle through existing handler
    const mockEvent = { stopPropagation: () => {}, preventDefault: () => {} } as React.MouseEvent;
    handleFeatureToggle(clientId, actionType, mockEvent);
    
    // FIRE-AND-FORGET: Async module logging (non-blocking)
    // NO AWAIT: This must not block the UI thread
    const logModuleAction = async (): Promise<void> => {
      try {
        const supabase = createSupabaseClient();
        if (!supabase) {
          console.warn(`[Dispatcher] Supabase client not initialized for logging`);
          return;
        }
        
        await supabase.from('module_logs').insert({
          tenant_id: clientId,
          module_type: actionType,
          timestamp: new Date().toISOString(),
        });
        console.log(`[Dispatcher] Logged ${actionType} action for ${clientId}`);
      } catch (err) {
        // STRUCTURED ERROR LOGGING: Never interrupts UI thread
        console.error(`[Dispatcher] Module log insertion failed`, {
          clientId,
          actionType,
          error: err instanceof Error ? err.message : String(err),
          timestamp: new Date().toISOString(),
        });
      }
    };
    
    // Fire log without await - keep UI snappy for 100k+ clients
    void logModuleAction();
  }, [allTenants, handleFeatureToggle, onExecuteSystemAction]);
  
  // Event Delegation: Single listener for all module actions
  useEffect(() => {
    const container = gridContainerRef.current;
    if (!container) return;
    
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const button = target.closest('[data-action]') as HTMLElement;
      
      if (!button) return;
      
      const clientId = button.getAttribute('data-client-id');
      const rawActionType = button.getAttribute('data-action');
      
      // STRICT TYPE VALIDATION: Runtime check before dispatch
      if (!clientId || !rawActionType || !isValidActionType(rawActionType)) {
        console.warn(`[Dispatcher] Invalid data attributes`, { clientId, actionType: rawActionType });
        return;
      }
      
      e.stopPropagation();
      handleModuleAction(clientId, rawActionType);
    };
    
    container.addEventListener('click', handleClick);
    
 // SCALABLE CLEAN-UP: Prevent memory leaks during rapid tab switching
    return () => {
      container.removeEventListener('click', handleClick);
    };
  }, [handleModuleAction]);

  // --- DELETED DUPLICATE UTILITIES ---
  // sanitizedIndicators logic now integrated into fetch flow or resolveEffectiveCategory


  const handleClientAdded = useCallback(() => {
    console.log('[Grid] New client added, clearing cache and refreshing...');
    setAllTenants([]); // Clear cache to force fresh fetch
    fetchTenants({ filterParam: 'ALL', resellerSlugParam: resellerSlug }); // Pass resellerSlug to fetchTenants
  }, [fetchTenants, resellerSlug]);
  
  // Filter clients using useMemo to preserve master list
  const visibleClients = useMemo(() => {
    if (!allTenants || allTenants.length === 0) return [];
    
    const OFFLINE_THRESHOLD = 86400000; // 24 hours in milliseconds
    
    return allTenants.filter((tenant: Tenant) => {
      if (!tenant) return false;
      
      const matchesSearch = 
        tenant.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        tenant.email.toLowerCase().includes(searchQuery.toLowerCase());
      
      // First, check Category match — normalize both category and industry with toUpperCase
      const activeFilter = filter.toUpperCase().trim();
      const clientCategory = (tenant.category || '').toUpperCase().trim();
      const clientIndustry = (tenant.industry || '').toUpperCase().trim();
      
      let categoryMatch = false;
      if (activeFilter === 'ALL') {
        categoryMatch = true;
      } else if (activeFilter === 'GENERAL') {
        categoryMatch = clientCategory.includes('GENERAL') || clientCategory.includes('BUSINESS') ||
                         clientIndustry.includes('GENERAL') || clientIndustry.includes('BUSINESS');
      } else {
        categoryMatch = clientCategory.includes(activeFilter) || clientIndustry.includes(activeFilter);
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

  // Removed unused `getCategoryIcon` function
  // Removed unused `OFFLINE_THRESHOLD_MS` constant
  // Removed unused onSTTResultRef (STT is now handled by parent orchestrator)

  // Mount-only initialization: runs exactly once. Re-mount occurs on page navigation.
  useEffect(() => {
    const supabaseClient = supabase.current;

    const init = async () => {
      const { data: { session } } = await supabaseClient.auth.getSession();
      const hasActiveSession = !!session;
      setHasSession(hasActiveSession);
      setSessionLoading(false);

      if (session && !isInvalidSlug(resellerSlug)) {
        document.body.classList.remove('heartbeat-error');
        fetchTenants({ filterParam: 'ALL', resellerSlugParam: resellerSlug });
        fetchDashboardStats();
        fetchCriticalAlerts();
      }
    };

    void init();

    // Session Bridge: Listen for custom sign-in event
    const handleUserSignedIn = (event: CustomEvent) => {
      console.log('User signed in event received:', event.detail);
      setHasSession(true);
      setSessionLoading(false);
      document.body.classList.remove('heartbeat-error');
      fetchTenants({ filterParam: 'ALL', resellerSlugParam: resellerSlug });
      fetchDashboardStats();
      fetchCriticalAlerts();
    };
    window.addEventListener('userSignedIn', handleUserSignedIn as EventListener);

    // Listen for auth state changes
    const { data: { subscription } } = supabaseClient.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        setHasSession(true);
        setSessionLoading(false);
        document.body.classList.remove('heartbeat-error');
        fetchTenants({ filterParam: 'ALL', resellerSlugParam: resellerSlug });
        fetchDashboardStats();
        fetchCriticalAlerts();
      } else if (event === 'SIGNED_OUT') {
        setHasSession(false);
        setSessionLoading(false);
        setAllTenants([]);
        document.body.classList.add('heartbeat-error');
      }
    });

    return () => {
      subscription.unsubscribe();
      window.removeEventListener('userSignedIn', handleUserSignedIn as EventListener);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  // Refetch when offline toggle or filter changes
  useEffect(() => {
    // Auth Guard: Prevent RLS errors by blocking API calls until session is resolved
    if (!hasSession || sessionLoading) return;
    
    let active = true;
    const _timeoutId = setTimeout(() => { // Add a small delay to prevent race conditions on initial mount
      if (active) fetchTenants({ filterParam: filter, resellerSlugParam: resellerSlug });
    }, 0);
    return () => { active = false; };
  }, [showOfflineOnly, filter, resellerSlug, hasSession, sessionLoading, fetchTenants]);

  // Realtime subscription - runs once on mount with proper cleanup
  useEffect(() => {
    // Atomic Guard: Prevent double-subscription
    if (isSubscribed.current) return;
    isSubscribed.current = true; // Set ref to true to prevent re-subscription
    
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
              if (buf.timer) {
                clearTimeout(buf.timer);
              }
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
          const newLog = payload.new as { error_type?: string };
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

    // DEDICATED INDICATOR CHANNEL: Realtime monitoring for status changes
    const indicatorChannel = supabase
      .channel('tenant-indicator-changes')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'tenants',
          // Only listen for indicator column changes would be ideal, 
          // but Supabase realtime filters by row not column
        },
        (payload) => {
          const updatedTenant = payload.new as Tenant;
          const oldTenant = payload.old as Tenant;
          
          // Check if indicators actually changed
          const newIndicators = updatedTenant.indicators;
          const oldIndicators = oldTenant.indicators;
          
          if (JSON.stringify(newIndicators) !== JSON.stringify(oldIndicators)) {
            console.log(`[Realtime] Indicator update for ${updatedTenant.id}:`, newIndicators);
            
            // Use raw newIndicators value directly (sanitizeIndicators was removed)
            const sanitizedIndicators = newIndicators as Indicators | undefined;
            
            // Update the specific tenant's indicators in local state
            startTransition(() => {
              setAllTenants(prev => prev.map(t => 
                t.id === updatedTenant.id 
                  ? { ...t, indicators: sanitizedIndicators }
                  : t
              ));
            });
            
            // Trigger pulse animation for indicator change
            const now = Date.now();
            if (!lastPulseAt.current[updatedTenant.id] || now - lastPulseAt.current[updatedTenant.id] > PULSE_THROTTLE_MS) {
              lastPulseAt.current[updatedTenant.id] = now;
              setPulseCardId(updatedTenant.id);
              setPulseType('standard');
              setTimeout(() => setPulseCardId(null), 3000);
            }
          }
        }
      )
      .subscribe();

    // CLEANUP: Remove channels on unmount
    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(logsChannel);
      supabase.removeChannel(indicatorChannel);
    };
  }, [fetchCriticalAlerts, fetchDashboardStats, fetchTenants, resellerSlug]); // Added dependencies for clarity and correctness

  if (error) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-6 text-center">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      </div>
    );
  }

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

      {/* Add Client Action Pane */}
      <AddClientAction onClientAdded={handleClientAdded} />

      {/* Grid */}
      {(() => {
        // Pierre AI themed skeleton loader for session loading
        if (sessionLoading) {
          return (
            <div className="backdrop-blur-xl bg-white/[0.02] border border-white/10 rounded-lg p-12 text-center">
              <div className="flex items-center justify-center mb-4">
                <div className="relative flex h-8 w-8">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-8 w-8 bg-cyan-500"></span>
                </div>
              </div>
              <div className="text-xs text-cyan-300 tracking-widest font-mono mb-2">
                POWERED BY PIERRE AI
              </div>
              <div className="text-xs text-white/40 tracking-[0.2em] uppercase">
                Initializing secure vault...
              </div>
            </div>
          );
        }

        // Show authentication prompt if no session
        if (!hasSession) {
          return (
            <div className="backdrop-blur-xl bg-white/[0.02] border border-white/10 rounded-lg p-12 text-center">
              <div className="flex items-center justify-center mb-4">
                <div className="relative flex h-8 w-8">
                  <span className="relative inline-flex rounded-full h-8 w-8 bg-red-500"></span>
                </div>
              </div>
              <div className="text-xs text-red-300 tracking-widest font-mono mb-2">
                SECURE VAULT LOCKED
              </div>
              <div className="text-xs text-white/40 tracking-[0.2em] uppercase mb-4">
                Please sign in to access your clients
              </div>
              <div className="text-xs text-white/20 mb-6">
                Authentication required for data access
              </div>
              <button
                onClick={() => router.push('/auth')}
                className="px-6 py-2 text-xs font-light tracking-[0.2em] bg-cyan-500/20 border border-cyan-500/30 rounded-lg text-cyan-300 uppercase hover:bg-cyan-500/30 transition-all"
              >
                Sign In
              </button>
            </div>
          );
        }

        if (loading) {
          return (
            <div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(300px,1fr))] w-full px-4 sm:px-0">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="backdrop-blur-xl bg-white/[0.02] border border-white/10 rounded-lg p-6">
                  <div className="animate-pulse">
                    <div className="h-4 bg-white/10 rounded w-3/4 mb-3" />
                    <div className="h-3 bg-white/5 rounded w-1/2 mb-4" />
                    <div className="flex gap-2 mb-4">
                      <div className="h-8 bg-white/5 rounded flex-1" />
                      <div className="h-8 bg-white/5 rounded flex-1" />
                    </div>
                    <div className="h-2 bg-white/5 rounded w-full" />
                  </div>
                </div>
              ))}
            </div>
          );
        }

        if (visibleClients.length === 0) {
          return (
            <div className="backdrop-blur-xl bg-white/[0.02] border border-white/10 rounded-lg p-12 text-center">
              {/* ZEEDER AI Branding */}
              <div className="mb-6">
                <div className="px-8 py-3 bg-gradient-to-br from-cyan-400 to-blue-600 rounded-full mx-auto flex items-center justify-center shadow-lg shadow-cyan-400/50 max-w-xs">
                  <span className="text-white font-bold tracking-widest text-sm">ZEEDER AI</span>
                </div>
              </div>
              
              {/* Clean Slate Message */}
              <div className="text-lg font-light text-white mb-4">
                Clean Slate
              </div>
              <div className="text-xs text-white/40 tracking-[0.2em] uppercase mb-2">
                {filter === 'all' || filter === 'ALL' 
                  ? 'Your client portfolio is ready' 
                  : `No ${filter.charAt(0).toUpperCase() + filter.slice(1).toLowerCase()} Clients Onboarded`
                }
              </div>
              <div className="text-xs text-white/20 mb-6">
                {filter === 'all' || filter === 'ALL' 
                  ? 'Begin building your intelligent client ecosystem' 
                  : 'Expand your portfolio in this category'
                }
              </div>
              
              {/* Action Button */}
              <button
                onClick={() => setShowAddClientModal(true)}
                className="px-8 py-3 bg-gradient-to-r from-cyan-500 to-blue-600 border border-cyan-500/50 rounded-full text-xs tracking-widest uppercase text-white hover:from-cyan-600 hover:to-blue-700 hover:border-cyan-400 transition-all duration-300 shadow-lg shadow-cyan-400/30"
              >
                {filter === 'all' || filter === 'ALL' 
                  ? 'Add Your First Client' 
                  : `Add Your First ${filter.charAt(0).toUpperCase() + filter.slice(1).toLowerCase()} Client`
                }
              </button>
              
              {/* Subtle hint */}
              <div className="mt-6 text-xs text-white/10 tracking-[0.15em] uppercase">
                Powered by ZEEDER AI Intelligence
              </div>
            </div>
          );
        }
        return (
          <div ref={gridContainerRef} className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(300px,1fr))] w-full px-4 sm:px-0">
            {visibleClients.map((tenant) => (
              <div
                key={tenant.id}
                onClick={() => {
                  console.log('ClientCard clicked, selecting tenant:', tenant.id, 'name:', tenant.name);
                  onSelectTenant?.(tenant.id, tenant.name, tenant.category);
                }}
                className={`relative cursor-pointer transition-all duration-200 ${
                  onSelectTenant ? 'hover:ring-2 hover:ring-[#0097b2]/50' : ''
                } ${activeTenantId === tenant.id ? 'ring-2 ring-green-500 shadow-[0_0_20px_rgba(34,197,94,0.3)]' : ''}`}
              >
                {/* Processing Skeleton Overlay */}
                {isProcessing && activeTenantId === tenant.id && (
                  <div className="absolute inset-0 z-10 rounded-lg bg-black/50 backdrop-blur-sm flex items-center justify-center">
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-8 h-8 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
                      <span className="text-[10px] text-green-400 tracking-widest uppercase animate-pulse">
                        Processing...
                      </span>
                    </div>
                  </div>
                )}
                <ClientCard
                  tenant={tenant}
                  pulseCardId={pulseCardId}
                  pulseType={pulseType}
                  successGlow={successGlow}
                  onDiagnosticClick={setDiagnosticTenantId}
                  onFeatureToggle={handleFeatureToggle}
                  onModuleAction={handleModuleAction}
                  onPricingClick={() => setPricingTenant(tenant)}
                  selectedClientId={selectedClientId}
                  onExecuteCommand={handleExecuteCommand}
                  onSTTResult={(tenantId, text) => {
                    // Forward STT results via custom event for client-side handling (using the ref)
                    const event = new CustomEvent('stt-result', { detail: { tenantId, text } });
                    window.dispatchEvent(event);
                  }}
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

      {pricingTenant && (
        <TenantPricingModal
          tenant={pricingTenant as unknown as Parameters<typeof TenantPricingModal>[0]['tenant']}
          isOpen={!!pricingTenant}
          onClose={() => setPricingTenant(null)}
          onSaved={() => fetchTenants({ filterParam: filter, resellerSlugParam: resellerSlug })}
        />
      )}

      {showAddClientModal && (
        <UniversalCommandModal 
          onClose={() => setShowAddClientModal(false)} 
          resellerSlug={resellerSlug}
          onClientCreated={() => {
            console.log('OVG-PLATFORM-V2: Client created successfully, adding delay before fetch');
            // Add 500ms delay to allow database to settle (race condition fix)
            setTimeout(() => {
              console.log('OVG-PLATFORM-V2: Delay complete, fetching tenants with ALL filter');
              // Reset UI filters to 'ALL' so user can see the new card
              fetchTenants({ filterParam: 'ALL', resellerSlugParam: resellerSlug });
            }, 500);
          }}
        />
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
    prev.categoryMap === next.categoryMap &&
    prev.activeTenantId === next.activeTenantId &&
    prev.isProcessing === next.isProcessing &&
    prev.isGlobalScanning === next.isGlobalScanning &&
    prev.onStatsUpdate === next.onStatsUpdate &&
    prev.onExecuteSystemAction === next.onExecuteSystemAction;

  return isSame;
});