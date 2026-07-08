import { ORCHESTRATOR_HANDLERS } from '@/lib/orchestrator';
import { FEATURE_REGISTRY } from './feature-registry';
import { supabaseAdmin } from '@/lib/supabase/admin';

// Headless infrastructure commands are persisted to system_tasks and processed
// asynchronously by the orchestrator worker instead of inline in the request.
const CRITICAL_COMMANDS = new Set<string>([
  'SYSTEM_EXECUTE_BUILD',
  'SYSTEM_SYNC_CRM',
  'SYSTEM_RELOAD_ASSETS',
]);

interface QueuedResult {
  status: 'QUEUED';
  taskId: string;
}

interface DirectResult {
  status: 'EXECUTED' | 'NO_HANDLER';
  result?: unknown;
}

/**
 * Resolves a SYSTEM_COMMAND to its registered orchestrator handler (if any)
 * and executes it. Headless infrastructure commands (e.g. SYSTEM_EXECUTE_BUILD)
 * are queued into system_tasks and return { status: 'QUEUED', taskId } so the
 * API can respond immediately. Lightweight commands run inline via async
 * promise as before.
 */
export async function executeCommand(
  command: string,
  payload?: unknown
): Promise<QueuedResult | DirectResult> {
  const entry = FEATURE_REGISTRY[command as keyof typeof FEATURE_REGISTRY];

  // ── Critical path: queue into system_tasks for the async worker ──────────
  if (CRITICAL_COMMANDS.has(command)) {
    console.log('[ORCHESTRATOR] Queueing critical command ' + command);

    const { data, error } = await supabaseAdmin
      .from('system_tasks')
      .insert({ command, payload: payload ?? null, status: 'PENDING' })
      .select('id')
      .single();

    if (error || !data) {
      console.error('[ORCHESTRATOR] Failed to queue ' + command + ':', error?.message);
      throw new Error('Failed to queue system task: ' + (error?.message ?? 'unknown error'));
    }

    console.log('[ORCHESTRATOR] Queued ' + command + ' as task ' + data.id);
    return { status: 'QUEUED', taskId: data.id };
  }

  // ── Lightweight path: execute inline via async promise ───────────────────
  const handlerName = entry?.handler;
  if (handlerName && ORCHESTRATOR_HANDLERS[handlerName]) {
    console.log('[ORCHESTRATOR] Dispatching ' + command + ' → ' + handlerName);
    const result = await ORCHESTRATOR_HANDLERS[handlerName](payload);
    console.log('[ORCHESTRATOR] Result for ' + command + ':', result);
    return { status: 'EXECUTED', result };
  }

  console.log('[ORCHESTRATOR] No orchestrator handler for ' + command);
  return { status: 'NO_HANDLER' };
}
