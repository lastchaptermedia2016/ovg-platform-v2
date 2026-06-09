'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { mapVisualStyleToPersona } from '@/lib/voice-visual-harmony';
import { createClient } from '@/lib/supabase/client';
import { resolveResellerId } from '@/lib/supabase/resolve-reseller-id';

type Step = 'command' | 'draft' | 'review' | 'confirm';
type VoiceEntryStep = 0 | 1 | 2 | 3 | 4; // Multi-step voice entry

// Category options keyed by industry
const INDUSTRY_CATEGORY_MAP: Record<string, string[]> = {
  AUTOMOTIVE: ['VIN_DECODE', 'LOGISTICS', 'RETAIL_SALES'],
  RETAIL: ['ECOMMERCE', 'BRICK_AND_MORTAR'],
  HEALTHCARE: ['CLINICAL', 'WELLNESS'],
  INSURANCE: ['CLAIMS', 'UNDERWRITING'],
  'AI AUTOMATION': ['AGENTIC_AI', 'WORKFLOW_AUTOMATION', 'CHATBOT'],
  'GENERAL BUSINESS': ['GENERAL', 'CONSULTING', 'SERVICES'],
};

const getCategoriesForIndustry = (ind: string): string[] =>
  INDUSTRY_CATEGORY_MAP[ind.toUpperCase().trim()] ?? INDUSTRY_CATEGORY_MAP['GENERAL BUSINESS'];

interface DraftData {
  clientName: string;
  clientEmail: string;
  industry: string;
  category: string;
  mobile: string;
  website: string;
  systemPrompt: string;
  parsedFromVoice: boolean;
  is_override?: boolean;
  confidence?: number;
}

interface UniversalCommandModalProps {
  onClose: () => void;
  resellerSlug?: string;
  onClientCreated?: () => void;
}

// ─── Atomic Form State ─────────────────────────────────────────────
interface FormState {
  name: string;
  email: string;
  industry: string;
  category: string;
  mobile: string;
  website: string;
  systemPrompt: string;
}

const INITIAL_FORM_STATE: FormState = {
  name: '',
  email: '',
  industry: 'GENERAL BUSINESS',
  category: '',
  mobile: '',
  website: '',
  systemPrompt: '',
};

interface VoiceEntryData {
  name: string;
  industry: string;
  category: string;
  email: string;
  mobile: string;
  website: string;
  vibe: string;
}

const INITIAL_VOICE_ENTRY_DATA: VoiceEntryData = {
  name: '',
  industry: '',
  category: '',
  email: '',
  mobile: '',
  website: '',
  vibe: '',
};

interface ReviewData {
  name: string;
  industry: string;
  category: string;
  email: string;
  mobile: string;
  website: string;
  vibe: string;
}

