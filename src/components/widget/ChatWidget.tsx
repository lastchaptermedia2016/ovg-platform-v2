"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  MessageCircle, X, Send, Mic, MicOff, RefreshCw, Volume2, VolumeX, ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useVoiceCommand } from "@/hooks/use-voice-command";
import { useWidgetPresence } from "@/hooks/useWidgetPresence";
import { generateBrandingCSS } from "@/lib/branding/css-generator";
import type { CanonicalBranding } from "@/lib/schemas/tenant-config.canonical";
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
  greeting: "Welcome to Omniverge Global ✨ My name is your virtual assistant. How can I help you today?",
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
  /**
   * Studio preview mode. Renders the chat window as a contained, always-open
   * surface (no consent gate, no floating bubble), suppresses realtime
   * presence/voice channels, and seeds a static sample conversation so the
   * canvas reflects branding without any network or WebSocket traffic.
   */
  preview?: boolean;
}

const ChatWidget = ({ tenantId, branding, preview = false }: ChatWidgetProps) => {
  const presenceStatus = useWidgetPresence(preview ? null : tenantId);

  const [config] = useState<WidgetConfig>(defaultConfig);
  const [isOpen, setIsOpen] = useState(false);
  const [showConsent, setShowConsent] = useState(false);
  const [hasConsent, setHasConsent] = useState(() => preview ? true : localStorage.getItem("ovgweb_ai_consent") === "true");
  const [showPeek, setShowPeek] = useState(false);
  const [showSyncBadge, setShowSyncBadge] = useState(false);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(() => preview ? true : localStorage.getItem("ovgweb_voice_mute") !== "true");
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [mounted, setMounted] = useState(false);

  const greetedRef = useRef(false);

  const [messages, setMessages] = useState<WidgetMessage[]>(() => {
    if (preview) {
      const now = Date.now();
      return [
        { id: "preview-1", role: "assistant", text: "Hi! I'm your AI concierge. How can I help you today?", timestamp: now },
        { id: "preview-2", role: "user", text: "Can you tell me about your services?", timestamp: now + 1 },
        { id: "preview-3", role: "assistant", text: "Absolutely — we tailor AI-powered solutions to help your business grow smarter. What are you working on?", timestamp: now + 2 },
      ];
    }
    try {
      const saved = JSON.parse(localStorage.getItem("ovgweb_chat_messages") || "[]");
      if (saved.length === 0) {
        const initialGreeting: WidgetMessage = {
          id: Date.now().toString(),
          role: "assistant",
          text: "Hi there! I'm OVG, the AI concierge for Omniverge Global. We help businesses like yours grow smarter using strategic marketing and AI. What brings you to our site today?",
          timestamp: Date.now(),
        };
        localStorage.setItem("ovgweb_chat_messages", JSON.stringify([initialGreeting]));
        return [initialGreeting];
      }
      return saved as WidgetMessage[];
    } catch {
      const initialGreeting: WidgetMessage = {
        id: Date.now().toString(),
        role: "assistant",
        text: "Hi there! I'm OVG, the AI concierge for Omniverge Global. We help businesses like yours grow smarter using strategic marketing and AI. What brings you to our site today?",
        timestamp: Date.now(),
      };
      localStorage.setItem("ovgweb_chat_messages", JSON.stringify([initialGreeting]));
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
      localStorage.setItem('ovgweb_chat_messages', JSON.stringify(next));
      return next;
    });
  }, []);

  const handleVoiceAIResponse = useCallback((text: string) => {
    if (!text.trim()) return;
    const aiMsg: WidgetMessage = {
      id: crypto.randomUUID(),
      role: 'assistant',
      text: text.trim(),
      timestamp: Date.now(),
    };
    setMessages((prev) => {
      const next = [...prev, aiMsg];
      localStorage.setItem('ovgweb_chat_messages', JSON.stringify(next));
      return next;
    });
    setIsTyping(false);
  }, []);

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
    const initialGreeting: WidgetMessage = {
      id: Date.now().toString(),
      role: "assistant",
      text: "Hi there! I'm OVG, the AI concierge for Omniverge Global. We help businesses like yours grow smarter using strategic marketing and AI. What brings you to our site today?",
      timestamp: Date.now(),
    };
    setMessages([initialGreeting]);
    localStorage.setItem("ovgweb_chat_messages", JSON.stringify([initialGreeting]));
    setShowResetConfirm(false);
  }, []);

  const handleAcceptConsent = useCallback(() => {
    setHasConsent(true);
    setShowConsent(false);
    localStorage.setItem("ovgweb_ai_consent", "true");
    const welcome: WidgetMessage = {
      id: Date.now().toString(),
      role: "assistant",
      text: config.greeting ?? "",
      timestamp: Date.now(),
    };
    setMessages([welcome]);
  }, [config.greeting]);

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

  const sendMessageDirect = useCallback(async (userInputText: string) => {
    if (preview) return;
    if (!userInputText.trim()) return;

    const userMsg: WidgetMessage = {
      id: Date.now().toString(),
      role: "user",
      text: userInputText,
      timestamp: Date.now(),
    };

    const newMsgs = [...messages, userMsg];
    setMessages(newMsgs);
    localStorage.setItem("ovgweb_chat_messages", JSON.stringify(newMsgs));
    setInput("");
    setIsTyping(true);

    try {
      console.log("💬 [ChatWidget] Routing client chat payload to client-isolated orchestration endpoint");
      const response = await fetch("/api/client/process-command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: userInputText,
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
      localStorage.setItem("ovgweb_chat_messages", JSON.stringify(finalMsgs));

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
  }, [messages, refreshConfiguration, preview]);

  const handleMicClick = useCallback(() => {
    if (preview) return;
    if (isRecording) {
      stopListeningAndProcess();
    } else {
      startListening();
    }
  }, [isRecording, startListening, stopListeningAndProcess, preview]);

  // Gate timestamp rendering until after client mount to avoid hydration
  // mismatch from locale/timezone-dependent toLocaleTimeString output.
  // Deferred via a macrotask so setState is not called synchronously within
  // the effect body (avoids the react-hooks/set-state-in-effect lint error).
  useEffect(() => {
    const id = setTimeout(() => setMounted(true), 0);
    return () => clearTimeout(id);
  }, []);

  // Auto-greet once when opened with consent and no messages
  useEffect(() => {
    if (isOpen && messages.length === 0 && !greetedRef.current && hasConsent) {
      greetedRef.current = true;
      handleAcceptConsent();
    }
  }, [isOpen, messages.length, hasConsent, handleAcceptConsent]);

  // Sync broadcast status with local UI state for visual feedback
  useEffect(() => {
    if (presenceStatus === "interacting") {
      // UI can react to presence changes if needed
    }
  }, [presenceStatus]);

  // Auto-scroll
  useEffect(() => {
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
            className="fixed bottom-24 right-6 z-[9998] max-w-[280px] rounded-2xl border border-pink-300/40 bg-gradient-to-br from-gray-900/90 to-gray-800/90 backdrop-blur-xl p-5 shadow-2xl"
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
            className="fixed bottom-24 right-6 z-[10002] max-w-[280px] rounded-2xl border border-pink-300/40 bg-gradient-to-br from-gray-900/90 to-gray-800/90 backdrop-blur-xl p-5 shadow-2xl"
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
              className="mx-4 w-full max-w-sm rounded-2xl bg-gradient-to-b from-gray-800 to-gray-900 border border-gray-700 p-6 shadow-2xl"
            >
              <div className="flex items-center gap-3 mb-4">
                <div
                  className="h-10 w-10 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: "var(--w-primary, #0097b2)" }}
                >
                  <ShieldCheck className="h-5 w-5 text-white" />
                </div>
                <h3 className="text-lg font-bold text-white">Before we chat…</h3>
              </div>

              <p className="text-sm text-gray-300 leading-relaxed mb-2">
                This AI concierge is powered by artificial intelligence. By continuing you agree to our:
              </p>
              <ul className="text-xs text-gray-400 space-y-1 mb-5 ml-4 list-disc">
                <li>Terms & Conditions</li>
                <li>Privacy Policy</li>
                <li>AI-generated responses disclaimer</li>
              </ul>

              <div className="flex gap-3">
                <Button
                  className="flex-1 border border-gray-600 text-gray-300 hover:bg-gray-700 hover:text-white"
                  onClick={() => setShowConsent(false)}
                >
                  Decline
                </Button>
                <Button
                  className="flex-1 text-white font-semibold"
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
              : "fixed z-[9999] widget-body bottom-[max(1.5rem,env(safe-area-inset-bottom))] right-[max(1rem,env(safe-area-inset-right))] w-[94vw] max-w-[380px] sm:max-w-[420px] rounded-3xl border-2 overflow-hidden shadow-2xl bg-transparent"
          }
          style={{ borderColor: "var(--w-primary, #0097b2)" }}
        >
          {/* Header */}
          <div className="relative widget-header p-5 flex justify-between items-center overflow-hidden">
            <div className="absolute inset-0 bg-black/40" />
            <div className="relative flex items-center gap-3">
              <img
                src={branding?.logoUrl || config.logo || config.logoUrl || "/images/omnivergeglobal.svg"}
                alt={config.brandName ?? "Brand"}
                width={40}
                height={40}
                className="object-contain"
              />
              <div>
                <h3 className="font-semibold text-white text-sm">{config.brandName}</h3>
                <div className="flex items-center gap-1.5">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                  </span>
                  <span className="text-[11px] text-white/70 font-medium">Online now</span>
                </div>
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
              {!preview && (
                <Button className="h-8 w-8 rounded-full text-white shrink-0" style={{ backgroundColor: "var(--w-primary, #0097b2)" }} onClick={() => setShowResetConfirm(true)}>
                  <RefreshCw className="h-4 w-4 text-white" />
                </Button>
              )}
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
                {["Book a treatment", "I need prices"].map((label) => (
                  <button
                    key={label}
                    onClick={() => sendMessageDirect(label)}
                    className="px-3 py-1.5 text-xs font-medium rounded-full border border-pink-400/60 bg-pink-50/70 backdrop-blur-sm text-pink-700 hover:bg-pink-100/80 transition-colors shadow-sm"
                  >
                    {label}
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
              const displayTranscript = isRecording ? interimTranscript : transcript;
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
              {/* Microphone Button - Bound to useVoiceCommand */}
              <Button
                onClick={handleMicClick}
                className={`shrink-0 ${isRecording ? "text-blue-500 animate-pulse scale-110" : "text-pink-500 hover:text-pink-600"}`}
              >
                {isRecording ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
              </Button>

              {/* Text Input */}
              <input
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder={isRecording ? "🎤 Listening..." : "Type your message..."}
                className="flex-1 px-3 py-2 rounded-lg border border-gray-300 bg-white/90 text-black"
                onKeyDown={e => e.key === "Enter" && sendMessageDirect(input)}
              />

              {/* Send Button */}
              <Button
                onClick={() => sendMessageDirect(input)}
                style={{ backgroundColor: "var(--w-primary, #0097b2)" }}
                className="text-white px-4 shrink-0"
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