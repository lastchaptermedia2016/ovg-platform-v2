# Voice Command Race Condition Bugfix Design

## Overview

`useVoiceCommand` in `src/hooks/use-voice-command.ts` has a race condition between `MediaRecorder.stop()` and the browser's asynchronous `onstop` event. When `stopListening` is called, the current code calls `mediaRecorder.stop()` and then immediately calls `cleanup()`. Because `onstop` fires asynchronously — after the browser has finished writing the container metadata — `cleanup()` can destroy the `MediaRecorder` reference and stop stream tracks before the final audio chunk is written. The `onstop` handler then assembles a `Blob` from partially-written or empty chunks and passes it to `processAudioPipeline`, which forwards it to the Whisper STT API. Whisper rejects the malformed container with a 400 "could not process file" error.

The fix introduces a **Promise-Based Synchronization Gate**: `processAudioPipeline` is invoked exclusively from within the `onstop` handler, after the browser has fully finalized the media container. `cleanup()` is removed from `stopListening` and deferred to after `onstop` completes. A minimum-size guard (`blob.size < 1024`) is added inside `onstop` to abort the pipeline for recordings too short to be a valid media file. The public API surface (`UseVoiceCommandReturn`) is unchanged — zero call-site modifications required.

---

## Glossary

- **Bug_Condition (C)**: The condition that triggers the race — `stopListening` is called while `MediaRecorder` is in the `'recording'` state, causing `cleanup()` to run before `onstop` fires.
- **Property (P)**: The desired behavior when the bug condition holds — `processAudioPipeline` is called exactly once, only after `onstop` fires, with a finalized `Blob` of size ≥ 1024 bytes.
- **Preservation**: All behaviors that must remain unchanged by the fix — the STT → AI → TTS pipeline for valid audio, `skipAIPipeline`, `abort()` via Escape key, `startListening` initialization, the 10s idle timeout, and the `activateVoice`/`deactivateVoice` Push-to-Talk lifecycle.
- **`stopListening`**: The public function in `useVoiceCommand` that signals the end of a recording session. Its signature (`() => void`) is unchanged.
- **`onstop`**: The browser-fired `MediaRecorder` event that signals the recorder has fully finalized the audio container, including header metadata. This is the only safe point to assemble the `Blob`.
- **`cleanup()`**: The internal function that tears down `MediaRecorder`, `AudioContext`, stream tracks, and timers. After the fix, it is called only from within `onstop` (after pipeline) and from `abort()`.
- **`processAudioPipeline`**: The async function that sends the `Blob` to Whisper STT, then optionally to the AI process-command and TTS endpoints. Its signature (`(audioBlob: Blob) => Promise<void>`) is unchanged.
- **Synchronization Gate**: The architectural pattern where `onstop` owns the full sequencing: stop tracks → assemble Blob → size guard → pipeline → cleanup.
- **Size Guard**: The `blob.size < 1024` check inside `onstop` that aborts the pipeline for recordings too short to be a valid media container.

---

## Bug Details

### Bug Condition

The race condition manifests when `stopListening` is called while the `MediaRecorder` is in the `'recording'` state. The function calls `mediaRecorder.stop()` to signal the recorder to finalize, but then immediately calls `cleanup()` — which nulls out `mediaRecorderRef.current`, stops stream tracks, and tears down the `AudioContext` — before the browser's asynchronous `onstop` event has fired. When `onstop` eventually fires, it assembles a `Blob` from `audioChunksRef.current`, which may contain only partial data or no final chunk (since the recorder was interrupted mid-finalization). This malformed `Blob` is passed to `processAudioPipeline` and forwarded to Whisper, which rejects it with HTTP 400.

**Formal Specification:**

```
FUNCTION isBugCondition(session)
  INPUT: session — a recording session object
  OUTPUT: boolean

  RETURN session.mediaRecorder.state = 'recording'
         AND stopListening() was called
         AND cleanup() was called BEFORE onstop fired
         AND processAudioPipeline was called with the resulting Blob
END FUNCTION
```

### Examples

