'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { mapVisualStyleToPersona } from '@/lib/voice-visual-harmony';
import { createClient } from '@/lib/supabase/client';
import { resolveResellerId } from '@/lib/supabase/resolve-reseller-id';
import { normalizeIndustry } from '@/lib/utils/normalize-industry';
import { VoiceStepMachine } from './client-creation/VoiceStepMachine';
import { ManualClientForm } from './client-creation/ManualClientForm';
import { ReviewSubmitStep } from './client-creation/ReviewSubmitStep';
import { INITIAL_FORM_STATE, INITIAL_VOICE_ENTRY_DATA, STEP_VOICE_PROMPTS, getMissingRequiredFields, getRepromptMessage } from './client-creation/constants';
import { classifyVibeInput, MIN_VIBE_LENGTH } from './client-creation/vibe-gating';
import type { DraftData, FormState, ReviewData, VoiceEntryData, VoiceEntryStep, VoiceStepOutcome } from './client-creation/types';

function triggerHapticFeedback(): void {
  if (typeof navigator !== "undefined" && navigator.vibrate) {
    navigator.vibrate(30);
  }
}

type Step = 'command' | 'draft' | 'review' | 'confirm';

/** Grace period after the last TTS playback ends before STT re-arms. */
const STT_UNLOCK_DEBOUNCE_MS = 500;

interface UniversalCommandModalProps {
  onClose: () => void;
  resellerSlug?: string;
  onClientCreated?: () => void;
  modalTitle?: string;
  voiceEntryLabel?: string;
  voice?: string;
  tenantId?: string;
}

