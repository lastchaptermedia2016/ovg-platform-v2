# Requirements Document

## Introduction

This document specifies the requirements for a structured refactor of the OVG Platform v2 codebase. The refactor addresses four priority tiers: P0 security vulnerabilities (unguarded admin endpoints, insecure identity resolution, diagnostic endpoint exposure), P1 architectural issues (Supabase client proliferation, auto-reseller side-effects, duplicate type definitions), P2/P3 code quality issues (React hook warnings, unused variables, weak TypeScript types, raw `<img>` tags, and garbage root files). All changes must leave the application functionally equivalent while improving security posture, maintainability, and lint cleanliness.

## Glossary

- **Platform**: The OVG Platform v2 Next.js application located at `c:\ovg-platform-v2`.
- **Canonical Supabase Clients**: The three authoritative Supabase client modules: `src/lib/supabase/server.ts` (server-side, cookie-based), `src/lib/supabase/client.ts` (browser-side), and `src/lib/supabase/admin.ts` (service-role).
- **Singleton**: The file `src/lib/supabase/singleton.ts` that wraps the canonical clients in a class and re-exports them — targeted for deletion.
- **Middleware**: The file `middleware.ts` at the project root that guards `/reseller/*` routes.
- **Layout**: The file `src/app/(dashboard)/reseller/[resellerSlug]/layout.tsx` that performs server-side reseller access verification.
- **ClientsGrid**: The component `src/components/reseller/ClientsGrid.tsx` that fetches and displays tenant cards.
- **Auth Page**: The file `src/app/(auth)/auth/page.tsx` that handles sign-in and sign-up.
- **Diagnostic Endpoints**: The API routes `/api/auth/diagnostics` and `/api/test-auth` that expose internal system state.
- **Cleanup Endpoint**: The API route `/api/admin/cleanup-tenants` that deletes tenant records.
- **Reseller Create Endpoint**: The API route `/api/resellers/create` that inserts reseller records.
- **Delete Client Endpoint**: The API route `/api/ai/delete-client` that deletes tenant records by voice command.
- **user_resellers**: The Supabase database junction table linking `auth.users` to `resellers` for authoritative access control.
- **Garbage Files**: Files in the project root that are not valid source, config, or documentation files (e.g., files named `(`, `cd`, `Click`, `eslint`, `npm`, `OFFLINE_THRESHOLD_MS`, `setShowOfflineOnly(!showOfflineOnly)}`, `...)`, `...)\``, `-p/` directory).

---

## Requirements

### Requirement 1: Auth Guard for Cleanup Tenants Endpoint

**User Story:** As a platform operator, I want the cleanup-tenants endpoint to reject unauthenticated and non-admin requests, so that tenant data cannot be bulk-deleted by anonymous callers.

#### Acceptance Criteria

1. WHEN a request reaches `POST /api/admin/cleanup-tenants` without a valid authenticated session, THEN THE Cleanup Endpoint SHALL return HTTP 401 with a JSON error body.
2. WHEN a request reaches `POST /api/admin/cleanup-tenants` with a valid session whose user does not hold an admin role, THEN THE Cleanup Endpoint SHALL return HTTP 403 with a JSON error body.
3. WHEN a request reaches `POST /api/admin/cleanup-tenants` with a valid admin session, THE Cleanup Endpoint SHALL proceed with the existing deletion logic unchanged.
4. THE Cleanup Endpoint SHALL use `src/lib/supabase/server.ts` to resolve the session and SHALL NOT instantiate a raw `createClient` from `@supabase/supabase-js` for the auth check.

---

### Requirement 2: Auth Guard for Reseller Create Endpoint

**User Story:** As a platform operator, I want the reseller-create endpoint to reject unauthenticated requests, so that arbitrary reseller records cannot be inserted by anonymous callers.

#### Acceptance Criteria

