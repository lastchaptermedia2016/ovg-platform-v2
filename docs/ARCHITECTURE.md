# OVG-Platform-V2 Architecture Documentation

## System Overview

OVG-Platform-V2 is a high-performance, multi-tenant SaaS platform designed for **Production Excellence**. It enables a white-labeled reseller model where partners can manage their own clients, branding, and revenue streams with total isolation.

---

## Core Architectural Stack

| Layer | Technology | Version |
|-------|------------|---------|
| Framework | Next.js (App Router) | ^16.2.6 |
| Database & Auth | Supabase (PostgreSQL) | Latest |
| Styling | Tailwind CSS | v4 |
| Payments | Paystack | — |
| AI / LLM | Groq (Whisper-v3, Orpheus, Llama-3.1) | — |
| State Management | Zustand | — |
| Animation | Framer Motion | — |
| Language | TypeScript | 5.x |

---

## System Capabilities (Production)

### 1. Live Intervene & Human Handoff System
Real-time WebSocket synchronization (`supabase_realtime`) with instant AI pause/resume, dynamic badge state indicators (`Owner speaking` / `AI paused`), and Live Chat Inbox intervention controls.

**Key Components:**
- `LiveChatInbox.tsx` — Real-time conversation view with message streaming
- `useTenantKnowledge` / `useTenantKnowledgeList` — Realtime hooks for chat messages
- WebSocket lifecycle: automatic reconnection with exponential backoff
- Channel deduplication: prevents `TIMED_OUT` errors during re-renders

### 2. Resilient Realtime Channel Management
Channel lifecycle teardown pattern handling reconnection backoffs, preventing WebSocket socket collisions and `TIMED_OUT` errors during state updates or re-renders.

**Implementation Pattern:**
```typescript
// Before creating new channel - explicit cleanup
if (channelRef.current) {
  supabase.removeChannel(channelRef.current);
  channelRef.current = null;
}

// Reconnect with socket reset
supabase.realtime.disconnect();
await subscribeToChatMessages();
```

### 3. RAG + LLM Engine
Knowledge Base vector/catalog retrieval with deduplication, structured Groq LLM action parsing, and fallback orchestration.

**Components:**
- `tenant-knowledge-engine.ts` — Knowledge retrieval & filtering
- `tenant-knowledge-client.ts` — Server-side API layer
- Groq Llama-3.1 for structured command parsing
- Fallback to Web Speech API for offline/local processing

### 4. Voice Orchestration & Orpheus TTS
Speech synthesis via Orpheus English TTS model (`hannah`) with sub-1000ms latency and browser audio buffer diagnostics.

**Pipeline:**
1. **Capture**: MediaRecorder API → Audio blobs (WebM)
2. **Validate**: ≥400ms hold, ≥1KB blob size guards
3. **Transcribe**: Groq Whisper-v3 → Text
4. **Process**: Groq Llama-3.1 → Structured commands
5. **Execute**: React state updates → Visual changes
6. **Confirm**: Groq Orpheus → Hannah's voice feedback

---

## Surface Architecture

### Reseller Surface (Dashboard)
```
/app/(dashboard)/reseller/[resellerSlug]/
├── branding/           # Branding Studio
├── clients/            # Client management
├── knowledge/          # Knowledge Base (AI Training Context)
└── ai-engine/          # AI Engine Studio
```

**Key Components:**
- `ResellerKnowledgeManager.tsx` — Tenant selection + knowledge orchestration
- `TenantKnowledgeTable.tsx` — CRUD table with toolbar, list, dialogs
- `ClientBrandingStudio.tsx` — Real-time visual customization
- `AIEngineStudio.tsx` — Voice persona configuration per tenant

### Client Surface (Zeeder Widget)
```
/app/client/
├── studio/             # Branding Studio (client view)
└── dashboard/          # Client dashboard
```

**Key Components:**
- `useZeederVoice.ts` — Zero-dependency voice bridge (client-safe)
- `ClientHelpModal.tsx` — SYSTEM_HELP visual capabilities modal
- `SystemMicButton.tsx` — Push-to-talk with `ClientHelpModal` mounted
- `brandName` resolution: `widget_config.branding.brandName` → "Omniverge Global"

