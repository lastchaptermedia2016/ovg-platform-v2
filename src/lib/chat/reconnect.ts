/**
 * Realtime reconnection backoff logic for the Client (Zeeder) live-chat surface.
 *
 * Extracted as a pure helper so the exponential-backoff calculation can be
 * unit-tested under the existing Node-environment Vitest config without a
 * WebSocket or DOM.
 */

/**
 * Compute the delay (ms) before the next reconnect attempt using exponential
 * backoff, capped at `maxDelay`.
 *
 * Mirrors the original inline formula in `LiveChatInbox`:
 *   `Math.min(baseDelay * 2 ** attempt, maxDelay)`
 *
 * @param attempt   Zero-based attempt index (0 = first retry).
 * @param baseDelay Initial delay in ms.
 * @param maxDelay  Upper bound in ms.
 * @returns Delay in milliseconds (never below `baseDelay`).
 */
export function computeReconnectDelay(
  attempt: number,
  baseDelay: number,
  maxDelay: number,
): number {
  const n = attempt < 0 ? 0 : attempt;
  return Math.min(baseDelay * 2 ** n, maxDelay);
}
