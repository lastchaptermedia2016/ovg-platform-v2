/**
 * Audio transcoding utilities — webm/opus (from MediaRecorder) → 16kHz mono 16-bit WAV.
 *
 * Why this exists:
 *   MediaRecorder produces a WebM live-stream container that lacks the
 *   index/duration header Groq's upstream Whisper decoder requires.
 *   Even though Groq lists 'webm' as a supported format, the static
 *   dump of MediaRecorder's output is rejected as "invalid media".
 *
 *   Decoding through the browser's native AudioContext and re-encoding
 *   to a canonical WAV (16kHz, mono, 16-bit PCM) produces a file
 *   Whisper ingests reliably — without server-side ffmpeg.
 *
 * Whisper canonical input:
 *   - Sample rate: 16000 Hz
 *   - Channels:    1 (mono)
 *   - Bit depth:   16-bit signed PCM
 *   - Container:   RIFF/WAVE
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

/**
 * Decode any audio container the browser supports (webm, mp4, ogg, …)
 * into an AudioBuffer using the native decoder.
 *
 * @throws Error if the audio format is not supported or the data is corrupted
 */
export async function decodeAudioBlob(
  blob: Blob,
  audioContext: AudioContext,
): Promise<AudioBuffer> {
  if (blob.size === 0) {
    throw new Error('Cannot decode empty audio blob');
  }

  try {
    const arrayBuffer = await blob.arrayBuffer();
    // decodeAudioData mutates the ArrayBuffer in some engines — clone to be safe.
    return await audioContext.decodeAudioData(arrayBuffer.slice(0));
  } catch (err) {
    // Enhance error message with blob metadata for debugging
    const errorMsg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Failed to decode audio (${blob.type || 'unknown'}, ${blob.size} bytes): ${errorMsg}`
    );
  }
}

/**
 * Resample + downmix an AudioBuffer to 16kHz mono using OfflineAudioContext.
 * The browser's resampler is high-quality and handles arbitrary input rates
 * (typically 44.1k, 48k, 96k) gracefully.
 */
export async function resampleToWhisperFormat(
  source: AudioBuffer,
): Promise<AudioBuffer> {
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
 * One-shot helper: decode → resample → encode in a single call.
 * Creates a transient AudioContext for the decode step and disposes
 * it cleanly afterwards. Use this when the caller doesn't already
 * hold an AudioContext reference.
 *
 * @throws Error if audio decoding fails (e.g., unsupported codec, corrupted data)
 */
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
        .filter(k => !['message', 'name', 'stack', 'constructor'].includes(k))
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
 * One-shot helper: decode → resample → encode in a single call.
 * Creates a transient AudioContext for the decode step and disposes
 * it cleanly afterwards. Use this when the caller doesn't already
 * hold an AudioContext reference.
 *
 * @throws Error if audio decoding fails (e.g., unsupported codec, corrupted data)
 */
export async function transcodeBlobToWav(blob: Blob): Promise<Blob> {
  // Use a short-lived AudioContext. We can't reuse the TTS one because
  // it's likely in 'running' state and we want a clean decode pipeline.
  const decodeCtx = new AudioContext();
  try {
    // Guard: minimum blob size (prevent header-only WebM containers from being decoded)
    if (!blob || blob.size < MIN_AUDIO_BLOB_BYTES) {
      throw new Error(
        `Audio blob too small to contain valid audio frames (${blob?.size || 0} bytes < ${MIN_AUDIO_BLOB_BYTES} bytes)`
      );
    }

    const decoded = await decodeAudioBlob(blob, decodeCtx);
    
    // Validate decoded audio has content
    if (!decoded || decoded.duration === 0) {
      throw new Error('Decoded audio has zero duration');
    }

    const resampled = await resampleToWhisperFormat(decoded);
    return encodeAsWav(resampled);
  } catch (err) {
    // Provide detailed error info for debugging transcoding failures
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error('[TranscodeToWav] Transcoding failed:', {
      blobSize: blob.size,
      blobType: blob.type,
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
