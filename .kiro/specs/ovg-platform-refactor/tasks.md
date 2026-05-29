# Implementation Plan: OVG Platform v2 — Full Refactor

## Overview

Corrective refactor across three phases. No new features are introduced; the application must remain functionally equivalent after every change. Tasks are ordered Phase 1 (canonical clients) → Phase 2 (security hardening) → Phase 3 (architecture & cleanups). Each task is atomic and independently executable.

---

## Tasks

### Phase 1 — Canonical Clients & Import Migration

- [ ] 1. Establish canonical Supabase client modules
  - [x] 1.1 Refactor `src/lib/supabase/server.ts` to use un-cached, request-bound `cookies()`
    - Ensure `createClient()` calls `await cookies()` fresh on every invocation — no module-level caching
    - Verify the cookie `getAll`/`setAll` handlers are correctly wired to the `cookieStore` returned by that call
    - Confirm the function signature remains `async function createClient()` returning a `SupabaseClient`
    - _Requirements: 8.4_

  - [x] 1.2 Validate `src/lib/supabase/admin.ts` uses the service role key correctly
    - Confirm `supabaseAdmin` is instantiated with `SUPABASE_SERVICE_ROLE_KEY` (not the anon key)
    - Confirm `autoRefreshToken: false` and `persistSession: false` are set
    - No changes needed if already correct — this task is a verification gate before migration
    - _Requirements: 8.4_

  - [x] 1.3 Scan codebase and migrate all non-canonical Supabase client imports
    - Search for all imports of `@/lib/supabase/singleton`, `./singleton`, and inline `createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)` from `@supabase/supabase-js`
    - For each occurrence, replace with the appropriate canonical import:
      - Server Components / API Routes needing user session → `import { createClient } from '@/lib/supabase/server'`
      - Client Components → `import { createClient } from '@/lib/supabase/client'`
      - API Routes needing service-role → `import { supabaseAdmin } from '@/lib/supabase/admin'`
    - Files confirmed to need migration: `src/app/api/admin/cleanup-tenants/route.ts`, `src/app/api/resellers/create/route.ts`, `src/app/api/ai/create-client/route.ts`, `src/app/api/tenants/update-config-with-greeting/route.ts`, `src/app/api/reseller/[resellerSlug]/clients/route.ts`
    - Remove any now-unused `createClient` imports from `@supabase/supabase-js` after migration
    - _Requirements: 8.2, 8.3, 8.4, 11.1, 11.2, 11.4_

  - [-] 1.4 Delete `singleton.ts` and rewrite `index.ts`
    - Only execute after task 1.3 confirms the import graph is clean (no remaining references to `singleton`)
    - Delete `src/lib/supabase/singleton.ts`
    - Rewrite `src/lib/supabase/index.ts` to re-export only from the three canonical modules:
      ```ts
      export { createClient } from './server';
      export { createClient as createBrowserClient } from './client';
      export { supabaseAdmin } from './admin';
      ```
    - Run a final grep for `singleton` across the codebase to confirm zero remaining references
    - _Requirements: 8.1, 8.2, 8.3_

---

### Phase 2 — Security Hardening

- [ ] 2. Replace `getSession` with `getUser` in Middleware
  - [ ] 2.1 Update `middleware.ts` to call `supabase.auth.getUser()` instead of `supabase.auth.getSession()`
    - Replace the `getSession()` call with `getUser()`
    - Derive the user ID from `user.id` (not `session.user.id`)
    - Inject `x-user-id` header only when `getUser()` returns a non-null user without error
    - Redirect to `/auth` (with `redirectTo` param) if `getUser()` returns error or null user
    - _Requirements: 5.1, 5.3, 5.4_

