<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

<!-- END:nextjs-agent-rules -->

<!-- BEGIN:scope-boundary-rules -->

# Client ↔ Reseller scope isolation is enforced

The platform ships two distinct front-end surfaces that MUST NOT cross-pollinate:

- **Client (Zeeder) surface** — routes under `src/app/client/**` (route group `src/app/(client)/**`) and components under `src/components/client/**`, `src/components/ui/zeeder/**`, plus the voice bridge `src/hooks/useZeederVoice.ts`.
- **Reseller surface** — routes under `src/app/(dashboard)/reseller/**` and components under `src/components/reseller/**`, plus the voice hook `src/hooks/use-voice-command.ts`.

## Hard rules for agents

1. Never import or edit Reseller-domain code when working on a Client (Zeeder) task, and vice-versa. `useZeederVoice.ts` and `SystemMicButton.tsx` are declared **zero-dependency** with respect to `src/contexts/HannahContext`, `src/hooks/use-voice-command`, and `src/lib/reseller/*` — keep them that way.
2. `SYSTEM_HELP` is elevated to a visual UI modal **only** in the Client surface (`ClientHelpModal`, mounted in `SystemMicButton`). Do not port the modal trigger into the Reseller `clients/page.tsx` help popover.
3. Shared AI capability metadata lives in `src/lib/audit/feature-registry.ts` (`FEATURE_REGISTRY`) and the client-safe taxonomy `src/lib/audit/command-types.ts`. Both are importable from `'use client'` components — do NOT reintroduce a server-only import path into these files.
4. Headless infrastructure commands (`SYSTEM_EXECUTE_BUILD`, `SYSTEM_SYNC_CRM`, `SYSTEM_RELOAD_ASSETS`) are queued into `system_tasks` and executed by `src/lib/orchestrator/worker.ts`; they have no UI modal by design.

<!-- END:scope-boundary-rules -->

<!-- BEGIN:production-excellence-rules -->

# Production Excellence & Quality Benchmarks

This project operates at a production-excellence bar. Full architecture reference: `docs/PROJECT_OVERVIEW.md`, `docs/ARCHITECTURE.md`.

## Verification Gates

All three must pass before work is considered complete. Run them; never assume.

| Gate | Command | Required result |
| :--- | :--- | :--- |
| Types | `npx tsc --noEmit` (or `npm run typecheck`) | 0 errors |
| Lint | `npm run lint` (ESLint) | 0 errors |
| Tests | `npm test` (Vitest) | 100% pass rate, no regressions |

Type safety is non-negotiable: no `any` escapes, no `@ts-ignore` to silence a real error, no unsafe casts to bypass a genuine mismatch. Fix the type error at the boundary instead.

## RLS & Tenant Isolation

- **RLS is the primary isolation mechanism**, not a defence-in-depth add-on. Every tenant-scoped table must have policies; every tenant-scoped policy must resolve through `user_resellers`.
- The canonical join is `JOIN user_resellers ur ON ur.reseller_id = t.reseller_id`, filtered by `ur.user_id = auth.uid()`. `tenants.reseller_id` is established by `002_create_resellers_table.sql`; `user_resellers` by `008_create_user_resellers_table.sql`. Follow the existing policies in `20260709000001_create_chat_messages.sql` and `20260728000001_create_tenant_knowledge.sql` rather than inventing a new shape.
- Service-role writes from API routes do not substitute for RLS. A table with no user policy is read-denied to everyone by default — verify the intended access path explicitly.
- Storage objects have **no** RLS policies in this repo by design; do not add them without an explicit decision.

## Migrations

- Filenames must carry a unique 14-digit UTC prefix `YYYYMMDDHHMMSS_`. Historical 8-digit (`YYYYMMDD_`) and sequential (`NNN_`) prefixes are grandfathered — do not rename them unless resolving a real collision, because renaming an applied migration orphans its `supabase_migrations.schema_migrations` row and causes re-execution.
- Migrations must be re-runnable: use `IF NOT EXISTS` / `IF EXISTS` and `CREATE OR REPLACE` so a re-run reaches the same end state rather than erroring. Bare `CREATE TABLE`, `ADD COLUMN`, `CREATE INDEX`, and `CREATE POLICY` are not idempotent.
- **Migration files are never source for discussion.** A file must contain only SQL and its own comments. If a transcript, plan, or scratch output is ever pasted into one, rewrite the file before pushing.
- Never edit an already-applied migration. Add a new forward migration instead.
- Schema changes must align with the TypeScript definitions in `src/types/` and `src/lib/supabase/`. If a migration adds a column, update the types in the same change.

<!-- END:production-excellence-rules -->