1. WHEN a request reaches `POST /api/resellers/create` without a valid authenticated session, THEN THE Reseller Create Endpoint SHALL return HTTP 401 with a JSON error body.
2. WHEN a request reaches `POST /api/resellers/create` with a valid authenticated session, THE Reseller Create Endpoint SHALL proceed with the existing creation logic unchanged.
3. THE Reseller Create Endpoint SHALL use `src/lib/supabase/server.ts` to resolve the session.

---

### Requirement 3: Delete Client Uses Session for Reseller Identity

**User Story:** As a platform operator, I want the delete-client endpoint to derive the reseller identity from the authenticated session rather than the request body, so that a caller cannot delete tenants belonging to a different reseller by supplying an arbitrary slug.

#### Acceptance Criteria

1. THE Delete Client Endpoint SHALL resolve the caller's reseller slug by querying the `user_resellers` table using the authenticated user's ID, rather than reading `resellerSlug` from the request body.
2. WHEN the authenticated user has no entry in `user_resellers`, THEN THE Delete Client Endpoint SHALL return HTTP 403 with a JSON error body.
3. WHEN the authenticated user's reseller does not own the targeted tenant, THEN THE Delete Client Endpoint SHALL return HTTP 403 with a JSON error body.
4. THE Delete Client Endpoint SHALL continue to accept `voiceCommand` from the request body and SHALL NOT accept `resellerSlug` from the request body.
5. IF the session cannot be resolved, THEN THE Delete Client Endpoint SHALL return HTTP 401 with a JSON error body.

---

### Requirement 4: Delete Diagnostic Endpoints

**User Story:** As a platform operator, I want the diagnostic and test-auth endpoints removed from the codebase, so that internal system state and service-role key usage are not exposed via unauthenticated HTTP routes.

#### Acceptance Criteria

1. THE Platform SHALL NOT contain the file `src/app/api/auth/diagnostics/route.ts`.
2. THE Platform SHALL NOT contain the file `src/app/api/test-auth/route.ts`.
3. WHEN the Auth Page renders, THE Auth Page SHALL NOT contain a button or UI element that calls `/api/auth/diagnostics`.
4. THE Platform SHALL NOT contain any import or reference to the deleted diagnostic route files.

---

### Requirement 5: Replace getSession with getUser in Middleware and Auth Page

**User Story:** As a platform operator, I want session validation in the middleware and auth page to use `getUser()` instead of `getSession()`, so that the Platform validates the JWT against the Supabase server on every request rather than trusting the locally cached session.

#### Acceptance Criteria

1. WHEN Middleware processes a `/reseller/*` request, THE Middleware SHALL call `supabase.auth.getUser()` to verify the session and SHALL NOT call `supabase.auth.getSession()`.
2. WHEN the Auth Page checks for an existing session on mount, THE Auth Page SHALL call `supabase.auth.getUser()` and SHALL NOT call `supabase.auth.getSession()`.
3. WHILE a valid user is returned by `getUser()`, THE Middleware SHALL inject the `x-user-id` header and allow the request to proceed.
4. IF `getUser()` returns an error or a null user, THEN THE Middleware SHALL redirect the request to `/auth`.

---

### Requirement 6: Verify Reseller Access via user_resellers Table in Layout

**User Story:** As a platform operator, I want the reseller layout's access check to verify the user's reseller association against the `user_resellers` database table, so that a user cannot gain access to a reseller dashboard by manipulating their own `user_metadata`.

#### Acceptance Criteria

1. WHEN the Layout performs the `verifyResellerAccess` check, THE Layout SHALL query the `user_resellers` table to confirm the authenticated user has a row linking them to the reseller identified by `resellerSlug`.
2. THE Layout SHALL NOT use `user.user_metadata.reseller_slug` as the sole basis for granting access.
3. IF the `user_resellers` query returns no matching row for the authenticated user and the requested `resellerSlug`, THEN THE Layout SHALL redirect to `/auth`.
4. WHEN the `user_resellers` query confirms the association, THE Layout SHALL allow rendering to proceed.

---

### Requirement 7: Remove Hardcoded Slugs from Auth Page

