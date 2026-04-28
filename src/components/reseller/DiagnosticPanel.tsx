'use client';

import { useState, useEffect } from 'react';
import { createClient as createSupabaseClient } from '@/lib/supabase/client';

interface LogEntry {
  id: string;
  tenant_id: string;
  error_type: string;
  error_message: string;
  metadata: any;
  created_at: string;
}

interface DiagnosticPanelProps {
  tenantId: string;
  isOpen: boolean;
  onClose: () => void;
}

export function DiagnosticPanel({ tenantId, isOpen, onClose }: DiagnosticPanelProps) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [fixableAction, setFixableAction] = useState<{ label: string; action: () => void } | null>(null);

  useEffect(() => {
    if (!isOpen || !tenantId) return;

    const supabase = createSupabaseClient();

    // Fetch initial logs
    const fetchLogs = async () => {
      const { data, error } = await supabase
        .from('tenant_logs')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) {
        console.error('Error fetching logs:', error);
      } else {
        setLogs(data || []);
        
        // Analyze last 3 error logs with Groq
        const errorLogs = (data || []).filter(log => log.error_type === 'error' || log.error_type === 'critical').slice(0, 3);
        if (errorLogs.length > 0) {
          analyzeWithGroq(tenantId, errorLogs);
        }
      }
    };

    fetchLogs();

    // Set up realtime subscription
    const channel = supabase
      .channel(`tenant-logs-${tenantId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'tenant_logs',
          filter: `tenant_id=eq.${tenantId}`
        },
        (payload) => {
          const newLog = payload.new as LogEntry;
          setIsTyping(true);
          
          // Simulate typing effect
          setTimeout(() => {
            setLogs(prev => [newLog, ...prev]);
            setIsTyping(false);
            
            // Re-analyze if new error log
            if (newLog.error_type === 'error' || newLog.error_type === 'critical') {
              const errorLogs = [newLog, ...logs.filter(log => log.error_type === 'error' || log.error_type === 'critical')].slice(0, 3);
              analyzeWithGroq(tenantId, errorLogs);
            }
          }, 500);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isOpen, tenantId]);

  const analyzeWithGroq = async (tenantId: string, errorLogs: LogEntry[]) => {
    setIsAnalyzing(true);
    
    // In production, this would call Groq API
    // For now, simulate AI analysis
    setTimeout(() => {
      const hasServiceDisabled = errorLogs.some(log => 
        log.error_message.toLowerCase().includes('disabled') || 
        log.error_message.toLowerCase().includes('service')
      );
      
      if (hasServiceDisabled) {
        setAiSuggestion('Service appears to be disabled. Re-enabling the AI service should restore normal operations.');
        setFixableAction({
          label: 'Re-enable Service',
          action: async () => {
            const supabase = createSupabaseClient();
            // Simulate fix execution
            await supabase
              .from('tenants')
              .update({ industry_config: { ...errorLogs[0].metadata, service_enabled: true } })
              .eq('id', tenantId);
            setFixableAction(null);
            setAiSuggestion('Service has been re-enabled. Monitoring for recovery...');
          }
        });
      } else {
        setAiSuggestion('Multiple connection errors detected. Check network connectivity and API key configuration.');
        setFixableAction(null);
      }
      
      setIsAnalyzing(false);
    }, 1500);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-3xl mx-4 backdrop-blur-xl bg-white/5 border-l-4 border-l-white/10 border border-white/10 rounded-r-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/10 bg-white/[0.02] flex justify-between items-center">
          <div>
            <h2 className="text-sm font-light tracking-[0.2em] text-white uppercase">
              Diagnostic Panel
            </h2>
            <div className="text-[10px] text-white/40 mt-1">
              Tenant ID: {tenantId.slice(0, 8)}...
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors"
          >
            <svg className="w-4 h-4 text-white/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* AI Suggestion Box */}
        {isAnalyzing && (
          <div className="px-6 py-4 bg-[#0097b2]/10 border border-[#0097b2]/30">
            <div className="flex items-center gap-2 text-[10px] text-[#0097b2]">
              <div className="w-2 h-2 rounded-full bg-[#0097b2] animate-pulse" />
              <span className="uppercase tracking-wider">AI analyzing logs...</span>
            </div>
          </div>
        )}

        {aiSuggestion && !isAnalyzing && (
          <div className="px-6 py-4 bg-[#0097b2]/10 border border-[#0097b2]/30">
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-[#0097b2]/20 flex items-center justify-center flex-shrink-0">
                <svg className="w-3 h-3 text-[#0097b2]" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z" />
                </svg>
              </div>
              <div className="flex-1">
                <div className="text-[10px] font-bold tracking-[0.2em] text-[#0097b2] uppercase mb-1">
                  AI Recommendation
                </div>
                <p className="text-xs text-white/90">{aiSuggestion}</p>
                {fixableAction && (
                  <button
                    onClick={fixableAction.action}
                    className="mt-3 px-4 py-2 bg-[#0097b2]/20 border border-[#0097b2]/30 rounded-lg text-[10px] font-bold tracking-[0.2em] text-[#0097b2] uppercase hover:bg-[#0097b2]/30 transition-all"
                  >
                    {fixableAction.label}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Log Content */}
        <div className="p-6 h-[500px] overflow-y-auto custom-scrollbar">
          {logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="w-12 h-12 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-white/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="text-xs text-white/40 tracking-[0.2em] uppercase mb-2">No logs found</div>
              <div className="text-[10px] text-white/20">System is operating normally</div>
            </div>
          ) : (
            <div className="space-y-3">
              {isTyping && (
                <div className="flex items-center gap-2 text-[10px] text-[#0097b2]">
                  <div className="w-2 h-2 rounded-full bg-[#0097b2] animate-pulse" />
                  <span className="uppercase tracking-wider">Receiving live data...</span>
                </div>
              )}
              
              {logs.map((log) => (
                <div
                  key={log.id}
                  className="backdrop-blur-md bg-white/[0.02] border border-white/10 rounded-lg p-4 hover:bg-white/[0.05] transition-colors"
                >
                  <div className="flex items-start justify-between gap-4 mb-2">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 text-[9px] tracking-[0.1em] rounded uppercase ${
                        log.error_type === 'critical' 
                          ? 'bg-[#DC143C]/20 border border-[#DC143C]/30 text-[#DC143C]'
                          : log.error_type === 'warning'
                          ? 'bg-[#FFB000]/20 border border-[#FFB000]/30 text-[#FFB000]'
                          : 'bg-[#0097b2]/20 border border-[#0097b2]/30 text-[#0097b2]'
                      }`}>
                        {log.error_type}
                      </span>
                      <span className="text-[9px] text-white/40">
                        {new Date(log.created_at).toLocaleString()}
                      </span>
                    </div>
                  </div>
                  
                  <div className="text-xs text-white/90 mb-2 font-mono">
                    {log.error_message}
                  </div>
                  
                  {log.metadata && (
                    <details className="mt-2">
                      <summary className="text-[10px] text-white/40 uppercase tracking-wider cursor-pointer hover:text-white/60 transition-colors">
                        View Metadata
                      </summary>
                      <pre className="mt-2 p-3 bg-black/30 rounded text-[9px] text-white/70 overflow-x-auto">
                        {JSON.stringify(log.metadata, null, 2)}
                      </pre>
                    </details>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-white/10 bg-white/[0.02] flex justify-between items-center">
          <div className="text-[9px] text-white/30 uppercase tracking-[0.1em]">
            {logs.length} entries
          </div>
          <div className="text-[9px] text-white/30 uppercase tracking-[0.1em]">
            Real-time enabled
          </div>
        </div>
      </div>
    </div>
  );
}
