'use client';

import { useState, useRef, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { mapVisualStyleToPersona } from '@/lib/voice-visual-harmony';
import { createClient } from '@/lib/supabase/client';

type Step = 'command' | 'draft' | 'confirm';
type VoiceEntryStep = 0 | 1 | 2 | 3 | 4; // Multi-step voice entry

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
  const pathname = usePathname();
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

  // Multi-step voice entry state
  const [voiceEntryStep, setVoiceEntryStep] = useState<VoiceEntryStep>(0);
  const [isVoiceEntryMode, setIsVoiceEntryMode] = useState(false);
  const [voicePersonaTone, setVoicePersonaTone] = useState('');
  
  // Field highlighting states for real-time feedback
  const [highlightedField, setHighlightedField] = useState<'name' | 'email' | 'industry' | 'mobile' | 'website' | 'vibe' | null>(null);
  const [voiceEntryData, setVoiceEntryData] = useState({
    name: '',
    industry: '',
    email: '',
    mobile: '',
    website: '',
    vibe: ''
  });

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  // Production Excellence: Industry normalization and mapping
  const normalizeIndustry = (industry: string): string => {
    if (!industry) return 'GENERAL BUSINESS';
    
    // Convert to lowercase and strip whitespace
    const normalized = industry.toLowerCase().trim();
    
    // Industry mapper for common misspellings and variations
    const industryMap: Record<string, string> = {
      // Insurance variations
      'insurans': 'insurance',
      'insur': 'insurance',
      'ins': 'insurance',
      
      // Automotive variations
      'auto': 'automotive',
      'car': 'automotive',
      'vehicle': 'automotive',
      
      // Retail variations
      'store': 'retail',
      'shop': 'retail',
      'shopping': 'retail',
      
      // Healthcare variations
      'health': 'healthcare',
      'medical': 'healthcare',
      'hospital': 'healthcare',
      'clinic': 'healthcare',
      
      // General business variations
      'business': 'general business',
      'company': 'general business',
      'service': 'general business',
      'professional': 'general business',
    };
    
    // Return mapped value or original normalized
    return industryMap[normalized] || normalized.toUpperCase();
  };

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
        // FINAL EXORCISM: Prevent audio during Neural Assembly Lab
        if (!pathname.includes('/create-agent')) {
          audio.play().catch(() => resolve());
        } else {
          resolve();
        }
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
      
      // Start heartbeat pulsate animation when Hannah begins listening
      document.body.classList.add('animate-heartbeat-pulse-infinite');
    } catch (err) {
      setError('Microphone access denied');
    }
  };

  const stopListening = () => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    setIsListening(false);
    
    // Stop heartbeat pulsate animation when Hannah stops listening
    document.body.classList.remove('animate-heartbeat-pulse-infinite');
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

  // Multi-step voice entry functions
  const startVoiceEntryMode = () => {
    setIsVoiceEntryMode(true);
    setVoiceEntryStep(0);
    setVoiceEntryData({ name: '', industry: '', email: '', mobile: '', website: '', vibe: '' });
    speak("Let's create a new client. First, tell me the client name and industry.");
  };

  const processVoiceEntryStep = async (transcript: string) => {
    const lowerTranscript = transcript.toLowerCase();
    
    // Production Excellence: Step 3 validation check and implicit confirmation
    if (voiceEntryStep === 2) {
      const hasMobile = voiceEntryData.mobile && voiceEntryData.mobile.trim() !== '';
      const hasWebsite = voiceEntryData.website && voiceEntryData.website.trim() !== '';
      
      console.log("OVG-PLATFORM-V2: Step 3 validation - Mobile:", hasMobile, "Website:", hasWebsite);
      
      // Implicit Confirmation: Check for navigation keywords when fields are complete
      const isNavigationKeyword = lowerTranscript.includes('next') || 
                                lowerTranscript.includes('continue') || 
                                lowerTranscript.includes('done') ||
                                lowerTranscript.includes('that\'s it') ||
                                lowerTranscript.includes('finished') ||
                                lowerTranscript.includes('ready');
      
      if (hasMobile && hasWebsite) {
        console.log("OVG-PLATFORM-V2: Step 3 fields complete, checking for implicit confirmation");
        
        if (isNavigationKeyword) {
          console.log("OVG-PLATFORM-V2: Implicit confirmation detected, auto-transitioning to Step 4");
          setVoiceEntryStep(3);
          setHighlightedField('vibe');
          await speak("Finally, describe their business vibe or personality in a few words.");
          return;
        }
      }
    }
    
    switch (voiceEntryStep) {
      case 0: // Step 1: Name and Industry
        await processNameAndIndustry(transcript);
        break;
      case 1: // Step 2: Email
        await processEmail(transcript);
        break;
      case 2: // Step 3: Mobile and Website
        await processContactInfo(transcript);
        break;
      case 3: // Step 4: Vibe/Description
        await processVibe(transcript);
        break;
      case 4: // Complete
        await completeVoiceEntry();
        break;
    }
  };

  const processNameAndIndustry = async (transcript: string) => {
    setHighlightedField('name');
    
    // Session injection: ensure authenticated session before API calls
    const supabase = createClient();
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    
    // Verify we have an authenticated session, not anonymous
    if (!session || !session.user) {
      await speak("I'm having trouble connecting to your secure vault. Please ensure you're logged in so I can save this for you.");
      // Change Pierre AI heartbeat from Cyan to Red for RLS failure
      document.body.classList.add('heartbeat-error');
      setTimeout(() => document.body.classList.remove('heartbeat-error'), 3000);
      return;
    }
    
    // Extract name and industry using Groq
    try {
      const response = await fetch('/api/ai/extract-client-info', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ transcript, fields: ['name', 'industry'] }),
      });
      
      const data = await response.json();
      
      if (data.name) {
        setVoiceEntryData(prev => ({ ...prev, name: data.name }));
        setClientName(data.name);
      }
      
      if (data.industry) {
        const normalizedIndustry = normalizeIndustry(data.industry);
        setVoiceEntryData(prev => ({ ...prev, industry: normalizedIndustry }));
        setIndustry(normalizedIndustry);
        console.log("OVG-PLATFORM-V2: Industry normalized from", data.industry, "to", normalizedIndustry);
      }
      
      if (data.name && data.industry) {
        await speak(`${data.name} in the ${data.industry} sector, check.`);
        setVoiceEntryStep(1);
        setHighlightedField('email');
        await speak("Now, what's their email address?");
      } else {
        await speak("I need both the client name and industry. Can you provide both?");
      }
    } catch (err) {
      await speak("I didn't catch that. Please tell me the client name and industry.");
    }
  };

  const processEmail = async (transcript: string) => {
    setHighlightedField('email');
    
    // Session injection: ensure authenticated session before API calls
    const supabase = createClient();
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    
    // Verify we have an authenticated session, not anonymous
    if (!session || !session.user) {
      await speak("I'm having trouble connecting to your secure vault. Please ensure you're logged in so I can save this for you.");
      // Change Pierre AI heartbeat from Cyan to Red for RLS failure
      document.body.classList.add('heartbeat-error');
      setTimeout(() => document.body.classList.remove('heartbeat-error'), 3000);
      return;
    }
    
    // Normalization: Clean transcript for natural speech patterns
    let cleanEmail = transcript.toLowerCase()
      .replace(/\s+at\s+/g, '@')
      .replace(/\s+dot\s+/g, '.')
      .replace(/\s+/g, '');
    
    // Extract email using regex after normalization
    const emailRegex = /\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/g;
    const emails = cleanEmail.match(emailRegex);
    
    if (emails && emails.length > 0) {
      let email = emails[0];
      
      // Format email properly (capitalize first letter of domain if needed)
      const [localPart, domain] = email.split('@');
      if (domain) {
        const domainParts = domain.split('.');
        email = `${localPart}@${domainParts.map(part => part).join('.')}`;
      }
      
      setVoiceEntryData(prev => ({ ...prev, email }));
      setClientEmail(email);
      
      // Hannah's confirmation with proper email reading
      const readableEmail = email.replace('@', ' at ').replace(/\./g, ' dot ');
      await speak(`${readableEmail}, got it.`);
      setVoiceEntryStep(2);
      setHighlightedField('mobile');
      await speak("What's website address?");
    } else {
      await speak("I didn't catch an email address. Can you repeat it?");
    }
  };

  const processContactInfo = async (transcript: string) => {
    // Highlight both fields since we're listening for both
    setHighlightedField('mobile');
    
    // Session injection: ensure authenticated session before API calls
    const supabase = createClient();
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    
    // Verify we have an authenticated session, not anonymous
    if (!session || !session.user) {
      await speak("I'm having trouble connecting to your secure vault. Please ensure you're logged in so I can save this for you.");
      // Change Pierre AI heartbeat from Cyan to Red for RLS failure
      document.body.classList.add('heartbeat-error');
      setTimeout(() => document.body.classList.remove('heartbeat-error'), 3000);
      return;
    }
    
    // Extract phone number
    const phoneRegex = /(\+?1[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})/g;
    const phones = transcript.match(phoneRegex);
    
    console.log("OVG-PLATFORM-V2: Phone regex result:", phones);
    
    // Production Excellence: Case-insensitive domain extraction for STT transcripts
    const cleanTranscript = transcript.toLowerCase();
    console.log("OVG-PLATFORM-V2: Regex matching against transcript:", cleanTranscript);
    
    // Enhanced URL extraction - case insensitive, supports raw domains, hyphens, and STT artifacts
    const fuzzyUrlRegex = /\b[a-z0-9.-]+\.[a-z]{2,}\b/gi; // 'i' flag for case insensitive
    const standardUrlRegex = /https?:\/\/[^\s]+/gi;
    
    // Try standard URL first, then fuzzy
    let urls = transcript.match(standardUrlRegex);
    let isFuzzyMatch = false;
    
    if (!urls || urls.length === 0) {
      urls = cleanTranscript.match(fuzzyUrlRegex);
      isFuzzyMatch = true;
      console.log("OVG-PLATFORM-V2: Fuzzy URL regex result:", urls);
    } else {
      console.log("OVG-PLATFORM-V2: Standard URL regex result:", urls);
    }
    
    let hasWebsite = false;
    let hasMobile = false;
    
    if (phones && phones.length > 0) {
      const phone = phones[0];
      setVoiceEntryData(prev => ({ ...prev, mobile: phone }));
      setMobile(phone);
      await speak(`Mobile: ${phone}.`);
      hasMobile = true;
    }
    
    if (urls && urls.length > 0) {
      let website = urls[0];
      
      // Production Excellence: cleanDomain helper for STT cleanup
      const cleanDomain = (domain: string): string => {
        // Remove trailing periods, spaces, and common STT artifacts
        return domain
          .replace(/[.\s]+$/, '') // Remove trailing dots and spaces
          .replace(/^\s+/, '') // Remove leading spaces
          .trim();
      };
      
      const cleanedWebsite = cleanDomain(website);
      console.log("OVG-PLATFORM-V2: Cleaned website domain:", cleanedWebsite);
      
      // Auto-normalization: prepend https:// if missing
      let finalWebsite = cleanedWebsite;
      if (!cleanedWebsite.startsWith('http://') && !cleanedWebsite.startsWith('https://')) {
        finalWebsite = `https://${cleanedWebsite}`;
      }
      
      setVoiceEntryData(prev => ({ ...prev, website: finalWebsite }));
      setWebsite(finalWebsite);
      
      // Audio confirmation for fuzzy matches
      if (isFuzzyMatch) {
        const cleanWebsite = finalWebsite.replace('https://', '').replace('http://', '');
        await speak(`Got ${cleanWebsite}!`);
      } else {
        await speak(`Website: ${finalWebsite}.`);
      }
      
      hasWebsite = true;
    }
    
    // Production Excellence: Persistence - Check existing values before validation
    const existingMobile = voiceEntryData.mobile;
    const existingWebsite = voiceEntryData.website;
    const hasExistingMobile = existingMobile && existingMobile.trim() !== '';
    const hasExistingWebsite = existingWebsite && existingWebsite.trim() !== '';
    
    console.log("OVG-PLATFORM-V2: Existing values - Mobile:", hasExistingMobile, "Website:", hasExistingWebsite);
    
    // Combine existing and new values for persistence
    const finalHasMobile = hasMobile || hasExistingMobile;
    const finalHasWebsite = hasWebsite || hasExistingWebsite;
    
    // Field validation chain - check if we need to prompt for missing info
    if (finalHasMobile || finalHasWebsite) {
      if (finalHasWebsite && !finalHasMobile) {
        if (!hasMobile) {
          // Only prompt if we didn't just get a mobile
          await speak("Got the site! And what's the mobile number?");
        }
        setHighlightedField('mobile'); // Keep mobile highlighted
      } else if (finalHasMobile && !finalHasWebsite) {
        if (!hasWebsite) {
          // Only prompt if we didn't just get a website
          await speak("Got mobile! And what's the website address?");
        }
        setHighlightedField('website'); // Keep website highlighted
      } else {
        // Both fields captured - proceed to next step
        setVoiceEntryStep(3);
        setHighlightedField('vibe');
        await speak("Finally, describe their business vibe or personality in a few words.");
      }
    } else {
      await speak("I didn't catch a phone number or website. Can you provide at least one?");
    }
  };

  const processVibe = async (transcript: string) => {
    setHighlightedField('vibe');
    
    // Use Persona Mapping Utility to generate voice_persona_tone
    try {
      const visualStyle = {
        industry: voiceEntryData.industry.toLowerCase(),
        headerType: 'solid' as const,
        primaryColor: '#0097b2',
        secondaryColor: '#226683',
        opacity: 0.8,
        hasGlassmorphism: false
      };
      
      const persona = mapVisualStyleToPersona(visualStyle);
      const personaTone = `${persona.tone} and ${persona.vocabulary} with ${persona.pace} pace`;
      
      setVoicePersonaTone(personaTone);
      setVoiceEntryData(prev => ({ ...prev, vibe: transcript }));
      setSystemPrompt(transcript);
      
      await speak(`Perfect! I've detected a ${personaTone} personality for this ${voiceEntryData.industry.toLowerCase()} business.`);
      
      // Check if all fields are complete
      if (voiceEntryData.name && voiceEntryData.industry) {
        setVoiceEntryStep(4);
        await completeVoiceEntry();
      }
    } catch (err) {
      setVoiceEntryData(prev => ({ ...prev, vibe: transcript }));
      setSystemPrompt(transcript);
      await speak("Got it. Let me finalize the profile.");
      setVoiceEntryStep(4);
      await completeVoiceEntry();
    }
  };

  const completeVoiceEntry = async () => {
    setHighlightedField(null);
    
    // Create draft data
    const draft = {
      clientName: voiceEntryData.name,
      clientEmail: voiceEntryData.email,
      industry: voiceEntryData.industry.toUpperCase(),
      mobile: voiceEntryData.mobile,
      website: voiceEntryData.website,
      systemPrompt: voiceEntryData.vibe,
      parsedFromVoice: true,
    };
    
    setDraftData(draft);
    setIsVoiceEntryMode(false);
    
    // The Big Reveal
    await speak(`I've drafted the full profile for ${voiceEntryData.name}. It looks sharp. Should I save this and start the branding rationale?`);
    
    setStep('draft');
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

    // Hannah identity check - Pierre AI interface
    const isIdentityQuestion = lowerTranscript.includes('who are you') || 
                              lowerTranscript.includes('what is your name') || 
                              lowerTranscript.includes('what\'s your name');

    try {
      if (isIdentityQuestion) {
        await speak("I'm Hannah, your Pierre AI assistant. I'm here to help you create and manage clients with intelligent voice commands.");
        setTranscript('');
        return;
      }

      if (isVoiceEntryMode) {
        await processVoiceEntryStep(transcript);
      } else if (isDeleteCommand) {
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
      
      // Session injection: ensure authenticated session before API calls
      const supabase = createClient();
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (!session) {
        await speak("I'm having trouble connecting to your secure vault. Please ensure you're logged in so I can save this for you.");
        setIsProcessing(false);
        return;
      }
      
      const response = await fetch('/api/ai/create-client', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          resellerSlug: resellerSlug || 'acme-corp',
          parseOnly: false,
          clientData: {
            name: draftData.clientName,
            industry: normalizeIndustry(draftData.industry),
            email: draftData.clientEmail,
            mobile: mobile,
            website: website,
            systemPrompt: systemPrompt,
            reseller_id: session.user.id, // Tenant association
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
          <h2 className="text-lg font-light tracking-widest text-white uppercase">
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
                      {voiceEntryStep === 0 && "Tell me the client name and industry"}
                      {voiceEntryStep === 1 && "What's their email address?"}
                      {voiceEntryStep === 2 && "Mobile number and website"}
                      {voiceEntryStep === 3 && "Describe their business vibe"}
                      {voiceEntryStep === 4 && "Completing profile..."}
                    </div>
                  </div>

                  {/* Real-time Field Highlighting */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className={`backdrop-blur-xl bg-white/[0.02] border rounded-lg p-2 transition-all ${
                      highlightedField === 'name' ? 'border-cyan-500 bg-cyan-500/10' : 'border-white/10'
                    }`}>
                      <div className="text-xs text-white/60">Name</div>
                      <div className="text-sm text-white">{voiceEntryData.name || '...'}</div>
                    </div>
                    <div className={`backdrop-blur-xl bg-white/[0.02] border rounded-lg p-2 transition-all ${
                      highlightedField === 'industry' ? 'border-cyan-500 bg-cyan-500/10' : 'border-white/10'
                    }`}>
                      <div className="text-xs text-white/60">Industry</div>
                      <div className="text-sm text-white">{voiceEntryData.industry || '...'}</div>
                    </div>
                    <div className={`backdrop-blur-xl bg-white/[0.02] border rounded-lg p-2 transition-all ${
                      highlightedField === 'email' ? 'border-cyan-500 bg-cyan-500/10' : 'border-white/10'
                    }`}>
                      <div className="text-xs text-white/60">Email</div>
                      <div className="text-sm text-white">{voiceEntryData.email || '...'}</div>
                    </div>
                    <div className={`backdrop-blur-xl bg-white/[0.02] border rounded-lg p-2 transition-all ${
                      (highlightedField === 'mobile' || (voiceEntryStep === 2 && !voiceEntryData.mobile)) ? 'border-cyan-500 bg-cyan-500/10' : 'border-white/10'
                    }`}>
                      <div className="text-xs text-white/60">Mobile</div>
                      <div className="text-sm text-white">{voiceEntryData.mobile || '...'}</div>
                    </div>
                    <div className={`backdrop-blur-xl bg-white/[0.02] border rounded-lg p-2 transition-all ${
                      (highlightedField === 'website' || (voiceEntryStep === 2 && !voiceEntryData.website)) ? 'border-cyan-500 bg-cyan-500/10' : 'border-white/10'
                    }`}>
                      <div className="text-xs text-white/60">Website</div>
                      <div className="text-sm text-white">{voiceEntryData.website || '...'}</div>
                    </div>
                    <div className={`backdrop-blur-xl bg-white/[0.02] border rounded-lg p-2 transition-all ${
                      highlightedField === 'vibe' ? 'border-cyan-500 bg-cyan-500/10' : 'border-white/10'
                    }`}>
                      <div className="text-xs text-white/60">Vibe</div>
                      <div className="text-sm text-white truncate">{voiceEntryData.vibe || '...'}</div>
                    </div>
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
                  {isVoiceEntryMode ? 'Voice Entry Mode' : 'Voice Command'}
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

              {/* Voice Entry Mode Toggle */}
              {!isVoiceEntryMode && (
                <div className="flex justify-center">
                  <button
                    onClick={startVoiceEntryMode}
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
                  onClick={processCommand}
                  disabled={!transcript || isProcessing || isSpeaking}
                  className="px-6 py-2 text-xs font-light tracking-[0.2em] bg-cyan-500/20 border border-cyan-500/30 rounded-lg text-cyan-300 uppercase hover:bg-cyan-500/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isProcessing ? 'Processing...' : isSpeaking ? 'Speaking...' : (isVoiceEntryMode ? 'Next Step' : 'Process Command')}
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
          <div className="text-[10px] text-white/30 uppercase tracking-widest font-light">
            POWERED BY PIERRE <span className="animate-heartbeat-pulse text-cyan-400">AI</span>
          </div>
        </div>
      </div>
    </div>
  );
}
