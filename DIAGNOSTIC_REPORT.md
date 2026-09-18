# Diagnostic Findings Report: "Create Client" Onboarding System

**Date:** 2026-09-18
**Scope:** Root-cause investigation across database schema, API handlers, wizard state machine, and AI extraction layers. Read-only — no code or database changes applied.

---

## 1. Database Schema vs. Code Alignment

### 1.1 `tenants` Table Column Origin Map

| Column | Source Migration | Exists If `20260918000001` Did NOT Run? |
|---|---|---|
| `id` | `001_create_tenants_table.sql` | Yes |
| `tenant_id` | `001_create_tenants_table.sql` | Yes |
| `name` | `001_create_tenants_table.sql` | Yes |
| `branding_color` | `001_create_tenants_table.sql` | Yes |
| `voice_id` | `001_create_tenants_table.sql` | Yes |
| `system_prompt` | `001_create_tenants_table.sql` | Yes |
| `created_at` | `001_create_tenants_table.sql` | Yes |
| `updated_at` | `001_create_tenants_table.sql` | Yes |
| `reseller_id` | `002_create_resellers_table.sql:28` | Yes (if 002 ran) |
| `industry` | `20260722000001_add_industry_to_tenants.sql:6` | Yes (if 20260722 ran) |
| `email` | `007_add_tenant_signal_columns.sql:8` | Yes (if 007 ran) |
| `category` | `20260918000001_add_missing_tenant_columns.sql:10` | **NO** |
| `mobile_number` | `20260918000001:14` | **NO** |
| `website_url` | `20260918000001:18` | **NO** |
| `is_active` | `20260918000001:6` | **NO** |
| `show_ovg_branding` | `20260918000001:22` | **NO** |
| `pricing_tier_key` | `20260918000001:26` | **NO** |
| `custom_assets` | `20260918000001:30` | **NO** |
| `branding_colors` | `20260918000001:37` | **NO** |

### 1.2 Create Client Insert Payload vs. Schema

**File:** `src/app/api/ai/create-client/route.ts:294-310`

The insert payload sends 15 columns to `tenants`. If migration `20260918000001` did not execute, **8 columns are missing**: `category`, `mobile_number`, `website_url`, `is_active`, `show_ovg_branding`, `pricing_tier_key`, `custom_assets`, `branding_colors`.

Each missing column triggers a **PostgREST 42703** (`undefined_column`) error, caught at line 323-338 and surfaced as a generic HTTP 500.

### 1.3 Industry CHECK Constraint Mismatch

**Original constraint** (`supabase/migrations/20260722000001_add_industry_to_tenants.sql:7-8`):
```sql
CHECK (industry IN ('automotive', 'general', 'retail', 'healthcare', 'real_estate', 'hospitality'))
```

**Application sends UPPERCASE values** (e.g., `AUTOMOTIVE`, `RETAIL`, `GENERAL BUSINESS`) per `create-client/route.ts:13-20` (ALLOWED_INDUSTRIES) and `UniversalCommandModal.tsx:202-249` (normalizeIndustry).

**Fixed constraint** (in migration `20260918000001`, lines 47-56):
```sql
CHECK (industry IN ('automotive', 'general', 'retail', 'healthcare', 'real_estate', 'hospitality',
                     'AUTOMOTIVE', 'GENERAL BUSINESS', 'RETAIL', 'HEALTHCARE', 'INSURANCE', 'AI AUTOMATION'))
```

**If `20260918000001` did not run**, the constraint at `20260722000001` still rejects UPPERCASE values → **SQLSTATE 23514** (check_constraint_violation) on every insert.

### 1.4 Reseller Clients GET Route Schema Dependency

**File:** `src/app/api/reseller/[resellerSlug]/clients/route.ts:52-55`

```ts
.from('tenants')
.select('id, name, category, is_active, branding_colors, custom_assets, created_at')
.eq('reseller_id', resolvedId)
```

Selecting `category`, `is_active`, `branding_colors`, `custom_assets` and filtering by `reseller_id` all depend on migrations having executed. If `20260918000001` did not run → **42703 undefined_column** on SELECT.

