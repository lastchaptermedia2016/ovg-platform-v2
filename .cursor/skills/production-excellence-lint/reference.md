# Production Lint Hardening Reference

## Triage Rubric

Prioritize in this order:

1. Build/type blockers (`tsc`, `next build`, runtime reference errors)
2. React correctness issues (`react-hooks/*`, state-in-effect, stale closures)
3. Type safety debt (`no-explicit-any`, broken API contracts)
4. JSX correctness (`no-unescaped-entities`, `jsx-no-comment-textnodes`, undef symbols)
5. Warning cleanup (`no-unused-vars`, non-critical framework warnings)

## Recommended Fix Patterns

### React hook integrity

- Keep dependencies exhaustive and stable.
- If dependency churn is high, stabilize callbacks with `useCallback` or move logic.
- Avoid calling state-setting routines synchronously in effect bodies when lint flags cascading render risks.

### Type-safe data contracts

- Replace `any` with small focused interfaces close to usage.
- Prefer narrow unions for known enums/states.
- Add typed guards for optional/legacy fields instead of broad casting.

### API route hardening

- Capture update query `data` and `error` explicitly.
- Use `.select()` when row-count validation is needed after updates.
- Keep structured error responses and clear status mapping.

### Runtime safety

- Remove orphaned render blocks that reference deleted state.
- If state is intentionally removed, clean related JSX and handlers in same tranche.

## Verification Commands

- Targeted lint: `npm run lint -- "<path>"`
- Full lint: `npm run lint`
- Production build: `npm run build`

Run targeted checks during a tranche and full checks at tranche completion.

## Reporting Template

- **Findings**
  - Critical:
  - Major:
  - Minor:
- **Changes made**
  - File:
  - Root cause:
  - Fix:
- **Verification**
  - Commands:
  - Result:
