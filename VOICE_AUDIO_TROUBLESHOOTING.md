# Voice Audio Troubleshooting Guide

## Overview

The ZEEDER voice pipeline uses a **high-fidelity, resilient architecture** with automatic fallback:

```
Push-to-Talk (PTT)
  ↓
MediaRecorder (browser)
  ↓
transcodeBlobToWav() [Browser AudioContext]
  ↓
/api/client/stt [Groq Whisper Transcription]
  ↓
/api/client/process-command [Intent Resolution]
  ↓
useZeederVoice Hook [Action Dispatch]
  ↓
ZeederContext/StudioDraftProvider [UI Update]
```

If **any step fails**, the system transparently falls back to the **Web Speech API** (device-local, offline-capable).

---

## Common Issues & Diagnostics

### Issue 1: "EncodingError: Unable to decode audio data"

**Symptom:**
```
[ZEEDER-VOICE] Whisper STT failed — falling back to Web Speech. 
{
  errorType: "EncodingError",
  errorMessage: "Failed to decode audio (audio/webm, 45000 bytes): The media resource could not be decoded.",
  blobSize: 45000,
  blobType: "audio/webm",
  mimeType: "audio/webm"
}
```

**Root Causes:**

1. **Unsupported WebM codec** — MediaRecorder is encoding with a codec the browser's AudioContext doesn't support
2. **Corrupted audio chunk** — Recording stopped unexpectedly, producing malformed data
3. **Browser compatibility** — Some browsers have stricter audio decoders than others

**Diagnosis:**
- Check the browser console for detailed `errorType` and `errorMessage` fields
- Look for `blobSize`, `blobType`, and `mimeType` to understand the audio format
- Verify the WebM container is valid with a tool like `ffprobe`
- The error now includes the full serialized exception details for debugging

**Solution:**

The code has been improved with better error handling:

1. **Detailed error serialization** — Error logging now includes:
   - `errorType`: Constructor name (e.g., "EncodingError", "TypeError")
   - `errorMessage`: The actual error message
   - `errorStack`: First 2-3 stack frames for context
   - Blob metadata: size, type, MIME type from MediaRecorder
   
   No more `{}` empty error objects!

2. **Empty blob guard** — The code now explicitly checks:
   ```typescript
   if (!blob || blob.size === 0) {
     console.warn('[ZEEDER-VOICE] Skipping transcode: recorded blob is empty.');
     return;
   }
   ```
   This prevents attempting to transcode a zero-byte blob.

3. **Validation in transcode** — `transcodeBlobToWav()` now:
   - Validates blob size before attempting decode
   - Checks decoded audio has non-zero duration
   - Logs detailed error metadata including codec and size
   - Safely closes AudioContext even on error
   - Uses `serializeError()` helper to handle all error types (Error, DOMException, objects)

4. **Automatic fallback** — On decode failure, the system:
   - Logs full error diagnostics with proper serialization
   - Clears partial transcript
   - Switches to Web Speech API (local-only)

**If fallback STT works but Whisper fails:**
- The browser's Web Speech API will handle transcription locally
- No server round-trip; less vocabulary boost but fully offline-capable
- This is **intentional**: fallback prioritizes availability over accuracy

---

### Issue 2: "Ignoring short audio clip" — Header-Only WebM Containers (1 KB Guard)

**Symptom:**
```
[ZEEDER-VOICE] Ignoring short audio clip (234 bytes < 1024 bytes). 
Likely an accidental tap or noise burst. Hold the button longer for a valid command.
```

**Root Cause:**
- User clicked PTT but released immediately (< 100-200ms)
- Recording captured only WebM container headers (~100-200 bytes) without audio frames
- Very brief noise, tap, or stray button press detected

**Diagnosis:**
- Check the blob size in the console message
- If < 1KB, it's an accidental tap or recording too brief to contain real audio
- This is **intentional behavior** — prevents header-only blobs from wasting transcode resources

**Two-Level Protection Strategy:**

1. **Hook-level guard** (`src/hooks/useZeederVoice.ts`):
   - Checks `if (blob.size < MIN_AUDIO_BLOB_BYTES)` where `MIN_AUDIO_BLOB_BYTES = 1024`
   - Provides user-friendly message
   - Early exit prevents unnecessary AudioContext allocation

2. **Transcode-level guard** (`src/utils/audio/transcode-to-wav.ts`):
   - Secondary validation before `decodeAudioBlob()`
   - Throws descriptive error if somehow bypasses hook check
   - Prevents confusing "Unable to decode audio data" errors

**Why 1KB threshold?**
- WebM headers alone: ~100-200 bytes (no audio data)
- Minimum real audio frames: > 800 bytes
- 1024 bytes (1 KB): Safe cutoff filtering accidental taps while allowing valid short utterances

**User guidance:**
- Hold the button for at least **1-2 seconds** for a valid command
- Brief taps are silently ignored (no error shown to user)
- Console message helps developers debug: *"Hold the button longer for a valid command"*

---

