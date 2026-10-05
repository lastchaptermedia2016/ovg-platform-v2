import { NextResponse } from 'next/server';
import { lookup } from 'node:dns/promises';
import { createClient } from '@/lib/supabase/server';

/**
 * Server-side brand scraper.
 *
 * This endpoint performs a user-supplied outbound HTTP request, which makes it
 * a classic SSRF pivot. The hardening below is layered:
 *   1. authentication (401)
 *   2. strict URL validation + protocol allowlist (400)
 *   3. hostname / IP-literal blocklist covering loopback, RFC1918, CGNAT,
 *      link-local (incl. the 169.254.169.254 cloud metadata address), multicast
 *      and reserved space (400)
 *   4. DNS resolution defense-in-depth — every A/AAAA answer is re-checked
 *      against the same IP guard (400)
 *   5. redirect refusal, timeout and a hard 2 MiB response cap (502)
 *
 * Client-facing error strings are always static. Nothing about the offending
 * URL, the upstream status text or the internal error message is echoed back.
 */

const MAX_URL_LENGTH = 2048;
const MAX_BODY_BYTES = 2 * 1024 * 1024; // 2 MiB
const FETCH_TIMEOUT_MS = 8000;

const ALLOWED_PROTOCOLS: ReadonlySet<string> = new Set(['http:', 'https:']);

// Internal / non-routable suffixes that must never be scraped.
const BLOCKED_HOST_SUFFIXES: readonly string[] = [
  '.localhost',
  '.local',
  '.internal',
  '.home.arpa',
];

/**
 * IPv4 ranges denied outright. Each entry is [network, prefix length] and is
 * matched on the parsed octets, so `http://0177.0.0.1/` and similar
 * encodings cannot slip past a naive string compare.
 */
const BLOCKED_IPV4_RANGES: ReadonlyArray<readonly [string, number]> = [
  ['0.0.0.0', 8], // "this network"
  ['10.0.0.0', 8], // RFC1918 private
  ['100.64.0.0', 10], // CGNAT
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local, includes 169.254.169.254 metadata
  ['172.16.0.0', 12], // RFC1918 private
  ['192.0.0.0', 24], // IETF protocol assignments
  ['192.0.2.0', 24], // TEST-NET-1
  ['192.88.99.0', 24], // 6to4 relay anycast
  ['192.168.0.0', 16], // RFC1918 private
  ['198.18.0.0', 15], // benchmarking
  ['198.51.100.0', 24], // TEST-NET-2
  ['203.0.113.0', 24], // TEST-NET-3
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved
];

/** IPv6 ranges denied outright, as [network, prefix length] over 128 bits. */
const BLOCKED_IPV6_RANGES: ReadonlyArray<readonly [string, number]> = [
  ['::', 128], // unspecified
  ['::1', 128], // loopback
  ['fc00::', 7], // unique local
  ['fe80::', 10], // link-local
  ['fec0::', 10], // deprecated site-local
  ['ff00::', 8], // multicast
];

/**
 * IPv6 ranges that *embed* a 32-bit IPv4 address. Without special handling
 * these are a trivial bypass: `http://[::ffff:127.0.0.1]/` carries an IPv6
 * hostname but still routes to loopback. Each entry is
 * [network, prefix length, group index where the embedded IPv4 starts].
 */
const EMBEDDED_IPV4_IPV6_RANGES: ReadonlyArray<readonly [string, number, number]> = [
  ['::ffff:0:0', 96, 6], // IPv4-mapped
  ['::', 96, 6], // IPv4-compatible (deprecated, still routable by some stacks)
  ['64:ff9b::', 96, 6], // NAT64 well-known prefix
  ['2002::', 16, 2], // 6to4
];

export type SafeUrlResult =
  | { ok: true; url: URL }
  | { ok: false; reason: string };

type BoundedBodyResult =
  | { ok: true; text: string }
  | { ok: false; reason: string };

/** Strict dotted-quad parse. Returns null for anything else (incl. leading zeros). */
function parseIpv4(address: string): number[] | null {
  const parts = address.split('.');
  if (parts.length !== 4) return null;
  const octets: number[] = [];
  for (const part of parts) {
    if (!/^(0|[1-9]\d{0,2})$/.test(part)) return null;
    const value = Number(part);
    if (value > 255) return null;
    octets.push(value);
  }
  return octets;
}