- **Normal stop (buggy)**: User speaks a command, `stopListening` is called. `cleanup()` runs at t=0ms. `onstop` fires at t=12ms. The assembled `Blob` is missing the WebM/MP4 container footer. Whisper returns 400.
- **Short recording (buggy)**: User activates mic and immediately stops. `audioChunksRef.current` contains one 80-byte chunk. Even if `onstop` fires correctly, the 80-byte `Blob` is not a valid media file. Whisper returns 400.
- **Abort path (not buggy)**: User presses Escape. `abort()` is called, which calls `cleanup()` directly and sets `isListening(false)`. `processAudioPipeline` is never called. This path is correct and must remain unchanged.
- **Valid recording after fix**: User speaks a 3-second command. `stopListening` calls `mediaRecorder.stop()` and `setIsListening(false)` only. `onstop` fires, stops tracks, assembles a 48 KB `Blob`, passes the size guard, calls `processAudioPipeline` exactly once. Whisper succeeds.

---

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**

- Mouse/pointer interactions with the UI that trigger `startListening` or `stopListening` must continue to work exactly as before.
- The full STT → AI process-command → TTS pipeline must continue to execute for valid audio blobs (size ≥ 1024 bytes).
- `skipAIPipeline = true` must continue to stop processing after the STT step without calling the AI or TTS endpoints.
- The `abort()` function (Escape key path) must continue to call `cleanup()` directly and bypass the pipeline entirely — this is intentional.
- `startListening` must continue to request microphone access, initialize `AudioContext` and `AnalyserNode`, and begin volume monitoring.
- The 10-second idle timeout in explicit activation mode must continue to auto-deactivate the mic and fire `onAutoDeactivate`.
- `activateVoice` and `deactivateVoice` must continue to manage `voiceActive` state and the Push-to-Talk lifecycle.
- The `stopListening` public signature (`() => void` on `UseVoiceCommandReturn`) must remain unchanged — zero call-site modifications.

**Scope:**

All inputs that do NOT involve the race condition path (i.e., all paths other than `stopListening` being called while `MediaRecorder` is in `'recording'` state) must be completely unaffected by this fix. This includes:

- The `abort()` path via Escape key
- The `skipAIPipeline` early-exit path
- The idle timeout auto-deactivation path
- The `deactivateVoice` → `stopListening` path (which now benefits from the same gate)
- All `startListening` initialization logic

---

## Hypothesized Root Cause

Based on the bug description and code analysis, the root cause is:

1. **Premature `cleanup()` in `stopListening`**: The current `stopListening` implementation calls `cleanup()` synchronously after `mediaRecorder.stop()`. `cleanup()` nulls `mediaRecorderRef.current` and calls `streamRef.current?.getTracks().forEach(track => track.stop())`. The browser's `onstop` event fires asynchronously (typically 10–50ms later), by which point the stream tracks may already be stopped and the recorder reference nulled. The `onstop` handler in `startListening` still fires and assembles a `Blob`, but the data may be incomplete because the recorder was interrupted before it could write the container footer.

2. **No size guard before pipeline invocation**: The current `onstop` handler checks `audioBlob.size > 0` but does not enforce a meaningful minimum. A 1-byte or 80-byte blob passes this check and is forwarded to Whisper, which correctly rejects it as an invalid media file.

3. **Track release timing**: `cleanup()` stops stream tracks before `onstop` fires. While this does not directly cause the malformed Blob (the recorder has already been told to stop), it means the hardware is released at an unpredictable point relative to the finalization event.

4. **`onstop` handler not owning the full sequence**: The current architecture splits responsibility — `stopListening` handles cleanup, `onstop` handles pipeline invocation. This split is the structural cause of the race. The fix consolidates all post-stop sequencing into `onstop`.

---

## Correctness Properties

Property 1: Bug Condition — Pipeline Invoked Only After `onstop` Fires

_For any_ recording session where `stopListening` is called while `MediaRecorder` is in the `'recording'` state, the fixed `useVoiceCommand` hook SHALL invoke `processAudioPipeline` exactly once, and only from within the `mediaRecorder.onstop` event handler, after the browser has fully finalized the media container.

**Validates: Requirements 2.1, 2.4**

---

Property 2: Size Guard — Sub-1024-Byte Blobs Abort Pipeline

