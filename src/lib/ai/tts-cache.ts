import { createHash } from 'crypto';

const MAX_ENTRIES = 500;
const TTL_MS = 60 * 60 * 1000;

interface CacheEntry {
  buffer: Buffer;
  expiresAt: number;
}

const ttsCache = new Map<string, CacheEntry>();

export function getTtsCacheKey(text: string, voiceId: string, provider: string, resellerSlug?: string): string {
  const normalized = text.trim().toLowerCase();
  const payload = `${normalized}|${voiceId}|${provider}|${resellerSlug || ''}`;
  return createHash('sha256').update(payload).digest('hex');
}

export function getTtsCache(key: string): Buffer | null {
  const entry = ttsCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    ttsCache.delete(key);
    return null;
  }
  return entry.buffer;
}

export function setTtsCache(key: string, buffer: Buffer): void {
  if (ttsCache.size >= MAX_ENTRIES) {
    const oldest = [...ttsCache.entries()].sort((a, b) => a[1].expiresAt - b[1].expiresAt)[0];
    if (oldest) ttsCache.delete(oldest[0]);
  }
  ttsCache.set(key, { buffer, expiresAt: Date.now() + TTL_MS });
}
