// src/app/api/resellers/scrape-brand/__tests__/scrape-brand.test.ts
//
// Deterministic security suite for the real POST handler in ../route.ts.
// The Supabase server client and node:dns/promises are mocked; the upstream
// fetch is stubbed globally. The pure guards (isBlockedIp / isBlockedHostname /
// parseTargetUrl) are exercised directly as well, so a regression in the
// network path cannot mask a regression in the blocklists.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { POST, isBlockedIp, isBlockedHostname, parseTargetUrl } from '../route';

interface MockAuthUser {
  id: string;
  email?: string;
}

type MockDnsAnswer = { address: string; family: number };

const state = vi.hoisted(() => ({
  authUser: { id: 'user-1', email: 'owner@example.com' } as MockAuthUser | null,
  authError: null as { message: string } | null,
  dnsAnswers: [] as MockDnsAnswer[],
  dnsError: null as Error | null,
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockImplementation(async () => ({
    auth: {
      getUser: vi.fn().mockImplementation(async () => ({
        data: { user: state.authUser },
        error: state.authError,
      })),
    },
  })),
}));

vi.mock('node:dns/promises', () => ({
  lookup: vi.fn().mockImplementation(async () => {
    if (state.dnsError) throw state.dnsError;
    return state.dnsAnswers;
  }),
}));

const ROUTE_URL = 'https://tenant.example.com/api/resellers/scrape-brand';
const TWO_MIB = 2 * 1024 * 1024;

let fetchMock: ReturnType<typeof vi.fn>;

function postJson(body: unknown): Promise<Response> {
  return POST(
    new Request(ROUTE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  );
}

function postRaw(body: string): Promise<Response> {
  return POST(
    new Request(ROUTE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    })
  );
}

function htmlResponse(html: string, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(html, { status, headers: { 'content-type': 'text/html', ...headers } });
}

/** A Response whose body streams `totalBytes` in `chunkSize` slices. */
function streamingHtmlResponse(
  totalBytes: number,
  chunkSize: number,
  headers: Record<string, string> = {}
): Response {
  let sent = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (sent >= totalBytes) {
        controller.close();
        return;
      }
      const size = Math.min(chunkSize, totalBytes - sent);
      sent += size;
      controller.enqueue(new Uint8Array(size));
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { 'content-type': 'text/html', ...headers },
  });
}

