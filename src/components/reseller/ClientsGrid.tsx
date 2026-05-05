'use client';

import { useEffect, useState, useRef, useMemo, memo, startTransition, useCallback } from 'react';
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
  category_config?: any;
  created_at: string;
  signal_count?: number;
  signal_trend?: number[];
  ai_insight?: string;
  last_seen?: string;
  total_revenue?: number;
  total_leads?: number;
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
  isGlobalScanning,
  onStatsUpdate,
  onSTTResult, // Ref to pass STT results without re-rendering
}: { 
  resellerSlug: string; 
  filter?: string; 
  showOfflineOnly?: boolean; 
  categoryMap?: Record<string, string>;
  onSelectTenant?: (tenantId: string, clientName?: string) => void;
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
  onSTTResult?: (tenantId: string, text: string) => void;
}) {
  // Debug: Log resellerSlug prop on component mount
  console.log('OVG-PLATFORM-V2: ClientsGrid mounted with resellerSlug:', {
    resellerSlug,
    type: typeof resellerSlug,
    isEmpty: !resellerSlug,
    isUndefined: resellerSlug === undefined,
    isNull: resellerSlug === null,
    length: resellerSlug?.length
  });
    
  // Props change tracking removed for production
  
  const router = useRouter();
  const [allTenants, setAllTenants] = useState<Tenant[]>([]);
  const isSubscribed = useRef(false);
  const [loading, setLoading] = useState(true);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [hasSession, setHasSession] = useState(false);
  const supabase = useRef(createSupabaseClient());
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
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [isExecutingCommand, setIsExecutingCommand] = useState(false);
  
  // Cache for AI confirmation audio (zero-latency playback)
  const cachedAudioBlob = useRef<Blob | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  
  // STT State
  const [isListening, setIsListening] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  
  // Ref to pass STT results without re-rendering - Initialized for Production Excellence
  const onSTTResultRef = useRef<((tenantId: string, text: string) => void) | null>(null);
  
  // Update the ref with latest callback
  onSTTResultRef.current = (tenantId: string, text: string) => {
    // This will be passed to ClientCard to update command input
    console.log(' [STT] Result for', tenantId, ':', text);
    onSTTResult?.(tenantId, text);
  };
  
  // Play AI confirmation with caching for zero-latency playback
  const playAIConfirmation = useCallback(async () => {
    const confirmationText = "AI Control System Initiated";

    // Use cached blob if available (zero-latency)
    if (cachedAudioBlob.current) {
      console.log('🔊 [Audio] Playing cached AI confirmation');
      const audioUrl = URL.createObjectURL(cachedAudioBlob.current);
      audioRef.current = new Audio(audioUrl);
      audioRef.current.play().catch(console.error);
      return;
    }

    // Fetch and cache the audio blob via secure internal API
    try {
      console.log('🔊 [Audio] Fetching AI confirmation from internal API...');
      const payload = {
        text: confirmationText,
        model: 'canopylabs/orpheus-v1-english',
        voice: 'daniel', // Professional tone for Pierre AI Control System
      };
      console.log('🔊 [Audio] Sending payload:', payload);
      
      const response = await fetch('/api/ai/speech', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const audioBuffer = await response.arrayBuffer();
      cachedAudioBlob.current = new Blob([audioBuffer], { type: 'audio/mpeg' });
      
      console.log('🔊 [Audio] Audio cached, playing now');
      const audioUrl = URL.createObjectURL(cachedAudioBlob.current);
      audioRef.current = new Audio(audioUrl);
      
      // Attach onEnded listener to trigger STT
      audioRef.current.onended = () => {
        console.log('🔊 [Audio] TTS complete, starting STT capture...');
        startSTTCapture();
      };
      
      audioRef.current.play().catch(console.error);
    } catch (error) {
      console.error('❌ [Audio] Failed to fetch AI confirmation:', error);
    }
  }, []);
  
  // STT Capture: Record audio and send to API
  const startSTTCapture = useCallback(async () => {
    if (isListening || !selectedClientId) return;
    
    try {
      console.log('🎙️ [STT] Requesting microphone access...');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      setIsListening(true);
      audioChunksRef.current = [];
      
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      });
      
      mediaRecorderRef.current = mediaRecorder;
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };
      
      mediaRecorder.onstop = async () => {
        console.log('🎙️ [STT] Recording stopped, processing...');
        
        // Stop all tracks to release microphone
        stream.getTracks().forEach(track => track.stop());
        
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        
        // Send to STT API
        try {
          const formData = new FormData();
          formData.append('audio', audioBlob, 'recording.webm');
          
          console.log('🎙️ [STT] Sending to API...');
          const response = await fetch('/api/ai/stt', {
            method: 'POST',
            body: formData,
          });
          
          if (!response.ok) {
            throw new Error(`STT API error: ${response.status}`);
          }
          
          const result = await response.json();
          console.log('✅ [STT] Transcription:', result.text);
          
          // Pass result to ClientCard
          if (result.text && onSTTResultRef.current) {
            onSTTResultRef.current(selectedClientId, result.text);
          }
        } catch (error) {
          console.error('❌ [STT] Transcription failed:', error);
        } finally {
          setIsListening(false);
        }
      };
      
      // Start recording
      mediaRecorder.start();
      console.log('🎙️ [STT] Recording started (5s max)');
      
      // Auto-stop after 5 seconds
      setTimeout(() => {
        if (mediaRecorderRef.current?.state === 'recording') {
          mediaRecorderRef.current.stop();
        }
      }, 5000);
      
    } catch (error) {
      console.error('❌ [STT] Failed to start recording:', error);
      setIsListening(false);
    }
  }, [isListening, selectedClientId]);
  
  // HUD State
  const [hudStats, setHudStats] = useState({
    totalMRR: 0,
    totalSignals: 0,
    aiEfficiency: 0
  });
  const [hudLoading, setHudLoading] = useState(true);
  const [criticalAlertsCount, setCriticalAlertsCount] = useState(0);

  
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
  const tenantUpdateBuffer = useRef<{ updated: Tenant[]; inserted: Tenant[]; removedIds: Set<string>; timer: any }>({
    updated: [], inserted: [], removedIds: new Set(), timer: null
  });

  // Throttle refs for pulse and alerts
  const lastPulseAt = useRef<Record<string, number>>({});
  const PULSE_THROTTLE_MS = 800;
  const lastAlertAt = useRef(0);
  const ALERT_THROTTLE_MS = 500;

  // ENTERPRISE DISPATCHER: Centralized action handler for scale
  const gridContainerRef = useRef<HTMLDivElement>(null);
  
  // Feature toggle handler - memoized for stable refs
  const handleFeatureToggle = useCallback((tenantId: string, feature: string, e: React.MouseEvent) => {
    e.stopPropagation();
    console.log(`[Grid] Feature toggle: ${feature} for ${tenantId}`);
  }, []);
  
  // Handle new client added
  const handleClientAdded = useCallback(() => {
    console.log('[Grid] New client added, clearing cache and refreshing...');
    setAllTenants([]); // Clear cache to force fresh fetch
    fetchTenants({ offlineOnly: false, filterParam: 'ALL', resellerSlugParam: resellerSlug });
  }, [resellerSlug]);
  
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

    setIsExecutingCommand(true);
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
    } finally {
      setIsExecutingCommand(false);
    }
  }, [resellerSlug, allTenants]);

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
    if ((tenant as any).is_active === false) {
      console.warn(`[Dispatcher] Client ${clientId} is inactive`);
      return;
    }
    
    // Check permission_level (if field exists)
    const permissionLevel = (tenant as any).permission_level || 'standard';
    if (permissionLevel === 'readonly') {
      console.warn(`[Dispatcher] Client ${clientId} has readonly permissions`);
      return;
    }
    
    // Industry-specific guards
    if (actionType === 'vin' && tenant.category !== 'automotive') {
      console.warn(`[Dispatcher] VIN action blocked for non-Automotive client ${clientId}`);
      return;
    }
    
    // AI ARMING MODE: Bypass status check for AI to allow activation
    if (actionType === 'ai') {
      console.log('🚀 [Dispatcher] ARMING AI SYSTEM for:', clientId);
      setSelectedClientId(clientId); // Trigger input bar display
      playAIConfirmation(); // Play vocal confirmation
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
  }, [allTenants]);
  
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

  // SAFETY GUARD: Ensure VIN stays inactive for non-Automotive clients
  const sanitizeIndicators = (tenant: Tenant, indicators?: Indicators): Indicators | undefined => {
    if (!indicators) return undefined;
    const isAutomotive = tenant.category === 'automotive';
    return {
      ...indicators,
      // VIN lock: Force 'inactive' for non-Automotive regardless of realtime data
      vin: !isAutomotive ? 'inactive' : indicators.vin
    };
  };

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

  // Auth state management with retry logic - fetch only when session is truthy
  useEffect(() => {
    const checkSession = async () => {
      try {
        // Token refresh: Verify token is valid before hitting tenants table
        const { data: { user }, error: userError } = await supabase.current.auth.getUser();
        
        if (userError || !user) {
          console.log('Token invalid or expired:', userError?.message);
          setHasSession(false);
          setSessionLoading(false);
          return;
        }

        // Session is valid, proceed with data fetching
        setHasSession(true);
        setSessionLoading(false);
        
        // Trigger UI transition from red pulse back to Cyan
        document.body.classList.remove('heartbeat-error');
        
        fetchTenants({ offlineOnly: false, filterParam: 'ALL', resellerSlugParam: resellerSlug });
        fetchDashboardStats();
        fetchCriticalAlerts();
      } catch (error) {
        console.error('Session check error:', error);
        setHasSession(false);
        setSessionLoading(false);
      }
    };

    // Only fetch if we have a session
    if (hasSession) {
      checkSession();
    } else {
      // Initial session check
      const initialCheck = async () => {
        const { data: { session } } = await supabase.current.auth.getSession();
        setHasSession(!!session);
        setSessionLoading(false);
        
        if (session) {
          // Trigger UI transition and fetch data
          document.body.classList.remove('heartbeat-error');
          fetchTenants({ offlineOnly: false, filterParam: 'ALL', resellerSlugParam: resellerSlug });
          fetchDashboardStats();
          fetchCriticalAlerts();
        }
      };
      
      initialCheck();
    }

    // Session Bridge: Listen for custom event from sign-in page
    const handleUserSignedIn = (event: CustomEvent) => {
      console.log('User signed in event received:', event.detail);
      setHasSession(true);
      setSessionLoading(false);
      
      // Trigger UI transition from red pulse back to Cyan
      document.body.classList.remove('heartbeat-error');
      
      // Immediately re-fetch tenants list
      fetchTenants({ offlineOnly: false, filterParam: 'ALL', resellerSlugParam: resellerSlug });
      fetchDashboardStats();
      fetchCriticalAlerts();
    };

    // Add event listener for custom sign-in event
    window.addEventListener('userSignedIn', handleUserSignedIn as EventListener);

    // Retry logic: Listen for auth state changes
    const { data: { subscription } } = supabase.current.auth.onAuthStateChange((event, session) => {
            
      if (event === 'SIGNED_IN' && session) {
        setHasSession(true);
        setSessionLoading(false);
        
        // Trigger UI transition from red pulse back to Cyan
        document.body.classList.remove('heartbeat-error');
        
        // Re-fetch data when user signs in
        fetchTenants({ offlineOnly: false, filterParam: 'ALL', resellerSlugParam: resellerSlug });
        fetchDashboardStats();
        fetchCriticalAlerts();
      } else if (event === 'SIGNED_OUT') {
        setHasSession(false);
        setSessionLoading(false);
        setAllTenants([]);
        // Add red pulse for locked state
        document.body.classList.add('heartbeat-error');
      }
    });

    return () => {
      subscription.unsubscribe();
      window.removeEventListener('userSignedIn', handleUserSignedIn as EventListener);
    };
  }, [resellerSlug, hasSession]);

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
            
            // Apply optimistic guard before updating state
            const sanitizedIndicators = sanitizeIndicators(updatedTenant, newIndicators);
            
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
  }, []); // Empty array ensures this only runs ONCE on mount

  const fetchCriticalAlerts = useCallback(async () => {
    try {
      // 🔷 Hydration Guard: Circuit breaker to prevent 400 error
      if (!resellerSlug || resellerSlug.startsWith('[') || resellerSlug === 'undefined') {
        console.log('%c[Pierre] ⏳ Hydration Guard: Skipping fetch - resellerSlug not ready', 'color: #0097b2; font-weight: bold;');
        setCriticalAlertsCount(0);
        return;
      }

      console.log("🚀 Fetching logs for:", resellerSlug);

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
      
            
      // Get tenant_ids for this reseller to scope query
      let tenantIds: string[] = [];
      const { data: rData, error: rErr } = await supabase
        .from('resellers')
        .select('id')
        .eq('slug', resellerSlug)
        .maybeSingle();
      
      if (rErr) {
        console.warn('Reseller lookup failed:', rErr.message);
      } else if (rData?.id) {
        // Fetch all tenant_ids for this reseller
        const { data: tData, error: tErr } = await supabase
          .from('tenants')
          .select('id')
          .eq('reseller_id', rData.id);
        
        if (!tErr && tData) {
          tenantIds = tData.map(t => t.id);
        }
      }
      
      // Build query with tenant scope and error_type filter
      let query = supabase
        .from('tenant_logs')
        .select('*', { count: 'exact', head: false })
        .gte('created_at', oneHourAgo)
        .in('error_type', ['error', 'critical']);
      
      // Add tenant filter if we have tenant_ids
      if (tenantIds.length > 0) {
        query = query.in('tenant_id', tenantIds);
      }

      const { count, error } = await query;

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
  }, [resellerSlug]);

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
      // Critical Guard: Prevent execution if resellerSlug is undefined
      if (!resellerSlugParam || resellerSlugParam === undefined || resellerSlugParam === null) {
        console.error('OVG-PLATFORM-V2: Critical - fetchTenants called with invalid resellerSlug:', {
          resellerSlugParam,
          type: typeof resellerSlugParam,
          isEmpty: !resellerSlugParam,
          isUndefined: resellerSlugParam === undefined,
          isNull: resellerSlugParam === null
        });
        setAllTenants([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      const supabase = createSupabaseClient();

      // Debug: Log the incoming resellerSlug parameter
      console.log('OVG-PLATFORM-V2: fetchTenants called with valid slug:', { 
        resellerSlugParam, 
        type: typeof resellerSlugParam,
        length: resellerSlugParam.length
      });

      // Verify authentication state
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (!session) {
        console.warn('OVG-PLATFORM-V2: No authenticated session - RLS will block queries');
        setLoading(false);
        return;
      }

      // Time Constraints: cutoffIso removed to ensure all records are pulled
      // const cutoffIso = new Date(Date.now() - OFFLINE_THRESHOLD_MS).toISOString();

      // 1) Get reseller UUID from slug - Strict Data Isolation
      let resellerId: string | null = null;
      if (!resellerSlugParam) {
        console.error('OVG-PLATFORM-V2: Critical - No resellerSlug parameter provided');
        setAllTenants([]);
        setLoading(false);
        return;
      }

      const { data: rData, error: rErr } = await supabase
        .from('resellers')
        .select('id')
        .eq('slug', resellerSlugParam)
        .maybeSingle();
      
      console.log('OVG-PLATFORM-V2: Strict reseller lookup for:', { resellerSlugParam, rData, rErr: rErr?.message });
      
      if (rErr || !rData?.id) {
        console.error('OVG-PLATFORM-V2: Reseller not found:', { resellerSlugParam, error: rErr?.message });
        
        // Try to create the reseller record for any valid slug
        if (resellerSlugParam && resellerSlugParam.length > 0) {
          console.log('OVG-PLATFORM-V2: Attempting to create reseller record for:', resellerSlugParam);
          
          // Validation Check: Ensure slug meets format requirements
          const slugValidation = {
            length: resellerSlugParam.length,
            hasSpecialChars: /[^a-z0-9-]/.test(resellerSlugParam),
            startsWithNumber: /^\d/.test(resellerSlugParam),
            endsWithHyphen: /-$/.test(resellerSlugParam),
            hasConsecutiveHyphens: /--/.test(resellerSlugParam)
          };
          
          console.log('OVG-PLATFORM-V2: Slug validation:', slugValidation);
          
          if (slugValidation.hasSpecialChars || slugValidation.startsWithNumber || slugValidation.endsWithHyphen || slugValidation.hasConsecutiveHyphens) {
            console.error('OVG-PLATFORM-V2: Slug validation failed:', slugValidation);
            setAllTenants([]);
            setLoading(false);
            return;
          }
          
          try {
            // Generate reseller name from slug (capitalize words)
            const resellerName = resellerSlugParam
              .split('-')
              .map(word => word.charAt(0).toUpperCase() + word.slice(1))
              .join(' ');
            
            console.log('OVG-PLATFORM-V2: Generated reseller name:', resellerName);
            
            // Use API endpoint with service role permissions instead of direct database insert
            const response = await fetch('/api/resellers/create', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                slug: resellerSlugParam,
                name: resellerName
              })
            });
            
            const result = await response.json();
            
            if (!response.ok) {
              console.error('OVG-PLATFORM-V2: API failed to create reseller:', result);
              setAllTenants([]);
              setLoading(false);
              return;
            }
            
            console.log('OVG-PLATFORM-V2: API response:', result);
            
            if (result.reseller?.id) {
              resellerId = result.reseller.id;
              console.log('OVG-PLATFORM-V2: Successfully created reseller via API:', result.reseller);
            } else {
              console.error('OVG-PLATFORM-V2: API response missing reseller ID:', result);
              setAllTenants([]);
              setLoading(false);
              return;
            }
          } catch (apiErr) {
            console.error('OVG-PLATFORM-V2: Exception calling reseller creation API:', apiErr);
            setAllTenants([]);
            setLoading(false);
            return;
          }
        } else {
          // For other slugs, show clean slate
          setAllTenants([]);
          setLoading(false);
          return;
        }
      } else {
        resellerId = rData.id;
      }
      
      console.log('OVG-PLATFORM-V2: Reseller ID confirmed:', { resellerSlugParam, resellerId });

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
      console.log('fetchTenants response:', { filterParam, resellerSlugParam, dataLength: data?.length ?? 0, error });

      if (error) throw error;

      setAllTenants(prev => {
        // Sanitize indicators on fetch (VIN lock for non-Automotive)
        const sanitizedData = (data || []).map((tenant: Tenant) => ({
          ...tenant,
          indicators: sanitizeIndicators(tenant, tenant.indicators)
        }));
        
        if (prev.length === sanitizedData.length &&
            prev.every((t, i) => t.id === sanitizedData[i]?.id)) {
          const hasChanges = sanitizedData.some((newTenant, i) => {
            const prevTenant = prev[i];
            return Object.keys(newTenant).some(
              key => (prevTenant as any)?.[key] !== (newTenant as any)?.[key]
            );
          });
          if (!hasChanges) {
            console.log('setAllTenants: no changes, skipping update');
            return prev;
          }
        }
        console.log('setAllTenants applied, count:', sanitizedData.length);
        return sanitizedData;
      });
    } catch (err: any) {
      console.error('Error fetching tenants:', {
        message: err?.message,
        code: err?.code,
        status: err?.status,
      });
      
      // Production Excellence: Set empty state on error
      setAllTenants([]);
    } finally {
      setLoading(false);
    }
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
              {/* OVG Engage Branding */}
              <div className="mb-6">
                <div className="px-8 py-3 bg-gradient-to-br from-cyan-400 to-blue-600 rounded-full mx-auto flex items-center justify-center shadow-lg shadow-cyan-400/50 max-w-xs">
                  <span className="text-white font-bold tracking-widest text-sm">OVG ENGAGE</span>
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
                Powered by OVG Engage Intelligence
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
                  onSelectTenant?.(tenant.id, tenant.name);
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
                  selectedClientId={selectedClientId}
                  onExecuteCommand={handleExecuteCommand}
                  onSTTResult={(tenantId, text) => {
                    // Find the card and update its input - use a custom event approach
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
              fetchTenants({ offlineOnly: false, filterParam: 'ALL', resellerSlugParam: resellerSlug });
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
    prev.onStatsUpdate === next.onStatsUpdate;

  return isSame;
});