/** Expand an IPv6 literal (incl. `::` compression and a trailing dotted quad) to 8 groups. */
function parseIpv6(address: string): number[] | null {
  let value = address;
  const zoneIndex = value.indexOf('%');
  if (zoneIndex !== -1) value = value.slice(0, zoneIndex);
  if (value.length === 0 || !value.includes(':')) return null;

  const doubleColonIndex = value.indexOf('::');
  if (doubleColonIndex !== -1 && value.indexOf('::', doubleColonIndex + 2) !== -1) {
    return null; // more than one "::" is invalid
  }

  const headSource = doubleColonIndex === -1 ? value : value.slice(0, doubleColonIndex);
  const tailSource = doubleColonIndex === -1 ? '' : value.slice(doubleColonIndex + 2);

  const toGroups = (source: string): number[] | null => {
    if (source === '') return [];
    const parts = source.split(':');
    const lastIndex = parts.length - 1;

    // A trailing dotted-quad occupies the final two 16-bit groups.
    if (parts[lastIndex].includes('.')) {
      const octets = parseIpv4(parts[lastIndex]);
      if (!octets) return null;
      const high = (octets[0] << 8) | octets[1];
      const low = (octets[2] << 8) | octets[3];
      parts.pop();
      parts.push(high.toString(16), low.toString(16));
    }

    const groups: number[] = [];
    for (const part of parts) {
      if (!/^[0-9a-fA-F]{1,4}$/.test(part)) return null;
      groups.push(parseInt(part, 16));
    }
    return groups;
  };

  const headGroups = toGroups(headSource);
  if (!headGroups) return null;

  if (doubleColonIndex === -1) {
    return headGroups.length === 8 ? headGroups : null;
  }

  const tailGroups = toGroups(tailSource);
  if (!tailGroups) return null;
  const missing = 8 - headGroups.length - tailGroups.length;
  if (missing < 0) return null;
  return [...headGroups, ...new Array<number>(missing).fill(0), ...tailGroups];
}

function isIpv4InRange(octets: number[], network: number[], bits: number): boolean {
  let remaining = bits;
  for (let i = 0; i < 4 && remaining > 0; i += 1) {
    const take = Math.min(8, remaining);
    const mask = take === 0 ? 0 : (0xff << (8 - take)) & 0xff;
    if ((octets[i] & mask) !== (network[i] & mask)) return false;
    remaining -= take;
  }
  return remaining <= 0;
}

function isIpv6InRange(groups: number[], network: number[], bits: number): boolean {
  let remaining = bits;
  for (let i = 0; i < 8 && remaining > 0; i += 1) {
    const take = Math.min(16, remaining);
    const mask = take === 0 ? 0 : (0xffff << (16 - take)) & 0xffff;
    if ((groups[i] & mask) !== (network[i] & mask)) return false;
    remaining -= take;
  }
  return remaining <= 0;
}

function isBlockedIpv4(octets: number[]): boolean {
  return BLOCKED_IPV4_RANGES.some(([network, bits]) => {
    const parsed = parseIpv4(network);
    return parsed ? isIpv4InRange(octets, parsed, bits) : false;
  });
}

/**
 * True when the address is not safe to connect to. Non-IP input (a hostname)
 * returns false — use `isBlockedHostname` for host names.
 */
export function isBlockedIp(address: string): boolean {
  const value = address.trim().toLowerCase();
  if (value.length === 0) return true;

  const ipv4 = parseIpv4(value);
  if (ipv4) return isBlockedIpv4(ipv4);

  if (!value.includes(':')) return false;

  const groups = parseIpv6(value);
  if (!groups) return true; // unparseable IPv6 literal -> refuse

  for (const [network, bits] of BLOCKED_IPV6_RANGES) {
    const parsed = parseIpv6(network);
    if (parsed && isIpv6InRange(groups, parsed, bits)) return true;
  }

  for (const [network, bits, offset] of EMBEDDED_IPV4_IPV6_RANGES) {
    const parsed = parseIpv6(network);
    if (!parsed || !isIpv6InRange(groups, parsed, bits)) continue;
    // Embedded IPv4 — extract the trailing 32 bits and re-run the IPv4 guard.
    const octets = [
      groups[offset] >> 8,
      groups[offset] & 0xff,
      groups[offset + 1] >> 8,
      groups[offset + 1] & 0xff,
    ];
    return isBlockedIpv4(octets);
  }

  return false;
}

/**
 * True when a URL host component must not be fetched: loopback / internal
 * suffixes, dotless single-label hosts, and blocked IP literals.
 */
