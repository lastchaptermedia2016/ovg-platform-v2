/**
 * Shared auth-flow error classification for the Client (Zeeder) surface.
 *
 * Pure utility — no framework or runtime imports — so it is safe to unit-test
 * under the existing Node-environment Vitest config.
 *
 * A browser-level network failure (unreachable/paused Supabase host, opaque
 * CORS preflight rejection, or a proxy block) is surfaced by `fetch` as a
 * `TypeError: Failed to fetch`. We classify it distinctly from a Supabase
 * domain error so the UI can show an actionable message.
 */

export type AuthFlowError = {
  /** User-facing message. */
  message: string;
  /** Whether the error is a network-level transport failure. */
  isNetwork: boolean;
};

const NETWORK_MESSAGE =
  "Unable to reach the authentication service. Verify your Supabase project is running and that CORS allows this origin.";

const FALLBACK_MESSAGE = "An unexpected error occurred. Please try again.";

/**
 * Detect browser-level network failures surfaced as `TypeError` by `fetch`.
 * Only matches `TypeError` whose message includes "Failed to fetch" to avoid
 * misclassifying unrelated TypeErrors.
 */
export function isNetworkError(err: unknown): boolean {
  if (err == null) return false;

  const isTypeErr =
    err instanceof TypeError ||
    (typeof err === "object" &&
      (err as { name?: unknown }).name === "TypeError");

  if (!isTypeErr) return false;

  const msg =
    err instanceof Error
      ? err.message
      : String((err as { message?: unknown }).message ?? "");

  return /failed to fetch/i.test(msg);
}

function isObjectLike(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Classify an error caught during a Supabase auth flow.
 *
 * - Supabase domain errors (plain objects with a `message`, e.g.
 *   `AuthError`/`PostgrestError`) → return their own message, `isNetwork: false`.
 * - A thrown `TypeError("Failed to fetch")` → network message, `isNetwork: true`.
 * - Anything else → generic fallback.
 */
export function classifyAuthError(error: unknown): AuthFlowError {
  if (isNetworkError(error)) {
    return { message: NETWORK_MESSAGE, isNetwork: true };
  }

  if (isObjectLike(error) && typeof (error as { message?: unknown }).message === "string") {
    return { message: (error as { message: string }).message, isNetwork: false };
  }

  if (typeof error === "string") {
    return { message: error, isNetwork: false };
  }

  return { message: FALLBACK_MESSAGE, isNetwork: false };
}
