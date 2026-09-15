# Minimum Audio Blob Size Guard Implementation

## Summary

Added a **1 KB (1024 bytes) minimum audio blob size guard** to prevent WebM container headers from being transcoded as audio. This prevents `decodeAudioData` failures on accidental microphone taps.

## Problem Solved

**Issue:** Users accidentally tapping the PTT button created tiny WebM blobs (100-200 bytes) containing only container headers and no audio frames, causing:
- Unnecessary AudioContext overhead
- Confusing `EncodingError: Unable to decode audio data` messages
- Poor user experience with no clear guidance

## Solution: Two-Level Defense

### Level 1: Hook Guard (Early Catch)
**File:** `src/hooks/useZeederVoice.ts`

```typescript
const MIN_AUDIO_BLOB_BYTES = 1024; // 1 KB threshold

// In recorder.onstop handler:
if (blob.size < MIN_AUDIO_BLOB_BYTES) {
  console.warn(
    `[ZEEDER-VOICE] Ignoring short audio clip (${blob.size} bytes < ${MIN_AUDIO_BLOB_BYTES} bytes). ` +
    'Likely an accidental tap or noise burst. Hold the button longer for a valid command.'
  );
  return;
}
```

**Benefits:**
- Catches accidental taps before transcoding work starts
- Prevents unnecessary AudioContext allocation
- User-friendly console message for developers
- Early exit improves performance

### Level 2: Transcode Guard (Secondary Defense)
**File:** `src/utils/audio/transcode-to-wav.ts`

```typescript
const MIN_AUDIO_BLOB_BYTES = 1024;

export async function transcodeBlobToWav(blob: Blob): Promise<Blob> {
  const decodeCtx = new AudioContext();
  try {
    if (!blob || blob.size < MIN_AUDIO_BLOB_BYTES) {
      throw new Error(
        `Audio blob too small to contain valid audio frames (${blob?.size || 0} bytes < ${MIN_AUDIO_BLOB_BYTES} bytes)`
      );
    }
    // ... rest of transcode logic
  }
}
```

**Benefits:**
- Fallback if hook guard is bypassed
- Prevents confusing decode errors
- Descriptive error message for debugging
- Defense-in-depth architecture

## Why 1 KB Threshold?

| Component | Size | Notes |
|-----------|------|-------|
| WebM header (empty container) | ~100-200 bytes | Container metadata only |
| Minimum real audio data | ~800+ bytes | Actual audio frames needed |
| **1 KB threshold** | **1024 bytes** | Safe cutoff |
| **Server validation** | **12 KB minimum** | Additional safety layer |

The 1 KB threshold filters accidental taps and noise bursts while allowing valid short utterances (1-2 second recordings).

## Audio Constraints (Complete Stack)

### Hook Level (Client)
- **Min size:** 1 KB (1024 bytes)
- **Purpose:** Prevent header-only WebM containers from transcode
- **User feedback:** Console warning with actionable guidance

### Transcode Level (Browser)
- **Min size:** 1 KB (secondary validation)
- **Purpose:** Fallback guard against tiny blobs
- **Purpose:** Prevent `decodeAudioData` failures

### Server Level (`/api/client/stt`)
- **Min size:** 12 KB (minimum micro-recording protection)
- **Purpose:** Ensure meaningful speech content
- **Purpose:** Second server-side validation

### Upper Bounds
- **Max recording:** 15 seconds (hard cap in hook)
- **Max file size:** 2 MB (server limit)
- **Sample rate:** 16 kHz (Whisper standard)
- **Channels:** 1 (mono)
- **Bit depth:** 16-bit PCM

## User Experience Flow

### Happy Path (Valid Recording)
```
User holds PTT for 2 seconds
  ↓
blob.size = 45,000 bytes (> 1 KB ✓)
  ↓
Hook guard passes
  ↓
Transcode blob to 16kHz mono WAV
  ↓
POST to /api/client/stt
  ↓
Whisper transcribes → Intent parsing → Action dispatch
```

