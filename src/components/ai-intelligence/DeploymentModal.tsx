'use client';

import { Dialog, Transition } from '@headlessui/react';

interface DeploymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  technicalSummary: string;
  isDeploying: boolean;
  onDeploy: () => void;
  onDeploySuccess?: (summary: string) => void;
}

export function DeploymentModal({
  isOpen,
  onClose,
  technicalSummary,
  isDeploying,
  onDeploy,
  onDeploySuccess,
}: DeploymentModalProps) {
  return (
    <Transition appear show={isOpen} as="div">
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        {/* Backdrop */}
        <Transition.Child
          as="div"
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
              as="div"
              className="relative w-full max-w-7xl"
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
                <Dialog.Panel
                  className="w-full transform rounded-2xl backdrop-blur-xl bg-black/40 border border-[#0097b2]/50 p-6 text-left align-middle shadow-[0_0_40px_rgba(0,151,178,0.3)] transition-all"
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
                      onClick={(e) => { e.stopPropagation(); e.preventDefault(); onClose(); }}
                      disabled={isDeploying}
                      className="px-6 py-2 rounded-lg border border-white/20 bg-white/5 text-white/70 text-xs tracking-widest uppercase transition-all duration-300 hover:bg-white/10 hover:text-white hover:border-white/30 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Cancel
                    </button>

                    <button
                      type="button"
                      onClick={async () => {
                        await onDeploy();
                        if (onDeploySuccess && technicalSummary) {
                          onDeploySuccess(technicalSummary);
                        }
                      }}
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

                  {/* Close Button — Decoupled from Dialog.Panel to avoid backdrop-blur stacking context trap.
                      Painted after Panel in DOM order for guaranteed visual layering. */}
                  <button
                    type="button"
                    onClick={onClose}
                    aria-label="Close modal"
                    className="absolute top-10 right-10 z-[9999] pointer-events-auto flex items-center justify-center w-10 h-10 rounded-lg backdrop-blur-md bg-white/15 border border-white/30 text-white shadow-[0_0_20px_rgba(0,0,0,0.4)] transition-all duration-200 hover:bg-white/30 hover:border-white/50 hover:shadow-[0_0_24px_rgba(255,255,255,0.3)] focus:outline-none focus:ring-2 focus:ring-white/50"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-5 w-5"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path
                        fillRule="evenodd"
                        d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </button>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}