**User Story:** As a developer, I want the auth page to derive the redirect destination entirely from the authenticated user's database record, so that hardcoded slug strings do not create incorrect routing for new users.

#### Acceptance Criteria

1. THE Auth Page SHALL NOT contain the string literal `lastchaptermedia2016` in any code path.
2. THE Auth Page SHALL NOT contain the string literal `acme-corp` in any code path.
3. WHEN a user signs in successfully and their `user_resellers` record exists, THE Auth Page SHALL redirect to `/reseller/{slug}/clients` where `{slug}` is the slug of the reseller linked in `user_resellers`.
4. IF a signed-in user has no `user_resellers` record, THEN THE Auth Page SHALL display an error message indicating the account is not linked to a reseller.

---

### Requirement 8: Delete singleton.ts and Standardize on Canonical Clients

**User Story:** As a developer, I want all Supabase client usage to go through the three canonical modules, so that there is a single, auditable source of truth for how database connections are created.

#### Acceptance Criteria

1. THE Platform SHALL NOT contain the file `src/lib/supabase/singleton.ts`.
2. THE Platform SHALL NOT contain any import that references `@/lib/supabase/singleton` or `./singleton`.
3. THE file `src/lib/supabase/index.ts` SHALL NOT re-export symbols from `singleton.ts`.
4. WHERE code previously imported from `singleton.ts`, THE Platform SHALL import the equivalent symbol from `server.ts`, `client.ts`, or `admin.ts` instead.

---

### Requirement 9: Remove Auto-Reseller Creation from ClientsGrid

**User Story:** As a developer, I want ClientsGrid to show an error state when the reseller slug is not found in the database, so that the component does not silently create reseller records as a side-effect of rendering.

#### Acceptance Criteria

1. WHEN `fetchTenants` in ClientsGrid resolves the reseller slug and the `resellers` table returns no matching row, THE ClientsGrid SHALL set an error state and SHALL NOT call `/api/resellers/create`.
2. WHEN the error state is set due to a missing reseller, THE ClientsGrid SHALL render a visible error message indicating the reseller was not found.
3. THE ClientsGrid SHALL NOT contain any code path that calls `fetch('/api/resellers/create', ...)`.
4. WHEN the reseller slug resolves successfully, THE ClientsGrid SHALL continue to fetch and display tenants as before.

---

### Requirement 10: Consolidate Duplicate Client/Tenant Type Definitions

**User Story:** As a developer, I want a single canonical `Tenant` type used across the codebase, so that type mismatches between the Zod-derived `Tenant` in `src/types/index.ts` and the inline `Tenant` interface in `ClientsGrid.tsx` do not cause silent data shape divergence.

#### Acceptance Criteria

1. THE Platform SHALL define the authoritative `Tenant` type in `src/types/index.ts` using the existing Zod schema.
2. THE ClientsGrid SHALL NOT declare a local `interface Tenant` that duplicates fields already present in the canonical type.
3. WHERE ClientsGrid requires fields not present in the canonical `Tenant` type (e.g., `signal_count`, `indicators`, `ai_insight`), THE canonical `Tenant` type SHALL be extended to include those fields.
4. THE `Client` interface in `src/types/index.ts` SHALL remain distinct from `Tenant` and SHALL represent the reseller-facing client record shape.

---

### Requirement 11: Consolidate Inline createClient Calls in API Routes

**User Story:** As a developer, I want API routes that need a service-role Supabase client to import `supabaseAdmin` from `src/lib/supabase/admin.ts`, so that raw `createClient` calls from `@supabase/supabase-js` are not scattered across route handlers.

#### Acceptance Criteria

1. THE Platform SHALL NOT contain any API route file that calls `createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)` inline.
2. WHERE an API route requires a service-role client, THE route SHALL import `supabaseAdmin` from `@/lib/supabase/admin`.
3. WHERE an API route requires a user-session client, THE route SHALL import `createClient` from `@/lib/supabase/server`.
4. THE files `src/app/api/tenants/update-config-with-greeting/route.ts`, `src/app/api/reseller/[resellerSlug]/clients/route.ts`, and `src/app/api/ai/create-client/route.ts` SHALL be updated to use the canonical admin client instead of inline instantiation.

