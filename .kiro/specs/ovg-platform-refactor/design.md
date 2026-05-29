# Design Document

## OVG Platform v2 — Full Refactor

---

## Overview

This refactor addresses four priority tiers across the OVG Platform v2 Next.js application. The changes are purely corrective — no new features are introduced. The application must remain functionally equivalent after every change.

**Priority tiers:**

- **P0 — Security**: Unguarded admin endpoints, insecure identity resolution (`getSession` vs `getUser`), diagnostic endpoint exposure, and `user_metadata`-based access control.
- **P1 — Architecture**: Supabase client proliferation (singleton pattern, inline `createClient` calls), auto-reseller side-effects in `ClientsGrid`, and duplicate `Tenant` type definitions.
- **P2/P3 — Code Quality**: React hook warnings, unused variables, `any` types, raw `<img>` tags, and garbage root files.

---

## Architecture

### Supabase Client Topology (Post-Refactor)

The platform will have exactly three canonical Supabase client modules. All other client instantiation is eliminated.

```
src/lib/supabase/
  server.ts   — createClient()       Server Components, API Routes (user session, cookie-based)
  client.ts   — createClient()       Browser Components (anon key, browser-side)
  admin.ts    — supabaseAdmin        API Routes requiring service-role (bypasses RLS)
```

`singleton.ts` is deleted. `index.ts` is rewritten to re-export only from the three canonical modules, with no reference to `singleton`.

**Import rules enforced across the codebase:**

| Context | Import |
|---|---|
| Server Component / API Route (user session) | `import { createClient } from '@/lib/supabase/server'` |
| Client Component | `import { createClient } from '@/lib/supabase/client'` |
| API Route (service-role / admin) | `import { supabaseAdmin } from '@/lib/supabase/admin'` |

### Auth Identity Resolution (Post-Refactor)

All session checks are migrated from `getSession()` to `getUser()`. The Supabase documentation explicitly states that `getSession()` reads from local storage and does not re-validate the JWT against the server, making it unsuitable for server-side authorization decisions.

```
Before:  supabase.auth.getSession()  →  trusts local cache
After:   supabase.auth.getUser()     →  validates JWT against Supabase Auth server
```

### Reseller Access Control (Post-Refactor)

The `user_resellers` junction table becomes the single source of truth for reseller access. `user_metadata.reseller_slug` is no longer used for authorization decisions.

```
Before:  user.user_metadata.reseller_slug === resellerSlug  (forgeable)
After:   SELECT reseller_slug FROM user_resellers WHERE user_id = auth.uid()  (authoritative)
```

This affects three locations: `middleware.ts`, `layout.tsx`, and `auth/page.tsx`.

---

## Components and Interfaces

### 1. Middleware (`middleware.ts`)

**Current state:** Calls `supabase.auth.getSession()`. Injects `x-user-id` from `session.user.id`.

**Target state:**

```typescript
// Replace getSession with getUser
const { data: { user }, error } = await supabase.auth.getUser();

if (!user || error) {
  const authUrl = new URL('/auth', request.url);
  authUrl.searchParams.set('redirectTo', pathname);
  return NextResponse.redirect(authUrl);
}

const response = NextResponse.next();
response.headers.set('x-user-id', user.id);
return response;
```

No other changes to middleware logic.

---

### 2. Reseller Layout (`src/app/(dashboard)/reseller/[resellerSlug]/layout.tsx`)

**Current state:** `verifyResellerAccess` reads `user.user_metadata.reseller_slug` and compares it to the URL slug. This is bypassable by a user who edits their own metadata.

**Target state:** Query `user_resellers` table to confirm the association.

```typescript
async function verifyResellerAccess(resellerSlug: string) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return { authorized: false, redirectTo: '/auth' };
  }

  // Authoritative check: query the junction table
  const { data: userReseller, error: linkError } = await supabase
    .from('user_resellers')
    .select('reseller_slug')
    .eq('user_id', user.id)
    .eq('reseller_slug', resellerSlug)
    .maybeSingle();

  if (linkError || !userReseller) {
    return { authorized: false, redirectTo: '/auth' };
  }

  return { authorized: true, redirectTo: null };
}
```

The `defaultSlug` variable (currently unused, causing a lint warning) is removed.

---

### 3. Auth Page (`src/app/(auth)/auth/page.tsx`)

**Current state:**
- Calls `supabase.auth.getSession()` on mount.
- Contains hardcoded slug strings `lastchaptermedia2016` and `acme-corp`.
- Contains a "Run Authentication Diagnostics" button that calls `/api/auth/diagnostics`.
- Calls `/api/auth/update-reseller-slug` to patch metadata.