_For any_ recording session where the assembled `Blob` has `size < 1024` bytes, the fixed `onstop` handler SHALL emit a `console.warn` and SHALL NOT invoke `processAudioPipeline` — regardless of whether the blob is non-empty.

**Validates: Requirements 2.3**

---

Property 3: Preservation — Valid Audio Pipeline Behavior Unchanged

_For any_ recording session where the bug condition does NOT hold (i.e., the assembled `Blob` has `size ≥ 1024` bytes and `processAudioPipeline` is called), the fixed hook SHALL produce the same STT → AI → TTS pipeline behavior as the original hook, preserving all transcript delivery, AI response, and TTS playback behavior.

**Validates: Requirements 3.1, 3.2**

---

Property 4: Preservation — Abort Path Unchanged

_For any_ invocation of `abort()` (e.g., via Escape key), the fixed hook SHALL call `cleanup()` directly and SHALL NOT invoke `processAudioPipeline`, preserving the existing abort behavior exactly.

**Validates: Requirements 3.3**

---

## Fix Implementation

### Changes Required

**File**: `src/hooks/use-voice-command.ts`

**Affected Functions**: `stopListening`, `startListening` (`onstop` handler)

**Specific Changes**:

1. **Refactor `stopListening` — remove `cleanup()` call**:
   - Call `mediaRecorder.stop()` if state is `'recording'` (unchanged).
   - Call `setIsListening(false)` (unchanged).
   - **Remove** the `cleanup()` call. Cleanup is now deferred to after `onstop` completes.
   - Remove `cleanup` from the `useCallback` dependency array for `stopListening`.

   ```typescript
   const stopListening = useCallback(() => {
     if (mediaRecorderRef.current?.state === 'recording') {
       mediaRecorderRef.current.stop();
     }
     setIsListening(false);
     // cleanup() intentionally removed — deferred to onstop handler
   }, []);
   ```

2. **Refactor `onstop` handler inside `startListening` — own the full sequence**:
   - Stop stream tracks immediately (release hardware).
   - Assemble `Blob` from `audioChunksRef.current`.
   - Apply size guard: if `blob.size < 1024`, warn and return.
   - `await processAudioPipeline(blob)` — exactly once.
   - Call `cleanup()` after pipeline completes.

   ```typescript
   mediaRecorder.onstop = async () => {
     // 1. Release hardware immediately
     mediaRecorder.stream.getTracks().forEach(track => track.stop());

     // 2. Assemble finalized Blob
     const audioBlob = new Blob(audioChunksRef.current, { type: mediaMimeTypeRef.current });

     // 3. Size guard — abort if too small to be a valid media file
     if (audioBlob.size < 1024) {
       console.warn('[VoiceCommand] Blob too small to be a valid media file, skipping pipeline');
       cleanup();
       return;
     }

     // 4. Invoke pipeline exactly once per session
     await processAudioPipeline(audioBlob);

     // 5. Cleanup after pipeline completes
     cleanup();
   };
   ```

3. **Preserve `abort()` path unchanged**: `abort()` continues to call `cleanup()` directly. This is intentional — the abort path bypasses the pipeline entirely and must not wait for `onstop`.

4. **No changes to `processAudioPipeline`**: The function signature and implementation are unchanged. The size guard lives in `onstop`, not inside `processAudioPipeline`.

5. **No changes to public API**: `UseVoiceCommandReturn` interface is unchanged. `stopListening` remains `() => void`. Zero call-site modifications required.

---

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bug on unfixed code (exploratory), then verify the fix works correctly and preserves existing behavior (fix checking + preservation checking).

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the race condition BEFORE implementing the fix. Confirm or refute the root cause analysis.

