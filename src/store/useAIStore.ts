import { create } from 'zustand';

interface AIStore {
  lastGlobalSpokenText: string | null;
  setLastGlobalSpokenText: (text: string) => void;
  clearLastGlobalSpokenText: () => void;
}

export const useAIStore = create<AIStore>((set) => ({
  lastGlobalSpokenText: null,
  setLastGlobalSpokenText: (text) => set({ lastGlobalSpokenText: text }),
  clearLastGlobalSpokenText: () => set({ lastGlobalSpokenText: null }),
}));
