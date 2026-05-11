---
name: production-excellence-lint
description: Resolves lint, type, and runtime quality debt to production standards with root-cause refactors. Use when users ask to fix lint/type errors, harden React hooks and state flow, remove any types, or clean warnings/errors in enterprise React/Next.js codebases.
---

# Production Excellence Lint Hardening

## Purpose

Use this skill to drive lint/type cleanup with permanent fixes, not suppressions.

## Operating Principles

- Fix root causes; do not use `@ts-ignore`, `@ts-nocheck`, or quick patches unless explicitly requested.
- Preserve behavior while improving correctness, type safety, and maintainability.
- Treat hook dependency correctness and stale-closure prevention as first-class requirements.
- Prefer typed domain models over `any`, especially for tenant/client and API payload shapes.
- Re-verify after each tranche with lint/build commands.

## Execution Workflow

1. **Collect current evidence**
   - Run lint/build once to capture current blockers.
   - Cluster findings by file and severity.

2. **Work in tranches**
   - Default: single-file tranche first (highest-impact hotspot), then expand.
   - Finish each target file to clean state before moving on.

3. **Apply production-grade fixes**
   - **React effects/callbacks**: make dependency arrays accurate and exhaustive.
   - **State flow**: eliminate sync setState anti-patterns in effects where flagged.
   - **Type safety**: replace `any` with specific interfaces/types and guards.
   - **Unused code**: remove dead imports/vars/state only when truly unused.
   - **JSX correctness**: fix unescaped entities/comment syntax when present.

4. **Guard integration boundaries**
   - Check related components/hooks/routes that share contracts.
   - If a “fix” conflicts with established behavior patterns, surface it before broad refactor.

5. **Validate continuously**
   - Re-run lint for changed files and globally as needed.
   - Run full build/typecheck before declaring done.

## Default Quality Gates

- No new lint/type/runtime regressions introduced.
- Changed files have zero relevant lint issues.
- Build passes (`npm run build`) when requested or when making cross-cutting fixes.
- No suppression-based shortcuts unless user explicitly asks.

## Communication Pattern

- Present findings first (by severity) when reviewing.
- During implementation, report concise progress per tranche.
- End with: files changed, root causes fixed, and verification results.

## Additional Guidance

- See [reference.md](reference.md) for triage rubric and fix patterns.
