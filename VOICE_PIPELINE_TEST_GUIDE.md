# Voice Pipeline Verification Test Guide

## Overview

This guide walks you through manual verification of the full PTT voice audio pipeline with the new 1 KB minimum blob size guard.

**Goal:** Confirm sustained 2+ second recordings process correctly through Whisper STT while accidental taps trigger the guard without resource leaks.

---

## Prerequisites

1. **Browser:** Chrome, Firefox, Edge, or Safari
2. **Environment:** Running `npm run dev` locally or accessing deployed instance
3. **Microphone:** Connected and permissions granted to browser
4. **DevTools:** Open DevTools Console (F12 or Cmd+Option+I)

---

## Test Setup

### Step 1: Load the Test Harness

1. Open your browser DevTools (F12)
2. Go to the **Console** tab
3. Copy the entire content from `scripts/verify-voice-pipeline.ts` (or use the browser-executable version below)
4. Paste into the console and press Enter

You should see:
```
✅ Voice Pipeline Test Harness Loaded

Usage:
  1. Run: voicePipelineTests.runAllTests()
  2. Follow the on-screen instructions for manual testing
  3. After testing, run: voicePipelineTests.generateFinalReport()
```

### Step 2: Start Baseline Tests

In the console, type:
```javascript
voicePipelineTests.runAllTests()
```

This runs automated checks and returns a report with instructions:

```
═══════════════════════════════════════════════════════════════
🎤 VOICE PIPELINE VERIFICATION REPORT
═══════════════════════════════════════════════════════════════

📊 Summary:
   Total Tests: 11
   ✅ Passed:   8
   ❌ Failed:   0
   Time: 2025-09-14T10:30:45.123Z

📋 Detailed Results:
✅ 1. MediaRecorder Availability
   MediaRecorder is available
...
```

---

## Manual Test 1: Sustained 2+ Second Recording

**Objective:** Verify that holding PTT for 2+ seconds successfully records, transcodes to WAV, and sends to Whisper STT without triggering the short-clip guard.

### Execution

1. **Find the PTT button** in the interface (SystemMicButton in ZEEDER surface)
2. **Press and hold** the button
3. **Speak a command** (e.g., "Hello" or "What's the time?")
4. **Keep holding** for at least 2 seconds
5. **Release** the button

### What to Look For (Console Logs)

You should see a sequence like:

```
[ZEEDER-VOICE] Recording started...
[ZEEDER-VOICE] Recording completed: {
  chunks: 12,
  totalSize: 45234,
  mimeType: "audio/webm",
  blobType: "audio/webm"
}
[ZEEDER-VOICE] Transcoding blob { size: 45234, type: "audio/webm" }
[TranscodeToWav] Transcoding completed successfully
[ZEEDER-VOICE] STT request sent to /api/client/stt
```

### Expected Results

✅ **PASS:**
- Blob size: > 1024 bytes (printed in logs)
- No `[ZEEDER-VOICE] Ignoring short audio clip` message
- No `[TranscodeToWav] Transcoding failed` error
- No `EncodingError: Unable to decode audio data` error
- STT request completes with response from Whisper

❌ **FAIL:**
- Blob size: < 1024 bytes → Guard blocks (short-clip warning)
- DOMException or EncodingError in console
- Network error from `/api/client/stt`
- STT response with error status

### Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `Ignoring short audio clip (234 bytes < 1024 bytes)` | Didn't hold long enough | Hold button for 2+ seconds |
| `Skipping transcode: recorded blob is empty` | Audio not captured | Check microphone permission, try again |
| `EncodingError: Unable to decode audio data` | WebM codec issue | Retry; if persistent, browser may not support WebM |
| 404 or 401 on `/api/client/stt` | API not reachable or auth failed | Check network, verify session is valid |
| Web Speech fallback triggered | Whisper failed but Web Speech took over | Check `/api/client/stt` response in Network tab |

---

## Manual Test 2: Rapid Quick-Taps (2+ times)

**Objective:** Verify that rapid taps (< 500ms each) trigger the < 1024 byte guard without resource leaks or unexpected errors.

### Execution