- [ ] 3. Add session verification and role checks to admin endpoints
  - [ ] 3.1 Add `getUser()` auth check and admin role guard to `src/app/api/admin/cleanup-tenants/route.ts`
    - At the top of the `POST` handler, call `createClient()` from `@/lib/supabase/server` and then `supabase.auth.getUser()`
    - Return HTTP 401 `{ error: 'Unauthorized' }` if no user or auth error
    - Check `user.app_metadata?.role ?? user.user_metadata?.role`; return HTTP 403 `{ error: 'Forbidden' }` if role is not `'admin'`
    - The `supabaseAdmin` import from task 1.3 is already in place — use it for the deletion logic
    - _Requirements: 1.1, 1.2, 1.3, 1.4_

  - [ ] 3.2 Add `getUser()` auth check to `src/app/api/resellers/create/route.ts`
    - At the top of the `POST` handler, call `createClient()` from `@/lib/supabase/server` and then `supabase.auth.getUser()`
    - Return HTTP 401 `{ error: 'Unauthorized' }` if no user or auth error
    - The `supabaseAdmin` import from task 1.3 is already in place — use it for the creation logic
    - _Requirements: 2.1, 2.2, 2.3_

- [ ] 4. Re-engineer Delete Client endpoint to derive context from `user_resellers`
  - [ ] 4.1 Rewrite reseller resolution in `src/app/api/ai/delete-client/route.ts`
    - Call `supabase.auth.getUser()` using `createClient()` from `@/lib/supabase/server`; return HTTP 401 if no user
    - Query `user_resellers` table by `user.id`; return HTTP 403 `{ error: 'Forbidden: no reseller association' }` if no row found
    - Remove `resellerSlug` from the accepted request body — accept only `voiceCommand`
    - Scope all tenant queries to `userReseller.reseller_id` derived from the session (not the request body)
    - Add ownership check before deletion: verify the matched tenant's `reseller_id` equals `userReseller.reseller_id`; return HTTP 403 if mismatch
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [ ] 5. Delete diagnostic and test-auth route files
  - [ ] 5.1 Physically delete `src/app/api/auth/diagnostics/route.ts` and `src/app/api/test-auth/route.ts`
    - Delete both files from the filesystem
    - Search for any remaining imports, `fetch()` calls, or UI references to `/api/auth/diagnostics` or `/api/test-auth` and remove them
    - The diagnostics button in `src/app/(auth)/auth/page.tsx` references `/api/auth/diagnostics` — remove that button and its `onClick` handler as part of this task
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

---

### Phase 3 — Architecture & Cleanups

- [ ] 6. Clean hardcoded slugs from auth components
  - [ ] 6.1 Migrate `src/app/(auth)/auth/page.tsx` to `getUser` + `user_resellers`-based redirect
    - Replace `supabase.auth.getSession()` on mount with `supabase.auth.getUser()`
    - After `getUser()`, query `user_resellers` for the caller's `reseller_slug`; redirect to `/reseller/{slug}/clients`
    - If no `user_resellers` row exists, call `setError('Your account is not linked to a reseller. Please contact support.')`
    - Apply the same `user_resellers` query pattern in the post-login redirect after `signInWithPassword`
    - Remove all occurrences of the string literals `lastchaptermedia2016` and `acme-corp`
    - Remove the `updateUserResellerSlug` function and all calls to it
    - Remove any call to `/api/auth/fix-metadata`
    - _Requirements: 5.2, 7.1, 7.2, 7.3, 7.4_

  - [ ] 6.2 Migrate `src/app/(dashboard)/reseller/[resellerSlug]/layout.tsx` to `user_resellers` table check
    - In `verifyResellerAccess`, replace the `user.user_metadata.reseller_slug === resellerSlug` comparison with a `user_resellers` table query
    - Call `supabase.auth.getUser()`; redirect to `/auth` if no user
    - Query `user_resellers` filtering by `user.id` and `resellerSlug` using `.maybeSingle()`; redirect to `/auth` if no row returned
    - Remove the unused `defaultSlug` variable (currently causing a lint warning)
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

