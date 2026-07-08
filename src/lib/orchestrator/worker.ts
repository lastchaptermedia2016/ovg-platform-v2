import { ORCHESTRATOR_HANDLERS } from './index';
import { FEATURE_REGISTRY } from '@/lib/audit/feature-registry';
import { supabaseAdmin } from '@/lib/supabase/admin';

const POLL_INTERVAL_MS = 5000;
const BATCH_SIZE = 10;

interface SystemTaskRow {
  id: string;
  command: string;
  payload: unknown;
  status: string;
}

/**
 * Runs one worker pass: claims PENDING system_tasks, executes the matching
 * orchestrator handler, and flips the row to COMPLETED or FAILED.
 * Claims are made by setting status = PROCESSING before execution so a
 * second concurrent worker won't double-process the same row.
 */
export async function runWorkerOnce(): Promise<number> {
  const { data: pending, error } = await supabaseAdmin
    .from('system_tasks')
    .select('id, command, payload, status')
    .eq('status', 'PENDING')
    .order('created_at', { ascending: true })
    .limit(BATCH_SIZE);

  if (error) {
    console.error('[ORCHESTRATOR] Worker failed to fetch tasks:', error.message);
    return 0;
  }

  const tasks = (pending as SystemTaskRow[] | null) ?? [];
  if (tasks.length > 0) {
    console.log('[ORCHESTRATOR] Worker picked up ' + tasks.length + ' pending task(s)');
  }

  for (const task of tasks) {
    await processTask(task);
  }

  return tasks.length;
}

async function processTask(task: SystemTaskRow): Promise<void> {
  // Claim the task so concurrent workers skip it.
  const { error: claimError } = await supabaseAdmin
    .from('system_tasks')
    .update({ status: 'PROCESSING', updated_at: new Date().toISOString() })
    .eq('id', task.id)
    .eq('status', 'PENDING');

  if (claimError) {
    console.error('[ORCHESTRATOR] Failed to claim task ' + task.id + ':', claimError.message);
    return;
  }

  const entry = FEATURE_REGISTRY[task.command as keyof typeof FEATURE_REGISTRY];
  const handlerName = entry?.handler;

  if (!handlerName || !ORCHESTRATOR_HANDLERS[handlerName]) {
    console.error('[ORCHESTRATOR] No handler for command ' + task.command + ' (task ' + task.id + ')');
    await failTask(task.id, 'No orchestrator handler registered for ' + task.command);
    return;
  }

  console.log('[ORCHESTRATOR] Executing ' + task.command + ' (task ' + task.id + ') → ' + handlerName);
  try {
    const result = await ORCHESTRATOR_HANDLERS[handlerName](task.payload);
    console.log('[ORCHESTRATOR] Completed ' + task.command + ' (task ' + task.id + '):', result);
    const { error: doneError } = await supabaseAdmin
      .from('system_tasks')
      .update({
        status: 'COMPLETED',
        updated_at: new Date().toISOString(),
      })
      .eq('id', task.id);
    if (doneError) {
      console.error('[ORCHESTRATOR] Failed to mark COMPLETED ' + task.id + ':', doneError.message);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[ORCHESTRATOR] ' + task.command + ' (task ' + task.id + ') failed:', message);
    await failTask(task.id, message);
  }
}

async function failTask(taskId: string, message: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('system_tasks')
    .update({
      status: 'FAILED',
      error_log: message,
      updated_at: new Date().toISOString(),
    })
    .eq('id', taskId);
  if (error) {
    console.error('[ORCHESTRATOR] Failed to mark FAILED ' + taskId + ':', error.message);
  }
}

/**
 * Starts an internal worker loop that polls system_tasks every POLL_INTERVAL_MS.
 * Returns a stop function. Guard against multiple concurrent loops.
 */
export function startWorkerLoop(intervalMs: number = POLL_INTERVAL_MS): () => void {
  console.log('[ORCHESTRATOR] Worker loop started (interval ' + intervalMs + 'ms)');
  const timer = setInterval(() => {
    runWorkerOnce().catch((err) =>
      console.error('[ORCHESTRATOR] Worker pass error:', err)
    );
  }, intervalMs);

  return () => {
    clearInterval(timer);
    console.log('[ORCHESTRATOR] Worker loop stopped');
  };
}

// Allow running directly as a one-shot script (e.g. `npx tsx worker.ts`).
// When imported by the app this branch is skipped.
if (process.argv[1] && process.argv[1].includes('worker')) {
  runWorkerOnce()
    .then((count) => {
      console.log('[ORCHESTRATOR] Worker pass complete — processed ' + count + ' task(s)');
      process.exit(0);
    })
    .catch((err) => {
      console.error('[ORCHESTRATOR] Worker pass failed:', err);
      process.exit(1);
    });
}
