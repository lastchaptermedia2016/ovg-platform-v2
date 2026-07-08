# Production Excellence Refactor - Task Progress

## Phase 1: Critical Errors (74 errors)
- [ ] Fix `src/components/reseller/ClientsGrid.tsx` (hoisting, refs-in-render, any types, exhaustive-deps)
- [ ] Fix `src/hooks/use-voice-command.ts` (hoisting, any types, exhaustive-deps)
- [ ] Fix `src/app/create-agent/page.tsx` (set-state-in-effect, any types, exhaustive-deps)
- [ ] Fix `src/components/auth/HannahWave.tsx` (set-state-in-effect, exhaustive-deps)
- [ ] Fix `src/core/reseller/alerts.ts` (ts-nocheck, any types)
- [ ] Fix `src/hooks/use-ai-command.ts` (any types)
- [ ] Fix `src/lib/ai/config.ts` (any types, unused vars)
- [ ] Fix `src/hooks/use-resilient-voice.ts` (any types, unused vars)
- [ ] Fix `src/hooks/use-reseller.ts` (set-state-in-effect)
- [ ] Fix `src/lib/hooks/useBranding.ts` (set-state-in-effect)
- [ ] Fix `src/components/widget/PodBubble.tsx` (set-state-in-effect)
- [ ] Fix `src/providers/reseller-provider.tsx` (exhaustive-deps, unused vars)
- [ ] Fix `src/lib/utils/headers.ts` (any type)
- [ ] Fix `src/core/billing/paystack.ts` (any type)
- [ ] Fix `src/core/client/types.ts` (any type)
- [ ] Fix `src/core/reseller/queries.ts` (any type, unused var)
- [ ] Fix `src/features/widget/components/Pod.tsx` (any type)
- [ ] Fix `src/features/widget/components/PodPanel.tsx` (any type)
- [ ] Fix `src/app/api/ai/stt/route.ts` (any type)
- [ ] Fix `src/components/reseller/ClientCard.tsx` (any types, unused vars)
- [ ] Fix `src/app/api/ai/extract-client-info/route.ts` (unused var)
- [ ] Fix `src/app/api/ai/process-command/route.ts` (unused var)
- [ ] Fix `src/app/\(auth)/sign-in/page.tsx` (exhaustive-deps)
- [ ] Fix `src/app/page.tsx` (exhaustive-deps)
- [ ] Fix `src/components/reseller/ClientBrandingStudio.tsx` (any types, exhaustive-deps, unused vars, img)
- [ ] Fix `src/app/\(dashboard)/reseller/\[resellerSlug]/clients/page.tsx` (exhaustive-deps, unused vars)

## Phase 2: Warnings (111 warnings)
### Unused vars (56 warnings)
- [ ] Fix unused vars across all remaining files

### `<img>` tags (6 warnings)
- [ ] Fix `<img>` tags in BrandKit.tsx, ClientBrandingStudio.tsx, ClientPolicyManager.tsx, UploadZone.tsx

### Exhaustive-deps warnings (remaining)
- [ ] Fix all remaining exhaustive-deps warnings

## Phase 3: Verification
- [ ] Run `npm run lint` and confirm 0 errors, 0 warnings

---

## Completed (Historical Log)

These items are finalized and tracked here for audit continuity. They are intentionally kept out of the active To-Do lists above.

- [x] **SYSTEM_HELP elevated to Zeeder Client UI modal** — `useZeederVoice` exposes `helpModalOpen` / `dismissHelpModal`; the `SYSTEM_HELP` branch triggers the modal while retaining TTS for accessibility. Rendered via `ClientHelpModal` (`src/components/client/ClientHelpModal.tsx`) mounted in `SystemMicButton`. Confined to the `/client` (Zeeder) surface; Reseller `clients/page.tsx` help popover untouched.
- [x] **`system_tasks` queue + orchestrator worker** — Headless infrastructure commands (`SYSTEM_EXECUTE_BUILD`, `SYSTEM_SYNC_CRM`, `SYSTEM_RELOAD_ASSETS`) are persisted to `system_tasks` by `src/lib/audit/command-dispatcher.ts` and processed asynchronously by `src/lib/orchestrator/worker.ts` (handlers in `src/lib/orchestrator/`). Migration `supabase/migrations/016_create_system_tasks_table.sql` applied with service-role-only RLS.
- [x] **Client-safe command taxonomy** — `SYSTEM_COMMANDS` / `SYSTEM_COMMAND` extracted into `src/lib/audit/command-types.ts` (no server-only imports); `feature-registry.ts` and `route.ts` repointed so `FEATURE_REGISTRY` is importable from `'use client'` components. Parity test `src/lib/audit/parity.audit.test.ts` green.