---

### Requirement 12: Fix react-hooks/exhaustive-deps Warnings

**User Story:** As a developer, I want all `react-hooks/exhaustive-deps` lint warnings resolved, so that hooks declare their true dependencies and do not silently capture stale closures.

#### Acceptance Criteria

1. THE Platform SHALL produce zero `react-hooks/exhaustive-deps` lint warnings when `npm run lint` is executed.
2. WHEN a dependency is intentionally excluded from a hook's dependency array for a documented reason (e.g., stable ref), THE code SHALL include an `// eslint-disable-next-line react-hooks/exhaustive-deps` comment with a one-line justification on the preceding line.
3. THE fix SHALL NOT suppress warnings by adding blanket `eslint-disable` file-level comments.

---

### Requirement 13: Remove Unused Variable Instances

**User Story:** As a developer, I want all `@typescript-eslint/no-unused-vars` lint warnings resolved, so that dead code does not obscure the active logic.

#### Acceptance Criteria

1. THE Platform SHALL produce zero `@typescript-eslint/no-unused-vars` lint warnings when `npm run lint` is executed.
2. WHERE a variable is unused because the feature it supported was removed, THE variable declaration SHALL be deleted.
3. WHERE a destructured variable is unused but the destructuring pattern must be preserved (e.g., to skip a positional value), THE variable SHALL be prefixed with `_` to signal intentional non-use.

---

### Requirement 14: Replace as any and Record<string, any> with Typed Alternatives

**User Story:** As a developer, I want `as any` casts and `Record<string, any>` usages replaced with specific types, so that TypeScript's type checker can catch shape mismatches at compile time.

#### Acceptance Criteria

1. THE Platform SHALL produce zero `@typescript-eslint/no-explicit-any` lint errors when `npm run lint` is executed.
2. WHERE `Record<string, any>` is used for a known data shape, THE Platform SHALL replace it with a named interface or `Record<string, unknown>` if the shape is genuinely dynamic.
3. WHERE `as any` is used to bypass a type error, THE Platform SHALL resolve the underlying type mismatch rather than suppressing it.

---

### Requirement 15: Replace Raw img Tags with Next.js Image Component

**User Story:** As a developer, I want raw `<img>` elements replaced with the Next.js `<Image>` component, so that images are automatically optimized and the `@next/next/no-img-element` lint warning is eliminated.

#### Acceptance Criteria

1. THE Platform SHALL produce zero `@next/next/no-img-element` lint warnings when `npm run lint` is executed.
2. WHERE a raw `<img>` tag is used for a user-supplied or dynamic URL where dimensions are unknown, THE Platform SHALL use the Next.js `<Image>` component with explicit `width`, `height`, or `fill` props.
3. THE replacement SHALL preserve the existing visual layout and alt text.

---

### Requirement 16: Delete Garbage Root Files

**User Story:** As a developer, I want all non-source, non-config, non-documentation files removed from the project root, so that the repository is clean and `ls` output is not polluted with shell command fragments.

#### Acceptance Criteria

1. THE Platform SHALL NOT contain any of the following files or directories at the project root: `(`, `...)`, `...)\``, `cd`, `Click`, `eslint`, `npm`, `OFFLINE_THRESHOLD_MS`, `setShowOfflineOnly(!showOfflineOnly)}`, `{`, `-p/` directory.
2. THE Platform SHALL retain all legitimate root files including `package.json`, `tsconfig.json`, `next.config.ts`, `middleware.ts`, `eslint.config.mjs`, `.env.local`, `.env.example`, `.gitignore`, `README.md`, `AGENTS.md`, `CLAUDE.md`, `tailwind.config.ts`, `postcss.config.mjs`, and SQL migration files.
3. WHEN the garbage files are deleted, THE Platform build and lint commands SHALL continue to succeed without referencing the deleted files.
