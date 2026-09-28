// src/lib/voice/__tests__/transcoder.test.ts
//
// Phase 5 — transcoder guard states (typed TranscodeError codes), Whisper
// resample targeting, WAV encoding, RMS analysis, and duration estimation.
// Node-only vitest: AudioContext / OfflineAudioContext are stubbed via
// vi.stubGlobal — no jsdom or Web Audio implementation required.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  transcodeBlobToWav,
  encodeAsWav,
  computeRms,
  estimateWavDurationMs,
  TranscodeError,
  TRANSCODE_ERROR_CODES,
  type TranscodeErrorCode,
} from '../transcoder';

// ── Test doubles ────────────────────────────────────────────────────────────

interface FakeBufferOptions {
  duration: number;
  sampleRate: number;
  channels?: number;
  fill?: number;
}

/** Minimal AudioBuffer stand-in (node has no Web Audio implementation). */
function makeBuffer(opts: FakeBufferOptions): AudioBuffer {
  const channels = opts.channels ?? 1;
  const length = Math.max(0, Math.ceil(opts.duration * opts.sampleRate));
  const planes = Array.from({ length: channels }, () => {
    const data = new Float32Array(length);
    if (opts.fill !== undefined) data.fill(opts.fill);
    return data;
  });
  return {
    numberOfChannels: channels,
    sampleRate: opts.sampleRate,
    length,
    duration: opts.duration,
    getChannelData: (index: number) => planes[index] ?? new Float32Array(0),
  } as unknown as AudioBuffer;
}

// Per-test decode behavior consumed by the AudioContext stub below.
let decodeShouldReject = false;
let decodeBuffer: AudioBuffer = makeBuffer({ duration: 0.5, sampleRate: 44100, fill: 0.2 });
let createdContexts: Array<{ state: string; close: () => Promise<void> }> = [];

class FakeAudioContext {
  state = 'running';
  resume = vi.fn(async () => {
    this.state = 'running';
  });
  close = vi.fn(async () => {
    this.state = 'closed';
  });
  decodeAudioData = vi.fn(async () => {
    if (decodeShouldReject) {
      const err = new Error('The media resource could not be decoded.');
      err.name = 'EncodingError';
      throw err;
    }
    return decodeBuffer;
  });
  constructor() {
    createdContexts.push(this);
  }
}

// Captured OfflineAudioContext ctor args: [channels, length, sampleRate].
let offlineArgs: [number, number, number] | null = null;
let renderBuffer: AudioBuffer = makeBuffer({ duration: 0.5, sampleRate: 16000, fill: 0.2 });

class FakeOfflineAudioContext {
  destination = {};
  constructor(channels: number, length: number, sampleRate: number) {
    offlineArgs = [channels, length, sampleRate];
    renderBuffer = makeBuffer({ duration: length / sampleRate, sampleRate, fill: 0.2 });
  }
  createBufferSource() {
    return { buffer: null as AudioBuffer | null, connect: vi.fn(), start: vi.fn() };
  }
  startRendering = vi.fn(async () => renderBuffer);
}

/** Assert a promise rejects with a TranscodeError carrying `code`. */
async function expectTranscodeError(
  promise: Promise<Blob>,
  code: TranscodeErrorCode,
): Promise<void> {
  const err = await promise.then(() => null).catch((e: unknown) => e);
  expect(err).toBeInstanceOf(TranscodeError);
  expect((err as TranscodeError).code).toBe(code);
}

const webmBlob = (bytes = 2048) => new Blob([new Uint8Array(bytes)], { type: 'audio/webm' });

