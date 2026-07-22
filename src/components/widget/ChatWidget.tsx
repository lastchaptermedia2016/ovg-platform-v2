"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  MessageCircle, X, Send, Mic, MicOff, RefreshCw, Volume2, VolumeX, ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useVoiceCommand } from "@/hooks/use-voice-command";
import { generateBrandingCSS } from "@/lib/branding/css-generator";
import { cornerStyle } from "@/lib/branding/widget-position";
import type { CanonicalBranding, CanonicalFeatures, SuggestedAction } from "@/lib/schemas/tenant-config.canonical";
import { getSpeechRecognition, type SpeechRecognitionInstance, type SpeechRecognitionResultEvent } from "@/types/voice-parser";
import "./widget.css";

interface WidgetConfig {
  logo?: string;
  logoUrl?: string;
  brandName?: string;
  primaryColor?: string;
  aiName?: string;
  greeting?: string;
  peekText?: string;
  syncBadgeText?: string;
  businessContext?: string;
  ownerName?: string;
  phone?: string;
  whatsappMessageTemplate?: string;
  allowedDomains?: string[];
  headerImage?: string;
}

const defaultConfig: WidgetConfig = {
  logo: "/images/omnivergeglobal.svg",
  brandName: "Omniverge Global",
  primaryColor: "#0097b2",
  aiName: "Assistant",
  greeting: "Hi there! I'm OVG, the AI concierge for Omniverge Global. We help businesses like yours grow smarter using strategic marketing and AI. What brings you to our site today?",
  peekText: "Ready to see the future of AI-powered business?",
  syncBadgeText: "VIP BOOKING SECURED • SYNCED TO SANCTUARY",
  phone: "27760330046",
  whatsappMessageTemplate: "Hello {title} {lastName}, your bespoke {treatment} ({price}) at {brandName} is confirmed for {time}. We have your {refreshment} ready for your arrival. See you in the sanctuary!",
};

interface WidgetMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  timestamp: number;
  action?: {
    type: 'APPLY_BRANDING_THEME';
    payload: Record<string, unknown>;
  };
}

interface ChatWidgetProps {
  tenantId: string;
  branding?: CanonicalBranding | null;
  widgetPosition?: CanonicalBranding['widgetPosition'];
  /**
   * Dynamic quick-action pills rendered above the chat input while the
   * conversation is empty. Sourced from tenants.widget_config.suggestedActions.
   */
  suggestedActions?: SuggestedAction[];
  /**
   * Tenant-configured greeting shown when the widget first opens or when the
   * conversation is reset. Falls back to the built-in default when empty.
   */
  greeting?: string;
  /**
   * Studio preview mode. Renders the chat window as a contained, always-open
   * surface (no consent gate, no floating bubble), suppresses realtime
   * presence/voice channels, and seeds a static sample conversation so the
   * canvas reflects branding without any network or WebSocket traffic.
   */
  preview?: boolean;
  /**
   * Live, unsaved Studio overrides surfaced to the test-drive preview so the
   * AI answers with the current, on-screen brand/vibe. Consumed only in preview.
   */
  liveDraft?: {
    brandName?: string;
    personaMode?: string;
    systemPrompt?: string;
  };
  /**
   * When false, the microphone button is hidden from the widget footer. This
   * mirrors the reseller-controlled `features.voiceFeaturesEnabled` flag so a
   * client's chat widget can ship without voice input.
   */
  voiceFeaturesEnabled?: boolean;
  /**
   * Feature flags controlling widget capabilities. Sourced from
   * tenants.widget_config.features.
   */
  features?: Partial<CanonicalFeatures>;
}

