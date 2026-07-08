<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

<!-- END:nextjs-agent-rules -->

<!-- BEGIN:scope-boundary-rules -->

# Client ↔ Reseller scope isolation is enforced

The platform ships two distinct front-end surfaces that MUST NOT cross-pollinate:

- **Client (Zeeder) surface** — routes under `src/app/client/**` (route group `src/app/(client)/**`) and components under `src/components/client/**`, `src/components/ui/zeeder/**`, plus the voice bridge `src/hooks/useZeederVoice.ts`.
- **Reseller surface** — routes under `src/app/(dashboard)/reseller/**` and components under `src/components/reseller/**`, plus the voice hook `src/hooks/use-voice-command.ts`.

## Hard rules for agents

1. Never import or edit Reseller-domain code when working on a Client (Zeeder) task, and vice-versa. `useZeederVoice.ts` and `SystemMicButton.tsx` are declared **zero-dependency** with respect to `src/contexts/HannahContext`, `src/hooks/use-voice-command`, and `src/lib/reseller/*` — keep them that way.
2. `SYSTEM_HELP` is elevated to a visual UI modal **only** in the Client surface (`ClientHelpModal`, mounted in `SystemMicButton`). Do not port the modal trigger into the Reseller `clients/page.tsx` help popover.
3. Shared AI capability metadata lives in `src/lib/audit/feature-registry.ts` (`FEATURE_REGISTRY`) and the client-safe taxonomy `src/lib/audit/command-types.ts`. Both are importable from `'use client'` components — do NOT reintroduce a server-only import path into these files.
4. Headless infrastructure commands (`SYSTEM_EXECUTE_BUILD`, `SYSTEM_SYNC_CRM`, `SYSTEM_RELOAD_ASSETS`) are queued into `system_tasks` and executed by `src/lib/orchestrator/worker.ts`; they have no UI modal by design.

<!-- END:scope-boundary-rules -->
