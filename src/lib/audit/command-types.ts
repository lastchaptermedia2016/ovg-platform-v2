/**
 * @file command-types.ts
 *
 * Client-safe SYSTEM command taxonomy.
 *
 * Extracted from `src/app/api/ai/process-command/route.ts` so that the
 * `SYSTEM_COMMANDS` constant and `SYSTEM_COMMAND` type can be imported by
 * `'use client'` components (e.g. the Zeeder `ClientHelpModal`) without
 * pulling the server-only route module — and its `groq-sdk` / Supabase server
 * imports — into the client bundle.
 *
 * @remarks
 * This module must remain free of any server-only imports.
 */

export const SYSTEM_COMMANDS = [
  'SINGLE',
  'BULK',
  'NO_MATCH',
  'DELETE_CLIENT',
  'SYSTEM_BULK_CONFIRM',
  'SYSTEM_BULK_CANCEL',
  'SYSTEM_FILTER_GRID',
  'SYSTEM_UPDATE_BRANDING',
  'SYSTEM_HELP',
  'SYSTEM_NOTE',
  'SYSTEM_DISARM',
  'SYSTEM_EXPLAIN',
  'SYSTEM_TELEMETRY',
  'SYSTEM_APPLY_BRANDING_THEME',
  'SYSTEM_EXECUTE_BUILD',
  'SYSTEM_SYNC_CRM',
  'SYSTEM_RELOAD_ASSETS',
] as const;

export type SYSTEM_COMMAND = (typeof SYSTEM_COMMANDS)[number];

/**
 * Strict partition of AI capability ownership across the platform's surfaces.
 *
 * - `client`         — user-facing Zeeder Client tools (branding, personas, help).
 * - `reseller`       — Reseller admin tooling (telemetry, client grid, deletion).
 * - `infrastructure` — headless background tasks executed by the orchestrator worker.
 *
 * Used by `FEATURE_REGISTRY` to enforce scope-based boundary integrity so the
 * Client surface (e.g. `ClientHelpModal`) never surfaces Reseller or
 * Infrastructure commands.
 */
export type FeatureScope = 'client' | 'reseller' | 'infrastructure';
