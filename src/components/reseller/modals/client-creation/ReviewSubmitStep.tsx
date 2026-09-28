'use client';

import type { DraftData, ReviewData } from './types';
import { INDUSTRY_OPTIONS, getCategoriesForIndustry } from './constants';

interface ReviewModeProps {
  mode: 'review';
  reviewData: ReviewData;
  onReviewChange: (patch: Partial<ReviewData>) => void;
  onStartOver: () => void;
  onConfirmAndSave: () => void;
}

interface ConfirmModeProps {
  mode: 'confirm';
  draftData: DraftData;
  isSubmitting: boolean;
  isSpeaking: boolean;
  onBack: () => void;
  onSubmit: () => void;
}

export type ReviewSubmitStepProps = ReviewModeProps | ConfirmModeProps;

export function ReviewSubmitStep(props: ReviewSubmitStepProps) {
  if (props.mode === 'review') {
    const { reviewData, onReviewChange, onStartOver, onConfirmAndSave } = props;
    return (
      <div className="space-y-6">
        <div className="text-center space-y-2">
          <h3 className="text-sm font-light tracking-[0.2em] text-white uppercase">Review Client Details</h3>
          <p className="text-xs text-white/60">Please correct any errors before saving to database</p>
        </div>

        <div className="backdrop-blur-xl bg-white/[0.01] border border-white/10 rounded-lg p-4 space-y-3">
          {/* Client Name Input */}
          <div className="flex justify-between items-center">
            <span className="text-xs text-white/60 uppercase tracking-[0.1em]">Client Name</span>
            <input
              type="text"
              value={reviewData.name}
              onChange={(e) => onReviewChange({ name: e.target.value })}
              className="text-xs text-white bg-transparent border-b border-white/20 focus:border-cyan-500/50 outline-none w-48 text-right"
            />
          </div>
          {/* Industry Select */}
          <div className="flex justify-between items-center">
            <span className="text-xs text-white/60 uppercase tracking-[0.1em]">Industry</span>
            <select
              value={reviewData.industry}
              onChange={(e) => onReviewChange({ industry: e.target.value, category: '' })}
              className="text-xs text-white bg-black/30 border-b border-white/20 focus:border-cyan-500/50 outline-none w-48 text-right"
            >
              {INDUSTRY_OPTIONS.map(i => (
                <option key={i} value={i}>{i.charAt(0) + i.slice(1).toLowerCase()}</option>
              ))}
            </select>
          </div>
          {/* Category Select */}
          <div className="flex justify-between items-center">
            <span className={`text-xs uppercase tracking-[0.1em] ${!reviewData.category ? 'text-amber-400' : 'text-white/60'}`}>Category {!reviewData.category && '⚠'}</span>
            <select
              value={reviewData.category}
              onChange={(e) => onReviewChange({ category: e.target.value })}
              className={`text-xs text-white bg-black/30 border-b outline-none w-48 text-right transition-colors ${
                !reviewData.category ? 'border-amber-400' : 'border-white/20 focus:border-cyan-500/50'
              }`}
            >
              <option value="">Select category...</option>
              {getCategoriesForIndustry(reviewData.industry).map(c => (
                <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>
              ))}
            </select>
          </div>
          {/* Email Input */}
          <div className="flex justify-between items-center">
            <span className="text-xs text-white/60 uppercase tracking-[0.1em]">Email</span>
            <input
              type="email"
              value={reviewData.email}
              onChange={(e) => onReviewChange({ email: e.target.value })}
              className="text-xs text-white bg-transparent border-b border-white/20 focus:border-cyan-500/50 outline-none w-48 text-right"
            />
          </div>
          {/* Mobile Number Input */}
          <div className="flex justify-between items-center">
            <span className="text-xs text-white/60 uppercase tracking-[0.1em]">Mobile</span>
            <input
              type="tel"
              value={reviewData.mobile}
              onChange={(e) => onReviewChange({ mobile: e.target.value })}
              placeholder="+1234567890"
              className="text-xs text-white bg-transparent border-b border-white/20 focus:border-cyan-500/50 outline-none w-48 text-right"
            />
          </div>
          {/* Website Input */}
          <div className="flex justify-between items-center">
            <span className="text-xs text-white/60 uppercase tracking-[0.1em]">Website</span>
            <input
              type="url"
              value={reviewData.website}
              onChange={(e) => onReviewChange({ website: e.target.value })}
              placeholder="https://example.com"
              className="text-xs text-white bg-transparent border-b border-white/20 focus:border-cyan-500/50 outline-none w-48 text-right"
            />
          </div>
          {/* Vibe Input */}
          <div className="flex flex-col gap-2">
            <span className="text-xs text-white/60 uppercase tracking-[0.1em]">Vibe / Personality</span>
            <textarea
              value={reviewData.vibe}
              onChange={(e) => onReviewChange({ vibe: e.target.value })}
              placeholder="Describe the client's vibe (e.g., 'innovative tech startup')"
              rows={2}
              className="text-xs text-white bg-black/30 border border-white/20 focus:border-cyan-500/50 outline-none rounded p-2 resize-none"
            />
          </div>
        </div>
        <div className="flex justify-between">
          <button
            onClick={onStartOver}
            className="px-6 py-2 text-xs font-light tracking-[0.2em] text-white/60 uppercase hover:text-white transition-colors"
          >
            Start Over
          </button>
          <button onClick={onConfirmAndSave} className="px-6 py-2 text-xs font-light tracking-[0.2em] bg-cyan-500/20 border border-cyan-500/30 rounded-lg text-cyan-300 uppercase hover:bg-cyan-500/30 transition-all">
            Confirm &amp; Save
          </button>
        </div>
      </div>
    );
  }

  const { draftData, isSubmitting, isSpeaking, onBack, onSubmit } = props;
  return (
    <div className="space-y-6">
      <div className="backdrop-blur-xl bg-white/[0.01] border border-white/10 rounded-lg p-4 space-y-3">
        {/* Review Client Name — reads from draftData exclusively */}
        <div className="flex justify-between">
          <span className="text-xs text-white/60 uppercase tracking-[0.1em]">Client Name</span>
          <span className="text-xs text-white capitalize">{draftData.clientName}</span>
        </div>
        {/* Review Email — reads from draftData exclusively */}
        <div className="flex justify-between">
          <span className="text-xs text-white/60 uppercase tracking-[0.1em]">Email</span>
          <span className="text-xs text-white">{draftData.clientEmail}</span>
        </div>
        {/* Review Industry — reads from draftData exclusively */}
        <div className="flex justify-between">
          <span className="text-xs text-white/60 uppercase tracking-[0.1em]">Industry</span>
          <span className="text-xs text-white capitalize">{draftData.industry}</span>
        </div>
        {/* Review Category — reads from draftData exclusively */}
        <div className="flex justify-between">
          <span className="text-xs text-white/60 uppercase tracking-[0.1em]">Category</span>
          <span className="text-xs text-white">{draftData.category.replace(/_/g, ' ') || '—'}</span>
        </div>
      </div>

      <div className="flex justify-between">
        <button onClick={onBack} className="px-6 py-2 text-xs font-light tracking-[0.2em] text-white/60 uppercase hover:text-white transition-colors">
          Back
        </button>
        <button
          onClick={onSubmit}
          disabled={isSpeaking || isSubmitting}
          className="px-6 py-2 text-xs font-light tracking-[0.2em] bg-cyan-500/20 border border-cyan-500/30 rounded-lg text-cyan-300 uppercase hover:bg-cyan-500/30 transition-all disabled:opacity-50"
        >
          {isSubmitting ? 'Creating...' : isSpeaking ? 'Speaking...' : 'Create Client'}
        </button>
      </div>
    </div>
  );
}