### Short Tap (< 1 KB)
```
User briefly taps PTT (< 200ms)
  ↓
blob.size = 234 bytes (< 1 KB ✗)
  ↓
Hook guard catches: console.warn([ZEEDER-VOICE] Ignoring short audio clip...)
  ↓
Silent skip, no transcode work
  ↓
User sees console message: "Hold the button longer for a valid command"
```

### Edge Case (Empty Blob)
```
User taps PTT but audio not ready
  ↓
blob.size = 0 bytes
  ↓
Hook guard catches: console.warn([ZEEDER-VOICE] Skipping transcode: recorded blob is empty.)
  ↓
Silent skip
```

## Error Messages

### For Developers (Console)
```
[ZEEDER-VOICE] Ignoring short audio clip (234 bytes < 1024 bytes). 
Likely an accidental tap or noise burst. Hold the button longer for a valid command.
```

### For Debugging (Transcode Failure)
```
[TranscodeToWav] Transcoding failed: {
  blobSize: 234,
  blobType: "audio/webm",
  error: "Audio blob too small to contain valid audio frames (234 bytes < 1024 bytes)",
  errorDetails: {...}
}
```

## Implementation Details

### Files Modified
1. **`src/hooks/useZeederVoice.ts`**
   - Added `MIN_AUDIO_BLOB_BYTES = 1024` constant
   - Added Guard 2 (minimum size check) in `recorder.onstop` handler after Guard 1 (empty blob check)

2. **`src/utils/audio/transcode-to-wav.ts`**
   - Added `MIN_AUDIO_BLOB_BYTES = 1024` constant
   - Updated `transcodeBlobToWav()` to check minimum size before decode

3. **`VOICE_AUDIO_TROUBLESHOOTING.md`**
   - Documented Issue 2: "Ignoring short audio clip" with explanation
   - Documented Issue 3: "Empty Recording" distinct from short clips
   - Updated audio constraints table with 1 KB (hook) vs 12 KB (server) distinction
   - Added two-level protection strategy explanation

### Build Status
✅ **TypeScript:** `npx tsc --noEmit` — Exit Code 0  
✅ **Build:** `npm run build` — Exit Code 0  
✅ **Routes:** All 48 routes compiled successfully

## Testing Checklist

- [ ] Console shows warning on brief PTT tap (< 1 KB)
- [ ] Valid 2-second recording transcodes normally (> 1 KB)
- [ ] Zero-byte blobs handled gracefully
- [ ] No unexpected errors on accidental taps
- [ ] Build passes with no TypeScript errors
- [ ] No regressions in valid voice commands

## Browser Compatibility

| Browser | Support | Notes |
|---------|---------|-------|
| Chrome/Chromium | ✅ Full | WebM codec, AudioContext full support |
| Firefox | ✅ Full | WebM codec, AudioContext full support |
| Safari | ⚠️ Partial | MP4 codec, falls back to Web Speech on decode error |
| Edge | ✅ Full | WebM codec, AudioContext full support |

## Deployment Notes

- **No git push:** Code changes ready but not pushed (per user instructions)
- **No database changes:** Pure client-side audio pipeline guard
- **No API changes:** No new endpoints or schema changes
- **Backward compatible:** Guard only prevents tiny blobs, doesn't affect valid recordings
- **No feature flags needed:** Guard is always active

## Future Enhancements

1. **Configurable threshold** — Allow per-tenant minimum blob size tuning
2. **Noise gate** — Detect and filter silence before reaching threshold
3. **Voice activity detection** — Auto-stop recording if no speech for 3 seconds
4. **Codec metrics** — Track transcode success rates per browser
5. **Adaptive constraints** — Adjust based on network conditions and device capabilities

## Summary

This implementation provides **defense-in-depth protection** against header-only WebM containers through a well-documented 1 KB threshold enforced at both the hook and transcode layers. Users benefit from clear guidance when they accidentally tap the button, and the system avoids unnecessary resource allocation on invalid audio blobs.