---

## 2. Database Connection & Migration Failure

### 2.1 Connection String Mismatch

**File:** `scripts/push_migration_20260918000001.mjs`

| Property | Migration Script (line 10) | `.env.local` line 7 |
|---|---|---|
| **User** | `postgres` (superuser) | `postgres.lfmrdaeuwfhguqghqrto` (pooler) |
| **Host** | `db.lfmrdaeuwfhguqghqrto.supabase.co` | `aws-0-eu-west-1.pooler.supabase.com` |
| **Port** | 5432 | 5432 |

**Root cause of ETIMEDOUT:**
- The script hardcodes a direct DB host (`db.*.supabase.co`) instead of using `process.env.DATABASE_URL` (line 10).
- Supabase direct DB hosts are **not publicly accessible** by default — they are firewalled and only reachable via Supabase's internal network or SSH tunnel.
- The pooler host (`aws-0-eu-west-1.pooler.supabase.com`) in `DATABASE_URL` IS publicly accessible.
- The script attempts IPv4-first DNS resolution (`dns.setDefaultResultOrder('ipv4first')` at line 2) as a workaround for IPv6 issues, but this cannot overcome the firewall block on the direct DB host.

**Result:** Connection attempt to `db.lfmrdaeuwfhguqghqrto.supabase.co:5432` times out (ETIMEDOUT), migration never applies.

### 2.2 Secondary Migration Script Issue

**File:** `scripts/push_migration_add_active_tenant.mjs:8`

Same pattern — hardcodes `postgresql://postgres.lfmrdaeuwfhguqghqrto:Ilove$dona68@db.lfmrdaeuwfhguqghqrto.supabase.co:5432/postgres` instead of using `DATABASE_URL`.

---

## 3. Client Creation API Handlers

### 3.1 Create Client Route — Full Request Trace

**File:** `src/app/api/ai/create-client/route.ts`

**MODE 1 (Final submission, `parseOnly: false`):**
1. Zod validation (`CreateClientRequestSchema`, line 26-49) — validates `clientData` fields
2. Resolve reseller ID via `resolveResellerId` (line 188) — queries `resellers` table
3. Verify authorization: user must be linked in `user_resellers` (line 271-292)
4. **INSERT into `tenants`** (line 317-321) — **FAILS HERE** if `20260918000001` didn't run
5. Auto-branding via `/api/ai/apply-vibe` (line 347) — only reached if insert succeeds

**Error swallowing analysis:**
- Insert errors (line 323-338): Properly logged with code, message, details, hint. Returned as HTTP 500 with `errorCode` field. **Not swallowed.**
- Generic catch (line 428-432): Returns `{ error: errorMessage }` at 500. Any error that escapes MODE 1's specific handlers is reduced to a plain string message — database error codes like `42703` or `23514` may be lost if they don't have a `.code` property on the caught error object.

### 3.2 Where 42703/Constraint Errors Are Generated

| Error Type | SQLSTATE | Source | HTTP Response |
|---|---|---|---|
| `undefined_column` | 42703 | PostgREST on INSERT/SELECT with missing columns | 500 (caught at line 323-338) |
| `check_constraint_violation` | 23514 | `industry_check` rejecting UPPERCASE values | 500 (caught at line 323-338) |
| `foreign_key_violation` | 23503 | `reseller_id` referencing non-existent reseller | 500 (caught at line 323-338) |
| `unique_violation` | 23505 | Duplicate `tenant_id` | 500 (caught at line 323-338) |

### 3.3 Resolver Error Suppression

**File:** `src/lib/db/resolve-reseller.ts:195-199`

```ts
if (slugError.code === '42703') {
  return { data: null, error: null };  // Silently treats 42703 as "not found"
}
```

When the `resellers` table has a 42703 on slug lookup, the resolver returns `null` instead of propagating the error. This causes `resolveResellerId` to return `null`, which triggers a 404 "Reseller not found" at `create-client/route.ts:190-192`.

---

## 4. Wizard State Machine (`UniversalCommandModal.tsx`)

