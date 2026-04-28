'use client';

import { useState } from 'react';
import { INDUSTRY_OPTIONS, getIndustryProfile, getIndustryFeatureLabel, getSuperFunctionLabel } from '@/core/industries/registry';

type Step = 'industry' | 'details' | 'review';

export function AddClientModal({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState<Step>('industry');
  const [selectedIndustry, setSelectedIndustry] = useState<string>('general');
  const [clientName, setClientName] = useState('');
  const [clientEmail, setClientEmail] = useState('');

  const industryProfile = getIndustryProfile(selectedIndustry);

  const handleNext = () => {
    if (step === 'industry') setStep('details');
    else if (step === 'details') setStep('review');
  };

  const handleBack = () => {
    if (step === 'details') setStep('industry');
    else if (step === 'review') setStep('details');
  };

  const handleSubmit = () => {
    // TODO: Implement client creation logic
    console.log('Creating client:', { clientName, clientEmail, industry: selectedIndustry });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-2xl mx-4 backdrop-blur-2xl bg-white/5 border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/10 bg-white/[0.02]">
          <h2 className="text-lg font-light tracking-[0.2em] text-white uppercase">
            Add New Client
          </h2>
          <div className="flex gap-2 mt-4">
            <div className={`h-1 flex-1 rounded-full transition-all duration-300 ${step === 'industry' ? 'bg-cyan-500' : 'bg-white/20'}`} />
            <div className={`h-1 flex-1 rounded-full transition-all duration-300 ${step === 'details' ? 'bg-cyan-500' : 'bg-white/20'}`} />
            <div className={`h-1 flex-1 rounded-full transition-all duration-300 ${step === 'review' ? 'bg-cyan-500' : 'bg-white/20'}`} />
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {step === 'industry' && (
            <div className="space-y-6">
              <div>
                <label className="block text-xs font-light tracking-[0.2em] text-white/60 uppercase mb-3">
                  Select Industry
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {INDUSTRY_OPTIONS.map((industry) => (
                    <button
                      key={industry.id}
                      onClick={() => setSelectedIndustry(industry.id)}
                      className={`p-4 rounded-lg border transition-all duration-300 text-left ${
                        selectedIndustry === industry.id
                          ? 'border-cyan-500/50 bg-cyan-500/10'
                          : 'border-white/10 bg-white/5 hover:border-white/20'
                      }`}
                    >
                      <div className="text-sm font-medium text-white mb-1">{industry.label}</div>
                      <div className="text-xs text-white/40">{industry.features.length} features available</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Feature Preview */}
              <div className="backdrop-blur-xl bg-white/[0.02] border border-white/10 rounded-lg p-4">
                <h3 className="text-xs font-light tracking-[0.2em] text-white/60 uppercase mb-3">
                  Activated Features
                </h3>
                <div className="space-y-2">
                  <div>
                    <div className="text-xs text-cyan-400/80 uppercase mb-2">Core Features</div>
                    <div className="flex flex-wrap gap-2">
                      {industryProfile.features.map((feature) => (
                        <span
                          key={feature}
                          className="px-2 py-1 text-[10px] tracking-[0.1em] bg-white/5 border border-white/10 rounded text-white/70"
                        >
                          {getIndustryFeatureLabel(feature)}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-cyan-400/80 uppercase mb-2 mt-3">Super Functions</div>
                    <div className="flex flex-wrap gap-2">
                      {industryProfile.superFunctions.map((func) => (
                        <span
                          key={func}
                          className="px-2 py-1 text-[10px] tracking-[0.1em] bg-cyan-500/10 border border-cyan-500/20 rounded text-cyan-300"
                        >
                          {getSuperFunctionLabel(func)}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {step === 'details' && (
            <div className="space-y-6">
              <div>
                <label className="block text-xs font-light tracking-[0.2em] text-white/60 uppercase mb-3">
                  Client Name
                </label>
                <input
                  type="text"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/30 focus:outline-none focus:border-cyan-500/50 transition-colors"
                  placeholder="Enter client business name"
                />
              </div>
              <div>
                <label className="block text-xs font-light tracking-[0.2em] text-white/60 uppercase mb-3">
                  Contact Email
                </label>
                <input
                  type="email"
                  value={clientEmail}
                  onChange={(e) => setClientEmail(e.target.value)}
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/30 focus:outline-none focus:border-cyan-500/50 transition-colors"
                  placeholder="Enter contact email"
                />
              </div>
              <div className="backdrop-blur-xl bg-white/[0.02] border border-white/10 rounded-lg p-4">
                <div className="text-xs text-white/60">Industry: <span className="text-white">{industryProfile.label}</span></div>
              </div>
            </div>
          )}

          {step === 'review' && (
            <div className="space-y-6">
              <div className="backdrop-blur-xl bg-white/[0.02] border border-white/10 rounded-lg p-4 space-y-3">
                <div className="flex justify-between">
                  <span className="text-xs text-white/60 uppercase tracking-[0.1em]">Client Name</span>
                  <span className="text-xs text-white">{clientName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-xs text-white/60 uppercase tracking-[0.1em]">Email</span>
                  <span className="text-xs text-white">{clientEmail}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-xs text-white/60 uppercase tracking-[0.1em]">Industry</span>
                  <span className="text-xs text-white">{industryProfile.label}</span>
                </div>
                <div className="pt-3 border-t border-white/10">
                  <div className="text-xs text-cyan-400/80 uppercase mb-2">Features Activated</div>
                  <div className="flex flex-wrap gap-2">
                    {industryProfile.features.map((feature) => (
                      <span
                        key={feature}
                        className="px-2 py-1 text-[10px] tracking-[0.1em] bg-white/5 border border-white/10 rounded text-white/70"
                      >
                        {getIndustryFeatureLabel(feature)}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-white/10 bg-white/[0.02] flex justify-between">
          {step !== 'industry' ? (
            <button
              onClick={handleBack}
              className="px-6 py-2 text-xs font-light tracking-[0.2em] text-white/60 uppercase hover:text-white transition-colors"
            >
              Back
            </button>
          ) : (
            <button
              onClick={onClose}
              className="px-6 py-2 text-xs font-light tracking-[0.2em] text-white/60 uppercase hover:text-white transition-colors"
            >
              Cancel
            </button>
          )}
          {step !== 'review' ? (
            <button
              onClick={handleNext}
              disabled={step === 'industry' ? false : !clientName || !clientEmail}
              className="px-6 py-2 text-xs font-light tracking-[0.2em] bg-cyan-500/20 border border-cyan-500/30 rounded-lg text-cyan-300 uppercase hover:bg-cyan-500/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              className="px-6 py-2 text-xs font-light tracking-[0.2em] bg-cyan-500/20 border border-cyan-500/30 rounded-lg text-cyan-300 uppercase hover:bg-cyan-500/30 transition-all"
            >
              Create Client
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