**Target state:**

**Session check on mount** — replace `getSession` with `getUser`, then query `user_resellers` for the redirect slug:

```typescript
useEffect(() => {
  const checkUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: userReseller } = await supabase
      .from('user_resellers')
      .select('reseller_slug')
      .eq('user_id', user.id)
      .maybeSingle();

    if (userReseller?.reseller_slug) {
      router.push(`/reseller/${userReseller.reseller_slug}/clients`);
    } else {
      setError('Your account is not linked to a reseller. Please contact support.');
    }
  };
  checkUser();
}, [router, supabase]);
```

**Post-login redirect** — same pattern: query `user_resellers` after successful `signInWithPassword`, redirect to the slug found there. If no row exists, display an error.

**Removals:**
- Delete the `updateUserResellerSlug` function and all calls to it.
- Delete the diagnostics button and its `onClick` handler.
- Remove all references to `lastchaptermedia2016` and `acme-corp`.
- Remove the call to `/api/auth/fix-metadata`.

---

### 4. Cleanup Tenants Endpoint (`src/app/api/admin/cleanup-tenants/route.ts`)

**Current state:** No auth check. Instantiates a raw `createClient` from `@supabase/supabase-js` for the admin operations.

**Target state:** Add auth guard at the top of the handler. Use `supabaseAdmin` from `@/lib/supabase/admin` for the deletion logic.

```typescript
import { createClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

export async function POST(request: Request) {
  // Auth guard
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Role check — read role from user_metadata or app_metadata
  const role = user.app_metadata?.role ?? user.user_metadata?.role;
  if (role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Existing deletion logic continues, using supabaseAdmin instead of inline createAdminClient
  const { resellerSlug, cleanupTestEntries } = await request.json();
  // ... rest of handler unchanged, replacing supabaseAdmin variable references
}
```

---

### 5. Reseller Create Endpoint (`src/app/api/resellers/create/route.ts`)

**Current state:** No auth check. Instantiates a raw `createClient` from `@supabase/supabase-js`.

**Target state:** Add auth guard. Replace inline client with `supabaseAdmin`.

```typescript
import { createClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

export async function POST(request: Request) {
  // Auth guard
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Existing creation logic continues, using supabaseAdmin
}
```

---

### 6. Delete Client Endpoint (`src/app/api/ai/delete-client/route.ts`)

**Current state:** Reads `resellerSlug` from the request body and uses it directly to scope the deletion. This allows a caller to supply any slug and delete tenants belonging to a different reseller.

**Target state:** Derive the reseller slug from the authenticated user's `user_resellers` row. Remove `resellerSlug` from the accepted request body.

```typescript
export async function POST(request: NextRequest) {
  const supabase = await createSupabaseClient();

  // 1. Verify session
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 2. Resolve reseller from user_resellers (not request body)
  const { data: userReseller, error: linkError } = await supabase
    .from('user_resellers')
    .select('reseller_id, reseller_slug')
    .eq('user_id', user.id)
    .maybeSingle();

  if (linkError || !userReseller) {
    return NextResponse.json({ error: 'Forbidden: no reseller association' }, { status: 403 });
  }

  // 3. Accept only voiceCommand from body
  const { voiceCommand } = await request.json();
  if (!voiceCommand) {
    return NextResponse.json({ error: 'voiceCommand required' }, { status: 400 });
  }

  // 4. Scope all tenant queries to userReseller.reseller_id
  // ... rest of handler unchanged
}
```

The ownership check before deletion:

```typescript
// Verify tenant belongs to caller's reseller before deleting
const { data: tenants } = await supabase
  .from('tenants')
  .select('id, name')
  .eq('reseller_id', userReseller.reseller_id)  // enforced from session
  .ilike('name', `%${clientName}%`);

if (!tenants || tenants.length === 0) {
  return NextResponse.json({ error: `Client not found` }, { status: 404 });
}
```

---

### 7. Diagnostic Endpoints (Deleted)

The following files are deleted entirely:

- `src/app/api/auth/diagnostics/route.ts`
- `src/app/api/test-auth/route.ts`

The diagnostics button in `auth/page.tsx` is removed as part of the Auth Page cleanup (§3 above).

---

### 8. ClientsGrid (`src/components/reseller/ClientsGrid.tsx`)

**Current state:** When `fetchTenants` cannot find the reseller slug in the `resellers` table, it calls `POST /api/resellers/create` to silently create a new reseller record. This is a dangerous side-effect of a read operation.