---

## Database Schema (Live-Verified)

> Captured from live dev Supabase database (information_schema + pg_constraint)

### Resellers
```sql
resellers {
  id: uuid (PK)
  tenant_id: uuid (NULL, default gen_random_uuid())
  name: text (NOT NULL)
  slug: text (NOT NULL, unique)
  owner_email: text (unique)
  is_active: boolean (default true)
  status: text (default 'active')
  branding_colors: jsonb (NULL)      # {primary, secondary}
  branding: jsonb (NULL)             # {primary, logo_url, secondary}
  branding_assets: jsonb (NULL)
  settings: jsonb (NULL)
  metadata: jsonb (NULL)
  pricing_tiers: jsonb (NULL)
  stripe_account_id: text (NULL)
  stripe_connect_id: text (NULL)
  stripe_onboarding_complete: boolean (default false)
  logo_url: text (NULL)
  created_at: timestamptz (default now())
}
```

### Tenants (Clients)
```sql
tenants {
  id: uuid (PK)
  tenant_id: text (NOT NULL, unique)
  name: text (NOT NULL)
  branding_color: text (NULL)
  branding_colors: text (NULL)
  voice_id: text (NULL)
  system_prompt: text (NULL)
  is_active: boolean (default true)
  reseller_id: uuid (FK → resellers.id)
  widget_config: jsonb (NULL)
  industry: text (CHECK constraint)
  category: text (default 'GENERAL')
  pricing_tier_key: text (default 'basic')
  custom_assets: jsonb (NULL)
  show_ovg_branding: boolean (default true)
  created_at: timestamptz (default now())
  updated_at: timestamptz (default now())
}
```

### User-Reseller Association
```sql
user_resellers {
  id: uuid (PK)
  user_id: uuid (FK → auth.users.id)
  reseller_id: uuid (FK → resellers.id)
  role: text (default 'admin', CHECK admin|manager|viewer)
  is_primary: boolean (default true)
  created_at: timestamptz (default now())
  updated_at: timestamptz (default now())
}
```

### System Tasks (Migration Exists - Not Applied to Live DB)
```sql
system_tasks {
  id: uuid (PK)
  command: text (NOT NULL)           # SYSTEM_COMMAND
  payload: jsonb
  status: text (default 'PENDING')   # CHECK: PENDING|PROCESSING|COMPLETED|FAILED
  error_log: text
  created_at: timestamptz (default now())
  updated_at: timestamptz (default now())
}
```

### Chat & Voice Tables
```sql
chat_messages {
  id: uuid (PK)
  tenant_id: uuid (FK → tenants.id)
  conversation_id: uuid
  sender_id: text
  message: text
  role: text (visitor|agent|ai)
  created_at: timestamptz
}

conversation_read_state {
  tenant_id: uuid (FK)
  user_id: uuid (FK → auth.users.id)
  conversation_id: uuid
  last_read_at: timestamptz
  updated_at: timestamptz
}

tenant_voice_sessions {
  id: uuid (PK)
  tenant_id: uuid (FK → tenants.id)
  session_token: text (unique)
  started_at: timestamptz
  ended_at: timestamptz (NULL)
  metadata: jsonb
}
```

---

## Security Perimeter

### Two-Step Verification Standard
1. **Canonical server-side authentication** using `supabase.auth.getUser()`
2. **Strict multi-tenant isolation** validation matching `user_id` and `reseller_slug` against `user_resellers` table

### Row Level Security (RLS)
- All tenant tables enforce RLS policies
- Service role bypasses for admin operations
- Anonymous widget endpoint rate-limited via `rate_limits` table + `check_rate_limit` RPC

### Anonymous Public Widget (`/api/client/process-command`)
- Anon callers restricted to `CLIENT_NOP`, `SYSTEM_HELP`, `SYSTEM_BOOKING_CAPTURE`
- Dual-key rate limiter: `t:<tenantId>|ip:<ip>` (15/60s) + `t:<tenantId>` (200/60s)
- Fails **open** on DB error

