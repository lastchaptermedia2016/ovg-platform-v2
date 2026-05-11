// Minimal implementation to satisfy imports and type-checking.
// Replace with real Groq SDK implementation when available.

interface ChatCompletionChunk {
  choices: Array<{
    delta?: {
      content?: string;
    };
  }>;
}

interface ChatCompletionStream {
  [Symbol.asyncIterator](): AsyncIterator<ChatCompletionChunk>;
}

interface AudioResponse {
  arrayBuffer(): Promise<ArrayBuffer>;
}

interface GroqCompletionOptions {
  model?: string;
  messages?: Array<{ role: string; content: string }>;
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
  [key: string]: unknown;
}

interface GroqAudioSpeechOptions {
  model?: string;
  input?: string;
  voice?: string;
  response_format?: string;
  [key: string]: unknown;
}

interface GroqInterface {
  completions: {
    create(options: GroqCompletionOptions): ChatCompletionStream;
  };
  audio: {
    speech: {
      create(options: GroqAudioSpeechOptions): Promise<AudioResponse>;
    };
  };
}

// Mock implementation - replace with actual Groq SDK
export const groq: GroqInterface = {
  completions: {
    async *create(): AsyncGenerator<ChatCompletionChunk> {
      // Stub - replace with actual Groq API call
      yield { choices: [{ delta: { content: 'This is a mock response from the stubbed groq implementation.' } }] };
    }
  },
  audio: {
    speech: {
      async create(): Promise<AudioResponse> {
        // Stub - replace with actual Groq TTS API call
        return {
          async arrayBuffer() {
            return new ArrayBuffer(0);
          }
        };
      }
    }
  }
};
