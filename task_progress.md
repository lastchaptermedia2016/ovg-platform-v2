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
- [x] **Multi-tenant `create-client` isolation** — `POST /api/ai/create-client` now verifies `user_resellers` membership via `getAuthenticatedUser()` before the service-role insert; returns 401/403/500 on failure. Test `src/app/api/ai/create-client/__tests__/create-client.test.ts` green.
- [x] **AI audit logging on `process-command`** — Bulk/single `SYSTEM_UPDATE_BRANDING` writes are audited to `action_logs` (`source='hannah'`) through the authenticated client (RLS-enforced), mirroring the human save path.
- [x] **White-label widget header `brandName`** — Added optional `brandName` to `BrandingSchema` / `CanonicalBrandingSchema`, `StudioDraft`, the Branding Studio + Reseller `ClientBrandingStudio` inputs, the `WidgetPreview`, and `ChatWidget` header (`branding.brandName` → `config.brandName` → `"Omniverge Global"`). Fixed Reseller `handleCommit` to nest `branding`/`features` under `widgetConfig` so the backend `update-config` route persists them. No DB migration required (additive JSONB key).
- [x] **Zeeder on-screen guide page-context rule** — `buildClientAgentPrompt()` (in `src/app/api/client/process-command/route.ts`) now includes a Dynamic Page Context Rule: when the client is on `/client/dashboard/studio/branding` and asks about branding/logo/header, the agent names the exact left-panel controls.
- [x] **Informational voice query routing to LLM** — Narrowed `CLIENT_HELP_INTENT_REGEX` (removed `how do i`) and added `CLIENT_INFORMATIONAL_INTENT_REGEX`; informational/how-to queries now route to `runSemanticFallback` (Groq LLM) instead of the static `SYSTEM_HELP` block, while capability questions still return `SYSTEM_HELP`. Verified end-to-end in-browser ("how do I upload my logo" → screen-aware `CLIENT_NOP` guide). Tests `src/app/api/client/process-command/__tests__/client-process-command.test.ts` green (231 total).
- [x] **Anonymous-tolerant `/api/client/process-command` (public widget embed)** — Replaced the hard 401 gate with anon resolution: `tenantId` (public `tenant_id` text) resolved server-side to the internal `tenants.id` UUID via `supabaseAdmin`; missing/unknown → 400/404. Anon allowlist limited to `CLIENT_NOP` / `SYSTEM_HELP` (restricted hardcoded line, empty `payload`) / `SYSTEM_BOOKING_CAPTURE`; branding/persona/telemetry mutations and integration `functionCall` execution blocked for anon. CORS helper returns `Access-Control-Allow-Origin: '*'` with an `OPTIONS` handler (deliberate tradeoff — `tenantId` is public; rate limiting is the real boundary). Dual-key Supabase rate limiter (`src/lib/rate-limit/tenant-rate-limit.ts` + migration `20260718_anon_rate_limit.sql`: `rate_limits` table + `check_rate_limit` SECURITY DEFINER RPC) caps 15/60s per-IP and 200/60s per-tenant, fails open on DB error. Booking capture via `CLIENT_BOOKING_INTENT_REGEX` → forced `SYSTEM_BOOKING_CAPTURE`; `buildBookingCapture` (`src/lib/booking/booking-capture.ts`) extracts contact details from the LLM structured payload + free-text regex fallback (phone normalized/stripped), inserting a `tenant_appointments` `LEAD` row. Verified live: conversation, forced booking capture (LLM extraction on natural utterance), restricted HELP, branding blocked, OPTIONS 204 + CORS `*`, rate-limit trips 429 at 16th/15-per-IP, `LEAD` row inserted + read-back. `lint`/`tsc`/`build` clean.