**Target state:** Replace the auto-creation branch with an error state.

```typescript
if (rErr || !rData?.id) {
  console.error('OVG-PLATFORM-V2: Reseller not found:', resellerSlugParam);
  setError(`Reseller "${resellerSlugParam}" not found. Please contact support.`);
  setLoading(false);
  return;
}
```

Add an `error` state variable to the component:

```typescript
const [error, setError] = useState<string | null>(null);
```

Render the error state in the component's return:

```typescript
if (error) {
  return (
    <div className="flex items-center justify-center p-8">
      <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-6 text-center">
        <p className="text-red-400 text-sm">{error}</p>
      </div>
    </div>
  );
}
```

The local `interface Tenant` in `ClientsGrid.tsx` is removed. The component imports `Tenant` from `@/types`.

---

### 9. Type System (`src/types/index.ts`)

**Current state:** The canonical `Tenant` type (Zod-derived) is missing fields that `ClientsGrid` uses: `signal_count`, `signal_trend`, `ai_insight`, `last_seen`, `total_revenue`, `total_leads`, `mrr`, `is_active`, `permission_level`, `indicators`, `email`, `category`, `industry`, `category_config`.

**Target state:** Extend the Zod schema to include all fields used by `ClientsGrid`. The `Indicators` interface is also moved to `src/types/index.ts`.

```typescript
// Added to TenantSchema
  email: z.string().nullable().optional(),
  category: z.string().optional(),
  industry: z.string().optional(),
  category_config: z.record(z.unknown()).optional(),
  signal_count: z.number().optional(),
  signal_trend: z.array(z.number()).optional(),
  ai_insight: z.string().nullable().optional(),
  last_seen: z.string().nullable().optional(),
  total_revenue: z.number().nullable().optional(),
  total_leads: z.number().nullable().optional(),
  mrr: z.number().nullable().optional(),
  is_active: z.boolean().default(true),
  permission_level: z.enum(['standard', 'readonly']).optional(),
  indicators: z.object({
    ai: z.enum(['active', 'inactive', 'error']),
    sms: z.enum(['active', 'inactive', 'error']),
    vin: z.enum(['active', 'inactive', 'error']),
    signal: z.enum(['active', 'inactive', 'error']),
  }).optional(),
```

The `Client` interface remains separate and unchanged — it represents the reseller-facing client record shape, not the database tenant shape.

---

### 10. API Route Client Consolidation

Three API routes currently instantiate a raw `createClient` from `@supabase/supabase-js` with the service role key inline. They are migrated to `supabaseAdmin`:

| File | Change |
|---|---|
| `src/app/api/tenants/update-config-with-greeting/route.ts` | Replace `createServiceClient(url, key)` with `supabaseAdmin` from `@/lib/supabase/admin` |
| `src/app/api/reseller/[resellerSlug]/clients/route.ts` | Replace `createServiceClient(url, key)` with `supabaseAdmin` |
| `src/app/api/ai/create-client/route.ts` | Replace `createServiceClient(url, key)` with `supabaseAdmin` |
| `src/app/api/admin/cleanup-tenants/route.ts` | Replace inline `createAdminClient(url, key)` with `supabaseAdmin` |
| `src/app/api/resellers/create/route.ts` | Replace inline `createAdminClient(url, key)` with `supabaseAdmin` |
| `src/app/api/auth/diagnostics/route.ts` | Deleted entirely |

---

### 11. `src/lib/supabase/index.ts` (Rewritten)

After `singleton.ts` is deleted, `index.ts` is rewritten to export only from the three canonical modules:

```typescript
// Canonical re-exports — no singleton references
export { createClient } from './server';
export { createClient as createBrowserClient } from './client';
export { supabaseAdmin } from './admin';
```

---

### 12. Code Quality Fixes

#### React Hooks (`exhaustive-deps`)

Each warning is resolved by one of three strategies:

