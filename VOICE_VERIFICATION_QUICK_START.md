# Voice Pipeline Verification — Quick Start

**TL;DR:** Follow these steps to verify the 1 KB minimum blob size guard is working correctly.

---

## 5-Minute Quick Verification

### Step 1: Load Test Harness (1 minute)

Open browser DevTools (F12) and paste into Console:

```javascript
// Copy from: scripts/voice-pipeline-test-console.js
// OR paste this simplified version:
(function(){window.voicePipelineTests={capturedLogs:[],startCapture(){this.capturedLogs=[]},stopCapture(){},getLogsMatching(p){return this.capturedLogs.filter(l=>p.test(l.message))},testAll(){console.log('✅ Test harness loaded. Ready for testing.')}}})();
```

### Step 2: Run Quick Test (1 minute)

```javascript
// This will verify browser compatibility
console.log('✅ MediaRecorder:', typeof MediaRecorder !== 'undefined');
console.log('✅ AudioContext:', typeof AudioContext !== 'undefined');
console.log('✅ Web Speech:', typeof webkitSpeechRecognition !== 'undefined');
```

### Step 3: Sustained Recording Test (2 minutes)

1. **Hold PTT button for 2+ seconds**
2. **Speak a command** (e.g., "Hello")
3. **Release**

**Expected Console:** `[ZEEDER-VOICE] Recording completed: { totalSize: 45234 }`

**Check:** Blob size should be > 1024

### Step 4: Quick-Tap Test (1 minute)

1. **Tap PTT button quickly** (< 200ms)
2. **Repeat 2 times**

**Expected Console:** `[ZEEDER-VOICE] Ignoring short audio clip (XXX bytes < 1024 bytes)`

**Check:** Both taps should show < 1024 bytes

---

## ✅ Success = All of These Are True

- [ ] Sustained recording: Blob size > 1024 bytes
- [ ] Sustained recording: No guard warning
- [ ] Quick-tap: Guard warning with size < 1024 bytes
- [ ] Quick-tap: **No** DOMException or EncodingError
- [ ] Quick-tap: **No** unexpected Web Speech fallback
- [ ] Microphone stops after each test

---

## ❌ If Anything Fails

| Problem | Fix |
|---------|-----|
| `Ignoring short audio clip` on sustained recording | Hold button longer (2+ sec) |
| `EncodingError: Unable to decode audio data` | Browser may not support WebM; try different browser |
| `Whisper STT failed — falling back to Web Speech` | Check `/api/client/stt` response in Network tab |
| Microphone stays active | Reload page, check for resource leak |
| Browser freezes | Likely memory leak; file bug with reproduction steps |

---

## Full Testing (20 minutes)

For comprehensive verification, follow:

**File:** `VOICE_PIPELINE_TEST_GUIDE.md`

Key tests:
1. Sustained 2+ second recording ✅
2. Rapid quick-taps (2-3 times) ✅
3. Mixed sequence (stress test) ✅
4. Resource leak check ✅
5. Error handling verification ✅

---

## Test Harness Commands

```javascript
// Start capture (records all console output)
voicePipelineTests.startCapture();

// After testing, view all captured logs
voicePipelineTests.capturedLogs;

// Filter logs by pattern
voicePipelineTests.getLogsMatching(/Ignoring short audio/);

// Generate report
voicePipelineTests.generateFinalReport();
```

---

## Key Console Messages

### ✅ Expected (Good)

```
[ZEEDER-VOICE] Recording completed: { totalSize: 45234, ... }
[ZEEDER-VOICE] Ignoring short audio clip (156 bytes < 1024 bytes).
[TranscodeToWav] Transcoding completed successfully
```

### ❌ Unexpected (Bad)

```
EncodingError: Unable to decode audio data
DOMException: ...
[ZEEDER-VOICE] Whisper STT failed — falling back to Web Speech
```

---

## Files Reference

| File | Purpose |
|------|---------|
| `VOICE_PIPELINE_VERIFICATION_REPORT.md` | Complete verification guide (comprehensive) |
| `VOICE_PIPELINE_TEST_GUIDE.md` | Step-by-step manual testing |
| `scripts/voice-pipeline-test-console.js` | Browser-executable test harness |
| `MINIMUM_BLOB_SIZE_GUARD_SUMMARY.md` | Implementation details |
| `VOICE_AUDIO_TROUBLESHOOTING.md` | Troubleshooting reference |

---

## Implementation Summary

**What Changed:**
- `src/hooks/useZeederVoice.ts`: Added 1 KB guard + warning message
- `src/utils/audio/transcode-to-wav.ts`: Added 1 KB guard + error handling

**Why:**
- Prevent header-only WebM containers (100-200 bytes) from wasting resources
- Give users clear guidance when they accidentally tap

**Impact:**
- ✅ Sustained recordings (> 1 KB): Work normally
- ✅ Accidental taps (< 1 KB): Silently ignored with helpful message
- ✅ No performance impact on valid recordings

---

## Deployment Checklist

Before going live:

- [ ] All manual tests pass
- [ ] Build passes: `npm run build`
- [ ] TypeScript check passes: `npx tsc --noEmit`
- [ ] No git push (user handles deployment)
- [ ] Browser compatibility verified (Chrome, Firefox, Safari, Edge)
- [ ] No resource leaks detected
- [ ] Console messages are clear and helpful

---

**Status:** ✅ Ready for Testing  
**Time to Verify:** ~20 minutes  
**Expected Outcome:** All tests pass, guards work as intended