export function isBlockedHostname(hostname: string): boolean {
  let host = hostname.trim().toLowerCase();
  if (host.startsWith('[') && host.endsWith(']')) host = host.slice(1, -1);
  while (host.endsWith('.')) host = host.slice(0, -1); // FQDN root dot
  if (host.length === 0) return true;

  if (host === 'localhost' || BLOCKED_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix))) {
    return true;
  }

  if (host.includes(':')) return isBlockedIp(host); // bracketed IPv6 literal

  if (parseIpv4(host)) return isBlockedIpv4(parseIpv4(host) as number[]);

  // Dotless / single-label hosts resolve through search domains or are
  // machine names on the local network.
  if (!host.includes('.')) return true;

  // A dotted-numeric host that is not a valid dotted quad (`0177.0.0.1`,
  // `1.2.3.4.5`, `0x7f.0.0.1`) is an obfuscation attempt, not a domain. No real
  // public TLD is numeric, so requiring an alphabetic final label is safe.
  if (/^[0-9.]+$/.test(host)) return true;
  const finalLabel = host.slice(host.lastIndexOf('.') + 1);
  if (!/[a-z]/.test(finalLabel)) return true;

  return false;
}

function isIpLiteral(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, '');
  return host.includes(':') || parseIpv4(host) !== null;
}

/**
 * Synchronous half of validation: length cap, bare-domain normalization,
 * protocol allowlist and hostname/IP-literal checks. No network I/O.
 */
export function parseTargetUrl(rawUrl: string): SafeUrlResult {
  const trimmed = rawUrl.trim();
  if (trimmed.length === 0) return { ok: false, reason: 'URL is required' };
  if (trimmed.length > MAX_URL_LENGTH) return { ok: false, reason: 'URL is too long' };

  // Preserve the existing UX affordance: bare domains are accepted. A value is
  // only treated as already-schemed when it carries a real scheme — either
  // with "//" or a dotless alpha scheme — so `example.com:8080` still works
  // while `file:` / `javascript:` / `data:` reach the allowlist and are denied.
  const hasExplicitScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed);
  const hasBareScheme = !hasExplicitScheme && /^[a-zA-Z][a-zA-Z0-9+-]*:/.test(trimmed);
  const candidate = hasExplicitScheme || hasBareScheme ? trimmed : `https://${trimmed}`;

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return { ok: false, reason: 'Invalid URL' };
  }

  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
    return { ok: false, reason: 'Unsupported URL protocol' };
  }
  if (isBlockedHostname(parsed.hostname)) {
    return { ok: false, reason: 'Blocked target host' };
  }

  return { ok: true, url: parsed };
}

/**
 * Full validation including DNS resolution.
 *
 * The DNS pass closes the direct-DNS SSRF vector (a public name that resolves
 * to 127.0.0.1 or 169.254.169.254). It is defense-in-depth only: a TOCTOU
 * window remains between this lookup and the subsequent `fetch`, which
 * performs its own resolution. Closing that fully would require pinning the
 * validated IP via a custom `http.Agent`/dispatcher and connecting to it with
 * the correct Host/SNI header.
 */
export async function assertSafeTargetUrl(rawUrl: string): Promise<SafeUrlResult> {
  const parsed = parseTargetUrl(rawUrl);
  if (!parsed.ok) return parsed;
  const { url } = parsed;

  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  if (!isIpLiteral(hostname)) {
    let addresses: Array<{ address: string }>;
    try {
      addresses = await lookup(hostname, { all: true, verbatim: true });
    } catch {
      return { ok: false, reason: 'Unable to resolve target host' };
    }
    if (!Array.isArray(addresses) || addresses.length === 0) {
      return { ok: false, reason: 'Unable to resolve target host' };
    }
    if (addresses.some((entry) => isBlockedIp(entry.address))) {
      return { ok: false, reason: 'Blocked target host' };
    }
  }

  return { ok: true, url };
}

