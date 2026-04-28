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

interface GroqInterface {
  completions: {
    create(options: any): ChatCompletionStream;
  };
  audio: {
    speech: {
      create(options: any): Promise<AudioResponse>;
    };
  };
}

// Mock implementation - replace with actual Groq SDK
export const groq: GroqInterface = {
  completions: {
    async *create(options: any): AsyncGenerator<ChatCompletionChunk> {
      // Stub - replace with actual Groq API call
      yield { choices: [{ delta: { content: 'This is a mock response from the stubbed groq implementation.' } }] };
    }
  },
  audio: {
    speech: {
      async create(options: any): Promise<AudioResponse> {
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
