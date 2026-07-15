/**
 * @file /api/client/stt/route.ts
 *
 * ZEEDER Client-Surface Speech-to-Text (High-Fidelity + Security)
 *
 * Authoritative, server-side STT for the ZEEDER client voice pipeline.
 * Replaces the browser-only Web Speech API with a Groq Whisper pipeline that:
 *   - Authenticates the caller via the server session (no spoofable headers).
 *   - Resolves the tenant UUID server-authoritatively (user_resellers → tenants).
 *   - Injects a dynamic brand vocabulary boost (tenant brandName + platform anchors).
 *   - Enforces auth, MIME, size, micro-recording, and per-IP rate-limit gates.
 *   - Never persists raw audio; the blob is forwarded to Groq and discarded.
 *
 * @remarks
 * Client (Zeeder) surface only. Does NOT import reseller-domain code.
 */

import { NextRequest, NextResponse } from 'next/server';
import Groq, { toFile } from 'groq-sdk';
import { getAuthenticatedUser, createAuthClient } from '@/lib/auth/server';
import { resolveTenantId } from '@/lib/resolveTenantId';
import { supabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

// ──────────────────────────── Constants ───────────────────────────────────

/** Hard cap on upload size (2 MB). Whisper rejects oversized payloads anyway. */
const MAX_BYTES = 2 * 1024 * 1024;

/** Micro-recording floor (~12 KB). Below this there is no decodable speech. */
const MIN_BYTES = 12 * 1024;

/** Acceptable container MIME types for the uploaded audio blob. */
const ALLOWED_MIME = new Set<string>([
  'audio/webm',
  'audio/ogg',
  'audio/wav',
  'audio/wave',
  'audio/x-wav',
  'audio/mpeg',
]);

/** Static platform anchors — Whisper prompt bias toward the real ecosystem. */
const STATIC_ANCHORS = [
  'Zeeder',
  'Omniverge Global',
  'OVG',
  'concierge',
  'client',
  'reseller',
  'dashboard',
  'branding studio',
];

/** Phonetic-deflection lines keep acoustic misreads anchored to real brands. */
const PHONETIC_DEFLECTION = [
  'Zeta, Cedar, or Zita in a client-name context refers to the brand Zeeder.',
  'OVG platform: tenants, clients, resellers, dashboard, branding studio.',
];

// ──────────────────────────── Rate Limiter ───────────────────────────────
// Minimal in-process token bucket (per-IP). Serverless instances do not share
// memory, so this is a best-effort guard against accidental/abusive bursts, not
// a global hard limit. Kept deliberately simple — no external KV dependency.

const RATE_LIMIT_MAX = 15;
const RATE_LIMIT_WINDOW_MS = 60_000;

interface Bucket {
  tokens: number;
  last: number;
}

const rateBuckets = new Map<string, Bucket>();

/**
 * Returns `true` when the key has exhausted its tokens for this window.
 * Refills proportionally to elapsed time, then consumes one token.
 */
function isRateLimited(key: string): boolean {
  const now = Date.now();
  const bucket = rateBuckets.get(key) ?? { tokens: RATE_LIMIT_MAX, last: now };
  const elapsed = now - bucket.last;
  bucket.tokens = Math.min(
    RATE_LIMIT_MAX,
    bucket.tokens + (elapsed / RATE_LIMIT_WINDOW_MS) * RATE_LIMIT_MAX,
  );
  bucket.last = now;
  if (bucket.tokens < 1) {
    rateBuckets.set(key, bucket);
    return true;
  }
  bucket.tokens -= 1;
  rateBuckets.set(key, bucket);
  return false;
}

// ──────────────────────────── Helpers ─────────────────────────────────────

interface GroqError {
  status?: number;
  message?: string;
  code?: string;
  name?: string;
  stack?: string;
}

/** Coerce an arbitrary error-status into a safe 400–599 HTTP status. */
function safeStatus(raw: unknown, fallback = 500): number {
  return typeof raw === 'number' && raw >= 400 && raw < 600 ? raw : fallback;
}

/** Unwrap Groq's doubly-nested "<status> {json}" error wrapper. */
function extractGroqError(rawMessage: string): { message: string; type: string | null } {
  const match = rawMessage.match(/^\d+\s+(\{[\s\S]*\})$/);
  if (!match) return { message: rawMessage, type: null };
  try {
    const parsed = JSON.parse(match[1]) as { error?: { message?: string; type?: string } };
    const innerMessage = parsed.error?.message;
    if (typeof innerMessage === 'string' && innerMessage.length > 0) {
      return { message: innerMessage, type: parsed.error?.type ?? null };
    }
  } catch {
    /* fall through to raw */
  }
  return { message: rawMessage, type: null };
}

/** Best-effort client IP from forwarded headers (never authoritative, only for rate keys). */
function clientIp(req: NextRequest): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0]?.trim() || 'unknown';
  return req.headers.get('x-real-ip') ?? 'unknown';
}

