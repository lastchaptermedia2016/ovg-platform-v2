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
 * Decode any audio container the browser supports (webm, mp4, ogg, …)
 * into an AudioBuffer using the native decoder.
 */
export async function decodeAudioBlob(
  blob: Blob,
  audioContext: AudioContext,
): Promise<AudioBuffer> {
  const arrayBuffer = await blob.arrayBuffer();
  // decodeAudioData mutates the ArrayBuffer in some engines — clone to be safe.
  return audioContext.decodeAudioData(arrayBuffer.slice(0));
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
 */
export async function transcodeBlobToWav(blob: Blob): Promise<Blob> {
  // Use a short-lived AudioContext. We can't reuse the TTS one because
  // it's likely in 'running' state and we want a clean decode pipeline.
  const decodeCtx = new AudioContext();
  try {
    const decoded = await decodeAudioBlob(blob, decodeCtx);
    const resampled = await resampleToWhisperFormat(decoded);
    return encodeAsWav(resampled);
  } finally {
    // Close the transient context to release hardware resources.
    // Per .clinerules: Lifecycle Cleanup is separate from Hardware Cleanup,
    // and an AudioContext is a lifecycle resource we own for this op.
    if (decodeCtx.state !== 'closed') {
      await decodeCtx.close();
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
