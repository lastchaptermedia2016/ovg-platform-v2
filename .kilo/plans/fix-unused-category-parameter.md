# Fix Unused Parameter in Clients Portfolio

## Objective
Silence the unused parameter linter warning for `category` in `handleSelectTenant` callback.

## Target File
- `src/app/(dashboard)/reseller/[resellerSlug]/clients/page.tsx`

## Change Required
Line 472: Prefix unused `category` parameter with underscore to match project's unused arguments pattern (`/^_/u`).

```diff
- const handleSelectTenant = useCallback((tenantId: string, clientName?: string, category?: string) => {
+ const handleSelectTenant = useCallback((tenantId: string, clientName?: string, _category?: string) => {
```

## Verification
- Run `npm run lint` to confirm zero warnings
- Run `next build` to confirm zero errors