/** Read the tenant brand name from widget_config.branding.brandName. */
async function fetchTenantBrandName(tenantId: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from('tenants')
    .select('widget_config')
    .eq('id', tenantId)
    .maybeSingle();

  if (error || !data?.widget_config) return null;

  const config = data.widget_config as Record<string, unknown> | null;
  const branding = config?.branding as Record<string, unknown> | undefined;
  const brandName = branding?.brandName;
  return typeof brandName === 'string' && brandName.trim().length > 0 ? brandName.trim() : null;
}

/** Build the Whisper `prompt` bias string (kept under Groq's 224-token ceiling). */
function buildVocabularyBoost(brandName: string | null): string {
  const anchors = brandName ? [brandName, ...STATIC_ANCHORS] : [...STATIC_ANCHORS];
  return [...anchors, ...PHONETIC_DEFLECTION].join(', ');
}

// ──────────────────────────── Route ───────────────────────────────────────

export async function POST(req: NextRequest) {
  // ── Gate 0: API key present (fail-fast) ────────────────────────────
  if (!process.env.GROQ_API_KEY) {
    console.error('[CLIENT-STT] GROQ_API_KEY not configured');
    return NextResponse.json({ error: 'STT service is not configured' }, { status: 500 });
  }

  // ── Gate 1: Authenticate the session (server-authoritative) ─────────
  const { userId, error: authError } = await getAuthenticatedUser();
  if (authError || !userId) {
    console.warn('[CLIENT-STT] Unauthorized STT attempt', authError?.message);
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // ── Gate 2: Rate limit per client IP ───────────────────────────────
  const ip = clientIp(req);
  if (isRateLimited(ip)) {
    console.warn('[CLIENT-STT] Rate limit exceeded', { ip });
    return NextResponse.json(
      { error: 'Too many requests. Please wait a moment before trying again.' },
      { status: 429 },
    );
  }

  // ── Gate 3: Resolve tenant UUID server-authoritatively ─────────────
  const supabase = await createAuthClient();
  const { data: tenantId, error: tenantError } = await resolveTenantId(userId, supabase);
  if (tenantError || !tenantId) {
    console.warn('[CLIENT-STT] No tenant resolved for user', userId, tenantError?.message);
    return NextResponse.json(
      { error: 'No tenant associated with this account' },
      { status: 403 },
    );
  }

  // ── Gate 4: Parse multipart payload (defensive) ───────────────────
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid multipart/form-data payload' }, { status: 400 });
  }

  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: 'No audio file received' }, { status: 400 });
  }

  // ── Gate 5: MIME allowlist ─────────────────────────────────────────
  const mime = file.type?.toLowerCase() ?? '';
  if (!ALLOWED_MIME.has(mime)) {
    console.warn('[CLIENT-STT] Rejected unsupported MIME', { type: file.type, size: file.size });
    return NextResponse.json(
      { error: `Unsupported audio type: ${file.type || 'unknown'}` },
      { status: 415 },
    );
  }

  // ── Gate 6: Size cap ───────────────────────────────────────────────
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: 'Recording too large. Maximum size is 2 MB.' },
      { status: 413 },
    );
  }

  // ── Gate 7: Micro-recording protection ─────────────────────────────
  if (file.size < MIN_BYTES) {
    console.warn('[CLIENT-STT] Micro-recording rejected', { type: file.type, size: file.size });
    return NextResponse.json(
      {
        error: 'Recording too short',
        message: 'Audio chunk contains no decodable voice data. Please hold the button down to speak your command.',
      },
      { status: 422 },
    );
  }

  // ── Vocabulary boost: tenant brand + platform anchors ───────────────
  const brandName = await fetchTenantBrandName(tenantId);
  const vocabularyBoost = buildVocabularyBoost(brandName);

  try {
    console.log('[CLIENT-STT] Transcribing', {
      tenantId,
      brandName,
      type: file.type,
      size: file.size,
    });

    const arrayBuffer = await file.arrayBuffer();
    const uploadable = await toFile(
      new Blob([arrayBuffer], { type: file.type }),
      file.name || 'recording',
      { type: file.type },
    );

    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

    const transcription = await groq.audio.transcriptions.create({
      file: uploadable,
      model: 'whisper-large-v3-turbo',
      response_format: 'json',
      temperature: 0,
      prompt: vocabularyBoost,
    });

    const text = transcription.text?.trim() ?? '';
    if (!text) {
      // Decoded but empty — treat as no command, not a failure.
      return NextResponse.json({ text: '' }, { status: 200 });
    }

    return NextResponse.json({ text }, { status: 200 });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const groqError = error as GroqError;
    const status = safeStatus(groqError.status, 500);
    const extracted = extractGroqError(errorMessage);

    // Safe failure logging — never logs raw audio, only diagnostics.
    console.error('[CLIENT-STT] Transcription error:', {
      rawMessage: errorMessage,
      extractedMessage: extracted.message,
      extractedType: extracted.type,
      status: groqError.status,
      code: groqError.code,
      name: groqError.name,
    });

    return NextResponse.json(
      {
        error: extracted.message,
        type: extracted.type,
        status: groqError.status ?? null,
      },
      { status },
    );
  }
}

// Unsupported methods
export async function GET() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}
export async function PUT() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}
export async function DELETE() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}
