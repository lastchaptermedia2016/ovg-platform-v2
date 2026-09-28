/**
 * Audio transcoding utilities — webm/opus (from MediaRecorder) → 16kHz mono 16-bit WAV.
 *
 * Why this exists:
 *   MediaRecorder produces a WebM live-stream container that lacks the
 *   index/duration header Groq's upstream Whisper decoder requires.
 *   Decoding through the browser's native AudioContext and re-encoding
 *   to a canonical WAV (16kHz, mono, 16-bit PCM) produces a file
 *   Whisper ingests reliably — without server-side ffmpeg.
 *
 * Whisper canonical input:
 *   - Sample rate: 16000 Hz
 *   - Channels:    1 (mono)
 *   - Bit depth:   16-bit signed PCM
 *   - Container:   RIFF/WAVE
 *
 * Phase 5 (moved from `src/utils/audio/transcode-to-wav.ts`, which now
 * re-exports from here so existing importers are unchanged):
 *   - `TranscodeError` carries an explicit code (TOO_SHORT, EMPTY, SILENCE,
 *     UNDECODABLE) so callers can branch on guard failures vs real faults.
 *   - `computeRms` amplitude analysis detects low-amplitude noise clips.
 *   - `estimateWavDurationMs` lets the server derive session duration from
 *     an uploaded canonical WAV without decoding it.
 *
 * Note: the codebase avoids TypeScript `enum`s entirely (see `as const`
 * unions elsewhere) — `TRANSCODE_ERROR_CODES` follows that convention.
 */

const WHISPER_SAMPLE_RATE = 16000;
const WHISPER_NUM_CHANNELS = 1;
const WAV_HEADER_BYTES = 44;
const BYTES_PER_SAMPLE = 2; // 16-bit

/**
 * Minimum valid audio blob size (1 KB).
 * WebM container headers alone occupy ~100-200 bytes. Blobs smaller than
 * this threshold indicate an accidental tap and should not be transcoded.
 */
const MIN_AUDIO_BLOB_BYTES = 1024;

/** Bytes per second of canonical Whisper WAV (16000 Hz × 1 ch × 2 bytes). */
const WHISPER_BYTES_PER_SECOND = WHISPER_SAMPLE_RATE * WHISPER_NUM_CHANNELS * BYTES_PER_SAMPLE;

/**
 * RMS amplitude below which a clip counts as silence/noise (~ -40 dBFS).
 * Speech recorded at normal levels sits well above this; a dead-air or
 * noise-gated clip sits below it and is not worth a Whisper round-trip.
 */
const SILENCE_RMS_THRESHOLD = 0.01;

// ──────────────────────────── TranscodeError ────────────────────────────────

/** All well-known transcode failure codes. */
export const TRANSCODE_ERROR_CODES = ['TOO_SHORT', 'EMPTY', 'SILENCE', 'UNDECODABLE'] as const;

/** One of {@link TRANSCODE_ERROR_CODES}. */
export type TranscodeErrorCode = (typeof TRANSCODE_ERROR_CODES)[number];

/**
 * Typed transcode failure. `code` lets callers distinguish "no speech
 * captured" guards (EMPTY / TOO_SHORT / SILENCE) from real codec faults
 * (UNDECODABLE) without string-matching messages.
 */
export class TranscodeError extends Error {
  readonly code: TranscodeErrorCode;

  constructor(code: TranscodeErrorCode, message: string) {
    super(message);
    this.name = 'TranscodeError';
    this.code = code;
  }
}

// ──────────────────────────── Decode ────────────────────────────────────────

/**
 * Decode any audio container the browser supports (webm, mp4, ogg, …)
 * into an AudioBuffer using the native decoder.
 *
 * @throws {TranscodeError} `EMPTY` for a zero-byte blob, `UNDECODABLE` when
 *   the format is unsupported or the data is corrupted.
 */
export async function decodeAudioBlob(
  blob: Blob,
  audioContext: AudioContext,
): Promise<AudioBuffer> {
  if (blob.size === 0) {
    throw new TranscodeError('EMPTY', 'Cannot decode empty audio blob');
  }

  try {
    const arrayBuffer = await blob.arrayBuffer();
    // decodeAudioData mutates the ArrayBuffer in some engines — clone to be safe.
    return await audioContext.decodeAudioData(arrayBuffer.slice(0));
  } catch (err) {
    // Enhance error message with blob metadata for debugging transcoding failures
    const errorMsg = err instanceof Error ? err.message : String(err);
    throw new TranscodeError(
      'UNDECODABLE',
      `Failed to decode audio (${blob.type || 'unknown'}, ${blob.size} bytes): ${errorMsg}`,
    );
  }
}

