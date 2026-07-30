# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Fixed
- **Test suite stabilization** — All 16 test files (285 tests) now pass cleanly with `npm test`.
- **Supabase mock regressions in `client-process-command.test.ts`** — Resolved `supabase.from is not a function` errors by adding a `createMockChain()` helper that provides fluent chainable builder methods (`from`, `select`, `eq`, `order`, etc.) and terminal methods (`maybeSingle`, `single`, `insert`). Anonymous caller tests now resolve the Demo Business tenant correctly via the `supabaseAdmin` mock.
- **Thenable spreading pitfall** — Documented and fixed the pattern where spreading a mock client's `then` property onto a resolved object causes `await clientPromise` to invoke the chain's `then` instead of returning the client instance. The fix destructures `then` out before spreading.

### Added
- `typecheck` script (`tsc --noEmit`) added to `package.json` for type-checking.
- Testing Guidelines section in `README.md` covering the Supabase fluent mock pattern and thenable spreading pitfall.
- Test suite status documentation in `README.md` (16 files, 285 tests, all green).

### Changed
- `README.md` Development section updated to include `npm test` and `npm run typecheck` commands.
