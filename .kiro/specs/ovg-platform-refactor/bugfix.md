# Bugfix Requirements Document

## Introduction

The STT (Speech-to-Text) pipeline in `src/hooks/use-voice-command.ts` intermittently fails with a 400 error from the Whisper API: `"could not process file - is it a valid media file?"`. The root cause is a race condition between `MediaRecorder.stop()` and the `onstop` event handler. When `stopListening` is called, the `MediaRecorder` is told to stop, but the `onstop` event fires asynchronously — meaning the browser has not yet finished writing the container metadata (WebM/MP4 header) before the accumulated `audioChunksRef` data is assembled into a `Blob` and dispatched to the pipeline. The result is a malformed or truncated binary container that Whisper rejects. Additionally, the microphone hardware track is not always released promptly, and there is no minimum-size guard to abort the pipeline when the recorded audio is too short to be a valid file.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN `stopListening` is called while the `MediaRecorder` is in the `"recording"` state THEN the system calls `mediaRecorder.stop()` and immediately invokes `cleanup()`, which may destroy the `MediaRecorder` reference and stop stream tracks before the `onstop` event has fired and the final audio chunk has been written to `audioChunksRef`.

1.2 WHEN the `onstop` handler fires after `cleanup()` has already run THEN the system assembles a `Blob` from partially-written or empty chunks and passes it to `processAudioPipeline`, resulting in a malformed container that causes the Whisper STT API to return a 400 "could not process file" error.

1.3 WHEN `processAudioPipeline` receives a `Blob` smaller than a valid media container THEN the system still transmits it to the STT API, wasting a network round-trip and surfacing a confusing error to the user.

1.4 WHEN `stopListening` is called THEN the system does not explicitly call `mediaRecorder.stream.getTracks().forEach(track => track.stop())` at the point of stopping, leaving microphone hardware potentially active until the broader `cleanup()` runs.

### Expected Behavior (Correct)

2.1 WHEN `stopListening` is called while the `MediaRecorder` is in the `"recording"` state THEN the system SHALL return a `Promise<Blob>` that resolves only inside the `mediaRecorder.onstop` event handler, guaranteeing the browser has fully finalized the media container (including header metadata) before the `Blob` is assembled and passed downstream.

2.2 WHEN the `onstop` Promise resolves THEN the system SHALL immediately call `mediaRecorder.stream.getTracks().forEach(track => track.stop())` to release the microphone hardware before any further processing occurs.

2.3 WHEN `processAudioPipeline` receives a `Blob` whose `size` is less than 1024 bytes THEN the system SHALL abort the pipeline with a `console.warn` and SHALL NOT transmit the blob to the STT API.

2.4 WHEN the synchronization gate is in place THEN the system SHALL continue to call `processAudioPipeline` with the finalized `Blob` exactly once per recording session, preserving the existing STT → AI → TTS pipeline behavior for valid audio.

### Unchanged Behavior (Regression Prevention)

3.1 WHEN a user speaks a valid voice command and `stopListening` is called after sufficient audio has been captured THEN the system SHALL CONTINUE TO transcribe the audio via the Whisper STT API and deliver the transcript to the `onTranscript` callback.

3.2 WHEN `skipAIPipeline` is `true` THEN the system SHALL CONTINUE TO stop after the STT step and SHALL NOT invoke the AI process-command or TTS endpoints.

3.3 WHEN the `Escape` key is pressed while the mic is active THEN the system SHALL CONTINUE TO abort the pipeline and reset all listening state without transmitting audio to the backend.

3.4 WHEN `startListening` is called THEN the system SHALL CONTINUE TO request microphone access, initialize the `AudioContext` and `AnalyserNode`, and begin volume monitoring as before.

3.5 WHEN the 10-second idle timeout elapses in explicit activation mode THEN the system SHALL CONTINUE TO auto-deactivate the mic and fire the `onAutoDeactivate` callback.

3.6 WHEN `activateVoice` and `deactivateVoice` are called THEN the system SHALL CONTINUE TO manage the `voiceActive` state and the Push-to-Talk lifecycle as before.