beforeEach(() => {
  decodeShouldReject = false;
  decodeBuffer = makeBuffer({ duration: 0.5, sampleRate: 44100, fill: 0.2 });
  createdContexts = [];
  offlineArgs = null;
  vi.stubGlobal('AudioContext', FakeAudioContext);
  vi.stubGlobal('OfflineAudioContext', FakeOfflineAudioContext);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ── TranscodeError contract ─────────────────────────────────────────────────

describe('TranscodeError', () => {
  it('exposes exactly the four directive error codes', () => {
    expect([...TRANSCODE_ERROR_CODES]).toEqual(['AUDIO_TOO_SHORT', 'EMPTY', 'SILENCE', 'UNDECODABLE']);
  });

  it('is a typed Error subclass carrying its code', () => {
    const err = new TranscodeError('EMPTY', 'no audio');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('TranscodeError');
    expect(err.code).toBe('EMPTY');
    expect(err.message).toBe('no audio');
  });
});

// ── transcodeBlobToWav guard states ─────────────────────────────────────────

describe('transcodeBlobToWav — guard states', () => {
  it('throws EMPTY for a zero-byte blob', async () => {
    await expectTranscodeError(transcodeBlobToWav(new Blob([])), 'EMPTY');
  });

  it('throws AUDIO_TOO_SHORT for a sub-1 KB blob', async () => {
    const err = await transcodeBlobToWav(webmBlob(500)).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TranscodeError);
    expect((err as TranscodeError).code).toBe('AUDIO_TOO_SHORT');
    expect((err as TranscodeError).message).toContain('500 bytes < 1024 bytes');
  });

  it('throws UNDECODABLE when the codec cannot be decoded', async () => {
    decodeShouldReject = true;
    const err = await transcodeBlobToWav(webmBlob()).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TranscodeError);
    expect((err as TranscodeError).code).toBe('UNDECODABLE');
    expect((err as TranscodeError).message).toContain('Failed to decode audio');
    expect((err as TranscodeError).message).toContain('audio/webm');
  });

  it('throws EMPTY when the decoded buffer has zero duration', async () => {
    decodeBuffer = makeBuffer({ duration: 0, sampleRate: 44100, fill: 0.2 });
    await expectTranscodeError(transcodeBlobToWav(webmBlob()), 'EMPTY');
  });

  it('throws SILENCE for a low-amplitude (noise-floor) clip', async () => {
    decodeBuffer = makeBuffer({ duration: 0.5, sampleRate: 44100, fill: 0.001 });
    await expectTranscodeError(transcodeBlobToWav(webmBlob()), 'SILENCE');
  });

  it('does not allocate an AudioContext for an invalid (empty) blob', async () => {
    await transcodeBlobToWav(new Blob([])).catch(() => undefined);
    expect(createdContexts).toHaveLength(0);
  });

  it('does not allocate an AudioContext for a too-brief blob', async () => {
    await transcodeBlobToWav(webmBlob(500)).catch(() => undefined);
    expect(createdContexts).toHaveLength(0);
  });

  it('creates and closes a transient AudioContext on the success path', async () => {
    await transcodeBlobToWav(webmBlob());
    expect(createdContexts).toHaveLength(1);
    expect(createdContexts[0]?.state).toBe('closed');
  });

  it('creates and closes a transient AudioContext even on a decode failure', async () => {
    decodeShouldReject = true;
    await transcodeBlobToWav(webmBlob()).catch(() => undefined);
    expect(createdContexts).toHaveLength(1);
    expect(createdContexts[0]?.state).toBe('closed');
  });

  it('resumes a suspended AudioContext before decoding', async () => {
    const resume = vi.fn(async () => undefined);
    class SuspendedAudioContext {
      state: string = 'suspended';
      resume = resume;
      close = vi.fn(async () => { this.state = 'closed'; });
      decodeAudioData = vi.fn(async () => decodeBuffer);
      constructor() {
        createdContexts.push(this);
      }
    }
    vi.stubGlobal('AudioContext', SuspendedAudioContext);

    await transcodeBlobToWav(webmBlob());
    expect(resume).toHaveBeenCalled();
    expect(createdContexts).toHaveLength(1);
    expect(createdContexts[0]?.state).toBe('closed');
  });

  it('uses the webkitAudioContext polyfill when AudioContext is undefined', async () => {
    vi.unstubAllGlobals();
    createdContexts.length = 0;
    let webkitCalls = 0;
    class WebkitAudioContext {
      state: string = 'running';
      close = vi.fn(async () => { this.state = 'closed'; });
      decodeAudioData = vi.fn(async () => decodeBuffer);
      constructor() {
        webkitCalls++;
        createdContexts.push(this);
      }
    }
    vi.stubGlobal('webkitAudioContext', WebkitAudioContext);
    vi.stubGlobal('AudioContext', undefined);
    vi.stubGlobal('OfflineAudioContext', FakeOfflineAudioContext);

    await transcodeBlobToWav(webmBlob());
    expect(webkitCalls).toBe(1);
    expect(createdContexts).toHaveLength(1);
    expect(createdContexts[0]?.state).toBe('closed');
  });

  it('throws UNDECODABLE when no Web Audio API is available', async () => {
    vi.unstubAllGlobals();
    vi.stubGlobal('AudioContext', undefined);
    vi.stubGlobal('webkitAudioContext', undefined);

    const err = await transcodeBlobToWav(webmBlob()).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TranscodeError);
    expect((err as TranscodeError).code).toBe('UNDECODABLE');
    expect((err as TranscodeError).message).toContain('not available in this browser');
    expect(createdContexts).toHaveLength(0);
  });

  it('surfaces the DOMException name in the decode rejection message', async () => {
    decodeShouldReject = true;
    const err = await transcodeBlobToWav(webmBlob()).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TranscodeError);
    expect((err as TranscodeError).message).toContain('EncodingError');
  });
});

// ── transcodeBlobToWav — success paths ──────────────────────────────────────