1. **Add the missing dependency** — when the dependency is stable (e.g., a `useCallback` or `useRef`).
2. **Move the value into a ref** — when the value changes frequently but the callback should not be recreated (e.g., `resellerSlug` in `ClientsGrid`'s `fetchDashboardStats`).
3. **Add a justified `eslint-disable-next-line` comment** — only when the exclusion is intentional and documented (e.g., mount-only effects).

Key fixes:

| Location | Warning | Fix |
|---|---|---|
| `clients/page.tsx:328` | `handleCommandSubmit` missing from `useCallback` | Add `handleCommandSubmit` to deps array |
| `page.tsx:160` | `blackBoxMessages` missing from `useEffect` | Add to deps or move to ref |
| `ClientsGrid.tsx:437` | `isListening` unnecessary dep | Remove from array |
| `ClientsGrid.tsx:533` | `resellerSlug` unnecessary dep | Remove from array |
| `ClientsGrid.tsx:686` | `handleFeatureToggle`, `playAIConfirmation` missing | Add to deps array |
| `ClientsGrid.tsx:863` | `fetchCriticalAlerts`, `fetchDashboardStats`, `fetchTenants` missing | Add to deps array |
| `ClientBrandingStudio.tsx:373` | `speak` unnecessary | Remove from array |
| `ClientBrandingStudio.tsx:728,829` | Missing deps | Add to deps array |
| `DiagnosticPanel.tsx:126` | `logs` missing | Add to deps array |
| `use-voice-command.ts:315` | `currentConfig`, `tenantContext.*` missing | Add to deps array |
| `reseller-provider.tsx:90` | `setIsLoading` missing | Add to deps array |

#### Unused Variables (`no-unused-vars`)

Strategy: delete if the feature was removed; prefix with `_` if the destructuring pattern must be preserved.

Key fixes across files:

- `clients/page.tsx`: Remove `volumeLevel`, `stopVoice`, `clearCaptions` declarations.
- `layout.tsx`: Remove `defaultSlug`.
- `ClientsGrid.tsx`: Remove `_isGlobalScanning`, `setRevenuePopup`, `setSortBy`, `totalLeads`, `totalRevenue`, `_error` (multiple), `_offlineOnly`, `_apiErr`, `_event`.
- `ClientBrandingStudio.tsx`: Remove `resellerSlug`, `isGeneratingGreeting`, rename `e` params to `_e`.
- `ClientCard.tsx`: Remove `getIndustryFeatureLabel`, `onFeatureToggle`, `onSTTResult`, `categoryProfile`.
- `UniversalCommandModal.tsx`: Remove `setIsSubmitting`, `conversationStep`, `missingFields`, `normalizeWebsite`, `processCommandWithTranscript`, rename `sessionError` to `_sessionError`.
- `BrandKit.tsx`: Remove `initialHeaderUrl`, `initialFooterUrl`.
- `LivePreview.tsx`: Remove `headerUrl`, `footerUrl`, `secondaryColor`, `getGreeting`.
- `ResellerHUDClient.tsx`: Remove `reseller`, `clients`, `clientCount`, `branding`.
- `UploadZone.tsx`: Remove unused `Image` import.
- `client.ts`: Remove `HeadersConstructor`.
- All other files per lint output.

#### `any` Types (`no-explicit-any`)

Replace `Record<string, any>` with `Record<string, unknown>` for genuinely dynamic shapes. Replace `as any` casts with proper type assertions or narrowing. Key locations:

- `update-config-with-greeting/route.ts`: `z.record(z.any())` → `z.record(z.unknown())`
- `create-client/route.ts`: `z.record(z.any())` → `z.record(z.unknown())`
- Any remaining `as any` casts resolved by narrowing the type at the call site.

#### Raw `<img>` Tags (`no-img-element`)

Two locations:

1. **`src/components/reseller/BrandKit.tsx`** — The inline `UploadZone` component uses a raw `<img>` with a `// eslint-disable-next-line` comment. Replace with `<Image>` from `next/image` using `fill` or explicit `width`/`height` props. Since the URL is user-supplied and external, use `unoptimized` prop.

2. **`src/components/reseller/UploadZone.tsx`** — Already uses `<Image>` correctly. The lint warning in `current_lint.txt` for this file is for the unused `Image` import (the component was refactored but the import remained). Remove the unused import.

For `BrandKit.tsx`:

```tsx
import Image from 'next/image';

// Replace:
<img src={currentUrl} alt={`${type} preview`} className="w-full h-32 object-cover rounded" />

// With:
<Image
  src={currentUrl}
  alt={`${type} preview`}
  width={640}
  height={128}
  unoptimized
  className="w-full h-32 object-cover rounded"
/>
```

#### Garbage Root Files

The following files/directories at the project root are deleted:

```
(
...)
...)`
cd
Click
eslint
npm
OFFLINE_THRESHOLD_MS
setShowOfflineOnly(!showOfflineOnly)}
{
-p/   (directory)
```

Legitimate root files are preserved: `package.json`, `tsconfig.json`, `next.config.ts`, `middleware.ts`, `eslint.config.mjs`, `.env.local`, `.env.example`, `.gitignore`, `README.md`, `AGENTS.md`, `CLAUDE.md`, `tailwind.config.ts`, `postcss.config.mjs`, SQL migration files, and all other valid config/source files.

---

## Data Models

### `user_resellers` Table (Existing — Read Only)

This table is the authoritative source for user-to-reseller associations. The refactor reads from it; it does not modify the schema.

```sql
user_resellers (
  id            uuid PRIMARY KEY,
  user_id       uuid REFERENCES auth.users(id),
  reseller_id   uuid REFERENCES resellers(id),
  reseller_slug text,  -- denormalized for fast lookup
  created_at    timestamptz
)
```

### `Tenant` Type (Extended)

The Zod schema in `src/types/index.ts` is extended as described in §9. The inferred TypeScript type `Tenant = z.infer<typeof TenantSchema>` automatically reflects all additions.

---

## Error Handling

### Auth Guard Pattern

All protected endpoints follow this pattern:

```typescript
const supabase = await createClient();
const { data: { user }, error } = await supabase.auth.getUser();
if (error || !user) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}
```

### `user_resellers` Lookup Failure

When `user_resellers` returns no row:
- In API routes: return `{ error: 'Forbidden' }` with HTTP 403.
- In Layout: `redirect('/auth')`.
- In Auth Page: `setError('Your account is not linked to a reseller. Please contact support.')`.

### ClientsGrid Error State

When the reseller slug is not found in the database, `ClientsGrid` sets `error` state and renders a visible error message. The component does not throw; it degrades gracefully.

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Delete Client Endpoint Derives Reseller from Session

*For any* authenticated user making a DELETE request, the reseller used to scope the tenant deletion SHALL be the reseller linked to that user in the `user_resellers` table — never a value supplied in the request body.

**Validates: Requirements 3.1, 3.3**

---

### Property 2: Middleware Uses Server-Validated Identity

*For any* request to a `/reseller/*` path, the middleware SHALL call `supabase.auth.getUser()` (which validates the JWT against the Supabase Auth server) and SHALL inject the `x-user-id` header only when `getUser()` returns a non-null user without error.

**Validates: Requirements 5.1, 5.3**

---

### Property 3: Layout Access Verified Against Database

*For any* combination of authenticated user and `resellerSlug` URL parameter, the layout SHALL grant access if and only if a row exists in `user_resellers` linking that user's ID to that slug — regardless of what the user's `user_metadata` contains.

**Validates: Requirements 6.1**

---

### Property 4: Auth Page Redirect Derived from Database

*For any* successfully authenticated user who has a row in `user_resellers`, the auth page SHALL redirect to `/reseller/{slug}/clients` where `{slug}` is the `reseller_slug` value from that user's `user_resellers` row.

**Validates: Requirements 7.3**

---

### Property 5: ClientsGrid Never Creates Resellers on Missing Slug

*For any* reseller slug that does not exist in the `resellers` table, `ClientsGrid.fetchTenants` SHALL set an error state and SHALL NOT make a network request to `/api/resellers/create`.

**Validates: Requirements 9.1**

---

### Property 6: Zero Lint Warnings After Refactor

*For any* execution of `npm run lint` against the refactored codebase, the output SHALL contain zero warnings or errors for the rule categories: `react-hooks/exhaustive-deps`, `@typescript-eslint/no-unused-vars`, `@typescript-eslint/no-explicit-any`, and `@next/next/no-img-element`.

**Validates: Requirements 12.1, 13.1, 14.1, 15.1**


---

## Testing Strategy

### Dual Testing Approach

Both unit/example-based tests and property-based tests are used. They are complementary.

**Unit / example-based tests** cover:
- Auth guard responses (401, 403) for specific request scenarios.
- Post-login redirect behavior for specific user states.
- ClientsGrid error state rendering when reseller is not found.
- Diagnostic endpoint absence (file system check).

**Property-based tests** cover:
- Universal invariants that must hold across all inputs (Properties 1–6 above).

### Property Test Configuration

- Minimum 100 iterations per property test.
- Each property test references its design document property number.
- Tag format: `Feature: ovg-platform-refactor, Property {N}: {property_text}`

### Lint as a Test

Properties 6 (lint cleanliness) is verified by running `npm run lint` and asserting zero warnings in the targeted rule categories. This is a deterministic, repeatable check that serves as the acceptance gate for all P2/P3 code quality requirements.

### Scope

The refactor does not introduce new external dependencies or new database tables. All tests operate against the existing Supabase schema. Integration tests that require a live Supabase connection use 1–3 representative examples rather than property-based iteration, since the behavior of the external service does not vary meaningfully with input.