**Test Plan**: Mock `MediaRecorder` with a delayed `onstop` event (simulating the browser's async finalization). Call `stopListening` and assert that `processAudioPipeline` receives a valid, finalized `Blob`. On unfixed code, this will fail because `cleanup()` runs before `onstop` fires.

**Test Cases**:

1. **Delayed `onstop` Test**: Mock `MediaRecorder` so `onstop` fires 20ms after `stop()` is called. Call `stopListening`. Assert `processAudioPipeline` is called with a `Blob` of size ≥ 1024 bytes. (Will fail on unfixed code — `cleanup()` runs at t=0, `onstop` fires at t=20ms with a potentially incomplete blob.)

2. **Sub-1024 Blob Test**: Mock `MediaRecorder` so `audioChunksRef` contains only an 80-byte chunk. Call `stopListening`. Assert `processAudioPipeline` is NOT called. (Will fail on unfixed code — the size guard does not exist.)

3. **Concurrent Stop + Cleanup Test**: Call `stopListening` and immediately verify that `mediaRecorderRef.current` is not nulled before `onstop` fires. (Will fail on unfixed code — `cleanup()` nulls the ref synchronously.)

**Expected Counterexamples**:

- `processAudioPipeline` is called with a `Blob` of size 0 or a few bytes.
- `processAudioPipeline` is called before `onstop` has fired.
- Possible causes: `cleanup()` running synchronously before `onstop`, no size guard.

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed hook produces the expected behavior.

**Pseudocode:**

```
FOR ALL session WHERE isBugCondition(session) DO
  result := useVoiceCommand_fixed.stopListening(session)
  ASSERT processAudioPipeline called exactly once
  ASSERT processAudioPipeline called only from within onstop handler
  ASSERT blob passed to processAudioPipeline has size >= 1024
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed hook produces the same result as the original hook.

**Pseudocode:**

```
FOR ALL session WHERE NOT isBugCondition(session) DO
  ASSERT useVoiceCommand_original(session) = useVoiceCommand_fixed(session)
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:

- It generates many test cases automatically across the input domain (varying blob sizes, pipeline configurations, activation modes).
- It catches edge cases that manual unit tests might miss (e.g., `skipAIPipeline` combined with explicit activation mode).
- It provides strong guarantees that behavior is unchanged for all non-buggy inputs.

**Test Plan**: Observe behavior on UNFIXED code first for valid audio sessions, `skipAIPipeline` sessions, and abort sessions, then write property-based tests capturing that behavior.

**Test Cases**:

1. **Valid Pipeline Preservation**: Observe that a valid audio blob (≥ 1024 bytes) flows through STT → AI → TTS on unfixed code, then write a test to verify this continues after fix.
2. **`skipAIPipeline` Preservation**: Observe that `skipAIPipeline = true` stops after STT on unfixed code, then verify this continues after fix.
3. **Abort Preservation**: Observe that `abort()` calls `cleanup()` directly and skips the pipeline on unfixed code, then verify this continues after fix.
4. **`deactivateVoice` Preservation**: Observe that `deactivateVoice` → `stopListening` correctly deactivates the mic on unfixed code, then verify the same sequence works through the new `onstop` gate.

### Unit Tests

- Test that `stopListening` does NOT call `cleanup()` synchronously (spy on `cleanup`).
- Test that `onstop` handler calls `processAudioPipeline` with the assembled `Blob`.
- Test that `onstop` handler does NOT call `processAudioPipeline` when `blob.size < 1024`.
- Test that `onstop` handler calls `mediaRecorder.stream.getTracks().forEach(track => track.stop())` before pipeline.
- Test that `abort()` still calls `cleanup()` directly without waiting for `onstop`.
- Test edge case: `stopListening` called when `MediaRecorder` is not in `'recording'` state (no-op).

### Property-Based Tests

- Generate random audio chunk arrays (varying sizes, counts) and verify that only chunks totaling ≥ 1024 bytes trigger the pipeline.
- Generate random `VoiceCommandOptions` configurations and verify that `skipAIPipeline`, `explicitActivation`, and `onAutoDeactivate` behaviors are preserved across all configurations.
- Generate random sequences of `startListening` / `stopListening` / `abort` calls and verify that `processAudioPipeline` is called at most once per session.

### Integration Tests

- Full voice command flow: start → speak → stop → verify Whisper receives a valid blob → verify transcript delivered.
- Abort flow: start → speak → Escape → verify no network request to STT endpoint.
- Short recording flow: start → stop immediately → verify no network request to STT endpoint (size guard).
- `deactivateVoice` flow: `activateVoice` → speak → `deactivateVoice` → verify pipeline completes correctly.
