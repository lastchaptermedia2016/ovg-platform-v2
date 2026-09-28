'use client';

import type { HighlightedField, VoiceEntryData, VoiceEntryStep } from './types';
import { STEP_INSTRUCTIONS } from './constants';

export interface VoiceStepMachineProps {
  voiceEntryLabel: string;
  isVoiceEntryMode: boolean;
  voiceEntryStep: VoiceEntryStep;
  voiceEntryData: VoiceEntryData;
  highlightedField: HighlightedField;
  voicePersonaTone: string;
  isListening: boolean;
  isProcessing: boolean;
  isSpeaking: boolean;
  transcript: string;
  error: string | null;
  onToggleListening: () => void;
  onPTTStart: () => void;
  onPTTStop: () => void;
  onStartVoiceEntry: () => void;
  onProcessCommand: () => void;
}

interface CaptureFieldCardProps {
  label: string;
  value: string;
  active: boolean;
  accent?: 'cyan' | 'amber';
  spanFull?: boolean;
  truncate?: boolean;
}

function CaptureFieldCard({ label, value, active, accent = 'cyan', spanFull = false, truncate = false }: CaptureFieldCardProps) {
  const activeClass = accent === 'amber'
    ? 'border-amber-400 bg-amber-400/10'
    : 'border-cyan-500 bg-cyan-500/10';
  const baseClass = `${spanFull ? 'col-span-2 ' : ''}backdrop-blur-xl bg-white/[0.02] border rounded-lg p-2 transition-all`;
  return (
    <div className={`${baseClass} ${active ? activeClass : 'border-white/10'}`}>
      <div className="text-xs text-white/60">{label}</div>
      <div className={`text-sm text-white${truncate ? ' truncate' : ''}`}>{value || '...'}</div>
    </div>
  );
}

export function VoiceStepMachine({
  voiceEntryLabel,
  isVoiceEntryMode,
  voiceEntryStep,
  voiceEntryData,
  highlightedField,
  voicePersonaTone,
  isListening,
  isProcessing,
  isSpeaking,
  transcript,
  error,
  onToggleListening,
  onPTTStart,
  onPTTStop,
  onStartVoiceEntry,
  onProcessCommand,
}: VoiceStepMachineProps) {
  return (
    <div className="space-y-6">
      {/* Voice Entry Mode UI */}
      {isVoiceEntryMode && (
        <div className="space-y-4">
          {/* Step Progress Indicator */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex gap-2">
              {[0, 1, 2, 3, 4].map((stepIdx) => (
                <div
                  key={stepIdx}
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium transition-all ${
                    stepIdx <= voiceEntryStep
                      ? 'bg-cyan-500 text-white'
                      : 'bg-white/10 text-white/40'
                  }`}
                >
                  {stepIdx + 1}
                </div>
              ))}
            </div>
            <div className="text-xs text-white/60">
              Step {voiceEntryStep + 1} of 5
            </div>
          </div>

          {/* Current Step Instructions */}
          <div className="backdrop-blur-xl bg-cyan-500/10 border border-cyan-500/20 rounded-lg p-3">
            <div className="text-xs text-cyan-300 font-medium">
              {STEP_INSTRUCTIONS[voiceEntryStep]}
            </div>
          </div>

          {/* Real-time Field Highlighting — reads from voiceEntryData (preview) */}
          <div className="grid grid-cols-2 gap-2">
            <CaptureFieldCard label="Name" value={voiceEntryData.name} active={highlightedField === 'name'} />
            <CaptureFieldCard label="Industry" value={voiceEntryData.industry} active={highlightedField === 'industry'} />
            <CaptureFieldCard label="Category" value={voiceEntryData.category} active={highlightedField === 'category'} accent="amber" />
            <CaptureFieldCard label="Email" value={voiceEntryData.email} active={highlightedField === 'email'} />
            <CaptureFieldCard
              label="Mobile"
              value={voiceEntryData.mobile}
              active={highlightedField === 'mobile' || (voiceEntryStep === 2 && !voiceEntryData.mobile)}
            />
            <CaptureFieldCard
              label="Website"
              value={voiceEntryData.website}
              active={highlightedField === 'website' || (voiceEntryStep === 2 && !voiceEntryData.website)}
            />
            <CaptureFieldCard label="Vibe" value={voiceEntryData.vibe} active={highlightedField === 'vibe'} spanFull truncate />
          </div>

          {voicePersonaTone && (
            <div className="backdrop-blur-xl bg-purple-500/10 border border-purple-500/20 rounded-lg p-2">
              <div className="text-xs text-purple-300">Detected Persona: {voicePersonaTone}</div>
            </div>
          )}
        </div>
      )}

      <div>
        <label className="block text-xs font-light tracking-[0.2em] text-white/60 uppercase mb-3">
          {isVoiceEntryMode ? (voiceEntryLabel + ' (Voice Entry)') : voiceEntryLabel}
        </label>
        <div className={`backdrop-blur-xl bg-white/[0.02] border rounded-lg p-4 transition-all duration-300 ${
          isListening
            ? 'border-[#0097b2] shadow-[0_0_20px_rgba(0,151,178,0.5)]'
            : 'border-white/10'
        }`}>
          <div className="flex items-start gap-4">
            <button
              onClick={onToggleListening}
              onMouseDown={onPTTStart}
              onMouseUp={onPTTStop}
              onMouseLeave={onPTTStop}
              onTouchStart={(e) => { e.preventDefault(); onPTTStart(); }}
              onTouchEnd={(e) => { e.preventDefault(); onPTTStop(); }}
              onTouchCancel={() => onPTTStop()}
              className={`w-12 h-12 rounded-full flex items-center justify-center transition-all duration-300 flex-shrink-0 touch-none select-none active:scale-95 ${
                isListening
                  ? 'bg-[#0097b2] text-white shadow-[0_0_15px_#0097b2] animate-pulse'
                  : 'bg-white/5 text-white/60 hover:bg-white/10'
              }`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
            </button>
            <div className="flex-1">
              <div className="text-xs text-white/40 mb-2">
                {isListening ? 'Listening… release to capture' : isProcessing ? 'Transcribing...' : 'Hold to speak, release to capture'}
              </div>
              <div className="text-sm text-white min-h-[60px]">
                {transcript || 'Your voice command will appear here...'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Voice Entry Mode Toggle */}
      {!isVoiceEntryMode && (
        <div className="flex justify-center">
          <button
            onClick={onStartVoiceEntry}
            className="px-4 py-2 text-xs font-light tracking-[0.2em] bg-gradient-to-r from-cyan-500/20 to-purple-500/20 border border-cyan-500/30 rounded-lg text-cyan-300 uppercase hover:from-cyan-500/30 hover:to-purple-500/30 transition-all"
          >
            Start Multi-Step Voice Entry
          </button>
        </div>
      )}

      {error && (
        <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      <div className="flex justify-end">
        <button
          onClick={onProcessCommand}
          disabled={!transcript || isProcessing || isSpeaking}
          className="px-6 py-2 text-xs font-light tracking-[0.2em] bg-cyan-500/20 border border-cyan-500/30 rounded-lg text-cyan-300 uppercase hover:bg-cyan-500/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isProcessing ? 'Processing...' : isSpeaking ? 'Speaking...' : (isVoiceEntryMode ? 'Next Step' : 'Process Command')}
        </button>
      </div>
    </div>
  );
}

