import { INTEGRATION_TOOL_BY_NAME, type FunctionCall, type ToolDefinition } from './integration-tools';

// ────────────────────────────────────────────────────────────────────
// Integration Tool Execution Handlers (Mock / Scaffold Layer)
// ────────────────────────────────────────────────────────────────────
// Each handler is highly resilient: it validates its arguments, emits a
// human-readable confirmation reflecting the processed payload, and NEVER
// throws. This is the scaffold the real booking/CRM/inventory connectors
// will replace; for now we "log" successful processing so the command
// pipeline can surface the outcome to the user via TTS / UI.

export interface ToolExecutionResult {
  ok: boolean;
  /** Human-readable confirmation surfaced to the user. */
  message: string;
  /** Structured detail for downstream logging / audit. */
  detail?: Record<string, unknown>;
}

function str(value: unknown, fallback = ''): string {
  if (value == null) return fallback;
  return String(value);
}

function asTool(def: ToolDefinition, call: FunctionCall): ToolExecutionResult {
  const args = call.arguments ?? {};
  switch (def.name) {
    case 'book_appointment': {
      const name = str(args.name, 'the client');
      const date = str(args.date, 'the requested date');
      const time = str(args.time, 'the requested time');
      const email = str(args.email);
      const message = `Booking created for ${name} at ${time} on ${date}${
        email ? ` (confirmation to ${email})` : ''
      }.`;
      // Mock execution log — replace with real calendar connector later.
      console.info('[integration-tool:book_appointment]', message);
      return { ok: true, message, detail: { ...args } };
    }
    case 'search_catalog': {
      const query = str(args.query, 'the catalog');
      const message = `Found live results for "${query}" in your inventory.`;
      console.info('[integration-tool:search_catalog]', message);
      return { ok: true, message, detail: { ...args } };
    }
    case 'capture_crm_lead': {
      const name = str(args.name, 'a new lead');
      const email = str(args.email);
      const notes = str(args.notes);
      const message = `Captured lead "${name}"${email ? ` (${email})` : ''} into your CRM${
        notes ? ` with notes: ${notes}` : ''
      }.`;
      console.info('[integration-tool:capture_crm_lead]', message);
      return { ok: true, message, detail: { ...args } };
    }
    default:
      return { ok: false, message: `Unknown integration tool "${def.name}".` };
  }
}

/**
 * Execute a single LLM-emitted function call against its mock handler.
 * Returns a safe result whether or not the tool is known or the args valid.
 */
export function executeIntegrationTool(call: FunctionCall): ToolExecutionResult {
  const def: ToolDefinition | undefined = INTEGRATION_TOOL_BY_NAME[call.name];
  if (!def) {
    return { ok: false, message: `No handler registered for tool "${call.name}".` };
  }
  try {
    return asTool(def, call);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Tool execution failed';
    console.error('[integration-tool] execution error:', message);
    return { ok: false, message: 'I tried to run that integration but hit an error.' };
  }
}
