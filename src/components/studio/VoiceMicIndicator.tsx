'use client';

import { useVoiceState, useVoiceControls } from '@/providers/voice-provider';

const STATUS_LABEL: Record<string, string> = {
  idle: 'Zeeder ready',
  listening: 'Listening…',
  processing: 'Processing…',
  speaking: 'Speaking…',
};

/**
 * Global, always-visible mic indicator driven by the VoiceProvider. Subscribes
 * only to the reactive state context, so it re-renders independently of the
 * rest of the tree.
 */
export function VoiceMicIndicator() {
  const { status, isListening, pendingNavigation } = useVoiceState();
  const { togglePushToTalk } = useVoiceControls();

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-2">
      {pendingNavigation && <PendingNavigationPrompt />}
      <button
        type="button"
        aria-label={isListening ? 'Stop push-to-talk' : 'Start push-to-talk (Space)'}
        onClick={togglePushToTalk}
        className={`flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-semibold backdrop-blur-xl transition-colors ${
          isListening
            ? 'border-cyan-400/60 bg-cyan-500/20 text-cyan-200'
            : 'border-white/10 bg-slate-950/40 text-white hover:border-white/20'
        }`}
      >
        <span
          className={`h-2.5 w-2.5 rounded-full ${
            isListening
              ? 'animate-pulse bg-cyan-400'
              : status === 'speaking'
                ? 'bg-emerald-400'
                : status === 'processing'
                  ? 'bg-amber-400'
                  : 'bg-zinc-500'
          }`}
        />
        {isListening ? '● Recording (Space to stop)' : STATUS_LABEL[status] ?? 'Voice idle'}
      </button>
    </div>
  );
}

function PendingNavigationPrompt() {
  const { persistProposal, cancelProposal, commitChanges } = useVoiceControls();

  return (
    <div className="w-72 rounded-2xl border border-amber-400/40 bg-slate-950/80 p-3 text-xs text-zinc-200 shadow-xl backdrop-blur-xl">
      <p className="font-semibold text-amber-300">Unsaved proposal</p>
      <p className="mt-1 text-zinc-400">
        You navigated away while a voice proposal was pending. Keep the draft and continue editing, or discard it?
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={persistProposal}
          className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 hover:bg-white/10"
        >
          Keep draft
        </button>
        <button
          type="button"
          onClick={commitChanges}
          className="rounded-lg border border-cyan-400/40 bg-cyan-500/15 px-3 py-1.5 text-cyan-200 hover:bg-cyan-500/25"
        >
          Save now
        </button>
        <button
          type="button"
          onClick={cancelProposal}
          className="rounded-lg border border-rose-400/30 px-3 py-1.5 text-rose-300 hover:bg-rose-500/10"
        >
          Discard
        </button>
      </div>
    </div>
  );
}