- [ ] 7. Strip auto-creation logic from ClientsGrid
  - [ ] 7.1 Replace auto-reseller-creation branch with error state in `src/components/reseller/ClientsGrid.tsx`
    - Add `const [error, setError] = useState<string | null>(null)` to the component state
    - In `fetchTenants`, locate the branch that calls `fetch('/api/resellers/create', ...)` when the reseller slug is not found
    - Replace that entire branch with: `setError(\`Reseller "${resellerSlugParam}" not found. Please contact support.\`); setLoading(false); return;`
    - Add an error render guard at the top of the component's return: when `error` is non-null, render a red-bordered error card containing the message
    - Confirm zero remaining `fetch('/api/resellers/create'` calls in the file
    - _Requirements: 9.1, 9.2, 9.3, 9.4_

- [ ] 8. Standardize types, fix lint warnings, and scrub garbage artifacts
  - [ ] 8.1 Extend canonical `TenantSchema` and remove local `interface Tenant` from `ClientsGrid.tsx`
    - Add missing fields to `TenantSchema` in `src/types/index.ts`: `email`, `category`, `industry`, `category_config`, `signal_count`, `signal_trend`, `ai_insight`, `last_seen`, `total_revenue`, `total_leads`, `mrr`, `permission_level`, `indicators`
    - Export the `Indicators` type from `src/types/index.ts`
    - Delete the local `interface Tenant` and `interface Indicators` declarations from `ClientsGrid.tsx`
    - Add `import type { Tenant } from '@/types'` to `ClientsGrid.tsx`
    - Verify the `Client` interface in `src/types/index.ts` remains unchanged
    - _Requirements: 10.1, 10.2, 10.3, 10.4_

  - [ ] 8.2 Fix all `react-hooks/exhaustive-deps` warnings
    - `src/components/reseller/ClientsGrid.tsx` ~437: remove `isListening` (unnecessary dep)
    - `src/components/reseller/ClientsGrid.tsx` ~533: remove `resellerSlug` (unnecessary dep)
    - `src/components/reseller/ClientsGrid.tsx` ~686: add `handleFeatureToggle` and `playAIConfirmation`
    - `src/components/reseller/ClientsGrid.tsx` ~863: add `fetchCriticalAlerts`, `fetchDashboardStats`, `fetchTenants`
    - `src/app/(dashboard)/reseller/[resellerSlug]/clients/page.tsx` ~328: add `handleCommandSubmit`
    - `src/app/page.tsx` ~160: move `blackBoxMessages` to a module-level constant (outside component) to stabilize the reference
    - `src/components/reseller/ClientBrandingStudio.tsx` ~373: remove `speak`; ~728, ~829: add missing deps
    - `src/components/reseller/DiagnosticPanel.tsx` ~126: add `logs`
    - `src/hooks/use-voice-command.ts` ~315: add `currentConfig` and `tenantContext.category`, `tenantContext.tenantId`
    - `src/providers/reseller-provider.tsx` ~90: add `setIsLoading`
    - _Requirements: 12.1, 12.2, 12.3_

  - [ ] 8.3 Remove all unused variable instances
    - `src/components/reseller/ClientsGrid.tsx`: remove `_isGlobalScanning`, `setRevenuePopup`, `setSortBy`, `totalLeads`, `totalRevenue`; prefix `_error`, `_offlineOnly`, `_apiErr`, `_event` with `_` or remove
    - `src/app/(dashboard)/reseller/[resellerSlug]/clients/page.tsx`: remove `volumeLevel`, `stopVoice`, `clearCaptions`
    - `src/components/reseller/ClientBrandingStudio.tsx`: remove `resellerSlug`, `isGeneratingGreeting`; rename `e` params to `_e`
    - `src/components/reseller/ClientCard.tsx`: remove `getIndustryFeatureLabel`, `onFeatureToggle`, `onSTTResult`, `categoryProfile`
    - `src/components/reseller/modals/UniversalCommandModal.tsx`: remove `setIsSubmitting`, `conversationStep`, `missingFields`, `normalizeWebsite`, `processCommandWithTranscript`; rename `sessionError` → `_sessionError`
    - `src/components/reseller/BrandKit.tsx`: remove `initialHeaderUrl`, `initialFooterUrl`
    - `src/components/reseller/LivePreview.tsx`: remove `headerUrl`, `footerUrl`, `secondaryColor`, `getGreeting`
    - `src/components/reseller/ResellerHUDClient.tsx`: remove `reseller`, `clients`, `clientCount`, `branding`
    - `src/components/reseller/UploadZone.tsx`: remove unused `Image` import
    - `src/lib/supabase/client.ts`: remove `HeadersConstructor`
    - All remaining files per `current_lint.txt`
    - _Requirements: 13.1, 13.2, 13.3_

  - [ ] 8.4 Replace `any` types with typed alternatives
    - `src/app/api/tenants/update-config-with-greeting/route.ts`: replace `z.record(z.any())` with `z.record(z.unknown())`
    - `src/app/api/ai/create-client/route.ts`: replace `z.record(z.any())` with `z.record(z.unknown())`
    - `src/components/reseller/ClientsGrid.tsx`: replace `(tenant as any).is_active`, `(tenant as any).permission_level`, `(err as any).code`, `(err as any).status` with proper type narrowing
    - Search for remaining `as any` casts across the codebase and resolve each by narrowing the type at the call site
    - _Requirements: 14.1, 14.2, 14.3_

  - [ ] 8.5 Replace raw `<img>` tags with Next.js `<Image>` component
    - `src/components/reseller/BrandKit.tsx`: add `import Image from 'next/image'`; replace `<img src={currentUrl} ...>` with `<Image src={currentUrl} alt={...} width={640} height={128} unoptimized className="w-full h-32 object-cover rounded" />`
    - _Requirements: 15.1, 15.2, 15.3_

  - [ ] 8.6 Delete garbage files from project root
    - Delete the following files: `(`, `...)`, `...)\``, `cd`, `Click`, `eslint`, `npm`, `OFFLINE_THRESHOLD_MS`, `setShowOfflineOnly(!showOfflineOnly)}`, `{`
    - Delete the `-p/` directory
    - Verify all legitimate root files remain untouched: `package.json`, `tsconfig.json`, `next.config.ts`, `middleware.ts`, `eslint.config.mjs`, `.env.local`, `.env.example`, `.gitignore`, `README.md`, `AGENTS.md`, `CLAUDE.md`, `tailwind.config.ts`, `postcss.config.mjs`, SQL files
    - _Requirements: 16.1, 16.2, 16.3_

  - [ ] 8.7 Run `npm run lint` and verify zero warnings in targeted rule categories
    - Execute `npm run lint` and confirm zero warnings for: `react-hooks/exhaustive-deps`, `@typescript-eslint/no-unused-vars`, `@typescript-eslint/no-explicit-any`, `@next/next/no-img-element`
    - Fix any remaining warnings surfaced by the lint run that were not caught by earlier sub-tasks
    - _Requirements: 12.1, 13.1, 14.1, 15.1_

---

## Notes

- Phase 1 must complete before Phase 2 — security hardening depends on canonical clients being in place
- Phase 2 must complete before Phase 3 — auth page cleanup (task 6) depends on the diagnostic endpoint being gone (task 5)
- Within Phase 1, tasks 1.1–1.3 can run in parallel; task 1.4 (delete singleton) must run after 1.3
- Within Phase 3, tasks 6–8 can run in parallel once Phase 2 is complete
- The `user_resellers` table is read-only in this refactor — no schema changes are made
- Before modifying any Next.js API route or middleware, read the relevant guide in `node_modules/next/dist/docs/` as the installed version may have breaking changes from training data

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["1.3"] },
    { "id": 2, "tasks": ["1.4"] },
    { "id": 3, "tasks": ["2.1", "3.1", "3.2", "4.1", "5.1"] },
    { "id": 4, "tasks": ["6.1", "6.2", "7.1", "8.1"] },
    { "id": 5, "tasks": ["8.2", "8.3", "8.4", "8.5", "8.6"] },
    { "id": 6, "tasks": ["8.7"] }
  ]
}
```
