# OVG Platform v2 — Project Overview

> **Repository:** `ovg-platform-v2` · **Version:** 0.1.0 · **Branch:** `main`
> **Framework:** Next.js 16.2.6 (App Router) · **Runtime:** Node 20 · **Language:** TypeScript 5
> **Audience:** Platform engineers, AI agents, and future maintainers joining the codebase.

This document is a single consolidated reference for the entire `ovg-platform-v2`
repository. It supersedes the need to read `README.md`, `docs/ARCHITECTURE.md`, and
`PROJECT_STATUS.md` independently, while explicitly calling out where those legacy
documents have drifted from the live code (see
[Appendix A](#appendix-a--known-defects--documentation-drift)).

---

## Table of Contents

1. [Executive Summary & Purpose](#1-executive-summary--purpose)
2. [High-Level Architecture](#2-high-level-architecture)
3. [Complete Tech Stack & Integrations](#3-complete-tech-stack--integrations)
4. [Database & Migration Architecture](#4-database--migration-architecture)
5. [Critical User & Voice Workflows](#5-critical-user--voice-workflows)
6. [Development Standards & Agent Execution Rules](#6-development-standards--agent-execution-rules)
- [Appendix A — Known Defects & Documentation Drift](#appendix-a--known-defects--documentation-drift)
- [Appendix B — Source of Truth Index](#appendix-b--source-of-truth-index)

---

## 1. Executive Summary & Purpose

### 1.1 Core Value Proposition

OVG Platform v2 is a **multi-tenant, white-label SaaS platform** that lets partner
resellers provision, brand, and operate their own AI-powered customer-service agents
under total data isolation. The platform's central bet is that a small business owner
should be able to configure a branded, voice-driven AI agent **without writing code** —
they speak to it, and it configures itself.

The product is delivered in three distinct surfaces that are deliberately kept apart
(see [§2.4](#24-the-scope-boundary-client--reseller)):

- a **Reseller** console for provisioning and managing client tenants,
- a **Client (Zeeder)** dashboard for branding, persona, knowledge, and integrations,
- a **public embeddable widget** that anonymous end visitors talk to.

### 1.2 Target Users

| Persona | Who they are | Entry surface | What they do |
|---|---|---|---|
| **Reseller** | A partner agency / consultant who resells the platform | `/reseller/[resellerSlug]/*` (route group `(dashboard)`) | Provision clients, set house branding, monitor tenants, manage integrations, track revenue |
| **Client (Zeeder)** | The end business that bought from the reseller | `/client/dashboard/*` | Configure brand, AI persona/voice, knowledge base, integrations — largely by speaking |
| **End Visitor** | An anonymous consumer on a client's website | `/widget/[tenantId]` | Chat with the AI agent, request bookings, be handed to a human |
| **Master Admin** | The platform owner | `/master-gate/*` | Bird's-eye tenant registry and system health (isolated super-admin surface) |

The `middleware.ts` identity gate reflects this exactly: `/reseller/*` redirects to
`/auth`, `/client/dashboard/*` redirects to `/client-auth`, and `/widget/*` is public —
it merely injects `x-tenant-id` into request headers for downstream Server Components.

### 1.3 The Problem Solved

1. **Tenant isolation.** A reseller must never see or mutate another reseller's clients.
   This is enforced *in the database*, not just in UI: Row Level Security policies join
   through the `user_resellers` junction table so a user can only ever reach tenants
   owned by a reseller they are linked to. See [§4.5](#45-row-level-security-model).
2. **Configuration friction.** Branding, persona, and knowledge setup is traditionally a
   form-filling exercise. Here it is a **voice conversation** — the agent parses intent,
   resolves it to a typed action, and dispatches it into client state
   ([§5.2](#52-the-voice-orchestration-pipeline)).
3. **Always-available sales staff.** The public widget provides 24/7 AI-assisted lead
   capture, with a **live human-intervention path** so a person can take over a
   conversation mid-flight and hand it back ([§5.4](#54-live-intervene--human-handoff)).
4. **White-labeling without fork-per-client.** Tenant configuration (branding, greeting,
   suggested actions, features) is data, not code, and is projected to anonymous
   visitors through a single narrow `SECURITY DEFINER` RPC
   ([§4.4](#44-rpc--function-inventory)).

### 1.4 The Name "Zeeder"


## 2. High-Level Architecture

### 2.1 Monorepo Layout

This is a **single Next.js application**, not a workspace monorepo. There is no
`pnpm-workspace.yaml` and no `packages/` directory — the "monorepo" in the product
pitch is a *conceptual* one: several business domains (`reseller`, `client`, `widget`,
`admin`) share one deployment, one database, and one type system.

```
ovg-platform-v2/
├── docs/                  # Documentation (this file lives here)
├── public/                # Static assets
├── scripts/               # One-off migration push / verification scripts
├── supabase/
│   ├── migrations/        # 43 SQL migrations (see §4)
│   └── config.toml        # Supabase CLI project config
├── src/
│   ├── app/               # Next.js App Router — routes, API, layouts
│   ├── components/        # Presentational + feature components
│   ├── config/            # Shared runtime config
│   ├── contexts/          # React context providers (Zeeder, Hannah, BrandKit…)
│   ├── core/              # Domain core — server actions & queries per domain
│   ├── features/          # Feature-sliced UI (widget)
│   ├── hooks/             # Cross-cutting React hooks
│   ├── interfaces/        # Interface/type declarations
│   ├── lib/               # The bulk of the logic (see §2.2)
│   ├── providers/         # Cross-cutting providers (voice, tenant)
│   ├── store/             # Zustand store
│   ├── types/             # Global TypeScript types
│   └── utils/             # Utilities (incl. audio transcoding)
├── middleware.ts          # Root auth/tenant identity gate
├── next.config.ts         # Next configuration
├── tailwind.config.ts     # Tailwind configuration
├── eslint.config.mjs      # ESLint flat config
├── vitest.config.ts       # Test runner config
└── .github/workflows/     # CI: zeeder-ci.yml, live-curl.yml
```

### 2.2 The `src/lib/` Subsystem Map

`src/lib/` carries the domain logic. Its subdirectories, with their responsibilities:

| Directory | Responsibility | Notable modules |
|---|---|---|
| `lib/ai/` | LLM orchestration, intent mapping, memory, prompt building, TTS cache | `cognitive-orchestrator.ts`, `intent-mapper.ts`, `memory-service.ts`, `system-prompt-builder.ts`, `help-matrix.ts`, `tts-cache.ts` |
| `lib/audit/` | Shared AI capability metadata (client-safe) | `feature-registry.ts`, `command-types.ts`, `command-dispatcher.ts` |
| `lib/auth/` | Supabase SSR auth, session + user resolution | `server.ts`, `auth-errors.ts` |
| `lib/branding/` | Branding sync / atomic commit logic | — |
| `lib/booking/` | Booking bridge + driver adapters | `drivers/` |
| `lib/chat/` | Live-intervene mute/handoff state, reconnect | `mute-state.ts`, `reconnect.ts` |
| `lib/db/` | Data access layer (tenant/client deletion) | `reseller-clients.ts` |
| `lib/groq/` | Groq client wrapper | — |
| `lib/migrations/` | Config transforms & migration helpers | `transform.ts` |
| `lib/orchestrator/` | Headless `system_tasks` worker & pipelines | `worker.ts`, `command-dispatcher.ts`, `crm-sync.ts`, `build-pipeline.ts` |
| `lib/rate-limit/` | Per-IP / per-tenant rate limiting | — |
| `lib/reseller/` | Reseller DAL, tenant knowledge client/engine | `tenant-knowledge-*.ts` |
| `lib/schemas/` | Zod schemas (client + tenant config) | `client-config.schema`, `tenant-config.schema`, `tenant-config.canonical` |
| `lib/security/` | Security helpers | — |
| `lib/services/` | Service layer (e.g. `tenant-config.service`) | — |
| `lib/supabase/` | Canonical Supabase clients (browser/server/admin) | `client.ts`, `server.ts`, `admin.ts`, `resolve-reseller-id.ts` |
| `lib/telemetry/` | Telemetry feed & aggregation | `feed.ts` |
| `lib/utils/` | Shared utilities (deep-merge, colors) | `deep-merge.ts` |
| `lib/voice/` | Voice pipeline leaf modules | `client-routes.ts`, `transcoder.ts`, `stt-client.ts`, `parse-voice-entry.ts`, `voice-logger.ts` |
| `lib/zeeder/` | Zeeder action registry | `action-registry.ts` |

### 2.3 App Router Structure

The app directory mixes **route groups** (parenthesized, layout-only) with **flat
top-level routes**. There is no `src/app/reseller/` or `src/app/client/` *directory*
per se — the reseller surface lives under the `(dashboard)` route group, and the client
surface is a flat `client/` tree. Full page inventory (26 page routes):

| Route group / tree | Routes |
|---|---|
| `(marketing)/` | `/` (landing), `/pricing` |
| `(auth)/` | `/auth`, `/sign-in`, `/sign-up` |
| `(admin)/master-gate/` | `/master-gate/login`, `/master-gate/(protected)` — isolated super-admin surface |
| `(dashboard)/reseller/[resellerSlug]/` | `/`, `/clients`, `/clients/new`, `/clients/[clientId]/branding`, `/clients/[clientId]/integrations`, `/branding`, `/ai-engine`, `/knowledge`, `/signal`, `/deployment`, `/revenue`, `/client` |
| `client/` (flat, Zeeder) | `/client/dashboard`, `/client/dashboard/studio/{branding,persona,knowledge,integrations}` |
| `client-auth/` | `/client-auth` |
| `create-agent/` | `/create-agent` |
| `widget/` | `/widget/[tenantId]`, `/widget/embed` (loader endpoint) |

---

"Zeeder" is the internal name for the **client-facing AI agent surface** — the voice
bridge (`useZeederVoice`), the action registry (`src/lib/zeeder/action-registry.ts`),
and the client context (`src/contexts/ZeederContext.tsx`). When this document says
"the Zeeder client surface", it means the `src/app/client/**` route group and its
associated components, hooks, and contexts.

---

### 2.4 The Scope Boundary: Client ↔ Reseller

A hard, agent-enforced boundary separates the two authenticated front-ends. `AGENTS.md`
declares it a **hard rule**; this document restates the topology:

- **Client (Zeeder) surface** — routes under `src/app/client/**`, components under
  `src/components/client/**` and `src/components/ui/zeeder/**`, and the voice bridge
  `src/hooks/useZeederVoice.ts`.
- **Reseller surface** — routes under `src/app/(dashboard)/reseller/**`, components
  under `src/components/reseller/**`, and `src/hooks/use-voice-command.ts`.

Key constraints:

1. `useZeederVoice.ts` and `SystemMicButton.tsx` are **zero-dependency** with respect to
   `HannahContext`, `use-voice-command`, and `src/lib/reseller/*`. Keep them that way.
2. `SYSTEM_HELP` is a **visual modal only in the Client surface** (`ClientHelpModal`,
   mounted in `SystemMicButton`). It must not leak into the Reseller clients page.
3. Shared AI metadata lives in `src/lib/audit/feature-registry.ts` and the client-safe
   taxonomy `src/lib/audit/command-types.ts`. Both are importable from `'use client'`
   components — do **not** reintroduce a server-only import path into them.
4. Headless infrastructure commands (`SYSTEM_EXECUTE_BUILD`, `SYSTEM_SYNC_CRM`,
   `SYSTEM_RELOAD_ASSETS`) are queued into `system_tasks` and executed by
   `src/lib/orchestrator/worker.ts`; they have **no UI modal by design**.

The `FeatureScope` union (`client` | `reseller` | `infrastructure`) in
`command-types.ts` is what makes the boundary machine-checkable: `FEATURE_REGISTRY`
annotates every command with a scope so the Client surface can never surface a
Reseller or Infrastructure command.

### 2.5 API Surface Area

There are **58 route handlers** under `src/app/api/`. They cluster as follows, with the
auth posture each generally follows (the two-step perimeter is `getAuthenticatedUser()`
+ an ownership/role check; see `PROJECT_STATUS.md` for the audited list):

| Group | Base | Purpose | Typical auth |
|---|---|---|---|
| Public / Widget | `/api/widget`, `/api/client/process-command`, `/api/client/stt` | Anonymous embed, chat, voice command routing | Anonymous-tolerant; rate-limited; restricted anon allowlist on command execution |
| Client AI | `/api/ai/*` | Voice-driven client creation, branding sync, STT/TTS, response generation | Authenticated; `user_resellers` membership enforced |
| Reseller | `/api/reseller/*`, `/api/resellers/*` | Tenant provisioning, signals, tenant knowledge, branding, assets | Authenticated + slug ownership |
| Tenant config | `/api/tenants/*` | Config, pricing, AI engine, integration suite updates | Authenticated + `validateTenantOwnership` |
| Chat / Live | `/api/chat/*` | Conversations, messages, mute, read state, voice | Authenticated for reads; service-role for state |
| Auth | `/api/auth/*` | SSR callback, reseller-slug update | Public (registration expected) |
| Payments | `/api/paystack/initialize` | Revenue-share payment init | Authenticated |
| Integrations | `/api/integrations`, `/api/integrations/booking-bridge` | Integration suites, booking bridge | Authenticated |
| Admin | `/api/admin/cleanup-tenants` | Tenant cleanup | Service role |

The public `process-command` route is the most security-sensitive: it is
**anonymous-tolerant** (the widget has no session) but enforces a **dual-key rate
limiter** (15/60s per-IP + 200/60s per-tenant via the `check_rate_limit` RPC) and a
**restricted anon allowlist** — anonymous callers may only trigger `CLIENT_NOP`,
`SYSTEM_HELP`, and `SYSTEM_BOOKING_CAPTURE`; branding/persona/telemetry/integration
execution is blocked for anon. `SYSTEM_BOOKING_CAPTURE` writes a `tenant_appointments`
row with `status: 'LEAD'`. Its CORS `*` is deliberate — rate limiting, not CORS, is the
real boundary.

---


## 3. Complete Tech Stack & Integrations

### 3.1 Runtime & Framework

| Layer | Technology | Version / notes |
|---|---|---|
| Framework | **Next.js** (App Router) | `^16.2.6` — see the version note in §6.2 |
| UI runtime | React / React DOM | `19.2.4` (pinned exactly) |
| Language | TypeScript | `^5`, strict, `noEmit` typecheck gate |
| Styling | Tailwind CSS | `^4.2.4` via `@tailwindcss/postcss`; `postcss ^8.5.12` + `autoprefixer` |
| State | **Zustand** | `^5.0.13` |
| Animation | Framer Motion | `^11.18.2` |
| Charts | Recharts | `^3.8.1` |
| Icons | Lucide React | `^0.468.0` |
| Headless UI | `@headlessui/react` | `^2.2.10` |
| Validation | Zod | `^3.24.1` — the backbone of request/response typing |
| Tests | **Vitest** | `^4.1.6` (node environment) |
| Lint | ESLint + `eslint-config-next` | `9` / `16.2.4`, flat config, core-web-vitals + typescript |
| Test/prod DB client | `pg` | `^8.22.0` (dev) — used by migration verification scripts |
| Env loading | `cross-env`, `dotenv-cli` | Dev ergonomics; `dev` raises heap to 2 GB |

### 3.2 Database, Auth & Realtime

- **Supabase Postgres** — the system of record.
- **Supabase Auth** — session management via `@supabase/ssr` (canonical clients:
  `src/lib/supabase/{client,server,admin}.ts`). Service-role access goes through
  `supabaseAdmin`.
- **Supabase Realtime** — powers the live-intervene chat channel
  (`supabase_realtime` WebSockets), with a channel lifecycle teardown pattern and
  exponential-backoff reconnection (`src/lib/chat/reconnect.ts`) to prevent
  socket collisions and `TIMED_OUT` errors on re-render.
- **Supabase Storage** — brand logos and widget assets in dedicated buckets
  (`brand-logos`, `widget-assets`).

### 3.3 AI Inference Partners

The platform's **only** inference provider is **Groq**, accessed via the official
`groq-sdk` (`^1.1.2`) and keyed by `GROQ_API_KEY`. Groq supplies all three AI
modalities used in the pipeline:

| Capability | Groq model (as configured) | Where used |
|---|---|---|
| **STT** (speech-to-text) | Whisper (Whisper-v3), tenant-scoped vocabulary boost | `/api/client/stt`, `/api/ai/stt` |
| **LLM** (structured command parsing, RAG answers) | Llama-3.1 family | `/api/client/process-command`, `/api/ai/process-command`, `src/lib/ai/*` |
| **TTS** (speech synthesis) | Orpheus English TTS, "Hannah" voice | `/api/ai/speech`, `src/lib/ai/tts-cache.ts` |

`src/core/widget/groq/` holds the streaming chat client (`client.ts`,
`unified-stream.ts`) used by the widget. A `ELEVENLABS_API_KEY` is *listed* in
`.env.example` as an optional TTS alternative, but the live code path is Groq/Orpheus;
the widget loader even whitelists `ElevenLabs` asset paths in `middleware.ts`.

### 3.4 Payments

**Paystack** is the payment rail for reseller revenue-share. `src/core/billing/paystack.ts`
and `/api/paystack/initialize` implement the init flow; plan tiers (Standard, Premium,
Enterprise) gate feature access.

### 3.5 Hosting & Configuration

- **Hosting:** the project is built and started with standard `next build` / `next start`
  (or `npm run dev`) and expects Supabase (and optionally Paystack) as managed services.
  There is no container/IaC config in-repo; deployment target is environment-driven.
- **`next.config.ts`:** enables Next Image with `qualities: [75, 100]`.
- **Environment variables** (`.env.example`):
  - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
  - `GROQ_API_KEY`, `ELEVENLABS_API_KEY` (optional)
  - Widget loader additionally reads `NEXT_PUBLIC_APP_URL` / `NEXT_PUBLIC_BASE_URL`.
- **Dev heap:** `npm run dev` sets `NODE_OPTIONS=--max-old-space-size=2048`.

---


## 4. Database & Migration Architecture

Migrations live in `supabase/migrations/` (**43 files**) and follow a
`YYYYMMDDNNNNNN_description.sql` convention (12 files were renamed to this convention
in the working tree). They are applied via `supabase db reset` locally / in CI, or
pushed individually by the helper scripts in `scripts/push_migration_*.mjs` against a
live database.

### 4.1 Core Tables

**`tenants`** — one row per client. The central entity.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | Referenced by all tenant-scoped tables |
| `tenant_id` | TEXT UNIQUE | Public slug (the `{tenantId}` in `/widget/[tenantId]`) |
| `name` | TEXT | Client business name |
| `reseller_id` | UUID FK → `resellers(id)` | Owning reseller — the isolation anchor |
| `branding_color` | TEXT (legacy) | Backfilled from `branding_bag`; still present, see §4.6 |
| `voice_id`, `system_prompt` | TEXT | Persona/voice config |
| `industry` | TEXT | CHECK-constrained (uppercase values after `20260918000001`) |
| `is_active` | BOOLEAN | Soft-delete / visibility |
| `category`, `mobile_number`, `website_url`, `pricing_tier_key` | TEXT | Added by `20260918000001` |
| `show_ovg_branding` | BOOLEAN | Whether OVG branding shows on widget |
| `branding_colors` | JSONB | `{ primary, secondary }` — current branding home |
| `custom_assets` | JSONB | Header/footer URLs, etc. |

**`resellers`** — partner/tenant-owner. Branding now lives in JSONB columns
(`branding`, `branding_colors`, `branding_assets`); the legacy scalar
`branding_color`/`accent_color` and `version_stamp` are **absent in the live DB** (see
§4.6). Has `owner_email` (standardized by `20240618`) and a `slug` (added by `013`).

**`user_resellers`** — the junction table that binds an authenticated `auth.uid()` to a
`reseller_id`. This is the single table every RLS policy joins through.

### 4.2 Memory Tables (AI "Humanistic Memory")

**`client_memories`** (`20260716000002`) — relational memory for **authenticated**
clients, keyed per `(tenant_id, client_id, memory_key)`. The `UNIQUE` constraint makes
upserts idempotent (one row per fact). `client_id` ties to the active user session.

**`visitor_memories`** (`20260720000001`) — relational memory for **anonymous** widget
visitors, keyed to a self-reported contact: `(tenant_id, identity_type, identity_value,
memory_key)` where `identity_type ∈ {phone, email}`. Phone values are normalized
digits-only; email values are lowercased/trimmed. `last_seen_at` drives retention.

These two tables give the AI concierge persistence: *who she is* comes from the tenant
row; *who she is talking to* comes from here.

### 4.3 Other Notable Tables

| Table | Purpose |
|---|---|
| `chat_messages` | Live-chat transcript (sender, role, conversation scoping) |
| `conversation_mute_state` | Per-conversation AI-mute / human-takeover / scheduled re-enable state |
| `conversation_read_state` | Unread tracking for the live-chat inbox |
| `action_logs` | Audit trail of AI + human actions (extended with source/scope) |
| `tenant_knowledge` | Per-tenant knowledge-base entries (RAG source) |
| `tenant_voice_sessions` | Per-STT-session log: duration, provider, transcript, `latency_ms` |
| `tenant_appointments` | Leads/bookings (status `LEAD`, indexed) |
| `system_tasks` | Headless orchestrator queue (`SYSTEM_EXECUTE_BUILD`, `SYSTEM_SYNC_CRM`, …) |
| `tenant_logs`, `intent_alerts`, `vehicles` | Operational/alerting/domain extras |
| `rate_limits` | Fixed-window counters backing the `check_rate_limit` RPC |

### 4.4 RPC / Function Inventory

| Function | Kind | Purpose |
|---|---|---|
| `sync_reseller_branding(p_tenant_id, …)` | `SECURITY DEFINER` | **Atomic branding commit** — locks the `resellers` row, writes the `branding` JSONB, returns a diff. Redefined by `20260717` to drop `version_stamp`/`branding_bag`; `20260727` added a lock timeout. |
| `get_public_widget_config(p_tenant_id TEXT)` | `SECURITY DEFINER`, SQL | The **public projection** for anonymous widget visitors. Returns **only** the `branding` and `suggestedActions` subtrees of `widget_config` — never PII, secrets, or AI prompts. This is why the widget works without a session. |
| `check_rate_limit(p_key, p_max, …)` | `SECURITY DEFINER` | Fixed-window atomic upsert counter (per-IP and per-tenant keys). |
| `update_tenant_config_with_greeting(p_tenant_id, p_config_patch, …)` | `SECURITY DEFINER` | Atomically updates `widget_config` **and** generates the AI greeting. |
| `reserve_booking_slot(p_tenant_id, p_slot_id, …)` | `SECURITY DEFINER` | Booking-bridge slot reservation (migration `012`). |
| `cleanup_expired_visitor_memories(p_retention_days = 365)` | `SECURITY DEFINER` | Retention sweep deleting `visitor_memories` rows whose `last_seen_at` is older than the window; returns deleted count. Invoked periodically or opportunistically. |
| `set_*_updated_at()` + `trg_*` triggers | Trigger | Maintain `updated_at` on every mutable table (see §4.7). |



### 4.5 Row Level Security Model

RLS is the **primary** isolation mechanism, and every tenant-scoped policy resolves
"does this user own this tenant?" through the `user_resellers` junction:

```sql
tenant_id IN (
  SELECT t.id FROM tenants t
  JOIN user_resellers ur ON ur.reseller_id = t.reseller_id
  WHERE ur.user_id = auth.uid()
)
```

Representative policies:

- `tenants` → `resellers_access_own_tenants` (`20240502000001`).
- `user_resellers` → `users_access_own_reseller_relationships` (`auth.uid() = user_id`).
- `client_memories` / `tenant_knowledge` → a `SELECT` policy plus an `ALL` policy that
  enforces ownership in **both** `USING` and `WITH CHECK`, so a user can never write a
  row into another tenant.
- `chat_messages` → read-own-tenant + insert-as-self.
- `action_logs` → insert for own tenant (`20240617`) **and** a read policy
  (`20260709000002`) added specifically so the client dashboard telemetry can render
  (without it, RLS silently denied the query).
- `system_tasks` → service-role only.
- `tenant_voice_sessions` → read-own-tenant; writes go through `supabaseAdmin` in the
  STT route, so the policy is defense-in-depth, not the primary guard.

**Storage note:** explicit RLS policies on `storage.objects` are intentionally omitted
in the bucket migrations (`20260713`, `20260727000002`) because in current Supabase
`storage.objects` is owned by `supabase_storage_admin`, so `ALTER`/`CREATE POLICY` fails
with *"must be owner of table objects"*. Deep storage hardening would be a
superuser-only SQL-Editor task.

### 4.6 Branding: Current vs. Legacy Model (Live Drift)

This is the single largest source of confusion in the schema, and
`PROJECT_STATUS.md` flags it explicitly:

- The **original** design stored branding in `branding_bag` with a `version_stamp`
  optimistic-lock counter.
- On the **live dev DB those columns are absent.** Migration
  `20260717_strip_version_stamp_from_sync_reseller_branding.sql` redefined the RPC to
  drop `version_stamp`/`branding_bag` and write the `resellers.branding` JSONB
  (`{primary, secondary, logo}`) instead. `20260929000001_add_reseller_branding_columns.sql`
  (untracked at the time of writing) re-adds branding columns.
- **Actionable takeaway:** do **not** assume the legacy scalar columns exist. Either the
  missing migrations are applied, or the code must be rewritten to read the JSONB
  columns. Several modules (`TenantRegistryTable.tsx`, `reseller-provider.tsx`,
  `src/types/database.ts`) still select `branding_color`/`accent_color`/`version_stamp`
  and will error against the live DB until reconciled.

The atomic commit flow, as it actually behaves live: **read** the `branding` JSONB →
**lock** with `SELECT … FOR UPDATE` (with a lock timeout) → **write** the new JSONB →
**resolve** (return a diff for UI reconciliation on conflict). There is no version-stamp
increment in the live path.

### 4.7 Timestamp Migration Rules

Postgres has no native `ON UPDATE` for `TIMESTAMP` columns, so this codebase uses a
consistent, repeated pattern on every mutable table:

1. Declare the column as
   `TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())`.
2. Create a trigger function that sets `NEW.updated_at = timezone('utc'::text, now())`.
3. Attach a `BEFORE UPDATE … FOR EACH ROW` trigger (dropped-and-recreated idempotently).

Applied to `client_memories`, `visitor_memories`, `tenant_knowledge`, and others.
Everything is stored in **UTC**. The one deliberate exception is
`tenant_voice_sessions`, which is an **immutable, insert-only log** — it has **no**
`updated_at` and no trigger, because a session is final once terminal.

### 4.8 ⚠️ Corrupted Migration (Action Required)

`supabase/migrations/20260923000001_create_tenant_voice_sessions.sql` is
**corrupted and will break `supabase db reset` in CI.** The file is ~485 lines:

- **Lines 1–33:** valid SQL (`CREATE TABLE tenant_voice_sessions …`).
- **Line 34 onward:** a pasted AI chat transcript (starting with a literal `Plan`
  heading and prose about "the migration file is at…") occupies roughly lines 34–685.
- **Line 686:** valid SQL resumes (`ALTER TABLE … ENABLE ROW LEVEL SECURITY`).
- **Line 689:** `CREATE POLICY "users_read_own_tenant_voice_sessions"` …

Until the transcript block is excised, `supabase db reset` / `db push` will fail on
this file. The table is also **untracked in git**, so it has not been committed. (Per
this task's constraints, it is documented here but **not** modified.)

---


## 5. Critical User & Voice Workflows

### 5.1 Widget Embedding

A client embeds the chat widget by pasting a single `<script>` tag that points at the
platform's loader endpoint. No build step, no npm package.

**Step 1 — The loader** (`GET /widget/embed?tenant={tenantId}`) returns a small IIFE
that:
1. Creates a `<div id="ovg-widget-root">` and appends it to `<body>`.
2. Creates an `<iframe src="{APP_URL}/widget/{tenantId}">` styled `position: fixed`,
   bottom-right, 450×700, `z-index: 999999`.
3. Sets `iframe.allow = "microphone"` — **required**, since the widget does STT in-page.
4. Listens for `postMessage` events of type `ovg-widget-resize` and resizes the iframe
   (the bubble/panel toggle in `PodBubble`/`ChatPanel` drives this).

The loader responds with `Content-Type: application/javascript`,
`Cache-Control: public, max-age=3600`, and `Access-Control-Allow-Origin: *` — it is
public, cacheable, and CORS-open by design. If `tenant` is missing, it returns a JS
snippet that merely logs a console error rather than throwing, so the host page never
breaks.

**Step 2 — The widget page** (`/widget/[tenantId]`) is a Server Component that:
1. Calls `getPublicWidgetConfig(tenantId)` (the `SECURITY DEFINER` RPC) — anonymous
   visitors have no session, so the anon Supabase client cannot read `tenants` directly.
2. Calls `notFound()` on an unknown slug (a 404 rather than a blank widget).
3. Runs `migrateLegacyBranding()` to normalize legacy config into the canonical shape.
4. Renders `<TenantProvider>` → `<WidgetPresence>` (tenant presence/typing signal) +
   `<ChatWidget>` with `branding`, `widgetPosition`, `suggestedActions`, `greeting`, and
   `features`.

It exports `revalidate = 0` **and** `dynamic = "force-dynamic"` deliberately: without
both, Next.js may cache the page at the edge and visitors would keep seeing stale
branding after a reseller saves a change.

### 5.2 The Voice Orchestration Pipeline

`src/hooks/useZeederVoice.ts` is the bridge between the browser microphone and the
Zeeder client state machine. The full round trip:

```
PTT button / keyboard
  → startListening()                    MediaRecorder opens mic (15s cap)
  → assertPreTranscodeValid(blob)       pre-network guard (see below)
  → transcodeBlobToWav(blob)            WebM/Opus → 16-bit PCM WAV
  → POST /api/client/stt               server-side Groq Whisper, tenant vocabulary boost
  → POST /api/client/process-command   intent resolution → typed actionType
  → ACTION_TYPE_TO_ZEEDER_ID           map server actionType → ZeederActionId
  → ZeederContext.dispatch(action)      local state machine executes
  → TTS confirmation                    Groq Orpheus reads the result aloud
```

**The pre-transcode guard** is the most important defensive detail. Before any decode
or network call, `assertPreTranscodeValid` rejects empty, sub-threshold, or non-audio
blobs, throwing a typed `TranscodeError`. The thresholds are a **combined** guard:

- duration **≥ 400 ms** (tracked via `recordingStartTimeRef`), **and**
- blob size **≥ 1024 bytes**.

This is what makes an accidental tap harmless: a 100 ms tap fails the guard, produces a
short inline "hold the button longer" hint, and **never** reaches the transcoder, the
network, or the LLM.

**Fallback semantics matter here.** A *guard rejection* is **not** a fallback case. Only
a *genuine* STT/codec failure falls back transparently to the device Web Speech API
(`webkitSpeechRecognition`), which sets a `sttFallback` indicator. If guard rejections
also triggered fallback, every tap would start a bogus recognition session.

**Pointer-capture hardening** (touch devices): `touch-action: none`,
`setPointerCapture`/`releasePointerCapture` so a hold survives a finger drag,
`onPointerCancel` for graceful cancel, and `e.preventDefault()` to suppress synthetic
mouse events. Keyboard shortcuts (spacebar) are independent of the button's local PTT
state, and global `isListening` never overrides the button's own state.

**Diagnostics:** every STT failure passes through `describeSttError(err)`, which always
returns a fully-enumerable object with explicit `name`/`message`/`stack` (plus `code`
for a `TranscodeError`) or a `rawError` field. Spreading a raw thrown `Error` loses
non-enumerable fields and prints `{}`, which is precisely the "silent failure" this
guards against.

**TTS normalization:** `normalizeTextForTTS()` rewrites South African Rand amounts
(`"R3,250"`, `"R39"`) into `"3250 Rands"` so the synthesizer pronounces them naturally.



### 5.3 Deterministic Routing via `client-routes.ts`

`src/lib/voice/client-routes.ts` is the **single source of truth** for where a spoken
command can navigate. It is 269 lines and is a **pure leaf module**: no imports, no
React, no server-only code — because it is consumed *both* by the server route
(`/api/client/process-command`) *and* by the `'use client'` voice hook. It must stay
isomorphic.

**Why it exists.** The four Studio viewports are *sibling routes under one layout*
(`src/app/client/dashboard/studio/layout.tsx` derives the active card by exact
`usePathname()` equality). Before this module, those paths were hardcoded —
inconsistently — in half a dozen files, so a command whose target got dropped
mid-pipeline silently fell back to a hardcoded Branding default. A stale path is not a
soft failure: `router.push('/client/knowledge')` renders a **404**, so the module never
emits a path it cannot justify.

**Exports:**

- `CLIENT_STUDIO_BASE = '/client/dashboard/studio'`
- `CLIENT_STUDIO_TABS = ['branding', 'persona', 'knowledge', 'integrations']`
- `clientStudioHref(tab)` → the routable href
- `isClientStudioTab(value)` → type guard for **untrusted** JSON payloads
- `hasNavigationIntent(text)` → does the utterance contain a navigation verb?
- `resolveClientStudioTab(text)` → which viewport is being asked for?

**Design decisions worth preserving:**

- `analytics` is **intentionally absent** — there is no analytics page, so that request
  must be answered by the telemetry *action*, not a navigation. Adding a tab here
  without a matching `page.tsx` would turn a voice command into a 404.
- `hasNavigationIntent` deliberately **excludes mutation verbs** ("update", "change",
  "set", "apply"). "update my branding" is a `SYSTEM_UPDATE_BRANDING` command, not a
  request to navigate; hijacking it would break the branding-edit flow.
- Collision resolution in `resolveClientStudioTab`, in priority order:
  1. **Phrase beats prefix** — "knowledge base" wins over "knowledge"; "visual
     identity" is claimed by branding before persona-only "voice"/"personality" words.
  2. **Bare words must not match inside longer words** — "brand" does not match inside
     "branding", "art" does not match inside "articles" (character-boundary check).
  3. **Negations are exclusions, not preferences** — in "go to the knowledge page,
     **not** the branding", the object of the verb is knowledge. A negated keyword is
     dropped whenever a non-negated one survives. (An earlier "later match wins"
     heuristic got this backwards and navigated users to the page they had just said
     they did *not* want.)
  4. **Earliest surviving match wins**; ties at the same index prefer the longer phrase.

  *Documented known limitation:* negation is only detected when the cue directly
  precedes the keyword, so "don't take me to branding, take me to knowledge" is not
  disambiguated. The module explicitly judges a full negation parser unwarranted for a
  voice route hint.

**Action mapping.** On the client, `useZeederVoice`'s `ACTION_TYPE_TO_ZEEDER_ID` maps
the server's `actionType` to a `ZeederActionId`:

| `actionType` (server) | `ZeederActionId` (client) |
|---|---|
| `SYSTEM_UPDATE_BRANDING` | `updateBranding` |
| `SYSTEM_UPDATE_PERSONA` | `ai_update_persona` |
| `SYSTEM_MANAGE_MEMORY` | `ai_manage_memory` |
| `SYSTEM_PUBLISH_DRAFT` | `ai_publish_studio_draft` |
| `SYSTEM_TELEMETRY` | `fetchTelemetry` |
| `SYSTEM_TOGGLE_AGENT` | `toggleAgent` |
| `SYSTEM_NAVIGATE` | `navigate` |

Anything not in this map (`SYSTEM_HELP`, `CLIENT_NOP`) is treated as a conversational
success — it logs and resets state without error. On the server, intent **precedence**
is itself ordered: commit `603ed57` reordered precedence so **KB RAG informational
queries outrank static help**, so "what is smart booking?" is answered from the
knowledge base rather than dumped into the help modal.

### 5.4 Live Intervene & Human Handoff

The platform can hand a live conversation from the AI to a human and back, driven by
`conversation_mute_state` and a Supabase Realtime channel.

- **State model** (`src/lib/chat/mute-state.ts` → `applyMuteState`): per `conversation_id`,
  an upserted row carries `is_ai_muted`, `is_human_taking_over`, `human_agent_id`,
  `handover_initiated_at`, `auto_reenable_ai`, `reenable_after_minutes` (default 30),
  and `scheduled_reenable_at`. This is what the UI badge states
  ("Owner speaking" / "AI paused") render from.
- **Realtime transport:** `LiveChatInbox.tsx` streams messages over
  `supabase_realtime`. The documented channel lifecycle pattern is *explicit teardown
  before re-subscribe* (`supabase.removeChannel(...)`, then
  `supabase.realtime.disconnect()`), with exponential-backoff reconnection in
  `src/lib/chat/reconnect.ts`. Without this, re-renders produce socket collisions and
  `TIMED_OUT` errors.
- **Resume** (`POST /api/widget/chat/resume`): resolves the tenant, **verifies the
  conversation actually belongs to that tenant** (403 otherwise), and clears mute +
  human-takeover. It validates `conversationId` as a UUID and rejects unknown tenants
  with a 404.
- **Read state** (`conversation_read_state`) drives unread badges in the inbox.

### 5.5 End-to-End Voice + Memory Loop

Putting §4.2 and §5.2 together, the concierge's memory behaviour is:

1. Inbound message → `process-command` resolves intent and reads
   `getClientMemories` (authenticated) or `getVisitorMemories` (anonymous, keyed by
   normalized phone/email).
2. `extractAndStoreMemories` / `extractAndStoreVisitorMemories` persist new facts;
   `touchVisitorMemory` refreshes `last_seen_at` on a returning visitor.
3. `normalizeVisitorPhone` canonicalizes the identity so differently-formatted numbers
   resolve to the same memory row.
4. Retention is enforced by `cleanup_expired_visitor_memories` (12-month default) and
   exposed via the `/api/cron/cleanup-memories` route.

---


## 6. Development Standards & Agent Execution Rules

### 6.1 Quality Benchmarks (`.clinerules`)

The repository's `AGENTS.md` (which `CLAUDE.md` simply `@`-includes) states a
"production excellence" bar. The binding rules:

**General**
- Production-excellence grade only — no quick fixes or sloppy logic.
- Prefer modular, scalable components **under 300 lines**.
- **Strict TypeScript**; avoid `any` at all costs.

**State & React hooks**
- **Never** call `setState` synchronously inside an effect body (prevents cascading
  renders).
- All functions passed to `useEffect` or as props **must** be wrapped in `useCallback`.
- Every `useEffect` and `useCallback` needs a **complete** dependency array.

**Performance & Next.js**
- Use the Next.js `<Image />` component, never a native `<img>`.
- Optimize components for Core Web Vitals.

**Error handling & logging**
- Prefix unused catch variables with an underscore (`_err`); this matches the ESLint
  `argsIgnorePattern`/`varsIgnorePattern` of `^_` in `eslint.config.mjs`.
- No `console.log` statements left in production code.

**Hardware lifecycle**
- All WebAudio / MediaStream access must be triggered **only within an explicit user
  gesture** (`onClick`). Never initialize an `AudioContext` or `MediaRecorder` in a
  `useEffect` or async callback chain — browsers block it as autoplay.
- Distinguish **hardware cleanup** (closing mics/streams) from **lifecycle cleanup**
  (closing audio contexts). Never call `.close()`/`.pause()` on a shared persistent
  resource (e.g. a global `AudioContext`) from a per-pipeline cleanup function.
- Every async request must be paired with `try…finally` so state flags (`isProcessing`,
  `isSpeaking`) reset to idle **regardless** of success or failure. No implicit
  "loading"/"busy" states.

**Verification workflow**
- After **every** file modification, run `npm run lint` on the affected file and
  self-correct any failure before reporting completion.

### 6.2 The "This Is NOT the Next.js You Know" Rule

`AGENTS.md` opens with a prominent warning: this Next.js version has breaking changes,
so **read the relevant guide in `node_modules/next/dist/docs/` before writing any
code**, and heed deprecation notices. The repo is on Next `^16.2.6` with
`eslint-config-next@16.2.4` — do not write App Router code from memory of older
versions.

### 6.3 Test Suite

- **Runner:** Vitest 4, configured in `vitest.config.ts` with
  `include: ['src/**/*.test.ts']`, `environment: 'node'`, and a `@` → `./src` alias.
- **Topology:** **30 test files** across the tree, colocated in `__tests__/` folders
  next to their subjects. Coverage areas include:
  - AI: `intent-mapper`, `cognitive-orchestrator`, `apply-vibe`
  - Voice: `transcoder`, `stt-client`, `client-routes`, `parse-voice-entry`,
    `voice-logger`
  - API routes: `ai/create-client`, `ai/process-command`, `client/process-command`,
    `client/stt`, `reseller/tenant-knowledge`
  - Schemas/services: `client-config.schema`, `tenant-config.schema`,
    `tenant-config.service`
  - Support: `chat/reconnect`, `audit/parity.audit`, `migrations/transform`,
    `utils/deep-merge`, `telemetry/feed`, `colors`, `auth/auth-errors`
  - Reseller: client-creation `vibe-gating` + four tenant-knowledge suites
- **Commands:** `npm test` (vitest run), `npm run typecheck` (`tsc --noEmit`),
  `npm run lint` (eslint).
- **Reported status:** `PROJECT_STATUS.md` records **301/301 tests passing across 18
  files**, 0 TypeScript errors, 0 lint errors/warnings, and 48/48 routes building. Treat
  these as *as-documented* figures from a 2026-09-15 audit; re-run the suite to confirm
  current state rather than assuming they still hold.

### 6.4 CI Workflows

**`.github/workflows/zeeder-ci.yml`** — runs on push/PR to `main` and `develop`:
`npm ci` → `supabase start` (local stack) → `supabase db reset` (verifies the
migrations actually apply) → `npm test` → `npm run build`. Because it runs
`supabase db reset`, it will fail on the corrupted migration described in §4.8.

**`.github/workflows/live-curl.yml`** — exercises the live deployment with `curl`.
It deliberately **fails closed**: if `CI_GROQ_API_KEY` is absent it aborts rather than
silently testing the local fallback, so the CHAT / BOOK / HELP scenarios always
exercise the real LLM path. It also runs a CORS-preflight scenario and a BOOK-as-LEAD
scenario that reads the inserted row back via `CI_SUPABASE_DB_URL`. Migration `012`
(booking schema) is intentionally never applied in this workflow.

### 6.5 Git Workflow Constraints

- Work on `main` / `develop`; both are CI-gated on every push and PR.
- **Migrations are versioned and ordered** — never edit an already-applied migration to
  fix behaviour; add a new one. The `sync_reseller_branding` RPC was redefined twice
  (`20260717`, `20260727`) rather than edited.
- Store-bucket and RLS migrations must tolerate re-running (`IF NOT EXISTS` /
  `DROP POLICY IF EXISTS` before `CREATE POLICY`).
- Live-DB verification is done by reading the database directly, and the results are
  recorded in code comments — the branding drift in §4.6 is a live-verified finding,
  not a guess.
- A repository-level agent directive governs this documentation task: **do not modify
  core application or migration code, and do not run `git push`.**

---


## Appendix A — Known Defects & Documentation Drift

Recorded here rather than fixed, since the current task is documentation-only.

| # | Issue | Location | Impact |
|---|---|---|---|
| 1 | **Corrupted migration** — a pasted AI chat transcript occupies ~lines 34–685 of the file, splitting the `CREATE TABLE` from its RLS policy. Untracked in git. | `supabase/migrations/20260923000001_create_tenant_voice_sessions.sql` | `supabase db reset` / `db push` will fail; **breaks `zeeder-ci.yml`** |
| 2 | **Branding column drift** — code still selects legacy `branding_color` / `accent_color` / `version_stamp`, which are absent from the live DB (branding now lives in JSONB). | `TenantRegistryTable.tsx`, `reseller-provider.tsx`, `src/types/database.ts` | Those queries error against the live database until reconciled |
| 3 | **Oversized module** — `useZeederVoice.ts` is **918 lines**, well over the `.clinerules` 300-line ceiling. | `src/hooks/useZeederVoice.ts` | Maintainability; consider extracting the capture/transcode/TTS concerns into `src/lib/voice/*` leaf modules |
| 4 | **Legacy footer artifact** — `tenants.branding_color` is described as "backfilled from `branding_bag`" while `branding_bag` itself no longer exists. | `tenants` table | Cosmetic/confusing; a candidate for a future cleanup migration |
| 5 | **Stale docs at repo root** — many ad-hoc root files (`build.log`, `lint_output.txt`, `fix_rls_complete.sql`, `any_errors.txt`, …) are scratch artifacts, not documentation. | repo root | Noise; consider a `.gitignore` / cleanup pass |

**Resolved (2026-09-29):** Both `20260923000001_create_tenant_voice_sessions.sql` and
`20260702000001_add_reseller_branding_columns.sql` are now fully repaired, tracked in
`supabase_migrations.schema_migrations`, and deployed to the linked remote database.
`npx supabase db push --linked --include-all` reports **"Remote database is up to date"**.
The voice-sessions migration was rewritten as idempotent DDL (`CREATE TABLE IF NOT EXISTS`,
`CREATE INDEX IF NOT EXISTS`, `DROP POLICY IF EXISTS` before `CREATE POLICY`); the branding
columns migration was renamed from `20260929000001_` to `20260702000001_` so its DDL runs
before dependent function migrations in July 2026, and now carries all three JSONB columns
(`branding`, `branding_colors`, `branding_assets`). Both are re-runnable and safe to apply
against an already-populated remote schema.

**Documentation drift resolved by this file:** `README.md` and `docs/ARCHITECTURE.md`
both describe the original `branding_bag` + `version_stamp` atomic-commit design.
§4.6 documents what the live database actually does.

---

## Appendix B — Source of Truth Index

| Question | Authoritative file |
|---|---|
| What is the client-reseller boundary? | `AGENTS.md` (scope-boundary rules) |
| Where can a voice command navigate? | `src/lib/voice/client-routes.ts` |
| What actions can the Zeeder surface execute? | `src/lib/zeeder/action-registry.ts` |
| What commands exist, and in which scope? | `src/lib/audit/command-types.ts` + `feature-registry.ts` |
| How does a command reach the database? | `src/lib/audit/command-dispatcher.ts` |
| What can anonymous visitors do? | `src/app/api/client/process-command/route.ts` (anon allowlist + dual-key rate limit) |
| What does a visitor's widget expose publicly? | `get_public_widget_config` RPC (`20260718000002`) |
| How is branding committed atomically? | `sync_reseller_branding` RPC (`20260717`, `20260727`) |
| How does live takeover work? | `src/lib/chat/mute-state.ts` + `/api/widget/chat/resume` |
| How is voice audio validated? | `src/lib/voice/transcoder.ts` + `useZeederVoice` pre-transcode guard |
| What AI models are in use? | `.env.example` + `src/core/widget/groq/` + `src/lib/ai/config.ts` |
| What are the code-quality rules? | `.clinerules` / `AGENTS.md` |
| What gates CI? | `.github/workflows/zeeder-ci.yml`, `live-curl.yml` |

---

*End of `docs/PROJECT_OVERVIEW.md`.*