describe('POST /api/resellers/scrape-brand — hardening', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.authUser = { id: 'user-1', email: 'owner@example.com' };
    state.authError = null;
    state.dnsAnswers = [{ address: '93.184.216.34', family: 4 }];
    state.dnsError = null;
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // ── 1. Authentication ─────────────────────────────────────────────────────
  describe('authentication', () => {
    it('401 when getUser() resolves without a user', async () => {
      state.authUser = null;

      const response = await postJson({ url: 'https://brand.example.com' });

      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: 'Unauthorized' });
      // No outbound request may be attempted for an unauthenticated caller.
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('401 when getUser() resolves with an auth error', async () => {
      state.authUser = { id: 'user-1' };
      state.authError = { message: 'invalid jwt' };

      const response = await postJson({ url: 'https://brand.example.com' });

      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: 'Unauthorized' });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('guards before parsing the body (malformed JSON still yields 401)', async () => {
      state.authUser = null;

      const response = await postRaw('{ not json');

      expect(response.status).toBe(401);
    });
  });

  // ── 2. Input validation ───────────────────────────────────────────────────
  describe('input validation', () => {
    it('400 for a malformed / non-JSON body', async () => {
      const response = await postRaw('{ this is not json');

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: 'Invalid request body' });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('400 when url is missing', async () => {
      const response = await postJson({});

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: 'URL is required' });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('400 when url is not a string', async () => {
      for (const bad of [42, null, true, { href: 'https://example.com' }, ['https://example.com']]) {
        const response = await postJson({ url: bad });
        expect(response.status, `url: ${JSON.stringify(bad)}`).toBe(400);
      }
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('400 when url exceeds the 2048 character cap', async () => {
      const response = await postJson({ url: `https://example.com/${'a'.repeat(2048)}` });

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: 'URL is too long' });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('400 for unparseable URLs', async () => {
      const response = await postJson({ url: 'https://' });

      expect(response.status).toBe(400);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('does not echo the offending URL back to the client', async () => {
      const response = await postJson({ url: 'http://169.254.169.254/latest/meta-data/' });
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(JSON.stringify(body)).not.toContain('169.254.169.254');
    });
  });

  // ── 3. Protocol allowlist ─────────────────────────────────────────────────
  describe('protocol allowlist', () => {
    const nonHttpSchemes = [
      'file:///etc/passwd',
      'ftp://files.example.com/x',
      'gopher://files.example.com/x',
      'data:text/html,<h1>hi</h1>',
      'javascript:alert(1)',
      'vbscript:msgbox(1)',
    ];

    for (const target of nonHttpSchemes) {
      it(`400 for ${target.split(':')[0]}: scheme`, async () => {
        const response = await postJson({ url: target });

        expect(response.status).toBe(400);
        expect(fetchMock).not.toHaveBeenCalled();
      });
    }
  });

  // ── 4. Hostname / IP-literal blocklist ────────────────────────────────────
  describe('blocked hosts', () => {
    const blocked = [
      'http://localhost/x',
      'http://app.localhost/x',
      'http://printer.local/x',
      'http://db.internal/x',
      'http://gateway.home.arpa/x',
      'http://intranet/x',
      'http://0.0.0.0/x',
      'http://10.0.0.1/',
      'http://100.64.0.1/',
      'http://127.0.0.1/x',
      'http://169.254.169.254/latest/meta-data/',
      'http://172.16.5.4/',
      'http://172.31.255.1/',
      'http://192.0.0.1/',
      'http://192.0.2.1/',
      'http://192.88.99.1/',
      'http://192.168.1.1/',
      'http://198.18.0.1/',
      'http://198.51.100.7/',
      'http://203.0.113.9/',
      'http://224.0.0.1/',
      'http://240.0.0.1/',
      'http://[::1]/',
      'http://[::]/',
      'http://[fc00::1]/',
      'http://[fe80::1]/',
      'http://[ff02::1]/',
      'http://[::ffff:127.0.0.1]/',
      'http://[::ffff:10.0.0.1]/',
      'http://[::ffff:169.254.169.254]/',
      'http://[64:ff9b::127.0.0.1]/',
      'http://[2002:7f00:1::]/',
      'http://[::127.0.0.1]/',
    ];

    for (const target of blocked) {
      it(`400 for ${target}`, async () => {
        const response = await postJson({ url: target });

        expect(response.status).toBe(400);
        expect(fetchMock).not.toHaveBeenCalled();
      });
    }
  });

  // ── 5. DNS defense-in-depth ───────────────────────────────────────────────
  describe('DNS resolution guard', () => {
    it('400 when a public-looking hostname resolves to a private IP', async () => {
      state.dnsAnswers = [{ address: '169.254.169.254', family: 4 }];

      const response = await postJson({ url: 'https://totally-legit.example.com/' });

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: 'Blocked target host' });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('400 when any one of several A records is private', async () => {
      state.dnsAnswers = [
        { address: '93.184.216.34', family: 4 },
        { address: '127.0.0.1', family: 4 },
      ];

      const response = await postJson({ url: 'https://mixed.example.com/' });

      expect(response.status).toBe(400);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('400 when an AAAA answer is an IPv4-mapped loopback', async () => {
      state.dnsAnswers = [{ address: '::ffff:127.0.0.1', family: 6 }];

      const response = await postJson({ url: 'https://mapped.example.com/' });

      expect(response.status).toBe(400);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('400 when DNS resolution fails outright', async () => {
      state.dnsError = new Error('getaddrinfo ENOTFOUND');

      const response = await postJson({ url: 'https://nope.example.com/' });

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: 'Unable to resolve target host' });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('400 when DNS returns no addresses', async () => {
      state.dnsAnswers = [];

      const response = await postJson({ url: 'https://empty.example.com/' });

      expect(response.status).toBe(400);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('accepts a hostname whose every address is public', async () => {
      fetchMock.mockResolvedValueOnce(htmlResponse('<title>Acme Corp</title>'));

      const response = await postJson({ url: 'https://brand.example.com/' });

      expect(response.status).toBe(200);
    });
  });

  // ── 6. Upstream fetch failures ────────────────────────────────────────────
  describe('upstream fetch', () => {
    it('502 when the upstream response is not ok', async () => {
      fetchMock.mockResolvedValueOnce(htmlResponse('<h1>404</h1>', 404));

      const response = await postJson({ url: 'https://brand.example.com/' });

      expect(response.status).toBe(502);
      const body = await response.json();
      expect(body).toEqual({ error: 'Failed to fetch target website' });
      // The upstream statusText must not be surfaced to the caller.
      expect(JSON.stringify(body)).not.toContain('Not Found');
    });

    it('502 when the upstream returns 500', async () => {
      fetchMock.mockResolvedValueOnce(htmlResponse('boom', 500));

      const response = await postJson({ url: 'https://brand.example.com/' });

      expect(response.status).toBe(502);
    });

    it('502 when fetch throws because the redirect was refused', async () => {
      fetchMock.mockRejectedValueOnce(new TypeError('fetch failed: unexpected redirect to ...'));

      const response = await postJson({ url: 'https://brand.example.com/' });

      expect(response.status).toBe(502);
      const body = await response.json();
      expect(body).toEqual({ error: 'Failed to fetch target website' });
      // Never leak the internal TypeError text.
      expect(JSON.stringify(body)).not.toContain('TypeError');
      expect(JSON.stringify(body)).not.toContain('unexpected redirect');
      // redirect: 'error' is mandatory.
      expect(fetchMock.mock.calls[0][1]).toMatchObject({ redirect: 'error' });
    });

    it('502 when fetch times out', async () => {
      fetchMock.mockRejectedValueOnce(new DOMException('The operation timed out.', 'TimeoutError'));

      const response = await postJson({ url: 'https://brand.example.com/' });

      expect(response.status).toBe(502);
    });

    it('issues the hardened fetch options', async () => {
      fetchMock.mockResolvedValueOnce(htmlResponse('<title>Acme Corp</title>'));

      await postJson({ url: 'https://brand.example.com/' });

      const init = fetchMock.mock.calls[0][1];
      expect(init.redirect).toBe('error');
      expect(init.cache).toBe('no-store');
      expect(init.signal).toBeDefined();
      expect(init.headers['User-Agent']).toContain('OVG-BrandScraper/1.0');
      expect(init.headers.Accept).toContain('text/html');
    });
  });

  // ── 7. Response size cap ──────────────────────────────────────────────────
  describe('response size cap', () => {
    it('502 immediately when content-length exceeds the 2 MiB cap', async () => {
      fetchMock.mockResolvedValueOnce(
        htmlResponse('<html></html>', 200, { 'content-length': String(TWO_MIB + 1) })
      );

      const response = await postJson({ url: 'https://brand.example.com/' });

      expect(response.status).toBe(502);
      expect(await response.json()).toEqual({ error: 'Target page too large' });
    });

    it('502 when a stream with no content-length exceeds the cap', async () => {
      fetchMock.mockResolvedValueOnce(streamingHtmlResponse(TWO_MIB + 4096, 64 * 1024));

      const response = await postJson({ url: 'https://brand.example.com/' });

      expect(response.status).toBe(502);
      expect(await response.json()).toEqual({ error: 'Target page too large' });
    });

    it('502 when the stream overruns a small declared content-length', async () => {
      fetchMock.mockResolvedValueOnce(
        streamingHtmlResponse(TWO_MIB + 4096, 64 * 1024, { 'content-length': '128' })
      );

      const response = await postJson({ url: 'https://brand.example.com/' });

      expect(response.status).toBe(502);
      expect(await response.json()).toEqual({ error: 'Target page too large' });
    });

    it('accepts a body just under the cap', async () => {
      const filler = '<!--' + 'x'.repeat(TWO_MIB - 64) + '-->';
      fetchMock.mockResolvedValueOnce(htmlResponse(`<title>Acme Corp</title>${filler}`));

      const response = await postJson({ url: 'https://brand.example.com/' });

      expect(response.status).toBe(200);
      expect((await response.json()).data.brandName).toBe('Acme Corp');
    });

    it('handles a null response body without crashing', async () => {
      fetchMock.mockResolvedValueOnce(new Response(null, { status: 200 }));

      const response = await postJson({ url: 'https://brand.example.com/' });

      expect(response.status).toBe(200);
      // Falls back to the hostname when there is no title tag.
      expect((await response.json()).data.brandName).toBe('brand.example.com');
    });
  });

  // ── 8. Relative URL resolution ────────────────────────────────────────────
  describe('asset URL resolution', () => {
    it('resolves a root-relative og:image against the origin', async () => {
      fetchMock.mockResolvedValueOnce(
        htmlResponse('<title>Acme Corp</title><meta property="og:image" content="/logo.png">')
      );

      const response = await postJson({ url: 'https://brand.example.com/dir/page.html' });

      expect(response.status).toBe(200);
      expect((await response.json()).data.logoUrl).toBe('https://brand.example.com/logo.png');
    });

    it('resolves a document-relative og:image against the document', async () => {
      fetchMock.mockResolvedValueOnce(
        htmlResponse('<title>Acme Corp</title><meta property="og:image" content="assets/logo.png">')
      );

      const response = await postJson({ url: 'https://brand.example.com/dir/page.html' });

      expect((await response.json()).data.logoUrl).toBe(
        'https://brand.example.com/dir/assets/logo.png'
      );
    });

    it('resolves a protocol-relative og:image', async () => {
      fetchMock.mockResolvedValueOnce(
        htmlResponse('<title>Acme Corp</title><meta property="og:image" content="//cdn.example.com/logo.png">')
      );

      const response = await postJson({ url: 'https://brand.example.com/dir/page.html' });

      expect((await response.json()).data.logoUrl).toBe('https://cdn.example.com/logo.png');
    });

    it('resolves a document-relative favicon when no og:image exists', async () => {
      fetchMock.mockResolvedValueOnce(
        htmlResponse('<title>Acme Corp</title><link rel="icon" href="assets/favicon.ico">')
      );

      const response = await postJson({ url: 'https://brand.example.com/dir/page.html' });

      expect((await response.json()).data.logoUrl).toBe(
        'https://brand.example.com/dir/assets/favicon.ico'
      );
    });

    it('resolves a root-relative favicon', async () => {
      fetchMock.mockResolvedValueOnce(
        htmlResponse('<title>Acme Corp</title><link rel="shortcut icon" href="/favicon.ico">')
      );

      const response = await postJson({ url: 'https://brand.example.com/dir/page.html' });

      expect((await response.json()).data.logoUrl).toBe('https://brand.example.com/favicon.ico');
    });

    it('drops a hostile og:image with a non-http protocol', async () => {
      fetchMock.mockResolvedValueOnce(
        htmlResponse('<title>Acme Corp</title><meta property="og:image" content="javascript:alert(1)">')
      );

      const response = await postJson({ url: 'https://brand.example.com/' });

      expect(response.status).toBe(200);
      expect((await response.json()).data.logoUrl).toBe('');
    });

    it('drops a data: favicon', async () => {
      fetchMock.mockResolvedValueOnce(
        htmlResponse(
          '<title>Acme Corp</title><link rel="icon" href="data:image/png;base64,iVBORw0KGgo=">'
        )
      );

      const response = await postJson({ url: 'https://brand.example.com/' });

      expect((await response.json()).data.logoUrl).toBe('');
    });
  });

  // ── 9. Success contract ───────────────────────────────────────────────────
  describe('success contract', () => {
    it('returns the exact pre-existing response shape', async () => {
      fetchMock.mockResolvedValueOnce(
        htmlResponse(
          '<html><head><title>Acme Corp | Home</title>' +
            '<meta property="og:image" content="https://cdn.example.com/logo.png">' +
            '</head></html>'
        )
      );

      const response = await postJson({ url: 'https://brand.example.com/' });
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body).toEqual({
        success: true,
        data: {
          brandName: 'Acme Corp',
          logoUrl: 'https://cdn.example.com/logo.png',
          brandingColors: '#307fbb',
          branding: {
            brandName: 'Acme Corp',
            logoUrl: 'https://cdn.example.com/logo.png',
            primaryColor: '#307fbb',
            widgetBody: {
              type: 'gradient',
              value: 'linear-gradient(135deg, #81b3f3, #307fbb)',
              opacity: 0.9,
              backdropBlur: true,
            },
            header: { type: 'solid', value: '#050A14' },
            footer: { type: 'solid', value: '#050A14' },
          },
        },
      });
    });

    it('still accepts a bare domain and normalizes it to https', async () => {
      fetchMock.mockResolvedValueOnce(htmlResponse('<title>Acme Corp</title>'));

      const response = await postJson({ url: 'brand.example.com' });

      expect(response.status).toBe(200);
      expect(fetchMock.mock.calls[0][0]).toBe('https://brand.example.com/');
    });

    it('preserves an explicit http:// target', async () => {
      fetchMock.mockResolvedValueOnce(htmlResponse('<title>Acme Corp</title>'));

      const response = await postJson({ url: 'http://brand.example.com/path' });

      expect(response.status).toBe(200);
      expect(fetchMock.mock.calls[0][0]).toBe('http://brand.example.com/path');
    });
  });

  // ── 10. Unexpected internal errors ────────────────────────────────────────
  describe('error taxonomy', () => {
    it('500 with a static message when the handler throws unexpectedly', async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

      // Not a real Response: `body` is undefined, so reading it throws deep
      // inside the handler and must be caught by the outer guard.
      fetchMock.mockResolvedValueOnce({ ok: true, headers: new Headers() });

      const response = await postJson({ url: 'https://brand.example.com/' });

      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body).toEqual({ error: 'Brand scrape failed' });
      expect(consoleError).toHaveBeenCalled();
      consoleError.mockRestore();
    });
  });
});

// ── Pure guards, exercised directly ────────────────────────────────────────
describe('URL/IP guards', () => {
  describe('isBlockedIp', () => {
    it('blocks private, loopback, link-local, CGNAT and reserved IPv4', () => {
      const blocked = [
        '0.0.0.0', '0.1.2.3', '10.0.0.0', '10.255.255.255', '100.64.0.1', '127.0.0.1',
        '169.254.169.254', '172.16.0.1', '172.31.255.254', '192.0.0.1', '192.0.2.1',
        '192.88.99.1', '192.168.0.1', '198.18.0.1', '198.19.255.255', '198.51.100.1',
        '203.0.113.1', '224.0.0.1', '239.255.255.255', '240.0.0.1', '255.255.255.255',
      ];
      for (const ip of blocked) {
        expect(isBlockedIp(ip), ip).toBe(true);
      }
    });

    it('allows public IPv4', () => {
      for (const ip of ['8.8.8.8', '1.1.1.1', '93.184.216.34', '172.32.0.1', '100.128.0.1']) {
        expect(isBlockedIp(ip), ip).toBe(false);
      }
    });

    it('blocks IPv6 loopback, unspecified, ULA, link-local and multicast', () => {
      const blocked = ['::', '::1', 'fc00::1', 'fd12:3456::1', 'fe80::1', 'ff02::1', 'fec0::1'];
      for (const ip of blocked) {
        expect(isBlockedIp(ip), ip).toBe(true);
      }
    });

    it('blocks IPv6 addresses embedding a blocked IPv4 address', () => {
      const blocked = [
        '::ffff:127.0.0.1',
        '::ffff:7f00:1',
        '::ffff:169.254.169.254',
        '::ffff:a00:1',
        '::127.0.0.1',
        '64:ff9b::127.0.0.1',
        '64:ff9b::a9fe:a9fe',
        '2002:7f00:1::',
        '2002:a9fe:a9fe::',
      ];
      for (const ip of blocked) {
        expect(isBlockedIp(ip), ip).toBe(true);
      }
    });

    it('allows IPv6 addresses embedding a public IPv4 address', () => {
      for (const ip of ['::ffff:8.8.8.8', '64:ff9b::8.8.8.8', '2002:0808:0808::', '2606:4700::1']) {
        expect(isBlockedIp(ip), ip).toBe(false);
      }
    });

    it('ignores a zone id and case', () => {
      expect(isBlockedIp('fe80::1%eth0')).toBe(true);
      expect(isBlockedIp('FE80::1')).toBe(true);
    });

    it('treats an unparseable literal as blocked', () => {
      expect(isBlockedIp('::gg')).toBe(true);
      expect(isBlockedIp('1::2::3')).toBe(true);
      expect(isBlockedIp('')).toBe(true);
    });

    it('returns false for non-IP input', () => {
      expect(isBlockedIp('example.com')).toBe(false);
    });
  });

  describe('isBlockedHostname', () => {
    it('blocks loopback and internal suffixes', () => {
      const blocked = [
        'localhost', 'app.localhost', 'printer.local', 'db.internal',
        'gw.home.arpa', 'router', 'intranet', 'LOCALHOST', 'localhost.',
      ];
      for (const host of blocked) {
        expect(isBlockedHostname(host), host).toBe(true);
      }
    });

    it('blocks bracketed IPv6 literals', () => {
      expect(isBlockedHostname('[::1]')).toBe(true);
      expect(isBlockedHostname('[::ffff:127.0.0.1]')).toBe(true);
      expect(isBlockedHostname('[2606:4700::1]')).toBe(false);
    });

    it('blocks IPv4 literals', () => {
      expect(isBlockedHostname('127.0.0.1')).toBe(true);
      expect(isBlockedHostname('169.254.169.254')).toBe(true);
      expect(isBlockedHostname('8.8.8.8')).toBe(false);
    });

    it('blocks obfuscated numeric hosts', () => {
      for (const host of ['0177.0.0.1', '1.2.3.4.5', '256.256.256.256', '0x7f.0.0.1']) {
        expect(isBlockedHostname(host), host).toBe(true);
      }
    });

    it('allows ordinary public domains', () => {
      for (const host of ['example.com', 'brand.example.co.uk', 'cdn.example.com.']) {
        expect(isBlockedHostname(host), host).toBe(false);
      }
    });
  });

  describe('parseTargetUrl', () => {
    it('normalizes a bare domain to https', () => {
      const result = parseTargetUrl('brand.example.com');
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.url.toString()).toBe('https://brand.example.com/');
    });

    it('keeps an explicit http target', () => {
      const result = parseTargetUrl('http://brand.example.com/a');
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.url.toString()).toBe('http://brand.example.com/a');
    });

    it('preserves an explicit port on a bare host', () => {
      const result = parseTargetUrl('brand.example.com:8080/x');
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.url.host).toBe('brand.example.com:8080');
    });

    it('rejects disallowed protocols and blocked hosts', () => {
      expect(parseTargetUrl('file:///etc/passwd').ok).toBe(false);
      expect(parseTargetUrl('javascript:alert(1)').ok).toBe(false);
      expect(parseTargetUrl('http://localhost/').ok).toBe(false);
      expect(parseTargetUrl('http://[::1]/').ok).toBe(false);
      expect(parseTargetUrl('').ok).toBe(false);
    });
  });
});