### Issue 3: Empty Recording (0 bytes) or Microphone Not Ready

**Symptom:**
```
[ZEEDER-VOICE] Skipping transcode: recorded blob is empty.
```

**Root Cause:**
- User clicked PTT but released immediately before audio capture started
- Audio devices were not ready or initialized
- Microphone permission was denied or revoked

**Diagnosis:**
- Check browser's permission prompt for microphone
- Ensure at least 1-2 seconds of actual recording
- This is distinct from "short audio clip" — this is truly 0 bytes

**Solution:**
- Users should hold the button for **at least 1-2 seconds**
- System catches and gracefully ignores zero-byte blobs
- No error shown to users, silently skipped
- On server side, the endpoint requires a minimum of **12 KB** of audio data (additional safety check)

---

### Issue 3: "Rate limited" or "Too many requests"

**Symptom:**
```
[CLIENT-STT] Rate limit exceeded
Too many requests. Please wait a moment before trying again.
```

**Root Cause:**
- User made >15 STT requests per 60 seconds
- May indicate stuck recording loop or rapid retry

**Solution:**
- Built-in rate limit: 15 requests per 60 seconds per IP
- After limit, wait 60 seconds before next request
- Check for recording loops in browser DevTools

---

### Issue 4: "Unauthorized" or "No tenant resolved"

**Symptom:**
```
[CLIENT-STT] Unauthorized STT attempt
[CLIENT-STT] No tenant resolved for user
```

**Root Cause:**
- User is not authenticated
- Session has expired
- User has no tenant association in `user_resellers`

**Diagnosis:**
- Check if user is logged in (check auth session)
- Verify user appears in `SELECT * FROM user_resellers WHERE user_id = ?`

**Solution:**
- Log out and log back in to refresh session
- Ensure user is linked to a tenant via the reseller dashboard

---

### Issue 5: Whisper Transcription Returns Empty

**Symptom:**
```
{
  "text": ""
}
```

**Root Cause:**
- Audio is silent or too much background noise
- Audio quality too low (extreme compression)
- Language detection failure

**Diagnosis:**
- Check audio levels in OS/browser mixer
- Ensure microphone is working in other apps
- Try with clear, audible speech

**Solution:**
- Speak clearly into microphone at normal volume
- Reduce background noise
- The system gracefully treats empty transcription as "no command" rather than error

---

## Performance Characteristics

### Latency Breakdown

| Component | Typical Time |
|-----------|-------------|
| MediaRecorder capture | ~15 seconds max |
| Transcode (decode → resample → encode) | 100-300ms |
| Groq Whisper transcription | 500ms-2s (depends on length) |
| Intent parsing + dispatch | 50-200ms |
| **Total** | **~1-3 seconds** |

### Audio Constraints

- **Sample rate:** 16 kHz (Groq Whisper standard)
- **Channels:** 1 (mono)
- **Bit depth:** 16-bit signed PCM
- **Container:** RIFF/WAVE
- **Max file size:** 2 MB (server-side limit)
- **Min file size (hook guard):** 1 KB (prevents header-only WebM containers)
- **Min file size (server):** 12 KB (micro-recording protection via `/api/client/stt`)
- **Max recording duration:** 15 seconds (hard cap)

---

## Browser Compatibility

| Browser | MediaRecorder | AudioContext.decodeAudioData | Web Speech API |
|---------|---|---|---|
| Chrome/Chromium | ✅ Full support | ✅ WebM, WAV, MP3 | ✅ Full support |
| Firefox | ✅ Full support | ✅ WebM, WAV, MP3 | ✅ Full support |
| Safari | ⚠️ Limited codec | ⚠️ MP4 only | ✅ Full support |
| Edge | ✅ Full support | ✅ WebM, WAV, MP3 | ✅ Full support |

**Safari Note:** Safari's MediaRecorder may default to MP4 instead of WebM. The transcode pipeline handles this, but if Safari's decode fails, the system falls back to Web Speech API (which works perfectly on Safari).

---

## Debugging Checklist

When audio isn't working:

- [ ] **Browser console open** — Watch for `[ZEEDER-VOICE]` and `[TranscodeToWav]` logs
- [ ] **Microphone permission granted** — Check browser's permission prompt
- [ ] **Microphone working in OS** — Test in system mixer or other app
- [ ] **Hold button long enough** — Press and hold for 1-2 seconds minimum
- [ ] **Network connectivity** — Verify `/api/client/stt` endpoint is reachable
- [ ] **Session is valid** — Ensure you're authenticated (not on embed/anonymous)
- [ ] **Rate limit reset** — If "Too many requests", wait 60 seconds
- [ ] **Browser dev tools** — Network tab shows `/api/client/stt` requests and responses
- [ ] **AudioContext available** — Check `typeof AudioContext !== 'undefined'` in console

---

## Manual Testing

### Test in Browser Console

