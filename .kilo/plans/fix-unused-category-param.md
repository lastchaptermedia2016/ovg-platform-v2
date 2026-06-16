# Fix unused-vars lint warning in clients view

## Issue
`src/app/(dashboard)/reseller/[resellerSlug]/clients/page.tsx:472` violates the project eslint rule `@typescript-eslint/no-unused-vars` — the third parameter `category` in the `handleSelectTenant` callback is defined but never referenced in the function body. The rule allows intentionally unused args only if they match the `/^_/u` pattern.

## Fix
Rename the third parameter from `category` to `_category` on line 472.

### Change
```diff
-  const handleSelectTenant = useCallback((tenantId: string, clientName?: string, category?: string) => {
+  const handleSelectTenant = useCallback((tenantId: string, clientName?: string, _category?: string) => {
```

## Verification
Run the existing validation scripts to confirm the warning is cleared:
```bash
npm run lint
next build
```

## Guardrails
- Do not modify adjacent layout tokens or any global hook wiring.
- Do not change the callback signature beyond the unused parameter rename.
