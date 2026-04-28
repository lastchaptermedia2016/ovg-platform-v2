'use client';

import { Fragment } from 'react';
import { Dialog, Transition } from '@headlessui/react';

interface DeploymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  technicalSummary: string;
  isDeploying: boolean;
  onDeploy: () => void;
}

export function DeploymentModal({
  isOpen,
  onClose,
  technicalSummary,
  isDeploying,
  onDeploy,
}: DeploymentModalProps) {
  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        {/* Backdrop */}
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" />
        </Transition.Child>

        {/* Modal Container */}
        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4 text-center">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel
                className="w-full max-w-md transform overflow-hidden rounded-2xl backdrop-blur-xl bg-black/40 border border-[#0097b2]/50 p-6 text-left align-middle shadow-[0_0_40px_rgba(0,151,178,0.3)] transition-all"
              >
                {/* Header */}
                <Dialog.Title
                  as="h3"
                  className="text-lg font-medium leading-6 text-[#D4AF37] tracking-[0.15em] uppercase mb-4"
                >
                  AI DEPLOYMENT BRIEFING
                </Dialog.Title>

                {/* Body - Scrollable Technical Summary */}
                <div className="mt-2">
                  <div className="max-h-[200px] overflow-y-auto rounded-lg bg-white/5 border border-white/10 p-4 mb-6 scrollbar-thin scrollbar-thumb-[#0097b2]/30 scrollbar-track-transparent">
                    <p className="text-sm text-white/80 leading-relaxed whitespace-pre-wrap">
                      {technicalSummary || 'Technical summary will appear here...'}
                    </p>
                  </div>
                </div>

                {/* Footer - Action Buttons */}
                <div className="mt-4 flex flex-col sm:flex-row gap-3 justify-end">
                  <button
                    type="button"
                    onClick={onClose}
                    disabled={isDeploying}
                    className="px-6 py-2 rounded-lg border border-white/20 bg-white/5 text-white/70 text-xs tracking-widest uppercase transition-all duration-300 hover:bg-white/10 hover:text-white hover:border-white/30 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Cancel
                  </button>

                  <button
                    type="button"
                    onClick={onDeploy}
                    disabled={isDeploying}
                    className={`relative px-6 py-2 rounded-lg border text-xs tracking-widest uppercase transition-all duration-300 overflow-hidden ${
                      isDeploying
                        ? 'border-[#0097b2]/50 bg-[#0097b2]/10 text-[#0097b2] cursor-wait'
                        : 'border-[#0097b2] bg-[#0097b2]/20 text-[#D4AF37] hover:bg-[#0097b2]/30 hover:shadow-[0_0_20px_rgba(0,151,178,0.5)]'
                    }`}
                  >
                    {/* Loading Pulse Animation */}
                    {isDeploying && (
                      <span className="absolute inset-0 flex items-center justify-center">
                        <span className="absolute w-full h-full bg-[#0097b2]/20 animate-pulse rounded-lg" />
                        <span className="relative flex items-center gap-2">
                          <svg
                            className="animate-spin h-4 w-4 text-[#0097b2]"
                            xmlns="http://www.w3.org/2000/svg"
                            fill="none"
                            viewBox="0 0 24 24"
                          >
                            <circle
                              className="opacity-25"
                              cx="12"
                              cy="12"
                              r="10"
                              stroke="currentColor"
                              strokeWidth="4"
                            />
                            <path
                              className="opacity-75"
                              fill="currentColor"
                              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                            />
                          </svg>
                          <span>INITIATING...</span>
                        </span>
                      </span>
                    )}
                    <span className={`${isDeploying ? 'opacity-0' : ''}`}>
                      INITIATE DEPLOYMENT
                    </span>
                  </button>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}
