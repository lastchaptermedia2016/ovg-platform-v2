import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from 'crypto';

// ────────────────────────────────────────────────────────────────────
// Integration Secret Encryption (AES-256-GCM, application-level)
// ────────────────────────────────────────────────────────────────────
// Sensitive integration credentials (CRM API keys, Twilio tokens) are
// encrypted here before they are ever written into the tenant's
// `widget_config.integrations` JSONB blob. Plaintext secrets never reach
// the database, and the read endpoint never returns them — only an
// `isConfigured` boolean so the UI can show a configured/unconfigured state.

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96-bit nonce recommended for GCM

export interface EncryptedSecret {
  v: 1;
  iv: string;
  tag: string;
  data: string;
}

function getEncryptionKey(): Buffer {
  const raw = process.env.INTEGRATIONS_ENCRYPTION_KEY;
  if (raw && raw.length >= 32) {
    // Accept a raw 32-byte key (hex or utf8). Normalize to 32 bytes.
    const buf = Buffer.from(raw, 'hex');
    if (buf.length === 32) return buf;
    return Buffer.from(raw).subarray(0, 32).toString('utf8').padEnd(32, '0').slice(0, 32) as unknown as Buffer;
  }
  // Deterministic dev fallback: derive a stable 32-byte key from the
  // NEXT_PUBLIC_SUPABASE_URL so local runs are reproducible. NOT for prod.
  const seed = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'ovg-dev-encryption-seed';
  return Buffer.from(seed).subarray(0, 32).toString('utf8').padEnd(32, '0').slice(0, 32) as unknown as Buffer;
}

export function encryptSecret(plaintext: string): EncryptedSecret {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    v: 1,
    iv: iv.toString('hex'),
    tag: tag.toString('hex'),
    data: encrypted.toString('hex'),
  };
}

export function decryptSecret(payload: EncryptedSecret | null | undefined): string | null {
  if (!payload || payload.v !== 1 || !payload.iv || !payload.tag || !payload.data) {
    return null;
  }
  try {
    const key = getEncryptionKey();
    const decipher = createDecipheriv(
      ALGORITHM,
      key,
      Buffer.from(payload.iv, 'hex')
    );
    decipher.setAuthTag(Buffer.from(payload.tag, 'hex'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(payload.data, 'hex')),
      decipher.final(),
    ]);
    return decrypted.toString('utf8');
  } catch {
    // Auth tag mismatch / corrupt payload → treat as not configured.
    return null;
  }
}

export function isEncryptedSecret(value: unknown): value is EncryptedSecret {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as EncryptedSecret).v === 1 &&
    typeof (value as EncryptedSecret).iv === 'string' &&
    typeof (value as EncryptedSecret).tag === 'string' &&
    typeof (value as EncryptedSecret).data === 'string'
  );
}

/** Constant-time equality check used to avoid leaking secret lengths. */
export function secretEquals(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}
