'use client';

import { useState, useRef, useEffect } from 'react';

type Step = 'command' | 'draft' | 'confirm';

interface DraftData {
  clientName: string;
  clientEmail: string;
  industry: string;
  mobile: string;
  website: string;
  systemPrompt: string;
  parsedFromVoice: boolean;
}

interface UniversalCommandModalProps {
  onClose: () => void;
  resellerSlug?: string;
}

export function UniversalCommandModal({ onClose, resellerSlug }: UniversalCommandModalProps) {
  const [step, setStep] = useState<Step>('command');
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [draftData, setDraftData] = useState<DraftData | null>(null);
  const [clientName, setClientName] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [industry, setIndustry] = useState('GENERAL BUSINESS');
  const [mobile, setMobile] = useState('');
  const [website, setWebsite] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  // Cleanup effect for media streams and audio resources
  useEffect(() => {
    return () => {
      // Stop media stream tracks
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      // Clean up media recorder
      if (mediaRecorderRef.current?.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

  // Sync draftData to local state when in review step (race condition mitigation)
  useEffect(() => {
    if (draftData && step === 'draft') {
      setClientName(draftData.clientName);
      setClientEmail(draftData.clientEmail);
      setIndustry(draftData.industry);
      setMobile(draftData.mobile);
      setWebsite(draftData.website);
      setSystemPrompt(draftData.systemPrompt);
      console.log("OVG-PLATFORM-V2: CRM fields successfully integrated into UI and API.");
      console.log("OVG-PLATFORM-V2: Personality and Analytics modules initialized.");
    }
  }, [draftData, step]);

  const speak = async (text: string, metadata?: { resellerSlug?: string }) => {
    try {
      setIsSpeaking(true);
      const ttsMetadata = { ...metadata, resellerSlug };
      console.log("OVG-PLATFORM-V2: Hannah TTS context validated for reseller:", resellerSlug);
      
      const response = await fetch('/api/ai/speech', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice: 'hannah', metadata: ttsMetadata }),
      });

      if (!response.ok) throw new Error('TTS failed');

      const audioBuffer = await response.arrayBuffer();
      const audioBlob = new Blob([audioBuffer], { type: 'audio/wav' });
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);

      await new Promise<void>((resolve) => {
        audio.onended = () => {
          URL.revokeObjectURL(audioUrl);
          resolve();
        };
        audio.onerror = () => {
          URL.revokeObjectURL(audioUrl);
          resolve();
        };
        audio.play().catch(() => resolve());
      });
    } catch (err) {
      console.error('[Modal TTS] Failed:', err);
    } finally {
      setIsSpeaking(false);
    }
  };

  const startListening = async () => {
    try {
      setError(null);
      audioChunksRef.current = [];
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4',
      });

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        if (audioBlob.size > 0) await transcribeAudio(audioBlob);
        stream.getTracks().forEach(t => t.stop());
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start(100);
      setIsListening(true);
    } catch (err) {
      setError('Microphone access denied');
    }
  };

  const stopListening = () => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    setIsListening(false);
  };

  const toggleListening = () => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  };

  const transcribeAudio = async (audioBlob: Blob) => {
    try {
      setIsProcessing(true);
      const formData = new FormData();
      formData.append('file', new File([audioBlob], 'command.webm', { type: 'audio/webm' }));

      const response = await fetch('/api/ai/stt', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) throw new Error('STT failed');
      const { text } = await response.json();
      setTranscript(text);
    } catch (err) {
      setError('Transcription failed — please try again');
    } finally {
      setIsProcessing(false);
    }
  };

  const processCommand = async () => {
    console.log('processCommand fired, transcript:', transcript);
    if (!transcript.trim()) return;
    setIsProcessing(true);
    setError(null);

    const lowerTranscript = transcript.toLowerCase();
    const isDeleteCommand = lowerTranscript.includes('delete') || 
                            lowerTranscript.includes('remove') || 
                            lowerTranscript.includes('deactivate');

    try {
      if (isDeleteCommand) {
        await handleDeleteCommand(transcript);
      } else {
        await handleCreateCommand(transcript);
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCreateCommand = async (command: string) => {
    try {
      const response = await fetch('/api/ai/create-client', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          voiceCommand: command,
          resellerSlug: resellerSlug || 'acme-corp',
          parseOnly: true,
        }),
      });

      const data = await response.json();
      console.log('[Modal] Parsed:', data);

      if (!response.ok) throw new Error(data.error || 'Failed to process command');

      console.log("OVG-PLATFORM-V2: Hydrating UI with", data.parsed.name);
      
      // Synchronous state updates before step change
      setClientName(data.parsed.name);
      setIndustry(data.parsed.industry);
      setClientEmail(data.parsed.email || '');
      setMobile(data.parsed.mobile || '');
      setWebsite(data.parsed.website || '');
      setSystemPrompt(data.parsed.systemPrompt || '');

      setDraftData({
        clientName: data.parsed.name,
        clientEmail: data.parsed.email || '',
        industry: data.parsed.industry,
        mobile: data.parsed.mobile || '',
        website: data.parsed.website || '',
        systemPrompt: data.parsed.systemPrompt || '',
        parsedFromVoice: true,
      });

      setStep('draft');
      const contactDetails = (data.parsed.mobile || data.parsed.website) ? ' with contact details' : '';
      await speak(`I've drafted ${data.parsed.name} as a ${data.parsed.industry} client${contactDetails}. Please review and confirm.`);
    } catch (err: any) {
      setError(err.message || 'Failed to process command');
    }
  };

  const handleDeleteCommand = async (command: string) => {
    try {
      const response = await fetch('/api/ai/delete-client', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voiceCommand: command, resellerSlug: resellerSlug || 'acme-corp' }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to delete client');

      await speak(`${data.clientName} has been successfully removed.`);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Could not identify client to delete. Please specify the exact client name.');
    }
  };

  const handleConfirm = async () => {
    if (!draftData) return;
    setIsProcessing(true);

    try {
      console.log("OVG-PLATFORM-V2: CRM fields (Mobile/Website) hydrated.");
      
      const response = await fetch('/api/ai/create-client', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resellerSlug: resellerSlug || 'acme-corp',
          parseOnly: false,
          clientData: {
            name: draftData.clientName,
            industry: draftData.industry,
            email: draftData.clientEmail,
            mobile: mobile,
            website: website,
            systemPrompt: systemPrompt,
          },
        }),
      });

      const data = await response.json();

      if (!response.ok) throw new Error(data.error || 'Failed to create client');

      const hasContactDetails = mobile || website;
      const contactMessage = hasContactDetails ? ' with their contact information' : '';
      await speak(`${draftData.clientName} has been successfully added${contactMessage}.`);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to create client');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-[600px] mx-4 backdrop-blur-2xl bg-white/[0.02] border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/10 bg-white/[0.01]">
          <h2 className="text-lg font-light tracking-[0.2em] text-white uppercase">
            Universal Command
          </h2>
          <div className="flex gap-2 mt-4">
            {(['command', 'draft', 'confirm'] as Step[]).map((s) => (
              <div
                key={s}
                className={`h-1 flex-1 rounded-full transition-all duration-300 ${
                  step === s ? 'bg-cyan-500' : 'bg-white/10'
                }`}
              />
            ))}
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
                <div className={`backdrop-blur-xl bg-white/[0.02] border rounded-lg p-4 transition-all duration-300 ${
                  isListening
                    ? 'border-[#0097b2] shadow-[0_0_20px_rgba(0,151,178,0.5)]'
                    : 'border-white/10'
                }`}>
                  <div className="flex items-start gap-4">
                    <button
                      onClick={toggleListening}
                      className={`w-12 h-12 rounded-full flex items-center justify-center transition-all duration-300 flex-shrink-0 ${
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
                        {isListening ? 'Listening... click mic to stop' : isProcessing ? 'Transcribing...' : 'Click microphone to start'}
                      </div>
                      <div className="text-sm text-white min-h-[60px]">
                        {transcript || 'Your voice command will appear here...'}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {error && (
                <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                  {error}
                </div>
              )}

              <div className="flex justify-end">
                <button
                  onClick={processCommand}
                  disabled={!transcript || isProcessing || isSpeaking}
                  className="px-6 py-2 text-xs font-light tracking-[0.2em] bg-cyan-500/20 border border-cyan-500/30 rounded-lg text-cyan-300 uppercase hover:bg-cyan-500/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isProcessing ? 'Processing...' : isSpeaking ? 'Speaking...' : 'Process Command'}
                </button>
              </div>
            </div>
          )}

          {step === 'draft' && draftData && (
            <div className="space-y-6">
              <div className="backdrop-blur-xl bg-white/[0.01] border border-white/10 rounded-lg p-4 space-y-3">
                {/* Client Name Input */}
                <div className="flex justify-between items-center">
                  <span className="text-xs text-white/60 uppercase tracking-[0.1em]">Client Name</span>
                  <input
                    type="text"
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    className="text-xs text-white bg-transparent border-b border-white/20 focus:border-cyan-500/50 outline-none w-48 text-right"
                  />
                </div>
                {/* Client Email Input */}
                <div className="flex justify-between items-center">
                  <span className="text-xs text-white/60 uppercase tracking-[0.1em]">Email</span>
                  <input
                    type="email"
                    value={clientEmail}
                    onChange={(e) => setClientEmail(e.target.value)}
                    className="text-xs text-white bg-transparent border-b border-white/20 focus:border-cyan-500/50 outline-none w-48 text-right"
                  />
                </div>
                {/* Industry Select */}
                <div className="flex justify-between items-center">
                  <span className="text-xs text-white/60 uppercase tracking-[0.1em]">Industry</span>
                  <select
                    value={industry}
                    onChange={(e) => setIndustry(e.target.value)}
                    className="text-xs text-white bg-black/30 border-b border-white/20 focus:border-cyan-500/50 outline-none w-48 text-right"
                  >
                    {['AUTOMOTIVE', 'RETAIL', 'HEALTHCARE', 'INSURANCE', 'GENERAL BUSINESS'].map(i => (
                      <option key={i} value={i}>{i.charAt(0) + i.slice(1).toLowerCase()}</option>
                    ))}
                  </select>
                </div>
                {/* Mobile Number Input */}
                <div className="flex justify-between items-center">
                  <span className="text-xs text-white/60 uppercase tracking-[0.1em]">Mobile Number</span>
                  <input
                    type="tel"
                    value={mobile}
                    onChange={(e) => setMobile(e.target.value)}
                    placeholder="+1234567890"
                    className="text-xs text-white bg-transparent border-b border-white/20 focus:border-cyan-500/50 outline-none w-48 text-right"
                  />
                </div>
                {/* Website Input */}
                <div className="flex justify-between items-center">
                  <span className="text-xs text-white/60 uppercase tracking-[0.1em]">Website</span>
                  <input
                    type="url"
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                    placeholder="https://example.com"
                    className="text-xs text-white bg-transparent border-b border-white/20 focus:border-cyan-500/50 outline-none w-48 text-right"
                  />
                </div>
                {/* System Prompt Textarea */}
                <div className="flex flex-col gap-2">
                  <span className="text-xs text-white/60 uppercase tracking-[0.1em]">System Prompt</span>
                  <textarea
                    value={systemPrompt}
                    onChange={(e) => setSystemPrompt(e.target.value)}
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
                  onClick={() => {
                    setStep('command');
                    setTranscript('');
                  }}
                  className="px-6 py-2 text-xs font-light tracking-[0.2em] text-white/60 uppercase hover:text-white transition-colors"
                >
                  Edit Command
                </button>
                <button onClick={() => setStep('confirm')} className="px-6 py-2 text-xs font-light tracking-[0.2em] bg-cyan-500/20 border border-cyan-500/30 rounded-lg text-cyan-300 uppercase hover:bg-cyan-500/30 transition-all">
                  Review & Confirm
                </button>
              </div>
            </div>
          )}

          {step === 'confirm' && draftData && (
            <div className="space-y-6">
              <div className="backdrop-blur-xl bg-white/[0.01] border border-white/10 rounded-lg p-4 space-y-3">
                {/* Review Client Name */}
                <div className="flex justify-between">
                  <span className="text-xs text-white/60 uppercase tracking-[0.1em]">Client Name</span>
                  <span className="text-xs text-white capitalize">{clientName}</span>
                </div>
                {/* Review Email */}
                <div className="flex justify-between">
                  <span className="text-xs text-white/60 uppercase tracking-[0.1em]">Email</span>
                  <span className="text-xs text-white">{clientEmail}</span>
                </div>
                {/* Review Industry */}
                <div className="flex justify-between">
                  <span className="text-xs text-white/60 uppercase tracking-[0.1em]">Industry</span>
                  <span className="text-xs text-white capitalize">{industry}</span>
                </div>
              </div>

              <div className="flex justify-between">
                <button onClick={() => setStep('draft')} className="px-6 py-2 text-xs font-light tracking-[0.2em] text-white/60 uppercase hover:text-white transition-colors">
                  Back
                </button>
                <button
                  onClick={handleConfirm}
                  disabled={isSpeaking || isSubmitting}
                  className="px-6 py-2 text-xs font-light tracking-[0.2em] bg-cyan-500/20 border border-cyan-500/30 rounded-lg text-cyan-300 uppercase hover:bg-cyan-500/30 transition-all disabled:opacity-50"
                >
                  {isSubmitting ? 'Creating...' : isSpeaking ? 'Speaking...' : 'Create Client'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-white/10 bg-white/[0.01] flex justify-between">
          <button onClick={onClose} className="px-6 py-2 text-xs font-light tracking-[0.2em] text-white/60 uppercase hover:text-white transition-colors">
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
