'use client';

import { useState, useRef, useEffect } from 'react';

type Step = 'command' | 'draft' | 'confirm';

interface DraftData {
  clientName: string;
  clientEmail: string;
  industry: string;
  parsedFromVoice: boolean;
}

export function UniversalCommandModal({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState<Step>('command');
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [draftData, setDraftData] = useState<DraftData | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  
  const recognitionRef = useRef<any>(null);

  // Initialize Web Speech API as fallback
  useEffect(() => {
    if (typeof window !== 'undefined' && 'webkitSpeechRecognition' in window) {
      recognitionRef.current = new (window as any).webkitSpeechRecognition();
      recognitionRef.current.continuous = true;
      recognitionRef.current.interimResults = true;
      recognitionRef.current.lang = 'en-US';

      recognitionRef.current.onresult = (event: any) => {
        let interimTranscript = '';
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcript;
          } else {
            interimTranscript += transcript;
          }
        }

        setTranscript(finalTranscript || interimTranscript);
      };

      recognitionRef.current.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        setIsListening(false);
      };
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, []);

  const toggleListening = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
    } else {
      recognitionRef.current?.start();
      setIsListening(true);
    }
  };

  const processCommand = async () => {
    setIsProcessing(true);
    
    // Simulate AI parsing (in production, this would call Groq API)
    setTimeout(() => {
      // Mock parsed data from voice command
      const mockDraft: DraftData = {
        clientName: 'Acme Corporation',
        clientEmail: 'contact@acme.com',
        industry: 'automotive',
        parsedFromVoice: true
      };
      
      setDraftData(mockDraft);
      setStep('draft');
      setIsProcessing(false);
    }, 1500);
  };

  const handleConfirm = () => {
    // TODO: Submit to Supabase tenants table
    console.log('Submitting draft data:', draftData);
    onClose();
  };

  const handleEdit = () => {
    setStep('command');
  };

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-[1200px] mx-4 backdrop-blur-2xl bg-white/5 border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/10 bg-white/[0.02]">
          <h2 className="text-lg font-light tracking-[0.2em] text-white uppercase">
            Universal Command
          </h2>
          <div className="flex gap-2 mt-4">
            <div className={`h-1 flex-1 rounded-full transition-all duration-300 ${step === 'command' ? 'bg-cyan-500' : 'bg-white/20'}`} />
            <div className={`h-1 flex-1 rounded-full transition-all duration-300 ${step === 'draft' ? 'bg-cyan-500' : 'bg-white/20'}`} />
            <div className={`h-1 flex-1 rounded-full transition-all duration-300 ${step === 'confirm' ? 'bg-cyan-500' : 'bg-white/20'}`} />
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {step === 'command' && (
            <div className="space-y-6">
              <div>
                <label className="block text-xs font-light tracking-[0.2em] text-white/60 uppercase mb-3">
                  Voice Command
                </label>
                <div className={`backdrop-blur-xl bg-white/5 border rounded-lg p-4 transition-all duration-300 ${
                  isListening 
                    ? 'border-[#0097b2] shadow-[0_0_20px_rgba(0,151,178,0.5)] animate-pulse' 
                    : 'border-white/10'
                }`}>
                  <div className="flex items-start gap-4">
                    <button
                      onClick={toggleListening}
                      className={`w-12 h-12 rounded-full flex items-center justify-center transition-all duration-300 ${
                        isListening
                          ? 'bg-[#0097b2] text-white shadow-[0_0_15px_#0097b2]'
                          : 'bg-white/10 text-white/60 hover:bg-white/20'
                      }`}
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                      </svg>
                    </button>
                    <div className="flex-1">
                      <div className="text-xs text-white/40 mb-2">
                        {isListening ? 'Listening...' : 'Click microphone to start'}
                      </div>
                      <div className="text-sm text-white min-h-[60px]">
                        {transcript || 'Your voice command will appear here...'}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  onClick={processCommand}
                  disabled={!transcript || isProcessing}
                  className="px-6 py-2 text-xs font-light tracking-[0.2em] bg-cyan-500/20 border border-cyan-500/30 rounded-lg text-cyan-300 uppercase hover:bg-cyan-500/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isProcessing ? 'Processing...' : 'Process Command'}
                </button>
              </div>
            </div>
          )}

          {step === 'draft' && draftData && (
            <div className="space-y-6">
              <div className="backdrop-blur-xl bg-white/[0.02] border border-white/10 rounded-lg p-4 space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-white/60 uppercase tracking-[0.1em]">Client Name</span>
                  <input
                    type="text"
                    value={draftData.clientName}
                    onChange={(e) => setDraftData({ ...draftData, clientName: e.target.value })}
                    className="text-xs text-white bg-transparent border-b border-white/20 focus:border-cyan-500/50 outline-none w-48 text-right"
                  />
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-white/60 uppercase tracking-[0.1em]">Email</span>
                  <input
                    type="email"
                    value={draftData.clientEmail}
                    onChange={(e) => setDraftData({ ...draftData, clientEmail: e.target.value })}
                    className="text-xs text-white bg-transparent border-b border-white/20 focus:border-cyan-500/50 outline-none w-48 text-right"
                  />
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-white/60 uppercase tracking-[0.1em]">Industry</span>
                  <select
                    value={draftData.industry}
                    onChange={(e) => setDraftData({ ...draftData, industry: e.target.value })}
                    className="text-xs text-white bg-transparent border-b border-white/20 focus:border-cyan-500/50 outline-none w-48 text-right"
                  >
                    <option value="automotive">Automotive</option>
                    <option value="retail">Retail</option>
                    <option value="healthcare">Healthcare</option>
                    <option value="general">General</option>
                  </select>
                </div>
                {draftData.parsedFromVoice && (
                  <div className="pt-3 border-t border-white/10">
                    <div className="text-[10px] text-cyan-400/80 uppercase flex items-center gap-2">
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                      Parsed from voice command
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-between">
                <button
                  onClick={handleEdit}
                  className="px-6 py-2 text-xs font-light tracking-[0.2em] text-white/60 uppercase hover:text-white transition-colors"
                >
                  Edit Command
                </button>
                <button
                  onClick={() => setStep('confirm')}
                  className="px-6 py-2 text-xs font-light tracking-[0.2em] bg-cyan-500/20 border border-cyan-500/30 rounded-lg text-cyan-300 uppercase hover:bg-cyan-500/30 transition-all"
                >
                  Review & Confirm
                </button>
              </div>
            </div>
          )}

          {step === 'confirm' && draftData && (
            <div className="space-y-6">
              <div className="backdrop-blur-xl bg-white/[0.02] border border-white/10 rounded-lg p-4 space-y-3">
                <div className="flex justify-between">
                  <span className="text-xs text-white/60 uppercase tracking-[0.1em]">Client Name</span>
                  <span className="text-xs text-white">{draftData.clientName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-xs text-white/60 uppercase tracking-[0.1em]">Email</span>
                  <span className="text-xs text-white">{draftData.clientEmail}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-xs text-white/60 uppercase tracking-[0.1em]">Industry</span>
                  <span className="text-xs text-white capitalize">{draftData.industry}</span>
                </div>
              </div>

              <div className="flex justify-between">
                <button
                  onClick={() => setStep('draft')}
                  className="px-6 py-2 text-xs font-light tracking-[0.2em] text-white/60 uppercase hover:text-white transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={handleConfirm}
                  className="px-6 py-2 text-xs font-light tracking-[0.2em] bg-cyan-500/20 border border-cyan-500/30 rounded-lg text-cyan-300 uppercase hover:bg-cyan-500/30 transition-all"
                >
                  Create Client
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-white/10 bg-white/[0.02] flex justify-between">
          <button
            onClick={onClose}
            className="px-6 py-2 text-xs font-light tracking-[0.2em] text-white/60 uppercase hover:text-white transition-colors"
          >
            Cancel
          </button>
          <div className="text-[10px] text-white/30 uppercase tracking-[0.1em]">
            Powered by Groq AI
          </div>
        </div>
      </div>
    </div>
  );
}