---

## Phase Implementation Status

| Phase | Description | Status |
|-------|-------------|--------|
| 1 | Canonical Supabase Clients & Import Migration | ✅ Complete |
| 2 | Security Hardening (getUser, admin guards, diagnostics cleanup) | 🏗️ In Progress |
| 3 | Architecture Cleanups (hardcoded slugs, type standards, lint fixes) | 📋 Planned |
| 4 | UI/UX Excellence & Polish (Unified glassmorphism, Knowledge Base cards, dynamic badge transparency, high-contrast status pills) | ✅ Complete |
| 5 | Voice Pipeline & Database Schemas (`tenant_voice_sessions` schema active; `useZeederVoice` orchestration ready) | 🟢 Green-Gated / In Progress |

---

## Verification & Build Commands

```bash
# Code Quality Verification
npx eslint .
npx tsc --noEmit
npm run test
npm run build
```

### Local Development
```bash
npm run dev        # Start dev server on http://localhost:3000
npm run build      # Production build
npm run start      # Start production server
npm run lint       # Run ESLint
npm run lint:fix   # Auto-fix lint issues
npm test           # Run all Vitest test suites
npm run typecheck  # Type-check with tsc --noEmit
```

---

## Key Implementation Details

### Atomic Branding Commit
The `sync_reseller_branding` RPC commits branding atomically via `SELECT...FOR UPDATE` on the `resellers.branding` JSONB column. Legacy `version_stamp`/`branding_bag` columns were dropped in migration `20260717_strip_version_stamp_from_sync_reseller_branding.sql`.

### Unified Data Access Layer (DAL)
Client deletion logic centralized in `src/lib/db/reseller-clients.ts` via `deleteResellerClients` and `deleteResellerTenant` helpers, embedding cryptographic `reseller_id` isolation directly into database mutations.

### AI Audit Logging
Bulk/single `SYSTEM_UPDATE_BRANDING` config writes from `process-command` are audited to `action_logs` (`source='hannah'`) via the authenticated client, mirroring the human save path.

---

## Design System

| Token | Value | Usage |
|-------|-------|-------|
| Primary | #0097b2 (Electric Blue) | Primary actions, links, focus rings |
| Secondary | #226683 (Deep Blue) | Secondary actions, borders |
| Accent | #D4AF37 (Gold) | Highlights, voice states |
| Glass | `backdrop-blur-xl` with rgba | Cards, modals, overlays |
| Font | Inter | All text |

---

## Project Structure

```
ovg-platform-v2/
├── src/
│   ├── app/
│   │   ├── (auth)/           # Authentication pages
│   │   ├── (dashboard)/      # Dashboard layouts & pages
│   │   └── api/              # API route handlers
│   ├── components/
│   │   ├── reseller/         # Reseller-facing components
│   │   ├── client/           # Zeeder Client surface
│   │   └── ui/zeeder/        # Voice UI components
│   ├── contexts/             # React context providers
│   ├── core/                 # Domain logic & DB access
│   ├── features/             # Feature modules
│   ├── hooks/                # Custom React hooks
│   ├── lib/
│   │   ├── supabase/         # Canonical Supabase clients
│   │   ├── audit/            # AI capability registry
│   │   ├── orchestrator/     # Async command workers
│   │   └── rate-limit/       # Rate limiting
│   ├── providers/            # Provider components
│   ├── store/                # Zustand stores
│   ├── types/                # TypeScript types & Zod schemas
│   └── utils/                # Utility functions
├── supabase/
│   ├── migrations/           # Database migrations
│   └── seeds/                # Seed data scripts
├── docs/                     # Documentation
├── public/                   # Static assets
├── middleware.ts             # Next.js middleware (auth guard)
├── next.config.ts            # Next.js configuration
├── tailwind.config.ts        # Tailwind CSS v4 configuration
├── eslint.config.mjs         # ESLint flat config
└── tsconfig.json             # TypeScript configuration
```