// ──────────────────────────── Resample ──────────────────────────────────────

/**
 * Resample + downmix an AudioBuffer to 16kHz mono using OfflineAudioContext.
 * The browser's resampler is high-quality and handles arbitrary input rates
 * (typically 44.1k, 48k, 96k) gracefully.
 */
export async function resampleToWhisperFormat(source: AudioBuffer): Promise<AudioBuffer> {
  const targetLength = Math.ceil(source.duration * WHISPER_SAMPLE_RATE);
  const offlineCtx = new OfflineAudioContext(
    WHISPER_NUM_CHANNELS,
    targetLength,
    WHISPER_SAMPLE_RATE,
  );
  const bufferSource = offlineCtx.createBufferSource();
  bufferSource.buffer = source;
  bufferSource.connect(offlineCtx.destination);
  bufferSource.start(0);
  return offlineCtx.startRendering();
}

/**
 * Encode a 16kHz mono 16-bit PCM AudioBuffer as a canonical RIFF/WAVE Blob.
 * Float32 samples in [-1, 1] are quantized to Int16 in [-32768, 32767] with
 * clamping to prevent clipping distortion.
 */
export function encodeAsWav(audioBuffer: AudioBuffer): Blob {
  // Guard: enforce Whisper format. OfflineAudioContext guarantees this, but
  // a defensive check makes the contract explicit if the helper is reused.
  if (audioBuffer.numberOfChannels !== WHISPER_NUM_CHANNELS) {
    throw new Error(
      `encodeAsWav: expected ${WHISPER_NUM_CHANNELS} channel(s), got ${audioBuffer.numberOfChannels}`,
    );
  }
  if (audioBuffer.sampleRate !== WHISPER_SAMPLE_RATE) {
    throw new Error(
      `encodeAsWav: expected ${WHISPER_SAMPLE_RATE}Hz, got ${audioBuffer.sampleRate}Hz`,
    );
  }

  const channelData = audioBuffer.getChannelData(0);
  const pcmBuffer = new Int16Array(channelData.length);

  // Float32 → Int16 quantization with explicit clamping to avoid clipping.
  for (let i = 0; i < channelData.length; i++) {
    const sample = channelData[i];
    if (sample === undefined) continue;
    // Clamp to [-1, 1] before scaling to prevent Int16 overflow.
    const clamped = Math.max(-1, Math.min(1, sample));
    pcmBuffer[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
  }

  const dataSize = pcmBuffer.length * BYTES_PER_SAMPLE;
  const buffer = new ArrayBuffer(WAV_HEADER_BYTES + dataSize);
  const view = new DataView(buffer);

  // RIFF chunk descriptor
  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, WAV_HEADER_BYTES - 8 + dataSize, true); // File size - 8
  writeAscii(view, 8, 'WAVE');

  // fmt sub-chunk (16 bytes for PCM)
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
  view.setUint16(20, 1, true); // AudioFormat: 1 = PCM
  view.setUint16(22, WHISPER_NUM_CHANNELS, true);
  view.setUint32(24, WHISPER_SAMPLE_RATE, true); // SampleRate
  view.setUint32(28, WHISPER_SAMPLE_RATE * WHISPER_NUM_CHANNELS * BYTES_PER_SAMPLE, true); // ByteRate
  view.setUint16(32, WHISPER_NUM_CHANNELS * BYTES_PER_SAMPLE, true); // BlockAlign
  view.setUint16(34, 16, true); // BitsPerSample

  // data sub-chunk
  writeAscii(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  // PCM samples
  const pcmView = new DataView(buffer, WAV_HEADER_BYTES);
  for (let i = 0; i < pcmBuffer.length; i++) {
    pcmView.setInt16(i * BYTES_PER_SAMPLE, pcmBuffer[i] ?? 0, true);
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

/**
 * Safely serialize error information for logging, handling all error types.
 * Converts DOMException, Error, and other objects to loggable format.
 */
function serializeError(err: unknown): Record<string, unknown> {
  if (err instanceof Error) {
    return {
      message: err.message,
      name: err.name,
      stack: err.stack?.split('\n').slice(0, 3).join('\n'), // First 3 stack frames
    };
  }

  // Handle DOMException and other objects with name/message properties
  if (typeof err === 'object' && err !== null) {
    const obj = err as Record<string, unknown>;
    return {
      type: obj.constructor?.name ?? 'Unknown',
      message: obj.message ?? obj.toString?.(),
      name: obj.name,
      code: (obj as { code?: unknown }).code,
      details: Object.keys(obj)
        .filter((k) => !['message', 'name', 'stack', 'constructor'].includes(k))
        .slice(0, 3) // Limit keys to avoid spam
        .reduce((acc, k) => {
          acc[k] = obj[k];
          return acc;
        }, {} as Record<string, unknown>),
    };
  }

  return {
    type: typeof err,
    value: String(err),
  };
}

/**
 * Root-mean-square amplitude of a decoded buffer (averaged across channels).
 * Pure and unit-testable — no AudioContext required.
 *
 * @returns RMS in [0, 1]; 0 for silence/empty buffers.
 */
export function computeRms(buffer: AudioBuffer): number {
  if (buffer.numberOfChannels === 0 || buffer.length === 0) return 0;

  let channelTotal = 0;
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    if (data.length === 0) continue;
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      const sample = data[i] ?? 0;
      sum += sample * sample;
    }
    channelTotal += Math.sqrt(sum / data.length);
  }
  return channelTotal / buffer.numberOfChannels;
}

/**
 * Estimate the duration of an uploaded canonical 16 kHz mono WAV from its
 * byte size (server-side session logging — no decode required).
 *
 * @returns Duration in ms, or `null` when the type is not WAV or the blob
 *   is smaller than the RIFF header.
 */
export function estimateWavDurationMs(audio: { type: string; size: number }): number | null {
  const mime = audio.type.toLowerCase();
  const isWav = mime === 'audio/wav' || mime === 'audio/wave' || mime === 'audio/x-wav';
  if (!isWav || audio.size <= WAV_HEADER_BYTES) return null;
  return Math.round(((audio.size - WAV_HEADER_BYTES) / WHISPER_BYTES_PER_SECOND) * 1000);
}

/**
 * One-shot helper: decode → guard → resample → encode in a single call.
 * Creates a transient AudioContext for the decode step and disposes
 * it cleanly afterwards. Use this when the caller doesn't already
 * hold an AudioContext reference.
 *
 * Short-but-decodable clips (< 500 ms) SUCCEED — there is deliberately no
 * minimum-duration floor here (the recording layer owns tap guards).
 *
 * @throws {TranscodeError} `EMPTY` (zero-byte blob or zero-duration decode),
 *   `TOO_SHORT` (below 1 KB), `SILENCE` (below the RMS threshold),
 *   `UNDECODABLE` (codec/corruption fault, from decodeAudioBlob).
 */
export async function transcodeBlobToWav(blob: Blob): Promise<Blob> {
  // Use a short-lived AudioContext. We can't reuse the TTS one because
  // it's likely in 'running' state and we want a clean decode pipeline.
  const decodeCtx = new AudioContext();
  try {
    if (!blob || blob.size === 0) {
      throw new TranscodeError('EMPTY', 'Cannot transcode an empty audio blob');
    }
    if (blob.size < MIN_AUDIO_BLOB_BYTES) {
      throw new TranscodeError(
        'TOO_SHORT',
        `Audio blob too small to contain valid audio frames (${blob.size} bytes < ${MIN_AUDIO_BLOB_BYTES} bytes)`,
      );
    }

    const decoded = await decodeAudioBlob(blob, decodeCtx);

    // Validate decoded audio has content
    if (!decoded || decoded.duration === 0) {
      throw new TranscodeError('EMPTY', 'Decoded audio has zero duration');
    }

    // Low-amplitude noise gate: a dead-air clip is not worth a Whisper round-trip.
    const rms = computeRms(decoded);
    if (rms < SILENCE_RMS_THRESHOLD) {
      throw new TranscodeError(
        'SILENCE',
        `Audio is silent or below the amplitude threshold (RMS ${rms.toFixed(4)} < ${SILENCE_RMS_THRESHOLD})`,
      );
    }

    const resampled = await resampleToWhisperFormat(decoded);
    return encodeAsWav(resampled);
  } catch (err) {
    // Provide detailed error info for debugging transcoding failures
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error('[TranscodeToWav] Transcoding failed:', {
      blobSize: blob?.size ?? 0,
      blobType: blob?.type ?? 'unknown',
      code: err instanceof TranscodeError ? err.code : undefined,
      error: errorMessage,
      errorDetails: serializeError(err),
    });
    throw err;
  } finally {
    // Close the transient context to release hardware resources.
    // Per .clinerules: Lifecycle Cleanup is separate from Hardware Cleanup,
    // and an AudioContext is a lifecycle resource we own for this op.
    if (decodeCtx.state !== 'closed') {
      try {
        await decodeCtx.close();
      } catch {
        // Closing can fail in some edge cases, but we still want to continue
      }
    }
  }
}

/**
 * Write a fixed-length ASCII string into a DataView at the given offset.
 * Caller must ensure offset + str.length ≤ view.byteLength.
 */
function writeAscii(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}