### 4.1 Voice Entry Step Advancement Bug

**File:** `src/components/reseller/modals/UniversalCommandModal.tsx`

**`processVoiceEntryStep` (line 853-903):** After processing each step, `voiceEntryStep` is **NEVER incremented**. The function:
1. Checks `getMissingRequiredFields` (line 857) — if missing, reprompts and returns (blocked)
2. Falls through to `switch (voiceEntryStep)` (line 886)
3. Calls the appropriate handler (e.g., `processNameAndIndustry` for case 0)
4. **Returns without incrementing `voiceEntryStep`**

`setVoiceEntryStep` is only called in two places:
- Line 848: `startVoiceEntryMode` → sets to `0`
- Line 879: Step 2 navigation keyword handling → sets to `3` (only reachable if step 2 is reached)

**Consequence:** After completing step 0 (name + industry), the step remains `0`. The next user utterance is processed at step 0 again via `processNameAndIndustry`, which re-calls `/api/ai/extract-client-info` with `fields: ['name', 'industry']` (line 792). Steps 1 (email), 2 (contact info), and 3 (vibe) are **unreachable**.

### 4.2 STEP_REQUIREMENTS Gating

**File:** `UniversalCommandModal.tsx:33-39`

```ts
const STEP_REQUIREMENTS: Record<VoiceEntryStep, (keyof VoiceEntryData)[]> = {
  0: ['name', 'industry'],           // BOTH required
  1: ['email'],                       // required
  2: ['mobile', 'website'],           // at least one required
  3: ['vibe'],                        // required
  4: [],                              // completion
};
```

Step 0 requires BOTH `name` AND `industry` (line 34). If STT/transcription produces a transcript that only contains one (e.g., only a client name), `getMissingRequiredFields` returns `['industry']`, and the system reprompts (line 861-863). Since step never advances, this reprompt loop repeats indefinitely at step 0.

### 4.3 Unhandled API Error Codes

| API Endpoint | Error Scenario | Handler | Behavior |
|---|---|---|---|
| `/api/ai/stt` (line 547) | Any non-200 response | `transcribeAudio` line 556 | Sets `error: 'Transcription failed — please try again'`. Error code lost. |
| `/api/ai/extract-client-info` | Any non-200 (line 793-805) | `processNameAndIndustry` line 840 | Caught by generic catch → `generateHannahResponse('Error processing input', ...)`. Original error code lost. |
| `/api/ai/speech` (line 434) | Any non-200 (line 440-443) | `speak` function | Logs `TTS API error detail`, throws, caught at line 462-463 (`console.error`). Error shown to user via speech only. |
| `/api/ai/create-client` (line 914) | Any non-200 (line 925) | `handleCreateCommand` | Throws → caught at line 969 → `setError(getErrorMessage(err))`. Error code lost in generic message. |

### 4.4 Draft→Review→Confirm Data Flow

**`handleReviewConfirm` (line 1030-1043):** Copies `reviewData` into `draftData`. But `reviewData` is only populated by `completeVoiceEntry` (line 570-578), which is only reachable from `processVoiceEntryStep` case 4 (voice step 4 → **unreachable**). In non-voice mode, `reviewData` remains at its initial empty values (line 184-192).

**`handleConfirm` (line 1046-1123):** Reads exclusively from `draftData` (line 1086 comment). If `draftData` was set via `handleCreateCommand` (parseOnly mode), it contains voice-parsed data. If `draftData` is null, the function returns immediately (line 1047).

---

## 5. Entity Extraction Handler (`extract-client-info/route.ts`)

### 5.1 Groq Model Identifier Issue

**File:** `src/app/api/ai/extract-client-info/route.ts:122`

```ts
model: 'openai/gpt-oss-20b',
```

The `groq-sdk` client is initialized at line 32 and calls Groq's API endpoint. The model identifier `openai/gpt-oss-20b` uses the OpenAI API namespace prefix (`openai/`), which is **not a valid Groq model identifier**. Groq expects model IDs like `llama-3.1-70b-versatile`, `mixtral-8x7b-32768`, or `gemma2-9b-it`. This likely causes a 400 or 404 from Groq's API.