1. **Quickly tap** the PTT button (don't hold)
2. **Immediately release** (< 200ms)
3. **Repeat 2-3 times** in rapid succession (< 500ms between taps)

### What to Look For (Console Logs)

You should see multiple warnings:

```
[ZEEDER-VOICE] Ignoring short audio clip (156 bytes < 1024 bytes). Likely an accidental tap or noise burst. Hold the button longer for a valid command.
[ZEEDER-VOICE] Ignoring short audio clip (189 bytes < 1024 bytes). Likely an accidental tap or noise burst. Hold the button longer for a valid command.
[ZEEDER-VOICE] Ignoring short audio clip (143 bytes < 1024 bytes). Likely an accidental tap or noise burst. Hold the button longer for a valid command.
```

### Expected Results

✅ **PASS:**
- Each tap logs `[ZEEDER-VOICE] Ignoring short audio clip` with size < 1024 bytes
- **No errors:** DOMException, EncodingError, or Web Speech fallback
- **No resource leaks:** MediaStream tracks properly stopped
- Console remains clean after guards trigger

❌ **FAIL:**
- `EncodingError: Unable to decode audio data` appears
- `[ZEEDER-VOICE] Whisper STT failed — falling back to Web Speech` appears (unexpected)
- DOMException in console
- Browser hangs or becomes unresponsive
- Microphone stays "active" after taps complete

### Resource Leak Check

After completing 5+ quick taps, run:

```javascript
// Check if MediaStream tracks are properly closed
console.log('Open streams:', navigator.mediaDevices ? 'Check DevTools → More tools → WebAudio' : 'N/A');
```

In DevTools:
1. Go to **More tools** → **Web Audio**
2. Expand the AudioContext section
3. Verify: No continuously running oscillators or processing nodes
4. Expected: Context created, used for decode, then closed

---

## Manual Test 3: Mixed Sequence (Stress Test)

**Objective:** Verify pipeline stability under mixed load.

### Execution

1. Quick-tap PTT button once (< 200ms)
2. Hold PTT for 2+ seconds and speak a command
3. Quick-tap twice in rapid succession
4. Hold PTT for 3+ seconds and speak another command

### Expected Results

✅ All operations complete without:
- Resource exhaustion
- Unexpected errors
- Audio context state issues
- MediaRecorder conflicts

---

## Test 4: Verify No Resource Leaks

**Objective:** Confirm that MediaStream tracks are properly closed after each recording.

### Execution

1. Run this in console **before** any recording:
```javascript
const beforeTracks = navigator.mediaDevices ? 'Check Network → MediaDevices' : 'N/A';
console.log('Before recording:', beforeTracks);
```

2. **Do 5 quick-taps** or 1 sustained recording

3. Run this **after** recording:
```javascript
const afterTracks = navigator.mediaDevices ? 'Check Network → MediaDevices' : 'N/A';
console.log('After recording:', afterTracks);
```

4. Check DevTools **Network** tab:
   - Look for `getUserMedia` requests
   - Verify they close properly (no hanging requests)

### Expected Results

✅ **PASS:**
- No hanging MediaStream connections
- Microphone icon stops blinking after release
- No "warning" indicators in browser UI
- Repeated recordings don't accumulate errors

❌ **FAIL:**
- Microphone remains "active" indefinitely
- Browser performance degrades after repeated recordings
- Error logs accumulate: `[ZEEDER-VOICE] Tearing down audio channels...` repeats forever

---

## Test 5: Error Handling Verification

**Objective:** Confirm guard messages are helpful and errors are properly categorized.

### Execution

Run this comprehensive check:

```javascript
// Capture all voice-related logs
const allLogs = voicePipelineTests.capturedLogs
  .filter(log => /ZEEDER-VOICE|TranscodeToWav|EncodingError|DOMException/.test(log.message));

console.log('Voice Pipeline Logs:');
allLogs.forEach(log => {
  console.log(`[${log.type.toUpperCase()}] ${log.message}`);
});

// Check for errors
const errors = allLogs.filter(log => log.type === 'error' || /Error|Exception/.test(log.message));
console.log(`\nTotal errors: ${errors.length}`);
if (errors.length > 0) {
  console.error('❌ Unexpected errors detected:', errors);
} else {
  console.log('✅ No unexpected errors');
}
```

### Expected Results

✅ **PASS:**
- Only expected warnings (short-clip guard)
- No cryptic error messages
- All errors are actionable and clear

❌ **FAIL:**
- Empty `{}` error objects (error serialization issue)
- Unexplained exceptions
- Silent failures with no console indication

---

## Final Verification Report

After completing all manual tests, run:

```javascript
voicePipelineTests.generateFinalReport()
```

This produces:

```
═══════════════════════════════════════════════════════════════
✅ VOICE PIPELINE VERIFICATION COMPLETE
═══════════════════════════════════════════════════════════════

📊 Final Results:
   Total Tests: 10
   ✅ Passed:   10
   ❌ Failed:   0

🎉 All tests passed! Voice pipeline is operating correctly.
```

---

## Success Criteria

All of the following must be true:

- [ ] Sustained 2+ second recordings process without guard triggering
- [ ] Rapid quick-taps trigger `[ZEEDER-VOICE] Ignoring short audio clip` warning
- [ ] No DOMException or EncodingError in console
- [ ] No unexpected Web Speech fallback (only on real STT failures)
- [ ] MediaStream tracks are properly closed (microphone stops after release)
- [ ] No resource leaks (no hanging connections, no degraded performance)
- [ ] Error messages are clear and actionable
- [ ] All 10+ automated tests pass

---

## Browser Compatibility Matrix

| Browser | MediaRecorder | AudioContext | Web Speech | Expected Result |
|---------|---|---|---|---|
| Chrome 120+ | ✅ Full | ✅ Full | ✅ Full | ✅ All tests pass |
| Firefox 121+ | ✅ Full | ✅ Full | ✅ Full | ✅ All tests pass |
| Safari 17+ | ⚠️ MP4 | ⚠️ MP4 | ✅ Full | ⚠️ May fallback to Web Speech |
| Edge 120+ | ✅ Full | ✅ Full | ✅ Full | ✅ All tests pass |

**Safari Note:** Safari's MediaRecorder may produce MP4 instead of WebM. The transcode pipeline handles this, but if WebM decode fails, the system falls back to Web Speech API (expected behavior).

---

## Debugging Tips

### Enable Verbose Logging

Add to console before testing:

```javascript
// Override console to capture everything
const originalLog = console.log;
const logs = [];
console.log = function(...args) {
  logs.push(args.join(' '));
  originalLog.apply(console, args);
};

// After testing, view all logs:
logs.forEach(log => console.log(log));
```

### Check Network Requests

In DevTools **Network** tab, filter by `/api/client/stt`:

1. After a sustained recording, you should see a POST request
2. Request body: binary WAV file
3. Response: JSON with `text` field (the transcribed speech)
4. Status: 200 OK

### Monitor AudioContext State

```javascript
// Check if AudioContext is running
const ctx = new (window.AudioContext || window.webkitAudioContext)();
console.log('AudioContext state:', ctx.state);
console.log('Sample rate:', ctx.sampleRate);
```

### Check Microphone Permissions

```javascript
// Request permissions and check status
navigator.permissions.query({ name: 'microphone' }).then(result => {
  console.log('Microphone permission:', result.state);
  // state can be: "granted", "denied", or "prompt"
});
```

---

## Cleanup

After testing, you can remove the test harness:

```javascript
delete (window as any).voicePipelineTests;
```

---

## Next Steps (For Developers)

1. **Document Results:** Note any issues or unexpected behaviors
2. **Create Issue:** If failures occur, file an issue with console logs from `voicePipelineTests.capturedLogs`
3. **Browser Reports:** If Safari-specific issues, document them separately
4. **Performance Profiling:** Use Chrome DevTools → Performance to profile transcode overhead
5. **Load Testing:** Test with 10+ rapid recordings to verify no memory leaks

---

## Rollback Instructions

If voice pipeline becomes unstable:

1. Revert changes to `src/hooks/useZeederVoice.ts` (remove MIN_AUDIO_BLOB_BYTES guard)
2. Revert changes to `src/utils/audio/transcode-to-wav.ts` (remove size check)
3. Clear browser cache and hard-reload
4. Re-test to verify stability

The 1 KB guard can be safely disabled by removing the two guard checks without affecting other functionality.