describe('transcodeBlobToWav — success paths', () => {
  it('transcodes a short (<500 ms) clip successfully targeting 16 kHz mono', async () => {
    decodeBuffer = makeBuffer({ duration: 0.4, sampleRate: 44100, fill: 0.3 });

    const wav = await transcodeBlobToWav(webmBlob());

    // OfflineAudioContext must be constructed as (1 ch, ceil(0.4*16000)=6400, 16000).
    expect(offlineArgs).toEqual([1, 6400, 16000]);
    expect(wav.type).toBe('audio/wav');
    expect(wav.size).toBe(44 + 6400 * 2);

    // Transient decode context is released (lifecycle cleanup).
    expect(createdContexts[0]?.state).toBe('closed');
  });

  it('converts a 48 kHz source to the 16 kHz Whisper standard', async () => {
    decodeBuffer = makeBuffer({ duration: 0.6, sampleRate: 48000, fill: 0.3 });

    await transcodeBlobToWav(webmBlob());

    expect(offlineArgs).toEqual([1, 9600, 16000]); // ceil(0.6 * 16000) = 9600
  });

  it('writes a canonical RIFF/WAVE header at 16 kHz mono 16-bit', async () => {
    const wav = await transcodeBlobToWav(webmBlob());
    const view = new DataView(await wav.arrayBuffer());
    const tag = (offset: number, len: number) =>
      String.fromCharCode(
        ...Array.from({ length: len }, (_, i) => view.getUint8(offset + i)),
      );

    expect(tag(0, 4)).toBe('RIFF');
    expect(tag(8, 4)).toBe('WAVE');
    expect(tag(36, 4)).toBe('data');
    expect(view.getUint32(24, true)).toBe(16000); // SampleRate
    expect(view.getUint16(22, true)).toBe(1); // Channels
    expect(view.getUint16(34, true)).toBe(16); // BitsPerSample
  });
});

// ── encodeAsWav contract ────────────────────────────────────────────────────

describe('encodeAsWav', () => {
  it('rejects buffers with the wrong channel count', () => {
    const stereo = makeBuffer({ duration: 0.1, sampleRate: 16000, channels: 2, fill: 0.2 });
    expect(() => encodeAsWav(stereo)).toThrow(/expected 1 channel/);
  });

  it('rejects buffers with the wrong sample rate', () => {
    const wrongRate = makeBuffer({ duration: 0.1, sampleRate: 44100, fill: 0.2 });
    expect(() => encodeAsWav(wrongRate)).toThrow(/expected 16000Hz/);
  });

  it('clamps out-of-range float samples to Int16 bounds', async () => {
    const hot = makeBuffer({ duration: 0.001, sampleRate: 16000, fill: 2.0 });
    const hotView = new DataView(await encodeAsWav(hot).arrayBuffer());
    expect(hotView.getInt16(44, true)).toBe(32767);

    const cold = makeBuffer({ duration: 0.001, sampleRate: 16000, fill: -2.0 });
    const coldView = new DataView(await encodeAsWav(cold).arrayBuffer());
    expect(coldView.getInt16(44, true)).toBe(-32768);
  });
});

// ── computeRms ──────────────────────────────────────────────────────────────

describe('computeRms', () => {
  it('returns 0 for a silent buffer', () => {
    expect(computeRms(makeBuffer({ duration: 0.1, sampleRate: 16000, fill: 0 }))).toBe(0);
  });

  it('returns the amplitude for a constant-level buffer', () => {
    const rms = computeRms(makeBuffer({ duration: 0.1, sampleRate: 16000, fill: 0.5 }));
    expect(rms).toBeCloseTo(0.5, 5);
  });

  it('averages RMS across channels', () => {
    const buffer = makeBuffer({ duration: 0.05, sampleRate: 16000, channels: 2, fill: 0.25 });
    expect(computeRms(buffer)).toBeCloseTo(0.25, 5);
  });

  it('returns 0 for an empty (zero-length) buffer', () => {
    expect(computeRms(makeBuffer({ duration: 0, sampleRate: 16000 }))).toBe(0);
  });
});

// ── estimateWavDurationMs ───────────────────────────────────────────────────

describe('estimateWavDurationMs', () => {
  it('derives duration from a canonical 16 kHz WAV byte size', () => {
    // 1 second of audio = 44-byte header + 32000 bytes of PCM.
    expect(estimateWavDurationMs({ type: 'audio/wav', size: 44 + 32000 })).toBe(1000);
  });

  it('accepts alternative WAV mime spellings', () => {
    expect(estimateWavDurationMs({ type: 'audio/x-wav', size: 44 + 16000 })).toBe(500);
    expect(estimateWavDurationMs({ type: 'audio/wave', size: 44 + 16000 })).toBe(500);
  });

  it('returns null for non-WAV containers', () => {
    expect(estimateWavDurationMs({ type: 'audio/webm', size: 999_999 })).toBeNull();
  });

  it('returns null when the blob cannot contain a full RIFF header', () => {
    expect(estimateWavDurationMs({ type: 'audio/wav', size: 10 })).toBeNull();
  });
});