```javascript
// Check AudioContext support
console.log('AudioContext available:', typeof AudioContext !== 'undefined');
console.log('MediaRecorder available:', typeof MediaRecorder !== 'undefined');
console.log('Web Speech available:', typeof (window.webkitSpeechRecognition || window.SpeechRecognition) !== 'undefined');

// Check session
fetch('/api/client/stt', { method: 'GET' }).then(r => r.status).then(console.log);
// Should return 405 (Method Not Allowed), not 401 (Unauthorized)
```

### Test STT Endpoint Directly

```bash
# Create a test WAV file (16kHz, mono, 16-bit)
# Then POST it:
curl -X POST \
  -F "file=@test-recording.wav" \
  http://localhost:3000/api/client/stt
```

---

## Code Improvements (Implemented)

### 1. Robust Error Serialization in `transcodeBlobToWav()`

**Problem:** Error objects were logging as empty `{}` when caught as non-standard error types (DOMException, etc).

**Solution:** New `serializeError()` helper safely extracts error information:

```typescript
function serializeError(err: unknown): Record<string, unknown> {
  if (err instanceof Error) {
    return {
      message: err.message,
      name: err.name,
      stack: err.stack?.split('\n').slice(0, 3).join('\n'),
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
        .slice(0, 3)
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
```

Now logs show:
```javascript
{
  errorDetails: {
    type: "EncodingError",
    message: "The media resource could not be decoded.",
    name: "EncodingError",
    code: null,
    details: {}
  }
}
```

### 2. Enhanced Error Logging in useZeederVoice.ts

**Problem:** Error context was lost when logging in the `onstop` handler.

**Solution:** Error extraction now handles all error types:

```typescript
let errorInfo = {};
if (err instanceof Error) {
  errorInfo = {
    errorType: err.name,
    errorMessage: err.message,
    errorStack: err.stack?.split('\n').slice(0, 2).join(' '),
  };
} else if (typeof err === 'object' && err !== null) {
  const errObj = err as Record<string, unknown>;
  errorInfo = {
    errorType: errObj.constructor?.name ?? 'Unknown',
    errorMessage: errObj.message ?? errObj.toString?.(),
    errorName: errObj.name,
  };
} else {
  errorInfo = {
    errorType: typeof err,
    errorMessage: String(err),
  };
}

console.error('[ZEEDER-VOICE] Whisper STT failed — falling back to Web Speech.', {
  ...errorInfo,
  blobSize: blob.size,
  blobType: blob.type,
  mimeType: recorder.mimeType,
});
```

### 3. Empty Blob Guard in recorder.onstop

**Problem:** Attempting to transcode zero-byte blobs would trigger unnecessary error logs.

**Solution:** Explicit early return with clear messaging:

```typescript
if (!blob || blob.size === 0) {
  console.warn('[ZEEDER-VOICE] Skipping transcode: recorded blob is empty.');
  return;
}
```

### 4. Validation in `transcodeBlobToWav()`

**Before:** Silent failure if blob was empty
```typescript
export async function transcodeBlobToWav(blob: Blob): Promise<Blob> {
  const decoded = await decodeAudioBlob(blob, decodeCtx);
  // No prior validation
}
```

**After:** Explicit size and duration validation
```typescript
export async function transcodeBlobToWav(blob: Blob): Promise<Blob> {
  try {
    if (blob.size === 0) {
      throw new Error('Audio blob is empty');
    }

    const decoded = await decodeAudioBlob(blob, decodeCtx);
    
    if (!decoded || decoded.duration === 0) {
      throw new Error('Decoded audio has zero duration');
    }

    const resampled = await resampleToWhisperFormat(decoded);
    return encodeAsWav(resampled);
  } catch (err) {
    console.error('[TranscodeToWav] Transcoding failed:', {
      blobSize: blob.size,
      blobType: blob.type,
      error: errorMessage,
      errorDetails: serializeError(err),
    });
    throw err;
  }
}
```

### 5. Improved decodeAudioBlob() Error Messages

**Before:**
```
Failed to decode audio: The media resource could not be decoded.
```

**After:**
```
Failed to decode audio (audio/webm, 45000 bytes): The media resource could not be decoded.
```

Includes blob type and size for better debugging.

---

## Future Improvements

1. **Adaptive codec selection** — Detect browser capabilities and select optimal codec
2. **Progressive WAV encoding** — Stream-encode instead of buffering all chunks
3. **Noise gate** — Filter silence/low-volume audio before upload
4. **Voice activity detection** — Detect speech boundaries automatically
5. **Codec health metrics** — Track transcoding success rates per browser
6. **Silence detection** — Auto-stop recording if no speech detected for 3s

---

## Support

For issues not covered here:

1. **Check server logs:** `console error` in terminal running `npm run dev`
2. **Browser DevTools:** Network tab → `/api/client/stt` → Response
3. **Microphone permissions:** Settings → Site Settings → Microphone
4. **Audio levels:** OS mixer → Check microphone input levels

The system is **resilient by design** — if Whisper fails, Web Speech takes over automatically. If you're not seeing a fallback, check the browser console for unexpected errors.
