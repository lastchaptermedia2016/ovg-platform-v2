'use client';

import type { DraftData, FormState } from './types';
import { INDUSTRY_OPTIONS, getCategoriesForIndustry } from './constants';

export interface ManualClientFormProps {
  formState: FormState;
  draftData: DraftData;
  categoryError: boolean;
  onFormChange: (patch: Partial<FormState>) => void;
  onIndustryChange: (industry: string) => void;
  onCategoryChange: (category: string) => void;
  onEditCommand: () => void;
  onProceedToConfirm: () => void;
}

export function ManualClientForm({
  formState,
  draftData,
  categoryError,
  onFormChange,
  onIndustryChange,
  onCategoryChange,
  onEditCommand,
  onProceedToConfirm,
}: ManualClientFormProps) {
  return (
    <div className="space-y-6">
      <div className="backdrop-blur-xl bg-white/[0.01] border border-white/10 rounded-lg p-4 space-y-3">
        {/* Client Name Input — bound to formState.name */}
        <div className="flex justify-between items-center">
          <span className="text-xs text-white/60 uppercase tracking-[0.1em]">Client Name</span>
          <input
            type="text"
            value={formState.name}
            onChange={(e) => onFormChange({ name: e.target.value })}
            className="text-xs text-white bg-transparent border-b border-white/20 focus:border-cyan-500/50 outline-none w-48 text-right"
          />
        </div>
        {/* Client Email Input — bound to formState.email */}
        <div className="flex justify-between items-center">
          <span className="text-xs text-white/60 uppercase tracking-[0.1em]">Email</span>
          <input
            type="email"
            value={formState.email}
            onChange={(e) => onFormChange({ email: e.target.value })}
            className="text-xs text-white bg-transparent border-b border-white/20 focus:border-cyan-500/50 outline-none w-48 text-right"
          />
        </div>
        {/* Industry Select — bound to formState.industry */}
        <div className="flex justify-between items-center">
          <span className="text-xs text-white/60 uppercase tracking-[0.1em] flex items-center gap-1">
            Industry
            {draftData.is_override && (
              <span title="Industry explicitly stated by user — not auto-classified" className="inline-flex items-center">
                <svg className="w-3 h-3 text-emerald-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
              </span>
            )}
            {draftData.confidence !== undefined && (
              <span className="text-[10px] text-white/40 font-normal tracking-normal">
                {Math.round(draftData.confidence * 100)}%
              </span>
            )}
          </span>
          <select
            value={formState.industry}
            onChange={(e) => onIndustryChange(e.target.value)}
            className="text-xs text-white bg-black/30 border-b border-white/20 focus:border-cyan-500/50 outline-none w-48 text-right"
          >
            {INDUSTRY_OPTIONS.map(i => (
              <option key={i} value={i}>{i.charAt(0) + i.slice(1).toLowerCase()}</option>
            ))}
          </select>
        </div>
        {/* Category Select — bound to formState.category */}
        <div className="flex justify-between items-center">
          <span className={`text-xs uppercase tracking-[0.1em] ${categoryError ? 'text-amber-400' : 'text-white/60'}`}>Category {categoryError && '⚠ Required'}</span>
          <select
            value={formState.category}
            onChange={(e) => onCategoryChange(e.target.value)}
            className={`text-xs text-white bg-black/30 border-b outline-none w-48 text-right transition-colors ${
              categoryError ? 'border-amber-400 focus:border-amber-300' : 'border-white/20 focus:border-cyan-500/50'
            }`}
          >
            <option value="">Select category...</option>
            {getCategoriesForIndustry(formState.industry).map(c => (
              <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>
            ))}
          </select>
        </div>
        {/* Mobile Number Input — bound to formState.mobile */}
        <div className="flex justify-between items-center">
          <span className="text-xs text-white/60 uppercase tracking-[0.1em]">Mobile Number</span>
          <input
            type="tel"
            value={formState.mobile}
            onChange={(e) => onFormChange({ mobile: e.target.value })}
            placeholder="+1234567890"
            className="text-xs text-white bg-transparent border-b border-white/20 focus:border-cyan-500/50 outline-none w-48 text-right"
          />
        </div>
        {/* Website Input — bound to formState.website */}
        <div className="flex justify-between items-center">
          <span className="text-xs text-white/60 uppercase tracking-[0.1em]">Website</span>
          <input
            type="url"
            value={formState.website}
            onChange={(e) => onFormChange({ website: e.target.value })}
            placeholder="https://example.com"
            className="text-xs text-white bg-transparent border-b border-white/20 focus:border-cyan-500/50 outline-none w-48 text-right"
          />
        </div>
        {/* System Prompt Textarea — bound to formState.systemPrompt */}
        <div className="flex flex-col gap-2">
          <span className="text-xs text-white/60 uppercase tracking-[0.1em]">System Prompt</span>
          <textarea
            value={formState.systemPrompt}
            onChange={(e) => onFormChange({ systemPrompt: e.target.value })}
            placeholder="Describe the client's vibe, role, or personality (e.g., 'innovative tech startup', 'traditional family business')"
            rows={2}
            className="text-xs text-white bg-black/30 border border-white/20 focus:border-cyan-500/50 outline-none rounded p-2 resize-none"
          />
        </div>
        {draftData.parsedFromVoice && (
          <div className="pt-3 border-t border-white/10">
            <div className="text-[10px] text-cyan-400/80 uppercase flex items-center gap-2">
              ✓ Parsed from voice command
            </div>
          </div>
        )}
      </div>

      <div className="flex justify-between">
        <button
          onClick={onEditCommand}
          className="px-6 py-2 text-xs font-light tracking-[0.2em] text-white/60 uppercase hover:text-white transition-colors"
        >
          Edit Command
        </button>
        <button onClick={onProceedToConfirm} className="px-6 py-2 text-xs font-light tracking-[0.2em] bg-cyan-500/20 border border-cyan-500/30 rounded-lg text-cyan-300 uppercase hover:bg-cyan-500/30 transition-all">
          Review &amp; Confirm
        </button>
      </div>
    </div>
  );
}

