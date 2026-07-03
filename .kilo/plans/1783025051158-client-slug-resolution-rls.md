# Fix Client Slug Resolution - RLS Flow

## Problem
User authentication → `resolveClientSlug(session.user.id)` → "Tenant Not Found" error

**Root Cause:** Querying `tenants.id` with `session.user.id` (auth UUID) violates RLS policy.

## Schema Reality
```
auth.users.id ──user_resellers──► resellers.id ──(has)──► resellers.slug
                          │
                          └──► user_resellers.reseller_id
```

**RLS Policy on tenants:**
```sql
USING (reseller_id IN (
  SELECT ur.reseller_id FROM user_resellers WHERE ur.user_id = auth.uid()
))
```

## Fix Required

### Task 1: Update resolve-client-slug.ts
**Current (broken):**
```typescript
// Queries tenants by session.user.id - WRONG!
from('tenants').select('*', 'resellers(slug)').eq('id', trimmed)
```

**Correct Flow:**
```typescript
// Step 1: Get user's reseller_id from user_resellers
const { data: ur } = await supabase
  .from('user_resellers')
  .select('reseller_id')
  .eq('user_id', trimmed)
  .maybeSingle();

// Step 2: Get slug from resellers using reseller_id
const { data: reseller } = await supabase
  .from('resellers')
  .select('slug')
  .eq('id', ur.reseller_id)
  .maybeSingle();

return { data: reseller?.slug ?? null, error: null };
```

### Task 2: Remove Broken user_tenants Reference
- `AIPersonaSettings.tsx` references `user_tenants` (line 77) - **table doesn't exist**
- Either create this table OR use the correct `user_resellers` → `resellers` path

### Task 3: Diagnostic Queries
**Check if record exists (service role):**
```sql
-- Run in Supabase dashboard with service role
SELECT t.id, t.name, t.reseller_id, r.slug
FROM tenants t
JOIN resellers r ON t.reseller_id = r.id
WHERE t.id = '<tenant-uuid>';
```

**Check user_resellers linkage:**
```sql
-- Run with service role
SELECT ur.user_id, ur.reseller_id, r.slug
FROM user_resellers ur
JOIN resellers r ON ur.reseller_id = r.id
WHERE ur.user_id = '748a71f9-9a33-495d-8ed6-27da3101c4cb';
```

## Validation
1. Build and run app
2. Check `[TRACE resolveClientSlug]` logs show:
   - Query result from `user_resellers`
   - Query result from `resellers`
   - Final slug value

## Decision Points
- Does the user intend to create `user_tenants` table, or should we use the existing `user_resellers` path?
- Should `resolveClientSlug` return the reseller slug (for `/client` portal) or tenant slug (for reseller context)?