/** Reads at most MAX_BODY_BYTES, aborting the stream as soon as the cap is passed. */
async function readBoundedBody(response: Response): Promise<BoundedBodyResult> {
  const declaredLength = response.headers.get('content-length');
  if (declaredLength !== null) {
    const parsedLength = Number(declaredLength);
    if (Number.isFinite(parsedLength) && parsedLength > MAX_BODY_BYTES) {
      return { ok: false, reason: 'Target page too large' };
    }
  }

  if (response.body === null) {
    // Empty/absent body: controlled result rather than a crash.
    return { ok: true, text: '' };
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let received = 0;
  let text = '';

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      received += value.byteLength;
      if (received > MAX_BODY_BYTES) {
        await reader.cancel();
        return { ok: false, reason: 'Target page too large' };
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } catch {
    await reader.cancel().catch(() => undefined);
    return { ok: false, reason: 'Failed to read target website' };
  } finally {
    reader.releaseLock();
  }

  return { ok: true, text };
}

/** Resolve a scraped asset reference against the target origin; '' on anything unsafe. */
function resolveAssetUrl(candidate: string, baseUrl: string): string {
  const trimmed = candidate.trim();
  if (trimmed.length === 0) return '';
  let resolved: URL;
  try {
    resolved = new URL(trimmed, baseUrl);
  } catch {
    return '';
  }
  // A hostile page can advertise `javascript:` or `data:` assets.
  if (!ALLOWED_PROTOCOLS.has(resolved.protocol)) return '';
  return resolved.toString();
}

function extractUrlField(payload: unknown): unknown {
  if (typeof payload !== 'object' || payload === null) return undefined;
  if (!('url' in payload)) return undefined;
  return payload.url;
}

export async function POST(req: Request) {
  try {
    // 1. Authentication guard — runs before any body parsing or network work.
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Body parsing.
    let payload: unknown;
    try {
      payload = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const rawUrl = extractUrlField(payload);
    if (typeof rawUrl !== 'string' || rawUrl.trim().length === 0) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }
    if (rawUrl.length > MAX_URL_LENGTH) {
      return NextResponse.json({ error: 'URL is too long' }, { status: 400 });
    }

    const safeTarget = await assertSafeTargetUrl(rawUrl);
    if (!safeTarget.ok) {
      return NextResponse.json({ error: safeTarget.reason }, { status: 400 });
    }
    const targetUrl = safeTarget.url.toString();

    // 3. Upstream fetch. `redirect: 'error'` makes a refused redirect throw,
    //    which is mapped to 502 below rather than falling through to a 500.
    let response: Response;
    try {
      response = await fetch(targetUrl, {
        redirect: 'error',
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        cache: 'no-store',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) OVG-BrandScraper/1.0',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        },
      });
    } catch {
      return NextResponse.json({ error: 'Failed to fetch target website' }, { status: 502 });
    }

    if (!response.ok) {
      // Gateway error: the caller supplied a syntactically fine URL, the
      // upstream is what failed. `response.statusText` is not surfaced.
      return NextResponse.json({ error: 'Failed to fetch target website' }, { status: 502 });
    }

    // 4. Bounded read.
    const body = await readBoundedBody(response);
    if (!body.ok) {
      return NextResponse.json({ error: body.reason }, { status: 502 });
    }
    const html = body.text;

    // 5. Metadata extraction.
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const brandName = titleMatch ? titleMatch[1].trim() : safeTarget.url.hostname;

    const ogImageMatch = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i) ||
                         html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i);
    const logoUrl = ogImageMatch ? resolveAssetUrl(ogImageMatch[1], targetUrl) : '';

    const faviconMatch = html.match(/<link[^>]*rel=["'](shortcut icon|icon)["'][^>]*href=["']([^"']+)["']/i);
    const faviconUrl = faviconMatch ? resolveAssetUrl(faviconMatch[2], targetUrl) : '';

    // 6. Construct branding payload matching our tenant schema (values unchanged).
    const scrapedBranding = {
      brandName: brandName.split('|')[0].split('-')[0].trim(),
      logoUrl: logoUrl || faviconUrl || '',
      primaryColor: '#307fbb', // Default fallback accent
      widgetBody: {
        type: 'gradient',
        value: 'linear-gradient(135deg, #81b3f3, #307fbb)',
        opacity: 0.9,
        backdropBlur: true,
      },
      header: {
        type: 'solid',
        value: '#050A14',
      },
      footer: {
        type: 'solid',
        value: '#050A14',
      }
    };

    return NextResponse.json({
      success: true,
      data: {
        brandName: scrapedBranding.brandName,
        logoUrl: scrapedBranding.logoUrl,
        brandingColors: '#307fbb',
        branding: scrapedBranding,
      }
    });
  } catch (error: unknown) {
    // 7. Unexpected internal failure — log server-side, return a static string.
    console.error('[BrandScraper Error]:', error);
    return NextResponse.json({ error: 'Brand scrape failed' }, { status: 500 });
  }
}