export function UniversalCommandModal({ onClose, resellerSlug, onClientCreated, modalTitle = 'Universal Command', voiceEntryLabel = 'UNIVERSAL', voice = 'hannah', tenantId }: UniversalCommandModalProps) {
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
  const [isSubmitting, setIsSubmitting] = useState(false);

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

  // ─── STT Gate (prevents prompt/tail-speech bleed across steps) ─────
  // While the active step's TTS prompt is playing — plus a short debounce
  // after it ends — incoming STT results are discarded so prompt echo and
  // tail speech from the previous step cannot satisfy the new step.
  const sttLockRef = useRef(false);
  const sttUnlockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeSpeechCountRef = useRef(0);

  // ─── Industry normalization via shared helper ─────────────────────
  // Single source of truth: @/lib/utils/normalize-industry (also used by
  // /api/ai/create-client and /api/reseller/tenants/create), guaranteeing
  // the modal, both routes, and the industry_check constraint agree.

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

  // ─── Sanitize Extracted Voice Values ─────────────────────────────────
  // Strips trailing periods, extra quotes, and outer whitespace from extracted strings
  const sanitizeValue = useCallback((val: string | null | undefined): string => {
    if (!val) return '';
    return val
      .replace(/[.#]+$/, '') // strip trailing periods/hashes
      .replace(/^["']+|["']+$/g, '') // strip outer quotes
      .trim();
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
      if (sttUnlockTimerRef.current) {
        clearTimeout(sttUnlockTimerRef.current);
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

  // ─── STT Lock / Debounced Unlock ──────────────────────────────────
  // Engage the STT gate (cancels any pending unlock).
  const lockStt = useCallback(() => {
    if (sttUnlockTimerRef.current) {
      clearTimeout(sttUnlockTimerRef.current);
      sttUnlockTimerRef.current = null;
    }
    sttLockRef.current = true;
  }, []);

  // Release only once the LAST in-flight TTS playback settles, after a
  // debounce so speech overlapping the tail of the prompt is discarded too.
  const releaseSttLock = useCallback(() => {
    activeSpeechCountRef.current = Math.max(0, activeSpeechCountRef.current - 1);
    if (activeSpeechCountRef.current > 0) return;
    if (sttUnlockTimerRef.current) clearTimeout(sttUnlockTimerRef.current);
    sttUnlockTimerRef.current = setTimeout(() => {
      sttLockRef.current = false;
      sttUnlockTimerRef.current = null;
    }, STT_UNLOCK_DEBOUNCE_MS);
  }, []);

  // ─── TTS ─────────────────────────────────────────────────────────
  const speak = useCallback(async (text: string, metadata?: { resellerSlug?: string }) => {
    // Hold STT for the full duration of this playback (echo/tail guard).
    lockStt();
    activeSpeechCountRef.current += 1;
    try {
      setIsSpeaking(true);
      const ttsMetadata = { ...metadata, resellerSlug };

      const response = await fetch('/api/ai/speech', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice: voice || 'hannah', model: 'orpheus-english', resellerSlug, tenantId, metadata: ttsMetadata }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({ error: response.statusText }));
        console.error('TTS API error detail:', response.status, errData);
        throw new Error(`TTS failed (${response.status}): ${errData.error || response.statusText}`);
      }

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
      releaseSttLock();
    }
  }, [resellerSlug, voice, tenantId, lockStt, releaseSttLock]);

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
    triggerHapticFeedback();
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
    // STT gate: this audio was captured while the active step's TTS prompt
    // was playing (or during the post-prompt debounce) — it is prompt echo /
    // tail speech and must not be dispatched to the new step.
    if (sttLockRef.current) {
      setTranscript('');
      return;
    }
    try {
      setIsProcessing(true);
      const formData = new FormData();
      formData.append('file', new File([audioBlob], 'command.webm', { type: 'audio/webm' }));
      if (tenantId) formData.append('tenantId', tenantId);
      if (resellerSlug) formData.append('resellerSlug', resellerSlug);

      const response = await fetch('/api/ai/stt', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) throw new Error('STT failed');
      const { text } = await response.json();
      console.log('[UniversalCommandModal] Transcribed speech:', text);
      setTranscript(text);
      setIsVoiceEntryMode(true);
      await processCommandRef.current(text);
    } catch {
      setError('Transcription failed — please try again');
    } finally {
      setIsProcessing(false);
    }
  }, [resellerSlug, tenantId]);

  // ─── Multi-Step Voice Entry ──────────────────────────────────────
  const completeVoiceEntry = useCallback(async () => {
    setTranscript(''); // flush the utterance that completed step 4
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

  const processCategoryAndMobile = useCallback(async (transcript: string): Promise<VoiceStepOutcome> => {
    setHighlightedField('category');

    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();

    if (!session || !session.user) {
      await speak("I'm having trouble connecting to your secure vault. Please ensure you're logged in so I can save this for you.");
      document.body.classList.add('heartbeat-error');
      setTimeout(() => document.body.classList.remove('heartbeat-error'), 3000);
      return { captured: {} };
    }

    const parsed = parseWithKeywordDelimiters(transcript);
    const captured: Partial<VoiceEntryData> = {};

    if (parsed.category?.trim()) {
      const sanitizedCat = sanitizeValue(parsed.category.trim().toUpperCase());
      if (sanitizedCat) {
        setVoiceEntryData(prev => ({ ...prev, category: sanitizedCat }));
        setFormState(prev => ({ ...prev, category: sanitizedCat }));
        setMissingFields(prev => { const u = new Set(prev); u.delete('category'); return u; });
        captured.category = sanitizedCat;
      }
    }

    const phoneRegex = /(\+?1[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})/g;
    const phones = transcript.match(phoneRegex);
    if (phones && phones.length > 0) {
      const phone = phones[0] || '';
      setVoiceEntryData(prev => ({ ...prev, mobile: phone }));
      setFormState(prev => ({ ...prev, mobile: phone }));
      setMissingFields(prev => { const u = new Set(prev); u.delete('mobile'); return u; });
      captured.mobile = phone;
    }

    if (!captured.mobile) {
      const standaloneRegex = /\b(\d{7,10})\b/g;
      const standalone = transcript.match(standaloneRegex);
      if (standalone && standalone.length > 0) {
        const phone = standalone[0];
        setVoiceEntryData(prev => ({ ...prev, mobile: phone }));
        setFormState(prev => ({ ...prev, mobile: phone }));
        setMissingFields(prev => { const u = new Set(prev); u.delete('mobile'); return u; });
        captured.mobile = phone;
      }
    }

    if (Object.keys(captured).length === 0) {
      await speak("I didn't catch a category or mobile number. Can you provide at least one?");
      setHighlightedField('category');
      return { captured: {} };
    }

    await speak(captured.category && captured.mobile
      ? "Got the category and mobile number."
      : captured.category
        ? "Got the category."
        : "Got the mobile number.");

    return { captured };
  }, [parseWithKeywordDelimiters, speak, sanitizeValue]);

  const processWebsite = useCallback(async (transcript: string): Promise<VoiceStepOutcome> => {
    setHighlightedField('website');

    const cleanTranscript = transcript.toLowerCase();
    const fuzzyUrlRegex = /\b[a-z0-9.-]+\.[a-z]{2,}\b/gi;
    const standardUrlRegex = /https?:\/\/[^\s]+/gi;
    const normalizedTranscript = cleanTranscript.replace(/\s+dot\s+com/gi, '.com').replace(/\s+dot\s+/gi, '.');

    let urls = transcript.match(standardUrlRegex);
    if (!urls || urls.length === 0) {
      urls = normalizedTranscript.match(fuzzyUrlRegex);
    }

    let extractedWebsite: string | null = null;
    if (urls && urls.length > 0) {
      const website = urls[0] || '';
      extractedWebsite = sanitizeWebsiteUrl(website);
    }

    const lowerTranscript = transcript.toLowerCase();
    const isSkipCommand = lowerTranscript.includes('skip') ||
                          lowerTranscript.includes('none') ||
                          lowerTranscript.includes('next');

    if (!extractedWebsite && !isSkipCommand) {
      console.warn('[UniversalCommandModal] No valid website domain found in transcript:', transcript);
      await speak("I couldn't find a valid website address. Please state their website or say skip.");
      return { captured: {} };
    }

    if (extractedWebsite) {
      setVoiceEntryData(prev => ({ ...prev, website: extractedWebsite }));
      setFormState(prev => ({ ...prev, website: extractedWebsite }));
      setMissingFields(prev => { const u = new Set(prev); u.delete('website'); return u; });
      await speak("Got the website URL.");
      return { captured: { website: extractedWebsite } };
    }

    // Explicit skip/none/next is a product-rule confirmation for this step;
    // the dispatcher treats `confirmed` as satisfying STEP_REQUIREMENTS.
    await speak("Skipping website. Moving to next step.");
    return { captured: {}, confirmed: true };
  }, [speak, sanitizeWebsiteUrl]);

  const processVibe = useCallback(async (transcript: string): Promise<VoiceStepOutcome> => {
    setHighlightedField('vibe');

    if (!transcript.trim()) {
      await speak(getRepromptMessage(['vibe']));
      return { captured: {} };
    }

    // Gating: tail/unrelated speech must NOT satisfy STEP_REQUIREMENTS[4].
    const kind = classifyVibeInput(transcript);

    if (kind === 'skip') {
      // Deliberate skip signal is a product-rule confirmation (mirrors the
      // website step); the dispatcher treats it as satisfying the step.
      await speak('Skipping vibe. Let me finalize the profile.');
      return { captured: {}, confirmed: true };
    }

    if (kind === 'bleed') {
      // Another step's answer / prompt tail — never captured as the vibe.
      await speak("That sounds like another detail. Describe the client's business vibe, or say skip.");
      return { captured: {} };
    }

    if (kind === 'filler') {
      // Hesitation or bare acknowledgement — ask for a deliberate vibe.
      await speak(getRepromptMessage(['vibe']));
      return { captured: {} };
    }

    const sanitizedVibe = sanitizeValue(transcript);
    if (sanitizedVibe.length < MIN_VIBE_LENGTH) {
      // Empty/too-short vibe - clarify and stay on the step. Profile completion
      // is gated in processVoiceEntryStep once requirements are confirmed.
      await speak(getRepromptMessage(['vibe']));
      return { captured: {} };
    }

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
      setVoiceEntryData(prev => ({ ...prev, vibe: sanitizedVibe }));
      setFormState(prev => ({ ...prev, systemPrompt: sanitizedVibe }));

      setMissingFields(prev => {
        const updated = new Set(prev);
        updated.delete('vibe');
        return updated;
      });

      await speak(`Perfect! I've detected a ${personaTone} personality for this ${voiceEntryData.industry.toLowerCase()} business.`);
      return { captured: { vibe: sanitizedVibe } };
    } catch {
      // Persona mapping failed - keep the captured vibe (draft state intact)
      // and let the dispatcher finalize the profile.
      setVoiceEntryData(prev => ({ ...prev, vibe: sanitizedVibe }));
      setFormState(prev => ({ ...prev, systemPrompt: sanitizedVibe }));
      await speak('Got it. Let me finalize the profile.');
      return { captured: { vibe: sanitizedVibe } };
    }
  }, [voiceEntryData, speak, sanitizeValue]);

  const processEmail = useCallback(async (transcript: string): Promise<VoiceStepOutcome> => {
    setHighlightedField('email');

    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();

    if (!session || !session.user) {
      await speak("I'm having trouble connecting to your secure vault. Please ensure you're logged in so I can save this for you.");
      document.body.classList.add('heartbeat-error');
      setTimeout(() => document.body.classList.remove('heartbeat-error'), 3000);
      return { captured: {} };
    }

    const cleanEmail = transcript.toLowerCase()
      .replace(/\s+at\s+/g, '@')
      .replace(/\s+dot\s+/g, '.')
      .replace(/\s+/g, '');

    const emailRegex = /\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/g;
    const emails = cleanEmail.match(emailRegex);
    const finalEmail = emails && emails.length > 0 ? sanitizeEmail(emails[0]) : null;

    if (finalEmail) {
      setVoiceEntryData(prev => ({ ...prev, email: finalEmail }));
      setFormState(prev => ({ ...prev, email: finalEmail }));

      setMissingFields(prev => {
        const updated = new Set(prev);
        updated.delete('email');
        return updated;
      });

      const response = await generateHannahResponse('Email captured', 'email', finalEmail);
      await speak(response);
      return { captured: { email: finalEmail } };
    }

    // No valid email captured - voice the clarification and let the user
    // speak again (step advancement is owned by processVoiceEntryStep).
    const errorResponse = await generateHannahResponse('Missing information', 'email');
    await speak(errorResponse);
    return { captured: {} };
  }, [speak, sanitizeEmail, generateHannahResponse]);

  const processNameAndIndustry = useCallback(async (transcript: string): Promise<VoiceStepOutcome> => {
    setHighlightedField('name');

    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();

    if (!session || !session.user) {
      await speak("I'm having trouble connecting to your secure vault. Please ensure you're logged in so I can save this for you.");
      document.body.classList.add('heartbeat-error');
      setTimeout(() => document.body.classList.remove('heartbeat-error'), 3000);
      return { captured: {} };
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

      const sanitizedName = sanitizeValue(data.name);
      const sanitizedIndustry = sanitizeValue(data.industry);
      const sanitizedCategory = sanitizeValue(data.category?.toUpperCase());
      const _sanitizedEmail = sanitizeValue(data.email);
      const _sanitizedMobile = sanitizeValue(data.mobile);
      const _sanitizedWebsite = sanitizeValue(data.website);
      const _sanitizedVibe = sanitizeValue(data.vibe);

      const finalName = parserFoundDelimiters
        ? (parsed.name?.replace(/^[\s,]+/, '').trim() || sanitizedName)
        : sanitizedName;

      const finalIndustry = (parserFoundDelimiters && parsed.industry?.trim())
        ? parsed.industry.trim()
        : sanitizedIndustry;

      const finalCategory = (parserFoundDelimiters && parsed.category?.trim())
        ? parsed.category.trim().toUpperCase()
        : sanitizedCategory;

      const captured: Partial<VoiceEntryData> = {};

      if (finalName) {
        setVoiceEntryData(prev => ({ ...prev, name: finalName }));
        setFormState(prev => ({ ...prev, name: finalName }));
        setMissingFields(prev => { const u = new Set(prev); u.delete('name'); return u; });
        captured.name = finalName;
      }

      if (finalIndustry) {
        setVoiceEntryData(prev => ({ ...prev, industry: finalIndustry }));
        setFormState(prev => ({ ...prev, industry: finalIndustry.toUpperCase() }));
        setMissingFields(prev => { const u = new Set(prev); u.delete('industry'); return u; });
        captured.industry = finalIndustry;
      }

      if (finalCategory) {
        setVoiceEntryData(prev => ({ ...prev, category: finalCategory }));
        setFormState(prev => ({ ...prev, category: finalCategory }));
        setMissingFields(prev => { const u = new Set(prev); u.delete('category'); return u; });
        captured.category = finalCategory;
      }

      // Clarify when this attempt captured nothing - merged with prior draft
      // state so the prompt names the correct outstanding field.
      if (Object.keys(captured).length === 0) {
        const gaps: (keyof VoiceEntryData)[] = [];
        if (!finalName && !voiceEntryData.name) gaps.push('name');
        if (!finalIndustry && !voiceEntryData.industry) gaps.push('industry');
        if (gaps.length > 0) {
          setHighlightedField(gaps[0]);
          await speak(getRepromptMessage(gaps));
        }
      }

      return { captured };
    } catch {
      const errorResponse = await generateHannahResponse('Error processing input', 'name and industry');
      await speak(errorResponse);
      return { captured: {} };
    }
  }, [parseWithKeywordDelimiters, speak, generateHannahResponse, sanitizeValue, voiceEntryData]);

  const startVoiceEntryMode = useCallback(() => {
    setTranscript(''); // start with a clean transcript buffer
    setIsVoiceEntryMode(true);
    setVoiceEntryStep(0);
    setVoiceEntryData(INITIAL_VOICE_ENTRY_DATA);
    speak("Let's create a new client. First, tell me the client name and industry.");
  }, [speak]);

  /**
   * Voice step dispatcher - the SINGLE owner of step advancement.
   *
   * Gating contract:
   *  1. Run the extractor for the active step; it captures fields, persists
   *     them, and voices its own clarification when it captures nothing.
   *  2. Merge prior draft state with this attempt's captures.
   *  3. Advance ONLY when all STEP_REQUIREMENTS for the active step are
   *     satisfied (or the extractor confirmed the step via a product rule
   *     such as an explicit website or vibe 'skip').
   *  4. Otherwise keep voiceEntryStep unchanged so the user can speak again -
   *     existing draft state is never rolled back or corrupted.
   */
  const processVoiceEntryStep = useCallback(async (transcript: string): Promise<void> => {
    const prior = voiceEntryData;
    const activeStep = voiceEntryStep;

    let outcome: VoiceStepOutcome;
    switch (activeStep) {
      case 0:
        outcome = await processNameAndIndustry(transcript);
        break;
      case 1:
        outcome = await processEmail(transcript);
        break;
      case 2:
        outcome = await processCategoryAndMobile(transcript);
        break;
      case 3:
        outcome = await processWebsite(transcript);
        break;
      case 4:
        outcome = await processVibe(transcript);
        break;
    }

    const merged: VoiceEntryData = { ...prior, ...outcome.captured };
    const missing = outcome.confirmed ? [] : getMissingRequiredFields(activeStep, merged);

    if (missing.length > 0) {
      // Failed or partial extraction -> STAY on activeStep. When the extractor
      // captured nothing it has already voiced its clarification; when it made
      // partial progress, voice the specific outstanding field here.
      if (Object.keys(outcome.captured).length > 0) {
        setHighlightedField(missing[0]);
        await speak(getRepromptMessage(missing));
      }
      return;
    }

    // Requirements confirmed for this step.
    if (activeStep === 4) {
      await completeVoiceEntry();
      return;
    }

    // Step transition: flush the transcript buffer and engage the STT gate so
    // the utterance that satisfied this step — and any tail speech captured
    // while the next step's TTS prompt plays — cannot bleed into the new step.
    setTranscript('');
    lockStt();
    setVoiceEntryStep((activeStep + 1) as VoiceEntryStep);
  }, [voiceEntryStep, voiceEntryData, processNameAndIndustry, processEmail, processCategoryAndMobile, processWebsite, processVibe, speak, completeVoiceEntry, lockStt]);

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

      // Sanitize all parsed values
      const sanitizedName = sanitizeValue(p.name);
      const sanitizedEmail = sanitizeValue(p.email);
      const sanitizedIndustry = sanitizeValue(p.industry);
      const sanitizedCategory = sanitizeValue(p.category);
      const sanitizedMobile = sanitizeValue(p.mobile);
      const sanitizedWebsite = sanitizeValue(p.website);
      const sanitizedSystemPrompt = sanitizeValue(p.systemPrompt);

      setFormState({
        name: sanitizedName,
        email: sanitizedEmail,
        industry: sanitizedIndustry || 'GENERAL BUSINESS',
        category: sanitizedCategory,
        mobile: sanitizedMobile,
        website: sanitizedWebsite,
        systemPrompt: sanitizedSystemPrompt,
      });

      setDraftData({
        clientName: sanitizedName,
        clientEmail: sanitizedEmail,
        industry: sanitizedIndustry || 'GENERAL BUSINESS',
        category: sanitizedCategory,
        mobile: sanitizedMobile,
        website: sanitizedWebsite,
        systemPrompt: sanitizedSystemPrompt,
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
  }, [resellerSlug, speak, sanitizeValue]);

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

    console.log('[UniversalCommandModal] Active step & mode:', { step, voiceEntryStep, mode: isVoiceEntryMode ? 'voice-entry' : 'command', transcript: activeTranscript });

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
  }, [transcript, isVoiceEntryMode, step, voiceEntryStep, speak, processVoiceEntryStep, handleDeleteCommand, handleCreateCommand]);

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
    if (!draftData || isSubmitting) return;
    setIsSubmitting(true);
    setIsProcessing(true);

    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        await speak("I'm having trouble connecting to your secure vault. Please ensure you're logged in so I can save this for you.");
        return;
      }

      let resellerId = null;
      if (resellerSlug) {
        try {
          const resolvedId = await resolveResellerId(supabase, resellerSlug);

          if (!resolvedId) {
            console.error('OVG-PLATFORM-V2: Failed to resolve resellerId for slug:', resellerSlug);
            await speak("I'm having trouble verifying your reseller account. Please try again.");
            return;
          }

          resellerId = resolvedId;
        } catch {
          await speak('There was an error preparing your client data. Please try again.');
          return;
        }
      } else {
        console.error('OVG-PLATFORM-V2: No resellerSlug provided for payload enforcement');
        await speak('Reseller context is missing. Please refresh the page and try again.');
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
      setIsSubmitting(false);
    }
  }, [draftData, isSubmitting, resellerSlug, speak, validateField, onClientCreated, onClose]);

  // ─── Sub-Component Handlers (orchestration for extracted views) ──
  const handleFormChange = useCallback((patch: Partial<FormState>) => {
    setFormState(prev => ({ ...prev, ...patch }));
  }, []);

  const handleIndustryChange = useCallback((industry: string) => {
    setFormState(prev => ({ ...prev, industry, category: '' }));
    setCategoryError(false);
  }, []);

  const handleCategoryChange = useCallback((category: string) => {
    setFormState(prev => ({ ...prev, category }));
    setCategoryError(false);
  }, []);

  const handleEditCommand = useCallback(() => {
    setStep('command');
    setTranscript('');
  }, []);

  const handleProceedToConfirm = useCallback(() => {
    setStep('confirm');
  }, []);

  const handleBackToDraft = useCallback(() => {
    setStep('draft');
  }, []);

  const handleReviewChange = useCallback((patch: Partial<ReviewData>) => {
    setReviewData(prev => ({ ...prev, ...patch }));
  }, []);

  const handleProcessCommandClick = useCallback(() => {
    void processCommand(transcript);
  }, [processCommand, transcript]);

  // ─── Auto-Read Step Prompts on Voice Step Transition ──
  useEffect(() => {
    if (!isVoiceEntryMode) return;
    // Step 0's opening prompt is spoken by startVoiceEntryMode; every
    // subsequent transition (including step 4 / vibe) must prompt here so
    // the user gets a deliberate ask before any utterance is accepted.
    if (voiceEntryStep === 0) return;
    const timer = setTimeout(() => speak(STEP_VOICE_PROMPTS[voiceEntryStep]), 0);
    return () => clearTimeout(timer);
  }, [voiceEntryStep, isVoiceEntryMode, speak]);

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
            {modalTitle}
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
            <VoiceStepMachine
              voiceEntryLabel={voiceEntryLabel}
              isVoiceEntryMode={isVoiceEntryMode}
              voiceEntryStep={voiceEntryStep}
              voiceEntryData={voiceEntryData}
              highlightedField={highlightedField}
              voicePersonaTone={voicePersonaTone}
              isListening={isListening}
              isProcessing={isProcessing}
              isSpeaking={isSpeaking}
              transcript={transcript}
              error={error}
              onToggleListening={toggleListening}
              onPTTStart={handlePTTMouseDown}
              onPTTStop={handlePTTStop}
              onStartVoiceEntry={startVoiceEntryMode}
              onProcessCommand={handleProcessCommandClick}
            />
          )}

          {step === 'draft' && draftData && (
            <ManualClientForm
              formState={formState}
              draftData={draftData}
              categoryError={categoryError}
              onFormChange={handleFormChange}
              onIndustryChange={handleIndustryChange}
              onCategoryChange={handleCategoryChange}
              onEditCommand={handleEditCommand}
              onProceedToConfirm={handleProceedToConfirm}
            />
          )}

          {step === 'review' && (
            <ReviewSubmitStep
              mode="review"
              reviewData={reviewData}
              onReviewChange={handleReviewChange}
              onStartOver={handleEditCommand}
              onConfirmAndSave={handleReviewConfirm}
            />
          )}

          {step === 'confirm' && draftData && (
            <ReviewSubmitStep
              mode="confirm"
              draftData={draftData}
              isSubmitting={isSubmitting}
              isSpeaking={isSpeaking}
              onBack={handleBackToDraft}
              onSubmit={handleConfirm}
            />
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