### 5.2 Error Handling Bug — Swallowed Groq Errors

**File:** `src/app/api/ai/extract-client-info/route.ts:194-216`

```ts
} catch (error) {
  console.warn('JSON generation failed, returning partial:', ...);
  parsedResponse = {
    name: null, industry: null, category: null,
    email: null, mobile: null, website: null, vibe: null,
  };
}
```

All Groq API errors (including authentication failures, rate limits, and model-not-found errors) are silently swallowed and replaced with an all-null response. The caller receives `{ name: null, industry: null, ... }` with HTTP 200, making it **impossible to distinguish** between "user said nothing relevant" and "AI extraction completely failed."

### 5.3 Partial vs. Complete Information Payload

**When partial information is spoken** (e.g., only a client name):
- Groq returns valid JSON (hopefully) with only some fields populated
- Missing fields default to `null` via Zod schema defaults (lines 16-23)
- Response is 200 with `{ "name": "Acme", "industry": null, "category": null, ... }`

**When complete information is spoken** (all fields):
- Groq returns valid JSON with all fields populated
- Same response format, all fields non-null

**The response schema cannot distinguish between these cases** — the HTTP response is identical (200 OK) for both success and total AI failure.

### 5.4 Outer Catch Dead Code

**File:** `src/app/api/ai/extract-client-info/route.ts:245-251`

```ts
if (status === 403 || status === 404) {
  return NextResponse.json({ error: `Groq API error (${status}): ${errorMessage}` }, { status: 502 });
}
```

This branch is effectively **dead code**. Groq errors are already caught by the inner try-catch (lines 194-216) and replaced with all-null responses. The outer catch only catches Zod validation failures (line 219) or unexpected exceptions (e.g., `NextResponse.json` serialization errors), not Groq API errors.

---

## 6. Step-by-Step Failure Trace

Below is the complete execution trace for a "Create Client" attempt, showing every failure point:

```
USER SPEAKS: "Create client Acme Motors in Automotive"
│
├─ [STT] POST /api/ai/stt → audio → text
│   └─ ✅ Success (returns transcript)
│
├─ processVoiceEntryMode: processVoiceEntryStep(transcript)
│   ├─ getMissingRequiredFields(0, data) → ['name', 'industry'] (empty = all met)
│   ├─ switch case 0: processNameAndIndustry(transcript)
│   │   └─ POST /api/ai/extract-client-info
│   │       └─ Groq model 'openai/gpt-oss-20b' → likely 400 (invalid model)
│   │           └─ Inner catch → returns all-null JSON
│   │       └─ Zod validation passes (all nullable)
│   │       └─ Response: { name: null, industry: null, ... } (HTTP 200)
│   │   ├─ finalName = sanitizedName → null → NOT SET (if block fails)
│   │   ├─ finalIndustry = sanitizedIndustry → null → NOT SET (if block fails)
│   │   └─ voiceEntryStep remains 0 ❌ (never incremented)
│   │
│   └─ ⚠️ STUCK: User must speak again, but step is still 0
│       Next utterance triggers processVoiceEntryStep again at step 0
│       getMissingRequiredFields(0) → still all met (name/industry were null, so check passes)
│       processNameAndIndustry runs again with new transcript → same failure loop
│
├─ ALTERNATIVE PATH: Non-voice text command
│   User types command → processCommand → handleCreateCommand
│   │
│   ├─ POST /api/ai/create-client { parseOnly: true, voiceCommand: ... }
│   │   └─ MODE 2: Groq call → extracts data → returns parsed JSON (HTTP 200)
│   │   └─ setDraftData(...) → setStep('draft')
│   │
│   ├─ User clicks "Review & Confirm" → setStep('review')
│   │   └─ reviewData is EMPTY (only populated by completeVoiceEntry, which is unreachable)
│   │
│   ├─ User clicks "Create Client" → handleConfirm
│   │   ├─ POST /api/ai/create-client { parseOnly: false, clientData: {...} }
│   │   │   └─ MODE 1: Insert into tenants
│   │   │   ├─ resolveResellerId → ✅
│   │   │   ├─ user_resellers check → ✅
│   │   │   └─ INSERT INTO tenants (...)
│   │   │       ├─ ❌ If 20260918000001 didn't run:
│   │   │       │   └─ 42703 undefined_column: category, mobile_number, website_url,
│   │   │       │      is_active, show_ovg_branding, pricing_tier_key, custom_assets, branding_colors
│   │   │       ├─ ❌ If industry_check not fixed:
│   │   │       │   └─ 23514 check_constraint_violation (UPPERCASE rejected)
│   │   │       └─ Error caught at line 323-338 → HTTP 500
│   │   │
│   │   └─ Response: { error: 'Failed to create client', details: insertError.message, ... }
│   │       └─ UniversalCommandModal handleConfirm catch (line 1118-1119):
│   │           setError('Failed to create client') ← generic message, error code lost
│   │
│   └─ ❌ CLIENT CREATION FAILS
```

