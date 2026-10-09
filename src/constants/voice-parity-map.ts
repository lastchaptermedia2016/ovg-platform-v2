/**
 * @file voice-parity-map.ts
 *
 * Single source of truth for the Voice-to-UI Functional Parity suite.
 *
 * "Parity" means: every screen a human can reach by clicking, and every action
 * they can trigger, has an equivalent voice utterance that the
 * `/api/client/process-command` router resolves to the SAME destination/action.
 *
 * This map is consumed by `voice-parity.test.ts`, which drives each utterance
 * through the real route handler and asserts the resolved `actionType` (and,
 * for navigation, the concrete `href`/`tab`). When a route or an action is
 * added to the dashboard, add its entry here — the coverage test fails loudly
 * if a dashboard page is left without a voice route (an "orphaned feature").
 *
 * Pure leaf module: no imports, no React, no server-only code, so both the
 * (server) route test and any future client test can import it.
 */

/** The kind of parity case. */
export type VoiceParityCategory = 'navigation' | 'action';

/**
 * One voice-to-UI parity case.
 *
 * - `navigation`: the utterance must resolve to `SYSTEM_NAVIGATE` with the
 *   given `expectedHref`. `expectedTab` is the payload `tab` (null for the
 *   dashboard landing route). The Persona viewport is the ONE exception — see
 *   {@link VoiceParityCase.personaNav} — it resolves to `SYSTEM_UPDATE_BRANDING`
 *   with `tab: 'persona'` because the hook navigates there via the branding
 *   dispatch. Flag it so the test asserts the correct contract.
 * - `action`: the utterance must resolve to `expectedActionType`. Navigation
 *   href/tab assertions are skipped.
 */
export interface VoiceParityCase {
  /** Stable identifier, also used in test failure messages. */
  id: string;
  category: VoiceParityCategory;
  /** One or more natural-language utterances that must ALL resolve identically. */
  utterances: string[];
  /** The actionType the router must return for every utterance. */
  expectedActionType: string;
  /** For navigation cases: the concrete, routable href the router must return. */
  expectedHref?: string;
  /** For navigation cases: the payload `tab` (null for the dashboard landing). */
  expectedTab?: string | null;
  /**
   * True ONLY for the Persona viewport, whose router contract is
   * `SYSTEM_UPDATE_BRANDING` + `tab: 'persona'` rather than `SYSTEM_NAVIGATE`.
   * When set, `expectedHref` is asserted against the client-side href the hook
   * derives from the tab (informational) rather than the payload href.
   */
  personaNav?: boolean;
}

/**
 * Every routable dashboard page, as it exists on disk under
 * `src/app/client/dashboard`. The coverage test derives the real page tree and
 * asserts each `navigationTarget`-eligible route appears in {@link VOICE_PARITY_CASES}.
 */
export interface DashboardRoute {
  /** The routable href. */
  href: string;
  /** Whether this route is reachable by a voice NAVIGATION command. */
  navigationTarget: boolean;
}

export const DASHBOARD_ROUTES: readonly DashboardRoute[] = [
  { href: '/client/dashboard', navigationTarget: true },
  { href: '/client/dashboard/appointments', navigationTarget: true },
  { href: '/client/dashboard/studio/branding', navigationTarget: true },
  { href: '/client/dashboard/studio/persona', navigationTarget: true },
  { href: '/client/dashboard/studio/knowledge', navigationTarget: true },
  { href: '/client/dashboard/studio/integrations', navigationTarget: true },
];

/**
 * The canonical voice-parity cases. Each `utterances` entry is a phrasing a
 * user might speak; the router must resolve them all to the same action.
 */
export const VOICE_PARITY_CASES: readonly VoiceParityCase[] = [
  // ── Navigation: dashboard landing ──────────────────────────────────────
  {
    id: 'nav-dashboard-landing',
    category: 'navigation',
    utterances: ['take me to my dashboard', 'open my dashboard', 'show my home page'],
    expectedActionType: 'SYSTEM_NAVIGATE',
    expectedHref: '/client/dashboard',
    expectedTab: null,
  },

  // ── Navigation: appointments / leads ───────────────────────────────────
  {
    id: 'nav-appointments',
    category: 'navigation',
    utterances: [
      'take me to my appointments',
      'open my appointments',
      'show my leads',
      'go to my appointment requests',
    ],
    expectedActionType: 'SYSTEM_NAVIGATE',
    expectedHref: '/client/dashboard/appointments',
    expectedTab: 'appointments',
  },

  // ── Navigation: studio viewports ───────────────────────────────────────
  {
    id: 'nav-studio-branding',
    category: 'navigation',
    utterances: ['open the branding page', 'take me to branding', 'show my brand settings'],
    expectedActionType: 'SYSTEM_NAVIGATE',
    expectedHref: '/client/dashboard/studio/branding',
    expectedTab: 'branding',
  },
  {
    // Persona is the one viewport whose router contract is SYSTEM_UPDATE_BRANDING
    // + tab:'persona' (the hook navigates via the branding dispatch).
    id: 'nav-studio-persona',
    category: 'navigation',
    utterances: ['open the persona page', 'take me to the persona settings'],
    expectedActionType: 'SYSTEM_UPDATE_BRANDING',
    expectedHref: '/client/dashboard/studio/persona',
    expectedTab: 'persona',
    personaNav: true,
  },
  {
    id: 'nav-studio-knowledge',
    category: 'navigation',
    utterances: ['take me to the knowledge page', 'open my faq', 'show my training documents'],
    expectedActionType: 'SYSTEM_NAVIGATE',
    expectedHref: '/client/dashboard/studio/knowledge',
    expectedTab: 'knowledge',
  },
  {
    id: 'nav-studio-integrations',
    category: 'navigation',
    utterances: ['where is my crm', 'open the integrations tab', 'show my integrations'],
    expectedActionType: 'SYSTEM_NAVIGATE',
    expectedHref: '/client/dashboard/studio/integrations',
    expectedTab: 'integrations',
  },

  // ── Actions (non-navigation) ───────────────────────────────────────────
  {
    id: 'action-telemetry',
    category: 'action',
    utterances: ['show my telemetry', 'how is my performance', 'show me the analytics'],
    expectedActionType: 'SYSTEM_TELEMETRY',
  },
  {
    id: 'action-toggle-agent',
    category: 'action',
    utterances: ['enable the agent', 'disable the ai', 'toggle the agent'],
    expectedActionType: 'SYSTEM_TOGGLE_AGENT',
  },
  {
    id: 'action-update-branding',
    category: 'action',
    utterances: ['update my branding', 'change the header color'],
    expectedActionType: 'SYSTEM_UPDATE_BRANDING',
  },
];

/** Convenience: only the navigation cases (used by the coverage test). */
export const NAVIGATION_PARITY_CASES: readonly VoiceParityCase[] =
  VOICE_PARITY_CASES.filter((c) => c.category === 'navigation');