export function UniversalCommandModal({ onClose, resellerSlug, onClientCreated }: UniversalCommandModalProps) {
  const getErrorMessage = (err: unknown): string => {
    if (err instanceof Error) return err.message;
    if (typeof err === 'string') return err;
    return 'An unknown error occurred.';
  };

  // ─── Core Navigation State ───────────────────────────────────────
  const [step, setStep] = useState<Step>('command');
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [draftData, setDraftData] = useState<DraftData | null>(null);
  const [categoryError, setCategoryError] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting] = useState(false);

  // ─── Atomic Form State (single source of truth) ──────────────────
  const [formState, setFormState] = useState<FormState>(INITIAL_FORM_STATE);

  // ─── Multi-Step Voice Entry State ────────────────────────────────
  const [voiceEntryStep, setVoiceEntryStep] = useState<VoiceEntryStep>(0);
  const [isVoiceEntryMode, setIsVoiceEntryMode] = useState(false);
  const [voicePersonaTone, setVoicePersonaTone] = useState('');
  const [voiceEntryData, setVoiceEntryData] = useState<VoiceEntryData>(INITIAL_VOICE_ENTRY_DATA);

  // Refs to avoid stale closures and forward-reference issues in async callbacks
  const voiceEntryDataRef = useRef<VoiceEntryData>(voiceEntryData);
  const processCommandRef = useRef<(manualTranscript?: string) => Promise<void>>(async () => {});
  const transcribeAudioRef = useRef<(blob: Blob) => Promise<void>>(async () => {});

  // Sync ref with latest voiceEntryData via effect (not during render)
  useEffect(() => {
    voiceEntryDataRef.current = voiceEntryData;
  }, [voiceEntryData]);

  // ─── UI Highlight & Conversation State ───────────────────────────
  const [highlightedField, setHighlightedField] = useState<'name' | 'email' | 'industry' | 'category' | 'mobile' | 'website' | 'vibe' | null>(null);
  const [, setConversationStep] = useState<'greeting' | 'name' | 'industry' | 'category' | 'email' | 'mobile' | 'website' | 'vibe' | 'review' | 'complete'>('greeting');
  const [, setMissingFields] = useState<Set<string>>(new Set(['name', 'industry', 'category', 'email', 'mobile', 'website', 'vibe']));

  // ─── Review Data ─────────────────────────────────────────────────
  const [reviewData, setReviewData] = useState<ReviewData>({
    name: '',
    industry: '',
    category: '',
    email: '',
    mobile: '',
    website: '',
    vibe: '',
  });

  // ─── Media Refs ──────────────────────────────────────────────────
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  // PTT: debounce timer so stopListening always fires even on rapid release
  const pttStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── Industry Enum & Normalization ───────────────────────────────
  const normalizeIndustry = useCallback((industry: string): string => {
    const ALLOWED_INDUSTRIES = [
      'AUTOMOTIVE',
      'RETAIL',
      'HEALTHCARE',
      'INSURANCE',
      'AI AUTOMATION',
      'GENERAL BUSINESS',
    ] as const;
    const upperIndustry = industry.toUpperCase().trim();

    if ((ALLOWED_INDUSTRIES as readonly string[]).includes(upperIndustry)) {
      return upperIndustry;
    }

    const fuzzyMap: Record<string, string> = {
      'INSURANCE': 'INSURANCE',
      'INSURE': 'INSURANCE',
      'INSURENS': 'INSURANCE',
      'INSUR': 'INSURANCE',
      'AUTO': 'AUTOMOTIVE',
      'CAR': 'AUTOMOTIVE',
      'VEHICLE': 'AUTOMOTIVE',
      'AUTOMOTIVE': 'AUTOMOTIVE',
      'RETAIL': 'RETAIL',
      'STORE': 'RETAIL',
      'SHOP': 'RETAIL',
      'HEALTH': 'HEALTHCARE',
      'MEDICAL': 'HEALTHCARE',
      'HEALTHCARE': 'HEALTHCARE',
      'HEALTH CARE': 'HEALTHCARE',
      'AI': 'AI AUTOMATION',
      'AUTOMATION': 'AI AUTOMATION',
      'AI AUTOMATION': 'AI AUTOMATION',
      'GENERAL': 'GENERAL BUSINESS',
      'BUSINESS': 'GENERAL BUSINESS',
      'GENERAL BUSINESS': 'GENERAL BUSINESS',
      'OTHER': 'GENERAL BUSINESS',
    };

    for (const [key, value] of Object.entries(fuzzyMap)) {
      if (upperIndustry.includes(key)) {
        return value;
      }
    }

    return 'GENERAL BUSINESS';
  }, []);

  // ─── Keyword Delimiter Parser ────────────────────────────────────
  const parseWithKeywordDelimiters = useCallback((transcript: string): {
    name: string; industry?: string; category?: string; email?: string; mobile?: string; website?: string;
  } => {
    const lowerTranscript = transcript.toLowerCase();
    const keywords = ['industry', 'category', 'mapped to', 'email', 'mobile', 'phone', 'website'];

    let name = transcript;
    let industry: string | undefined;
    let category: string | undefined;
    let email: string | undefined;
    let mobile: string | undefined;
    let website: string | undefined;

    const keywordPositions: { keyword: string; index: number }[] = [];
    for (const keyword of keywords) {
      const index = lowerTranscript.indexOf(keyword);
      if (index !== -1) {
        keywordPositions.push({ keyword, index });
      }
    }

    keywordPositions.sort((a, b) => a.index - b.index);

    for (let i = 0; i < keywordPositions.length; i++) {
      const { keyword, index } = keywordPositions[i];
      const nextKeyword = keywordPositions[i + 1];
      const startIndex = index + keyword.length;
      const endIndex = nextKeyword ? nextKeyword.index : transcript.length;
      const value = transcript.substring(startIndex, endIndex).trim();

      if (keyword === 'industry') {
        industry = value;
      } else if (keyword === 'category' || keyword === 'mapped to') {
        category = value;
      } else if (keyword === 'email') {
        email = value;
      } else if (keyword === 'mobile' || keyword === 'phone') {
        mobile = value;
      } else if (keyword === 'website') {
        website = value;
      }
    }

    if (keywordPositions.length > 0) {
      name = transcript.substring(0, keywordPositions[0].index).trim();
    }

    const commandPrefixes = [
      /^(client name|company name|name is|company is|the name is|the company is|the client name is)/i,
      /^(create client|add client|new client)/i,
      /^(my company|our company|the company)/i,
    ];

    for (const prefix of commandPrefixes) {
      name = name.replace(prefix, '').trim();
    }

    name = name.replace(/[,\.;:!?\-\—\–]+$/, '').trim();

    return { name, industry, category, email, mobile, website };
  }, []);

  // ─── Sanitizers ──────────────────────────────────────────────────
  const sanitizeWebsiteUrl = useCallback((website: string): string | null => {
    if (!website || website.trim() === '') return null;

    let sanitized = website
      .replace(/\s+dot\s+com/gi, '.com')
      .replace(/\s+dot\s+/gi, '.')
      .replace(/\s+at\s+/gi, '@')
      .replace(/\s+/g, '')
      .toLowerCase()
      .trim();

    if (!sanitized.includes('.')) {
      return null;
    }

    if (!sanitized.startsWith('http://') && !sanitized.startsWith('https://')) {
      sanitized = `https://${sanitized}`;
    }

    return sanitized;
  }, []);

  const sanitizeEmail = useCallback((email: string): string | null => {
    if (!email || email.trim() === '') return null;

    const sanitized = email
      .replace(/\s+at\s+/gi, '@')
      .replace(/\s+dot\s+/gi, '.')
      .replace(/\s+/g, '')
      .toLowerCase()
      .trim();

    if (!sanitized.includes('@') || !sanitized.includes('.')) {
      return null;
    }

    return sanitized;
  }, []);

  const validateField = useCallback((value: string | null | undefined): string | null => {
    if (!value || value.trim() === '' || value === '---' || value === '...' || value === 'null') {
      return null;
    }
    return value.trim();
  }, []);

  // ─── LLM Response Generation ─────────────────────────────────────
  const generateHannahResponse = useCallback(async (context: string, field: string, value?: string): Promise<string> => {
    try {
      const response = await fetch('/api/ai/generate-response', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ context, field, value }),
      });

      if (!response.ok) {
        console.error('Failed to generate Hannah response:', response.statusText);
        return 'Got it.';
      }

      const data = await response.json();
      return data.response || 'Got it.';
    } catch {
      return 'Got it.';
    }
  }, []);

  // ─── Media Stream Cleanup ────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (pttStopTimerRef.current) {
        clearTimeout(pttStopTimerRef.current);
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      if (mediaRecorderRef.current?.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

  // ─── Sync draftData → formState when entering draft step ─────────
  useEffect(() => {
    if (!draftData || step !== 'draft') return;

    let active = true;
    Promise.resolve().then(() => {
      if (!active) return;
      setFormState({
        name: draftData.clientName,
        email: draftData.clientEmail,
        industry: draftData.industry,
        category: draftData.category,
        mobile: draftData.mobile,
        website: draftData.website,
        systemPrompt: draftData.systemPrompt,
      });
    });

    return () => { active = false; };
  }, [draftData, step]);

  // ─── TTS ─────────────────────────────────────────────────────────
  const speak = useCallback(async (text: string, metadata?: { resellerSlug?: string }) => {
    try {
      setIsSpeaking(true);
      const ttsMetadata = { ...metadata, resellerSlug };

      const response = await fetch('/api/ai/speech', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice: 'hannah', model: 'orpheus-v1', metadata: ttsMetadata }),
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
    } catch (_err) {
      console.error('[Modal TTS] Failed:', _err);
    } finally {
      setIsSpeaking(false);
    }
  }, [resellerSlug]);

  // ─── Microphone ──────────────────────────────────────────────────
  const startListening = useCallback(async () => {
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
        if (audioBlob.size > 0) await transcribeAudioRef.current(audioBlob);
        stream.getTracks().forEach(t => t.stop());
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start(100);
      setIsListening(true);
      document.body.classList.add('animate-heartbeat-pulse-infinite');
    } catch {
      setError('Microphone access denied');
    }
  }, []);

  const stopListening = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    setIsListening(false);
    document.body.classList.remove('animate-heartbeat-pulse-infinite');
  }, []);

  const toggleListening = useCallback(() => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  }, [isListening, startListening, stopListening]);

  // ─── Push-to-Talk handlers ───────────────────────────────────────
  // Hold to speak, release to capture. The 200ms delay on stop gives the
  // browser time to flush the final ondataavailable chunk before onstop fires.
  const handlePTTMouseDown = useCallback(() => {
    if (pttStopTimerRef.current) {
      clearTimeout(pttStopTimerRef.current);
      pttStopTimerRef.current = null;
    }
    startListening();
  }, [startListening]);

  const handlePTTStop = useCallback(() => {
    if (pttStopTimerRef.current) {
      clearTimeout(pttStopTimerRef.current);
    }
    pttStopTimerRef.current = setTimeout(() => {
      stopListening();
      pttStopTimerRef.current = null;
    }, 200);
  }, [stopListening]);

  // ─── Transcription ───────────────────────────────────────────────
  const transcribeAudio = useCallback(async (audioBlob: Blob) => {
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
      await processCommandRef.current(text);
    } catch {
      setError('Transcription failed — please try again');
    } finally {
      setIsProcessing(false);
    }
  }, []);

  // ─── Multi-Step Voice Entry ──────────────────────────────────────
  const completeVoiceEntry = useCallback(async () => {
    setHighlightedField(null);

    // Read from ref to avoid stale closure
    const currentData = voiceEntryDataRef.current;

    setReviewData({
      name: currentData.name,
      industry: currentData.industry.toUpperCase(),
      category: currentData.category.toUpperCase(),
      email: currentData.email,
      mobile: currentData.mobile,
      website: currentData.website,
      vibe: currentData.vibe,
    });

    setIsVoiceEntryMode(false);
    await speak(`I've drafted the full profile for ${currentData.name}. Please review the details and correct any errors before I save this to your database.`);
    setStep('review');
  }, [speak]);

  const processVibe = useCallback(async (transcript: string) => {
    setHighlightedField('vibe');

    try {
      const visualStyle = {
        industry: voiceEntryData.industry.toLowerCase(),
        headerType: 'solid' as const,
        primaryColor: '#0097b2',
        secondaryColor: '#226683',
        opacity: 0.8,
        hasGlassmorphism: false,
      };

      const persona = mapVisualStyleToPersona(visualStyle);
      const personaTone = `${persona.tone} and ${persona.vocabulary} with ${persona.pace} pace`;

      setVoicePersonaTone(personaTone);
      setVoiceEntryData(prev => ({ ...prev, vibe: transcript }));
      setFormState(prev => ({ ...prev, systemPrompt: transcript }));

      setMissingFields(prev => {
        const updated = new Set(prev);
        updated.delete('vibe');
        return updated;
      });

      await speak(`Perfect! I've detected a ${personaTone} personality for this ${voiceEntryData.industry.toLowerCase()} business.`);

      if (voiceEntryData.name && voiceEntryData.industry) {
        setVoiceEntryStep(4);
        await completeVoiceEntry();
      }
    } catch {
      setVoiceEntryData(prev => ({ ...prev, vibe: transcript }));
      setFormState(prev => ({ ...prev, systemPrompt: transcript }));
      await speak('Got it. Let me finalize the profile.');
      setVoiceEntryStep(4);
      await completeVoiceEntry();
    }
  }, [voiceEntryData, speak, completeVoiceEntry]);

  const processContactInfo = useCallback(async (transcript: string) => {
    setHighlightedField('mobile');

    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();

    if (!session || !session.user) {
      await speak("I'm having trouble connecting to your secure vault. Please ensure you're logged in so I can save this for you.");
      document.body.classList.add('heartbeat-error');
      setTimeout(() => document.body.classList.remove('heartbeat-error'), 3000);
      return;
    }

    const phoneRegex = /(\+?1[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})/g;
    const phones = transcript.match(phoneRegex);

    const cleanTranscript = transcript.toLowerCase();
    const fuzzyUrlRegex = /\b[a-z0-9.-]+\.[a-z]{2,}\b/gi;
    const standardUrlRegex = /https?:\/\/[^\s]+/gi;
    const normalizedTranscript = cleanTranscript.replace(/\s+dot\s+com/gi, '.com').replace(/\s+dot\s+/gi, '.');

    let urls = transcript.match(standardUrlRegex);
    if (!urls || urls.length === 0) {
      urls = normalizedTranscript.match(fuzzyUrlRegex);
    }

    let hasWebsite = false;
    let hasMobile = false;

    if (phones && phones.length > 0) {
      const phone = phones[0] || '';
      setVoiceEntryData(prev => ({ ...prev, mobile: phone }));
      setFormState(prev => ({ ...prev, mobile: phone }));

      setMissingFields(prev => {
        const updated = new Set(prev);
        updated.delete('mobile');
        return updated;
      });

      const mobileResponse = await generateHannahResponse('Mobile captured', 'mobile', phone);
      await speak(mobileResponse);
      hasMobile = true;
    }

    if (urls && urls.length > 0) {
      const website = urls[0] || '';
      const finalWebsite = sanitizeWebsiteUrl(website);

      if (finalWebsite) {
        setVoiceEntryData(prev => ({ ...prev, website: finalWebsite }));
        setFormState(prev => ({ ...prev, website: finalWebsite }));

        setMissingFields(prev => {
          const updated = new Set(prev);
          updated.delete('website');
          return updated;
        });

        const websiteResponse = await generateHannahResponse('Website captured', 'website', finalWebsite);
        await speak(websiteResponse);
        hasWebsite = true;
      }
    }

    const existingMobile = voiceEntryData.mobile;
    const existingWebsite = voiceEntryData.website;
    const hasExistingMobile = existingMobile && existingMobile.trim() !== '';
    const hasExistingWebsite = existingWebsite && existingWebsite.trim() !== '';

    const finalHasMobile = hasMobile || hasExistingMobile;
    const finalHasWebsite = hasWebsite || hasExistingWebsite;

    if (finalHasMobile || finalHasWebsite) {
      if (finalHasWebsite && !finalHasMobile) {
        if (!hasMobile) {
          await speak("Got the site! And what's the mobile number?");
        }
        setHighlightedField('mobile');
      } else if (finalHasMobile && !finalHasWebsite) {
        if (!hasWebsite) {
          await speak("Got mobile! And what's the website address?");
        }
        setHighlightedField('website');
      } else {
        setVoiceEntryStep(3);
        setHighlightedField('vibe');
        await speak('Finally, describe their business vibe or personality in a few words.');
      }
    } else {
      await speak("I didn't catch a phone number or website. Can you provide at least one?");
    }
  }, [voiceEntryData, speak, sanitizeWebsiteUrl, generateHannahResponse]);

  const processEmail = useCallback(async (transcript: string) => {
    setHighlightedField('email');

    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();

    if (!session || !session.user) {
      await speak("I'm having trouble connecting to your secure vault. Please ensure you're logged in so I can save this for you.");
      document.body.classList.add('heartbeat-error');
      setTimeout(() => document.body.classList.remove('heartbeat-error'), 3000);
      return;
    }

    const cleanEmail = transcript.toLowerCase()
      .replace(/\s+at\s+/g, '@')
      .replace(/\s+dot\s+/g, '.')
      .replace(/\s+/g, '');

    const emailRegex = /\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/g;
    const emails = cleanEmail.match(emailRegex);

    if (emails && emails.length > 0) {
      const email = emails[0];
      const finalEmail = sanitizeEmail(email);

      if (finalEmail) {
        setVoiceEntryData(prev => ({ ...prev, email: finalEmail }));
        setFormState(prev => ({ ...prev, email: finalEmail }));

        setMissingFields(prev => {
          const updated = new Set(prev);
          updated.delete('email');
          return updated;
        });
      }

      const response = await generateHannahResponse('Email captured', 'email', finalEmail || undefined);
      await speak(response);

      setVoiceEntryStep(2);
      setHighlightedField('mobile');
      setConversationStep('mobile');

      const nextPrompt = await generateHannahResponse('Moving to next field', 'mobile');
      await speak(nextPrompt);
    } else {
      const errorResponse = await generateHannahResponse('Missing information', 'email');
      await speak(errorResponse);
    }
  }, [speak, sanitizeEmail, generateHannahResponse]);

  const processNameAndIndustry = useCallback(async (transcript: string) => {
    setHighlightedField('name');

    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();

    if (!session || !session.user) {
      await speak("I'm having trouble connecting to your secure vault. Please ensure you're logged in so I can save this for you.");
      document.body.classList.add('heartbeat-error');
      setTimeout(() => document.body.classList.remove('heartbeat-error'), 3000);
      return;
    }

    const parsed = parseWithKeywordDelimiters(transcript);
    const cleanedTranscript = transcript.trim();
    const parserFoundDelimiters = transcript.toLowerCase().includes('industry') ||
                                   transcript.toLowerCase().includes('email') ||
                                   transcript.toLowerCase().includes('mobile') ||
                                   transcript.toLowerCase().includes('website');

    try {
      const response = await fetch('/api/ai/extract-client-info', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ transcript: cleanedTranscript, fields: ['name', 'industry'] }),
      });

      const data = await response.json();

      const finalName = parserFoundDelimiters
        ? (parsed.name?.replace(/^[\s,]+/, '').trim() || data.name)
        : data.name;

      const finalIndustry = (parserFoundDelimiters && parsed.industry?.trim())
        ? parsed.industry.trim()
        : data.industry;

      const finalCategory = (parserFoundDelimiters && parsed.category?.trim())
        ? parsed.category.trim().toUpperCase()
        : (data.category?.trim().toUpperCase() || '');

      // Atomic update: sync both voiceEntryData and formState
      if (finalName) {
        setVoiceEntryData(prev => ({ ...prev, name: finalName }));
        setFormState(prev => ({ ...prev, name: finalName }));
        setMissingFields(prev => { const u = new Set(prev); u.delete('name'); return u; });
      }

      if (finalIndustry) {
        setVoiceEntryData(prev => ({ ...prev, industry: finalIndustry }));
        setFormState(prev => ({ ...prev, industry: finalIndustry.toUpperCase() }));
        setMissingFields(prev => { const u = new Set(prev); u.delete('industry'); return u; });
      }

      if (finalCategory) {
        setVoiceEntryData(prev => ({ ...prev, category: finalCategory }));
        setFormState(prev => ({ ...prev, category: finalCategory }));
        setMissingFields(prev => { const u = new Set(prev); u.delete('category'); return u; });
      }

      if (data.name && data.industry) {
        setConversationStep('name');
        const hannahResp = await generateHannahResponse('Creating client profile', 'name and industry', `${data.name} in ${data.industry}`);
        await speak(hannahResp);

        if (!finalCategory) {
          const industryLabel = finalIndustry || data.industry;
          await speak(`I've got the ${industryLabel} industry. To finalize the capability mapping, what is the specific category for this client?`);
          setHighlightedField('category');
          return;
        }

        setVoiceEntryStep(1);
        setHighlightedField('email');
        setConversationStep('email');
        const nextPrompt = await generateHannahResponse('Moving to next field', 'email');
        await speak(nextPrompt);
      } else {
        const errorResponse = await generateHannahResponse('Missing information', 'name and industry');
        await speak(errorResponse);
      }
    } catch {
      const errorResponse = await generateHannahResponse('Error processing input', 'name and industry');
      await speak(errorResponse);
    }
  }, [parseWithKeywordDelimiters, speak, generateHannahResponse]);

  const startVoiceEntryMode = useCallback(() => {
    setIsVoiceEntryMode(true);
    setVoiceEntryStep(0);
    setVoiceEntryData(INITIAL_VOICE_ENTRY_DATA);
    speak("Let's create a new client. First, tell me the client name and industry.");
  }, [speak]);

  const processVoiceEntryStep = useCallback(async (transcript: string) => {
    const lowerTranscript = transcript.toLowerCase();

    if (voiceEntryStep === 2) {
      const hasMobile = voiceEntryData.mobile && voiceEntryData.mobile.trim() !== '';
      const hasWebsite = voiceEntryData.website && voiceEntryData.website.trim() !== '';

      const isNavigationKeyword = lowerTranscript.includes('next') ||
                                  lowerTranscript.includes('continue') ||
                                  lowerTranscript.includes('done') ||
                                  lowerTranscript.includes("that's it") ||
                                  lowerTranscript.includes('finished') ||
                                  lowerTranscript.includes('ready');

      if (hasMobile && hasWebsite && isNavigationKeyword) {
        setVoiceEntryStep(3);
        setHighlightedField('vibe');
        await speak('Finally, describe their business vibe or personality in a few words.');
        return;
      }
    }

    switch (voiceEntryStep) {
      case 0:
        await processNameAndIndustry(transcript);
        break;
      case 1:
        await processEmail(transcript);
        break;
      case 2:
        await processContactInfo(transcript);
        break;
      case 3:
        await processVibe(transcript);
        break;
      case 4:
        await completeVoiceEntry();
        break;
    }
  }, [voiceEntryStep, voiceEntryData, processNameAndIndustry, processEmail, processContactInfo, processVibe, completeVoiceEntry, speak]);

  // ─── Handle Create Command (Direct Voice) ────────────────────────
  const handleCreateCommand = useCallback(async (command: string) => {
    try {
      if (!resellerSlug) {
        console.error('OVG-PLATFORM-V2: Critical - No resellerSlug provided to UniversalCommandModal');
        setError('Reseller context missing. Please refresh the page and try again.');
        return;
      }

      const response = await fetch('/api/ai/create-client', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          voiceCommand: command,
          resellerSlug,
          parseOnly: true,
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to process command');

      // Atomic update: formState + draftData in sync
      const p = data.parsed;

      // Extract is_override and confidence with safe defaults
      const isOverride = typeof p.is_override === 'boolean' ? p.is_override : false;
      const confidence = typeof p.confidence === 'number' ? Math.min(1, Math.max(0, p.confidence)) : 0;

      setFormState({
        name: p.name || '',
        email: p.email || '',
        industry: p.industry || 'GENERAL BUSINESS',
        category: p.category || '',
        mobile: p.mobile || '',
        website: p.website || '',
        systemPrompt: p.systemPrompt || '',
      });

      setDraftData({
        clientName: p.name || '',
        clientEmail: p.email || '',
        industry: p.industry || 'GENERAL BUSINESS',
        category: p.category || '',
        mobile: p.mobile || '',
        website: p.website || '',
        systemPrompt: p.systemPrompt || '',
        parsedFromVoice: true,
        is_override: isOverride,
        confidence,
      });

      setStep('draft');
      const contactDetails = (p.mobile || p.website) ? ' with contact details' : '';
      await speak(`I've drafted ${p.name} as a ${p.industry} client${contactDetails}. Please review and confirm.`);
    } catch (err: unknown) {
      setError(getErrorMessage(err) || 'Failed to process command');
    }
  }, [resellerSlug, speak]);

  // ─── Handle Delete Command ───────────────────────────────────────
  const handleDeleteCommand = useCallback(async (command: string) => {
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
    } catch (_err) {
      setError(getErrorMessage(_err) || 'Could not identify client to delete. Please specify the exact client name.');
    }
  }, [resellerSlug, speak, onClose]);

  // ─── Process Command (Root Dispatcher) ───────────────────────────
  const processCommand = useCallback(async (manualTranscript?: string) => {
    const activeTranscript = manualTranscript || transcript;
    if (!activeTranscript || !activeTranscript.trim()) return;

    setIsProcessing(true);
    setError(null);

    const lowerTranscript = activeTranscript.toLowerCase();
    const isDeleteCommand = lowerTranscript.includes('delete') ||
                            lowerTranscript.includes('remove') ||
                            lowerTranscript.includes('deactivate');

    const isIdentityQuestion = lowerTranscript.includes('who are you') ||
                              lowerTranscript.includes('what is your name') ||
                              lowerTranscript.includes("what's your name");

    try {
      if (isIdentityQuestion) {
        await speak('Universal command active. Use this bar to filter your portfolio, broadcast messages, or run cross-client analytics.');
        if (!manualTranscript) setTranscript('');
        return;
      }

      if (isVoiceEntryMode) {
        await processVoiceEntryStep(activeTranscript);
      } else if (isDeleteCommand) {
        await handleDeleteCommand(activeTranscript);
      } else {
        await handleCreateCommand(activeTranscript);
      }
    } finally {
      setIsProcessing(false);
    }
  }, [transcript, isVoiceEntryMode, speak, processVoiceEntryStep, handleDeleteCommand, handleCreateCommand]);

  // ─── Review Confirm ──────────────────────────────────────────────
  const handleReviewConfirm = useCallback(() => {
    const draft: DraftData = {
      clientName: reviewData.name,
      clientEmail: reviewData.email,
      industry: reviewData.industry,
      category: reviewData.category,
      mobile: reviewData.mobile,
      website: reviewData.website,
      systemPrompt: reviewData.vibe,
      parsedFromVoice: true,
    };
    setDraftData(draft);
    setStep('confirm');
  }, [reviewData]);

  // ─── Handle Confirm (Final Submit) ───────────────────────────────
  const handleConfirm = useCallback(async () => {
    if (!draftData) return;
    setIsProcessing(true);

    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        await speak("I'm having trouble connecting to your secure vault. Please ensure you're logged in so I can save this for you.");
        setIsProcessing(false);
        return;
      }

      let resellerId = null;
      if (resellerSlug) {
        try {
          const resolvedId = await resolveResellerId(supabase, resellerSlug);

          if (!resolvedId) {
            console.error('OVG-PLATFORM-V2: Failed to resolve resellerId for slug:', resellerSlug);
            await speak("I'm having trouble verifying your reseller account. Please try again.");
            setIsProcessing(false);
            return;
          }

          resellerId = resolvedId;
        } catch {
          await speak('There was an error preparing your client data. Please try again.');
          setIsProcessing(false);
          return;
        }
      } else {
        console.error('OVG-PLATFORM-V2: No resellerSlug provided for payload enforcement');
        await speak('Reseller context is missing. Please refresh the page and try again.');
        setIsProcessing(false);
        return;
      }

      // Read all data exclusively from draftData — single source of truth
      const response = await fetch('/api/ai/create-client', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          resellerSlug,
          resellerId,
          parseOnly: false,
          clientData: {
            name: validateField(draftData.clientName) || 'Unknown Client',
            industry: normalizeIndustry(validateField(draftData.industry) || 'GENERAL BUSINESS'),
            category: validateField(draftData.category) || 'GENERAL',
            email: validateField(draftData.clientEmail),
            mobile: validateField(draftData.mobile),
            website: validateField(draftData.website),
            systemPrompt: validateField(draftData.systemPrompt),
            reseller_id: resellerId,
          },
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to create client');

      const hasContactDetails = draftData.mobile || draftData.website;
      const contactMessage = hasContactDetails ? ' with their contact information' : '';
      await speak(`${draftData.clientName} has been successfully added${contactMessage}.`);

      if (onClientCreated) onClientCreated();
      onClose();
    } catch (err: unknown) {
      setError(getErrorMessage(err) || 'Failed to create client');
    } finally {
      setIsProcessing(false);
    }
  }, [draftData, resellerSlug, speak, validateField, normalizeIndustry, onClientCreated, onClose]);

  // ─── Sync refs with latest callback values (after all callbacks are defined) ──
  useEffect(() => {
    processCommandRef.current = processCommand;
  }, [processCommand]);
  useEffect(() => {
    transcribeAudioRef.current = transcribeAudio;
  }, [transcribeAudio]);

  // =================================================================
  // RENDER
  // =================================================================
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

                  {/* Real-time Field Highlighting — reads from voiceEntryData (preview) */}
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
                      highlightedField === 'category' ? 'border-amber-400 bg-amber-400/10' : 'border-white/10'
                    }`}>
                      <div className="text-xs text-white/60">Category</div>
                      <div className="text-sm text-white">{voiceEntryData.category || '...'}</div>
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
                    <div className={`col-span-2 backdrop-blur-xl bg-white/[0.02] border rounded-lg p-2 transition-all ${
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
                  {isVoiceEntryMode ? 'UNIVERSAL (Voice Entry)' : 'UNIVERSAL'}
                </label>
                <div className={`backdrop-blur-xl bg-white/[0.02] border rounded-lg p-4 transition-all duration-300 ${
                  isListening
                    ? 'border-[#0097b2] shadow-[0_0_20px_rgba(0,151,178,0.5)]'
                    : 'border-white/10'
                }`}>
                  <div className="flex items-start gap-4">
                    <button
                      onClick={toggleListening}
                      onMouseDown={handlePTTMouseDown}
                      onMouseUp={handlePTTStop}
                      onMouseLeave={handlePTTStop}
                      className={`w-12 h-12 rounded-full flex items-center justify-center transition-all duration-300 flex-shrink-0 select-none ${
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
                  onClick={() => processCommand(transcript)}
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
                {/* Client Name Input — bound to formState.name */}
                <div className="flex justify-between items-center">
                  <span className="text-xs text-white/60 uppercase tracking-[0.1em]">Client Name</span>
                  <input
                    type="text"
                    value={formState.name}
                    onChange={(e) => setFormState(prev => ({ ...prev, name: e.target.value }))}
                    className="text-xs text-white bg-transparent border-b border-white/20 focus:border-cyan-500/50 outline-none w-48 text-right"
                  />
                </div>
                {/* Client Email Input — bound to formState.email */}
                <div className="flex justify-between items-center">
                  <span className="text-xs text-white/60 uppercase tracking-[0.1em]">Email</span>
                  <input
                    type="email"
                    value={formState.email}
                    onChange={(e) => setFormState(prev => ({ ...prev, email: e.target.value }))}
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
                    onChange={(e) => {
                      setFormState(prev => ({ ...prev, industry: e.target.value, category: '' }));
                      setCategoryError(false);
                    }}
                    className="text-xs text-white bg-black/30 border-b border-white/20 focus:border-cyan-500/50 outline-none w-48 text-right"
                  >
                    {['AUTOMOTIVE', 'RETAIL', 'HEALTHCARE', 'INSURANCE', 'AI AUTOMATION', 'GENERAL BUSINESS'].map(i => (
                      <option key={i} value={i}>{i.charAt(0) + i.slice(1).toLowerCase()}</option>
                    ))}
                  </select>
                </div>
                {/* Category Select — bound to formState.category */}
                <div className="flex justify-between items-center">
                  <span className={`text-xs uppercase tracking-[0.1em] ${categoryError ? 'text-amber-400' : 'text-white/60'}`}>Category {categoryError && '⚠ Required'}</span>
                  <select
                    value={formState.category}
                    onChange={(e) => {
                      setFormState(prev => ({ ...prev, category: e.target.value }));
                      setCategoryError(false);
                    }}
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
                    onChange={(e) => setFormState(prev => ({ ...prev, mobile: e.target.value }))}
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
                    onChange={(e) => setFormState(prev => ({ ...prev, website: e.target.value }))}
                    placeholder="https://example.com"
                    className="text-xs text-white bg-transparent border-b border-white/20 focus:border-cyan-500/50 outline-none w-48 text-right"
                  />
                </div>
                {/* System Prompt Textarea — bound to formState.systemPrompt */}
                <div className="flex flex-col gap-2">
                  <span className="text-xs text-white/60 uppercase tracking-[0.1em]">System Prompt</span>
                  <textarea
                    value={formState.systemPrompt}
                    onChange={(e) => setFormState(prev => ({ ...prev, systemPrompt: e.target.value }))}
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

          {step === 'review' && (
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
                    onChange={(e) => setReviewData({ ...reviewData, name: e.target.value })}
                    className="text-xs text-white bg-transparent border-b border-white/20 focus:border-cyan-500/50 outline-none w-48 text-right"
                  />
                </div>
                {/* Industry Select */}
                <div className="flex justify-between items-center">
                  <span className="text-xs text-white/60 uppercase tracking-[0.1em]">Industry</span>
                  <select
                    value={reviewData.industry}
                    onChange={(e) => setReviewData({ ...reviewData, industry: e.target.value, category: '' })}
                    className="text-xs text-white bg-black/30 border-b border-white/20 focus:border-cyan-500/50 outline-none w-48 text-right"
                  >
                    {['AUTOMOTIVE', 'RETAIL', 'HEALTHCARE', 'INSURANCE', 'AI AUTOMATION', 'GENERAL BUSINESS'].map(i => (
                      <option key={i} value={i}>{i.charAt(0) + i.slice(1).toLowerCase()}</option>
                    ))}
                  </select>
                </div>
                {/* Category Select */}
                <div className="flex justify-between items-center">
                  <span className={`text-xs uppercase tracking-[0.1em] ${!reviewData.category ? 'text-amber-400' : 'text-white/60'}`}>Category {!reviewData.category && '⚠'}</span>
                  <select
                    value={reviewData.category}
                    onChange={(e) => setReviewData({ ...reviewData, category: e.target.value })}
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
                    onChange={(e) => setReviewData({ ...reviewData, email: e.target.value })}
                    className="text-xs text-white bg-transparent border-b border-white/20 focus:border-cyan-500/50 outline-none w-48 text-right"
                  />
                </div>
                {/* Mobile Number Input */}
                <div className="flex justify-between items-center">
                  <span className="text-xs text-white/60 uppercase tracking-[0.1em]">Mobile</span>
                  <input
                    type="tel"
                    value={reviewData.mobile}
                    onChange={(e) => setReviewData({ ...reviewData, mobile: e.target.value })}
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
                    onChange={(e) => setReviewData({ ...reviewData, website: e.target.value })}
                    placeholder="https://example.com"
                    className="text-xs text-white bg-transparent border-b border-white/20 focus:border-cyan-500/50 outline-none w-48 text-right"
                  />
                </div>
                {/* Vibe Input */}
                <div className="flex flex-col gap-2">
                  <span className="text-xs text-white/60 uppercase tracking-[0.1em]">Vibe / Personality</span>
                  <textarea
                    value={reviewData.vibe}
                    onChange={(e) => setReviewData({ ...reviewData, vibe: e.target.value })}
                    placeholder="Describe the client's vibe (e.g., 'innovative tech startup')"
                    rows={2}
                    className="text-xs text-white bg-black/30 border border-white/20 focus:border-cyan-500/50 outline-none rounded p-2 resize-none"
                  />
                </div>
              </div>

              <div className="flex justify-between">
                <button
                  onClick={() => {
                    setStep('command');
                    setTranscript('');
                  }}
                  className="px-6 py-2 text-xs font-light tracking-[0.2em] text-white/60 uppercase hover:text-white transition-colors"
                >
                  Start Over
                </button>
                <button onClick={handleReviewConfirm} className="px-6 py-2 text-xs font-light tracking-[0.2em] bg-cyan-500/20 border border-cyan-500/30 rounded-lg text-cyan-300 uppercase hover:bg-cyan-500/30 transition-all">
                  Confirm & Save
                </button>
              </div>
            </div>
          )}

          {step === 'confirm' && draftData && (
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