---

## 7. Summary of All Failure Points

| # | File | Line(s) | Issue Type | Description |
|---|---|---|---|---|
| 1 | `scripts/push_migration_20260918000001.mjs` | 10 | **Network** | Hardcoded direct DB host (`db.*.supabase.co`) is firewalled; uses `postgres` superuser instead of pooler user from DATABASE_URL |
| 2 | `supabase/migrations/20260918000001_add_missing_tenant_columns.sql` | 1-65 | **Schema** | Migration never executes due to ETIMEDOUT; 8 columns and industry_check fix remain unapplied |
| 3 | `src/app/api/ai/create-client/route.ts` | 294-310 | **Schema mismatch** | Insert payload references columns that don't exist if migration 20260918000001 didn't run |
| 4 | `supabase/migrations/20260722000001_add_industry_to_tenants.sql` | 7-8 | **Constraint** | industry_check rejects UPPERCASE values that create-client route sends |
| 5 | `src/components/reseller/modals/UniversalCommandModal.tsx` | 853-903 | **Logic bug** | `voiceEntryStep` never increments after processing; all voice entry steps beyond 0 are unreachable |
| 6 | `src/app/api/ai/extract-client-info/route.ts` | 122 | **API/model** | Groq model `'openai/gpt-oss-20b'` is not a valid Groq model identifier; likely causes 400 |
| 7 | `src/app/api/ai/extract-client-info/route.ts` | 194-216 | **Error handling** | All Groq errors silently swallowed; all-null response returned with HTTP 200 |
| 8 | `src/app/api/ai/extract-client-info/route.ts` | 245-251 | **Dead code** | Outer catch 403/404 handler never reached because Groq errors are caught by inner try-catch |
| 9 | `src/app/api/ai/create-client/route.ts` | 428-432 | **Error handling** | Generic catch returns 500 with only error message string; database error codes may be lost |
| 10 | `src/components/reseller/modals/UniversalCommandModal.tsx` | 1030-1043 | **Data flow** | `reviewData` only populated by `completeVoiceEntry` (unreachable); review step shows empty data |
| 11 | `src/lib/db/resolve-reseller.ts` | 195-199 | **Error suppression** | 42703 on slug lookup silently returns null instead of propagating error |
| 12 | `src/app/api/reseller/[resellerSlug]/clients/route.ts` | 52-55 | **Schema mismatch** | SELECT and WHERE reference columns dependent on unapplied migrations |

---

## 8. Critical Path Dependencies

The system has a **cascade failure** pattern:

```
push_migration_20260918000001 ETIMEDOUT
  → 8 columns missing on tenants table
    → create-client INSERT fails with 42703/23514
      → User sees generic "Failed to create client" error
  → industry_check still rejects UPPERCASE
    → Even if columns existed, INSERT fails with 23514
  → voice entry stuck at step 0
    → User cannot complete voice-based client creation
  → reseller clients list fails with 42703
    → Reseller cannot view their clients
```

**The single root cause** (ETIMEDOUT on migration push) cascades into ~12 distinct failure points across 6 different files and layers.
