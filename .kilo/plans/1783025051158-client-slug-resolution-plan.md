# Fix Client Slug Resolution - Direct Reseller Lookup

**Decision:** The correct flow is `auth.users.id → user_resellers.reseller_id → resellers.slug`. The tenants table is unnecessary for the `/client` portal identity flow.

## Task 1: Rewrite resolve-client-slug.ts

**Current:**
- Queries `tenants` table with `id = session.user.id` (wrong - tenant UUID !== auth UUID)
- Queries `resellers` via join (correct approach but wrong starting point)

**New Flow:**
```
1. user_resellers(user_id = userId) → reseller_id
   - if no row: return null + "No user-reseller link"
   - if null reseller_id: return null + "Missing reseller_id"

2. resellers(id = reseller_id) → slug
   - if no row: return null + "Reseller not found"
   - if null slug: return null + "Reseller slug missing"

3. Return slug
```

## Task 2: Update layout.tsx
- Already handles `null` slugResult with throw
- No changes needed

## Task 3: Fix AIPersonaSettings.tsx
- Currently uses non-existent `user_tenants` table (line 76-80)
- Replace with `user_resellers` → `resellers.tenant_id` OR `user_resellers` → `resellers` join
- **Decision needed here** - see open question

## Task 4: Verification
- Confirm `[TRACE resolveClientSlug]` logs show: `reseller_id from user_resellers:`, then `Final slug:`
- Confirm ZeederVoice receives `resolvedResellerId` and proceeds to API call

## RLS Verification
- `user_resellers` policy: `auth.uid() = user_id` (correct, works for Step 1)
- `resellers` table: **NO explicit RLS policy found** - direct query should work, but should be hardened
- **Risk:** If `resellers` RLS is enabled in the future without a correct policy, this flow will break again

## Open Question
AIPersonaSettings.tsx queries `user_tenants` (non-existent). Should we:
1. Replace with `user_resellers → resellers.tenant_id` path (writes tenant_id to context)
2. Keep using `user_resellers → resellers.slug` (reseller context for reseller dashboard)
3. Create the missing `user_tenants` table

**My recommendation:** Option 1 for AIPersonaSettings - it uses tenant context (tenant_id for widget config), so fetching via `user_resellers.reseller_id → resellers` is wrong. It needs tenant_id, not reseller slug.

## Definition of Done
- `resolveClientSlug('748a71f9-9a33-495d-8ed6-27da3101c4cb')` returns a valid reseller slug
- ZeederVoice proceeds to API call (no early return at line 171)
- Network tab shows POST to `/api/ai/process-command` with valid `resellerId`