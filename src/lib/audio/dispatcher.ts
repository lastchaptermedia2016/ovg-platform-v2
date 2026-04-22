export interface VoiceDispatcherOptions {
  text: string;
  voiceId?: string;
  canopyEndpoint?: string;
  elevenLabsApiKey?: string;
}

export async function dispatchVoice(
  options: VoiceDispatcherOptions,
): Promise<boolean> {
  const { text, voiceId, canopyEndpoint, elevenLabsApiKey } = options;

  // Attempt A: CanopyLabs/Orpheus endpoint
  if (canopyEndpoint) {
    try {
      const response = await fetch(canopyEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text }),
        signal: AbortSignal.timeout(5000), // 5 second timeout
      });

      if (response.ok) {
        const audioBlob = await response.blob();
        await playAudioBlob(audioBlob);
        return true;
      } else {
        console.log(
          `CanopyLabs/Orpheus returned status ${response.status}, falling back to ElevenLabs`,
        );
      }
    } catch (error) {
      console.log(
        "CanopyLabs/Orpheus endpoint failed, falling back to ElevenLabs:",
        error,
      );
    }
  }

  // Attempt B: ElevenLabs API
  if (elevenLabsApiKey && voiceId) {
    try {
      const response = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "xi-api-key": elevenLabsApiKey,
          },
          body: JSON.stringify({
            text,
            model_id: "eleven_monolingual_v1",
            voice_settings: {
              stability: 0.5,
              similarity_boost: 0.5,
            },
          }),
          signal: AbortSignal.timeout(5000), // 5 second timeout
        },
      );

      if (response.ok) {
        const audioBlob = await response.blob();
        await playAudioBlob(audioBlob);
        return true;
      }
    } catch (error) {
      console.log(
        "ElevenLabs API failed, falling back to Web Speech API:",
        error,
      );
    }
  }

  // Attempt C: Web Speech API (Local fallback)
  return playWebSpeech(text);
}

async function playAudioBlob(blob: Blob): Promise<void> {
  return new Promise((resolve, reject) => {
    const audio = new Audio();
    audio.src = URL.createObjectURL(blob);
    audio.onended = () => {
      URL.revokeObjectURL(audio.src);
      resolve();
    };
    audio.onerror = () => {
      URL.revokeObjectURL(audio.src);
      reject(new Error("Audio playback failed"));
    };
    audio.play().catch(reject);
  });
}

async function playWebSpeech(text: string): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.onend = () => resolve(true);
      utterance.onerror = () => resolve(false);
      window.speechSynthesis.speak(utterance);
    } else {
      resolve(false);
    }
  });
}
