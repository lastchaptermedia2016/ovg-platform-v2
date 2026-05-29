/**
 * Guards against unresolved Next.js route param proxies.
 *
 * `useParams()` can return a Proxy object during SSR/hydration that hasn't resolved
 * to a primitive string yet. `String(proxy)` produces `"[object Object]"`.
 * This function checks for that failure mode along with bare hydration markers.
 */
export const isInvalidSlug = (slug: string): boolean =>
  !slug || slug.includes('[') || slug.includes(']') || slug.includes('object');