const ChatWidget = ({
  tenantId,
  branding,
  widgetPosition,
  preview = false,
  liveDraft,
  voiceFeaturesEnabled = true,
  suggestedActions = [],
  greeting,
  features,
}: ChatWidgetProps) => {
  const effectiveVoiceFeaturesEnabled = features?.voiceFeaturesEnabled ?? voiceFeaturesEnabled;
  const [config] = useState<WidgetConfig>(defaultConfig);
  const [isOpen, setIsOpen] = useState(false);
  const [showConsent, setShowConsent] = useState(false);
  const [hasConsent, setHasConsent] = useState(() => {
    if (preview) return true;
    try {
      return typeof window !== 'undefined' && localStorage.getItem("ovgweb_ai_consent") === "true";
    } catch {
      return false;
    }
  });
  const [showPeek, setShowPeek] = useState(false);
  const [showSyncBadge, setShowSyncBadge] = useState(false);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(() => {
    if (preview) return true;
    try {
      return typeof window !== 'undefined' && localStorage.getItem("ovgweb_voice_mute") !== "true";
    } catch {
      return true;
    }
  });
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [mounted, setMounted] = useState(false);

  // ── Cognitive Memory (relational recognition) state ─────────────
  // Fetched from the client-safe /api/client/memories endpoint so the widget
  // can surface a subtle "Recognized User" pill when the concierge has prior
  // relational memory (client_name / company_name / preferences) about the
  // visitor. Never blocks the chat; degrades silently to no indicator.
  const [clientMemories, setClientMemories] = useState<Record<string, string>>({});
  const [hasClientMemory, setHasClientMemory] = useState(false);

  // ── Preview test-drive voice state (only used when `preview` is true) ──
  const previewRecognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const [previewRecording, setPreviewRecording] = useState(false);
  const [previewInterim, setPreviewInterim] = useState("");

  const greetedRef = useRef(false);
  const chatHistoryKey = `ovgweb_chat_messages_${tenantId}`;
  const previewRef = useRef(preview);

  const [messages, setMessages] = useState<WidgetMessage[]>(() => {
    const effectiveGreeting = greeting ?? defaultConfig.greeting ?? "";
    if (preview) {
      const now = Date.now();
      return [
        { id: "preview-1", role: "assistant", text: effectiveGreeting, timestamp: now },
        { id: "preview-2", role: "user", text: "Can you tell me about your services?", timestamp: now + 1 },
        { id: "preview-3", role: "assistant", text: "Absolutely — we tailor AI-powered solutions to help your business grow smarter. What are you working on?", timestamp: now + 2 },
      ];
    }
    if (typeof window === 'undefined') {
      const initialGreeting: WidgetMessage = {
        id: Date.now().toString(),
        role: "assistant",
        text: effectiveGreeting,
        timestamp: Date.now(),
      };
      return [initialGreeting];
    }
    try {
      const saved = JSON.parse(localStorage.getItem(chatHistoryKey) || "[]");
      if (saved.length === 0) {
        const initialGreeting: WidgetMessage = {
          id: Date.now().toString(),
          role: "assistant",
          text: effectiveGreeting,
          timestamp: Date.now(),
        };
        localStorage.setItem(chatHistoryKey, JSON.stringify([initialGreeting]));
        return [initialGreeting];
      }
      return saved as WidgetMessage[];
    } catch {
      const initialGreeting: WidgetMessage = {
        id: Date.now().toString(),
        role: "assistant",
        text: effectiveGreeting,
        timestamp: Date.now(),
      };
      localStorage.setItem(chatHistoryKey, JSON.stringify([initialGreeting]));
      return [initialGreeting];
    }
  });

  const handleVoiceTranscript = useCallback((text: string) => {
    if (!text.trim()) return;
    const userMsg: WidgetMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      text: text.trim(),
      timestamp: Date.now(),
    };
    setMessages((prev) => {
      const next = [...prev, userMsg];
      localStorage.setItem(chatHistoryKey, JSON.stringify(next));
      return next;
    });
  }, [chatHistoryKey]);

  const handleVoiceAIResponse = useCallback((text: string) => {
    if (!text.trim()) return;
    const aiMsg: WidgetMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      text: text.trim(),
      timestamp: Date.now(),
    };
    setMessages((prev) => {
      const next = [...prev, aiMsg];
      localStorage.setItem(chatHistoryKey, JSON.stringify(next));
      return next;
    });
    setIsTyping(false);
  }, [chatHistoryKey]);

  const handleVoiceError = useCallback((errorMsg: string) => {
    console.error('[ChatWidget] Voice error:', errorMsg);
    setIsTyping(false);
  }, []);

  const {
    isRecording,
    startListening,
    stopListeningAndProcess,
    interimTranscript,
    transcript,
  } = useVoiceCommand({
    tenantContext: { tenantId: preview ? "" : tenantId },
    onTranscript: handleVoiceTranscript,
    onAIResponse: handleVoiceAIResponse,
    onError: handleVoiceError,
  });

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const openWhatsApp = useCallback((phone: string, message: string) => {
    const cleanPhone = phone.replace(/\D/g, "");
    const url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
    window.open(url, "_blank");
  }, []);

  const resetChat = useCallback(() => {
    const effectiveGreeting = greeting ?? defaultConfig.greeting ?? "";
    const initialGreeting: WidgetMessage = {
      id: Date.now().toString(),
      role: "assistant",
      text: effectiveGreeting,
      timestamp: Date.now(),
    };
    setMessages([initialGreeting]);
    localStorage.setItem(chatHistoryKey, JSON.stringify([initialGreeting]));
    setShowResetConfirm(false);
  }, [greeting, chatHistoryKey]);

  const handleAcceptConsent = useCallback(() => {
    setHasConsent(true);
    setShowConsent(false);
    localStorage.setItem("ovgweb_ai_consent", "true");
    const effectiveGreeting = greeting ?? defaultConfig.greeting ?? "";
    const welcome: WidgetMessage = {
      id: Date.now().toString(),
      role: "assistant",
      text: effectiveGreeting,
      timestamp: Date.now(),
    };
    setMessages([welcome]);
  }, [greeting]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const effectiveGreeting = greeting ?? defaultConfig.greeting ?? "";
    const id = setTimeout(() => {
      setMessages(prev => {
        const next = [...prev];
        const firstAssistant = next.find(m => m.role === "assistant");
        if (firstAssistant && firstAssistant.text !== effectiveGreeting) {
          firstAssistant.text = effectiveGreeting;
          localStorage.setItem(chatHistoryKey, JSON.stringify(next));
        }
        return next;
      });
    }, 0);
    return () => clearTimeout(id);
  }, [greeting, chatHistoryKey]);

  const handleOpenChat = useCallback(() => {
    setShowPeek(false);
    if (!hasConsent) {
      setShowConsent(true);
    } else {
      setIsOpen(true);
    }
  }, [hasConsent]);

  const refreshConfiguration = useCallback(async () => {
    if (preview) return;
    try {
      const response = await fetch(`/api/tenants/${tenantId}`);
      if (!response.ok) return;
      const _data = await response.json();
      console.log('[ChatWidget] Configuration refreshed');
    } catch (e) {
      console.error('[ChatWidget] Refresh failed:', e);
    }
  }, [tenantId, preview]);

  // ── Preview test-drive TTS (client surface, mirrors useZeederVoice) ──
  const speakPreview = useCallback(async (text: string) => {
    try {
      const ttsResponse = await fetch('/api/ai/speech', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice: 'hannah' }),
      });
      if (!ttsResponse.ok) return;
      const audioBlob = await ttsResponse.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      audio.onended = () => URL.revokeObjectURL(audioUrl);
      await audio.play();
    } catch {
      /* TTS is best-effort in the preview */
    }
  }, []);

  const sendMessageDirect = useCallback(async (userInputText: string) => {
    if (!userInputText.trim()) return;

    const userMsg: WidgetMessage = {
      id: Date.now().toString(),
      role: "user",
      text: userInputText,
      timestamp: Date.now(),
    };

    const newMsgs = [...messages, userMsg];
    setMessages(newMsgs);
    setInput("");
    setIsTyping(true);

    try {
      if (preview) {
        // ── Sandbox test-drive ───────────────────────────────────────────
        // Non-persistent: messages stay in component state only (never
        // localStorage), and the request is tagged testMode so the route skips
        // any conversation/message log writes. Live draft overrides let the AI
        // answer with the current, unsaved brand/vibe.
        const response = await fetch("/api/client/process-command", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: userInputText,
            testMode: true,
            draftBrandName: liveDraft?.brandName,
            draftVibe: liveDraft?.systemPrompt,
            draftPersona: liveDraft?.personaMode,
            currentPath: "/client/dashboard/studio/branding",
            context: {
              surface: "chat-widget-embed",
              clientMemories,
            },
          }),
        });

        if (!response.ok) throw new Error(`Process failed: ${response.status}`);

        const data = await response.json();
        const aiText = data.response || data.summary || "I'm here to help.";

        const aiMsg: WidgetMessage = {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          text: aiText,
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, aiMsg]);
        if (voiceEnabled) void speakPreview(aiText);
        return;
      }

      localStorage.setItem(chatHistoryKey, JSON.stringify(newMsgs));

      void fetch('/api/chat/send-anon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId, message: userInputText }),
      }).catch(() => {
        /* non-blocking best-effort sync */
      });

      console.log("💬 [ChatWidget] Routing client chat payload to client-isolated orchestration endpoint");
      const response = await fetch("/api/client/process-command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: userInputText,
          tenantId,
          context: {
            surface: "chat-widget-embed",
          },
        }),
      });

      if (!response.ok) throw new Error(`Process failed: ${response.status}`);

      const data = await response.json();
      const aiText = data.response || data.summary || "I'm here to help.";

      const isBrandingTheme = data.actionType === 'SYSTEM_APPLY_BRANDING_THEME';
      const aiMsg: WidgetMessage = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        text: aiText,
        timestamp: Date.now(),
        ...(isBrandingTheme && data.payload
          ? { action: { type: 'APPLY_BRANDING_THEME', payload: data.payload } }
          : {}),
      };

      const finalMsgs = [...newMsgs, aiMsg];
      setMessages(finalMsgs);
      localStorage.setItem(chatHistoryKey, JSON.stringify(finalMsgs));

      if (data.payload && typeof data.payload === "object" && !isBrandingTheme) {
        console.log("📦 [Jill Capture] Booking payload:", data.payload);
        setShowSyncBadge(true);
        setTimeout(() => setShowSyncBadge(false), 4500);
      }

      if (isBrandingTheme && data.payload?.branding) {
        window.dispatchEvent(new CustomEvent('branding-concierge:apply', {
          detail: { branding: data.payload.branding },
        }));
      }

      if (
        data.actionType === 'SYSTEM_UPDATE_BRANDING' ||
        (data.payload && typeof data.payload === 'object' && 'branding' in data.payload && !isBrandingTheme)
      ) {
        refreshConfiguration();
      }
    } catch (e) {
      console.error("AI Error:", e);
    } finally {
      setIsTyping(false);
    }
  }, [messages, refreshConfiguration, preview, voiceEnabled, liveDraft, speakPreview, tenantId, clientMemories, chatHistoryKey]);

  // ── Preview test-drive STT (Web Speech API) ─────────────────────────
  const startPreviewListening = useCallback(() => {
    const Ctor = getSpeechRecognition();
    if (!Ctor) return;
    const recognition = new Ctor();
    recognition.lang = 'en-US';
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event: SpeechRecognitionResultEvent) => {
      let interim = '';
      let finalText = '';
      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) finalText += result.item(0)?.transcript ?? '';
        else interim += result.item(0)?.transcript ?? '';
      }
      setPreviewInterim(interim);
      if (finalText.trim()) {
        setPreviewInterim('');
        void sendMessageDirect(finalText.trim());
      }
    };
    recognition.onerror = () => {
      setPreviewRecording(false);
      setPreviewInterim('');
    };
    recognition.onend = () => {
      setPreviewRecording(false);
      setPreviewInterim('');
    };
    previewRecognitionRef.current = recognition;
    setPreviewRecording(true);
    try {
      recognition.start();
    } catch {
      setPreviewRecording(false);
    }
  }, [sendMessageDirect]);

  const stopPreviewListening = useCallback(() => {
    previewRecognitionRef.current?.stop();
    setPreviewRecording(false);
  }, []);

  const handleMicClick = useCallback(() => {
    if (preview) {
      if (previewRecording) stopPreviewListening();
      else startPreviewListening();
      return;
    }
    if (isRecording) {
      stopListeningAndProcess();
    } else {
      startListening();
    }
  }, [preview, previewRecording, startPreviewListening, stopPreviewListening, isRecording, startListening, stopListeningAndProcess]);

  // Gate timestamp rendering until after client mount to avoid hydration
  // mismatch from locale/timezone-dependent toLocaleTimeString output.
  // Deferred via a macrotask so setState is not called synchronously within
  // the effect body (avoids the react-hooks/set-state-in-effect lint error).
  useEffect(() => {
    const id = setTimeout(() => setMounted(true), 0);
    return () => clearTimeout(id);
  }, []);

  // Abort any in-flight preview speech recognition when the widget unmounts
  // (e.g. switching viewports or leaving the Studio) to release the mic.
  useEffect(() => {
    return () => {
      previewRecognitionRef.current?.abort();
    };
  }, []);

  // Keep previewRef in sync with the prop without expanding dependency arrays
  // of unrelated effects (avoids "dependency array changed size" warnings).
  useEffect(() => {
    previewRef.current = preview;
  }, [preview]);

  // Auto-greet once when opened with consent and no messages
  useEffect(() => {
    if (isOpen && messages.length === 0 && !greetedRef.current && hasConsent) {
      greetedRef.current = true;
      handleAcceptConsent();
    }
  }, [isOpen, messages.length, hasConsent, handleAcceptConsent]);

  // Auto-scroll (skip in preview — contained canvas, no viewport scroll)
  useEffect(() => {
    if (previewRef.current) return;
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  // Peek teaser timer
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!isOpen && !showConsent) {
        setShowPeek(true);
      }
    }, 3000);
    return () => clearTimeout(timer);
  }, [isOpen, showConsent]);

  // Inject branding CSS variables into the document.
  // If this widget ever moves into a Shadow DOM root, update the
  // appendChild target from document.head to that shadow root.
  useEffect(() => {
    const styleId = "zeeder-branding-styles";
    const css = branding ? generateBrandingCSS(branding) : "";

    let styleEl = document.getElementById(styleId) as HTMLStyleElement | null;

    if (!styleEl) {
      styleEl = document.createElement("style");
      styleEl.id = styleId;
      document.head.appendChild(styleEl);
    }

    styleEl.textContent = css;
  }, [branding]);

  // Fetch relational client memory (client_name / company_name / preferences)
  // so the header can surface a subtle "Recognized User" indicator. Skipped in
  // Studio preview (no real session) and silent on any failure.
  useEffect(() => {
    if (preview) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/client/memories", { cache: "no-store" });
        if (res.ok) {
          const data = (await res.json()) as {
            memories?: Record<string, string>;
            hasMemory?: boolean;
          };
          if (cancelled) return;
          const memories = data.memories ?? {};
          setClientMemories(memories);
          setHasClientMemory(Boolean(data.hasMemory) || Object.keys(memories).length > 0);
        }
      } catch {
        /* non-fatal: no recognition pill */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [preview]);

  // Silent anonymous visitor recognition fallback: if the authenticated
  // /api/client/memories endpoint is unavailable (anon visitor), inspect the
  // latest user message for phone/email and query visitor_memories. Skipped in
  // Studio preview and silent on any failure.
  useEffect(() => {
    if (preview) return;
    let cancelled = false;
    (async () => {
      try {
        const latestUserMsg = [...messages].reverse().find(m => m.role === 'user');
        if (!latestUserMsg) return;

        const phoneMatch = latestUserMsg.text.match(/\+?\d[\d ()-]{6,19}\d/);
        const emailMatch = latestUserMsg.text.match(/[^\s]+@[^\s]+\.[^\s]+/);
        if (!phoneMatch && !emailMatch) return;

        const visitorRes = await fetch("/api/client/visitor-memories", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            phone: phoneMatch ? phoneMatch[0] : undefined,
            email: emailMatch ? emailMatch[0] : undefined,
            tenantId,
          }),
        });

        if (!visitorRes.ok) return;
        const visitorData = (await visitorRes.json()) as Record<string, string>;
        if (cancelled) return;
        const memories = Object.fromEntries(
          Object.entries(visitorData).filter(
            ([, v]) => v && v !== 'Unknown' && v !== 'None recorded',
          ),
        );
        if (Object.keys(memories).length > 0) {
          setClientMemories(memories);
          setHasClientMemory(true);
        }
      } catch {
        /* non-fatal: no recognition pill */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [preview, messages, tenantId]);

  return (
    <>
      {/* ===== PEEK TEASER ===== */}
      <AnimatePresence>
        {!preview && !isOpen && !showConsent && showPeek && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 300, damping: 24 }}
            className="fixed bottom-24 left-4 right-4 sm:left-auto sm:right-6 z-[9998] max-w-[calc(100vw-2rem)] sm:max-w-[280px] rounded-2xl border border-pink-300/40 bg-gradient-to-br from-gray-900/90 to-gray-800/90 backdrop-blur-xl p-5 shadow-2xl"
          >
            <button
              onClick={() => setShowPeek(false)}
              className="absolute top-2 right-2 text-gray-400 hover:text-white transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
            <p className="text-sm text-white/90 leading-relaxed">{config.peekText}</p>
            <button
              onClick={handleOpenChat}
              className="mt-3 text-sm font-semibold hover:opacity-80 transition-opacity"
              style={{ color: "var(--w-primary, #0097b2)" }}
            >
              Chat with us →
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ===== RESET CONFIRM POPUP ===== */}
      <AnimatePresence>
        {showResetConfirm && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 300, damping: 24 }}
            className="fixed bottom-24 left-4 right-4 sm:left-auto sm:right-6 z-[10002] max-w-[calc(100vw-2rem)] sm:max-w-[280px] rounded-2xl border border-pink-300/40 bg-gradient-to-br from-gray-900/90 to-gray-800/90 backdrop-blur-xl p-5 shadow-2xl"
          >
            <button
              onClick={() => setShowResetConfirm(false)}
              className="absolute top-2 right-2 text-gray-400 hover:text-white transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
            <p className="text-sm text-white/90 leading-relaxed">Are you sure you want to reset the chat? This will clear all messages.</p>
            <div className="flex gap-2 mt-3">
              <button
                onClick={() => setShowResetConfirm(false)}
                className="text-sm font-semibold text-gray-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={resetChat}
                className="text-sm font-semibold hover:opacity-80 transition-opacity"
                style={{ color: "var(--w-primary, #0097b2)" }}
              >
                Reset Chat →
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ===== CONSENT MODAL ===== */}
      <AnimatePresence>
        {showConsent && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[10001] flex items-center justify-center bg-black/60 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.85, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: "spring", stiffness: 350, damping: 28 }}
              className="mx-4 w-full max-w-sm rounded-2xl border p-6 shadow-2xl"
              style={{
                background:
                  "var(--w-body-bg, linear-gradient(to bottom, rgba(17,24,39,0.92), rgba(3,7,18,0.96)))",
                backdropFilter: "var(--w-body-backdrop-blur, 0px)",
                WebkitBackdropFilter: "var(--w-body-backdrop-blur, 0px)",
                borderColor: "rgba(255, 255, 255, 0.15)",
              }}
            >
              <div className="flex items-center gap-3 mb-4">
                <div
                  className="h-10 w-10 rounded-full flex items-center justify-center"
                  style={{
                    backgroundColor: "color-mix(in srgb, var(--w-accent, #D4AF37) 22%, transparent)",
                    border: "1px solid color-mix(in srgb, var(--w-accent, #D4AF37) 45%, transparent)",
                  }}
                >
                  <ShieldCheck className="h-5 w-5" style={{ color: "var(--w-accent, #D4AF37)" }} />
                </div>
                <h3 className="text-lg font-bold text-white">Before we chat…</h3>
              </div>

              <p className="text-sm text-gray-100 leading-relaxed mb-2" style={{ color: "rgba(255,255,255,0.88)" }}>
                This AI concierge is powered by artificial intelligence. By continuing you agree to our:
              </p>
              <ul className="text-xs space-y-1 mb-5 ml-4 list-disc" style={{ color: "rgba(255,255,255,0.7)" }}>
                <li>Terms & Conditions</li>
                <li>Privacy Policy</li>
                <li>AI-generated responses disclaimer</li>
              </ul>

              <div className="flex gap-3">
                <Button
                  className="flex-1 font-semibold rounded-full"
                  style={{
                    backgroundColor: "rgba(255, 255, 255, 0.05)",
                    color: "rgba(255, 255, 255, 0.9)",
                    border: "1px solid rgba(255, 255, 255, 0.15)",
                  }}
                  onClick={() => setShowConsent(false)}
                >
                  Decline
                </Button>
                <Button
                  className="flex-1 text-white font-semibold rounded-full"
                  style={{ backgroundColor: "var(--w-primary, #0097b2)" }}
                  onClick={() => {
                    greetedRef.current = true;
                    handleAcceptConsent();
                    setIsOpen(true);
                  }}
                >
                  I Agree ✨
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ===== MAIN CHAT WINDOW ===== */}
      {(preview || isOpen) && (
        <div
          className={
            preview
              ? "relative z-0 widget-body flex flex-col w-full h-full rounded-3xl border-2 overflow-hidden shadow-2xl bg-transparent"
              : "z-[9999] widget-body w-[calc(100vw-1rem)] max-w-[380px] sm:max-w-[420px] rounded-3xl border-2 overflow-hidden shadow-2xl bg-transparent"
          }
          style={{
            borderColor: "var(--w-primary, #0097b2)",
            ...(preview ? {} : cornerStyle(widgetPosition)),
          }}
        >
          {/* Header */}
          <div className="relative widget-header p-5 flex justify-between items-center overflow-hidden">
            <div className="absolute inset-0 bg-black/40" />
            <div className="relative flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={branding?.logoUrl || config.logo || config.logoUrl || "/images/omnivergeglobal.svg"}
                alt={branding?.brandName || config.brandName || "Brand"}
                width={40}
                height={40}
                className="object-contain"
              />
              <div>
                <h3 className="font-semibold text-white text-sm">{branding?.brandName || config.brandName || "Omniverge Global"}</h3>
                <div className="flex items-center gap-1.5">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                  </span>
                  <span className="text-[11px] text-white/70 font-medium">Online now</span>
                </div>
                {hasClientMemory && !preview && (
                  <div
                    className="mt-1 inline-flex items-center gap-1.5 rounded-full border px-2 py-[2px] text-[10px] font-medium tracking-wide backdrop-blur-md"
                    style={{
                      borderColor: "var(--w-accent, #D4AF37)",
                      color: "var(--w-accent, #D4AF37)",
                      backgroundColor: "color-mix(in srgb, var(--w-accent, #D4AF37) 12%, transparent)",
                    }}
                    title={clientMemories.preferences ? `Preferences: ${clientMemories.preferences}` : "We recognize you from prior conversations"}
                  >
                    <span className="h-1.5 w-1.5 rounded-full animate-pulse" style={{ backgroundColor: "var(--w-accent, #D4AF37)" }} />
                    {clientMemories.client_name
                      ? `Recognized · ${clientMemories.client_name}`
                      : clientMemories.company_name
                        ? `Recognized · ${clientMemories.company_name}`
                        : "Cognitive Memory Active"}
                  </div>
                )}
              </div>
            </div>

            {/* Controls */}
            <div className="relative flex items-center gap-2">
              <Button
                className="h-8 w-8 rounded-full text-white shrink-0"
                style={{ backgroundColor: "var(--w-primary, #0097b2)" }}
                onClick={() => {
                  const next = !voiceEnabled;
                  setVoiceEnabled(next);
                  localStorage.setItem("ovgweb_voice_mute", next ? "" : "true");
                  if (!next && audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
                }}
              >
                {voiceEnabled ? <Volume2 className="h-4 w-4 text-white" /> : <VolumeX className="h-4 w-4 text-white" />}
              </Button>
              <Button className="h-8 w-8 rounded-full text-white shrink-0" style={{ backgroundColor: "var(--w-primary, #0097b2)" }} onClick={() => setShowResetConfirm(true)}>
                <RefreshCw className="h-4 w-4 text-white" />
              </Button>
              <Button className="h-8 w-8 rounded-full text-white shrink-0" style={{ backgroundColor: "var(--w-primary, #0097b2)" }} onClick={() => setIsOpen(false)}>
                <X className="h-4 w-4 text-white" />
              </Button>
            </div>
          </div>

          {/* Messages */}
          <div className={preview ? "relative overflow-y-auto p-4 space-y-2 bg-transparent flex-1 min-h-0" : "relative overflow-y-auto p-4 space-y-2 bg-transparent h-[40vh] sm:h-[320px] max-h-[450px]"}>
            <AnimatePresence>
              {showSyncBadge && (
                <motion.div
                  initial={{ y: -50, opacity: 0 }}
                  animate={{ y: 10, opacity: 1 }}
                  exit={{ y: -20, opacity: 0 }}
                  className="absolute left-1/2 -translate-x-1/2 z-[9999] w-[90%] pointer-events-none"
                >
                  <div className="bg-emerald-600 text-white text-[10px] font-bold py-2 px-4 rounded-full shadow-2xl flex items-center justify-center gap-2 border border-white/30 backdrop-blur-md">
                    <ShieldCheck className="h-3.5 w-3.5 animate-pulse" />
                    {config.syncBadgeText || "BOOKING SECURED"}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {messages.map((msg) => {
              const time = new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
              const isUser = msg.role === "user";
              const isBrandingAction = msg.action?.type === 'APPLY_BRANDING_THEME';
              return (
                <div key={msg.id} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`relative max-w-[75%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed backdrop-blur-md border-b-2 ${
                      isUser
                        ? "bg-gradient-to-br from-pink-100/95 to-pink-50/95 text-amber-800 rounded-tr-sm border-b-pink-400 shadow-lg shadow-pink-100/30"
                        : "bg-gradient-to-br from-white/95 to-gray-50/95 text-amber-800 rounded-tl-sm border-b-pink-400 shadow-lg shadow-gray-100/30"
                    }`}
                  >
                    <span className="font-light">{msg.text}</span>
                    {isBrandingAction && (
                      <div className="mt-3 flex gap-2">
                        <button
                          onClick={() => window.dispatchEvent(new CustomEvent('branding-concierge:confirm'))}
                          className="px-3 py-1.5 text-xs font-bold rounded-lg border border-white/30 bg-white/90 text-gray-800 hover:bg-white transition-colors shadow-sm"
                        >
                          Confirm
                        </button>
                        <button
                          onClick={() => {
                            setMessages((prev) => prev.filter((m) => m.id !== msg.id));
                          }}
                          className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-300 bg-transparent text-gray-600 hover:bg-gray-100 transition-colors"
                        >
                          Dismiss
                        </button>
                      </div>
                    )}
                    <span className="ml-2 inline-flex items-end float-right text-[9px] text-amber-600/70 mt-1.5 pl-2 leading-none whitespace-nowrap font-mono">
                      {mounted ? time : ""}
                    </span>
                  </div>
                </div>
              );
            })}
            {isTyping && (
              <div className="px-2 py-3">
                <div className="flex items-center gap-2 text-amber-800 text-sm font-light">
                  <span className="animate-pulse">Concierge is typing</span>
                  <span className="animate-bounce delay-100">.</span>
                  <span className="animate-bounce delay-200">.</span>
                  <span className="animate-bounce delay-300">.</span>
                </div>
                <div className="mt-2 h-1 rounded-full overflow-hidden">
                  <div className="h-full w-full animate-pulse bg-gradient-to-r from-pink-400 via-amber-400 to-pink-400 bg-[length:200%_100%]"></div>
                </div>
              </div>
            )}

            {messages.length <= 1 && !isTyping && (
              <div className="flex flex-wrap gap-2 px-1 pt-2">
                {suggestedActions.map((action) => (
                  <button
                    key={action.label}
                    onClick={() =>
                      action.actionType === 'link'
                        ? window.open(action.payload, '_blank', 'noopener,noreferrer')
                        : sendMessageDirect(action.payload)
                    }
                    className="px-3 py-1.5 text-xs font-medium rounded-full transition-colors"
                    style={{
                      background: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      color: 'rgba(255, 255, 255, 0.88)',
                    }}
                  >
                    {action.label}
                  </button>
                ))}

                <button
                  onClick={() => openWhatsApp(config.phone ?? "27760330046", `Hi ${config.brandName ?? "there"}, I'd like to speak to a consultant.`)}
                  className="px-3 py-1.5 text-xs font-bold rounded-full border border-green-400/50 bg-green-50 text-green-700 hover:bg-green-100 transition-colors shadow-sm flex items-center gap-1"
                >
                  💬 Speak to a consultant
                </button>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* STT Layer - Dedicated transcription band anchored near PTT controls */}
          <div className="relative w-full px-4 h-5 flex items-center justify-center border-t border-gray-300/30 bg-black/20">
            {(() => {
              const displayTranscript = preview
                ? (previewRecording ? previewInterim : '')
                : (isRecording ? interimTranscript : transcript);
              return (
                <span className={`text-[10px] font-mono uppercase tracking-tight italic transition-opacity duration-200 ${
                  displayTranscript ? 'opacity-100' : 'opacity-0'
                }`} style={{ color: 'var(--w-primary, #0097b2)' }}>
                  {displayTranscript ? `Detected: "${displayTranscript}"` : ''}
                </span>
              );
            })()}
          </div>

          {/* Input / Footer Area */}
          <div className="relative widget-footer p-4 border-t border-gray-300/50 overflow-hidden">
            <div className="absolute inset-0 bg-black/40" />

            <div className="relative flex gap-2 items-center">
              {/* Microphone Button - Bound to useVoiceCommand.
                  Hidden entirely when the reseller disables voice features,
                  so the client-side widget can ship without voice input. */}
              {effectiveVoiceFeaturesEnabled && (
                <Button
                  onClick={handleMicClick}
                  aria-label={isRecording ? "Stop listening" : "Hold to talk"}
                  className={`shrink-0 h-10 w-10 flex items-center justify-center rounded-full ${isRecording ? "text-blue-500 animate-pulse scale-110" : "text-pink-500 hover:text-pink-600"}`}
                >
                  {isRecording ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
                </Button>
              )}

              {/* Text Input */}
              <input
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder={isRecording ? "🎤 Listening..." : "Type your message..."}
                className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-gray-300 bg-white/90 text-black"
                onKeyDown={e => e.key === "Enter" && sendMessageDirect(input)}
              />

              {/* Send Button */}
              <Button
                onClick={() => sendMessageDirect(input)}
                aria-label="Send message"
                style={{ backgroundColor: "var(--w-primary, #0097b2)" }}
                className="text-white h-10 w-10 flex items-center justify-center rounded-full shrink-0"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ===== FLOATING BUBBLE ===== */}
      {!preview && !isOpen && !showConsent && (
        <button
          onClick={handleOpenChat}
          className="fixed bottom-6 right-6 z-[10000] h-14 w-14 rounded-full shadow-2xl hover:scale-110 transition-all flex items-center justify-center widget-bubble"
          style={{ background: `linear-gradient(to bottom right, var(--w-primary, #0097b2), #ff69b4)` }}
        >
          <MessageCircle className="h-6 w-6 text-white" />
        </button>
      )}
    </>
  );
};

export default ChatWidget;