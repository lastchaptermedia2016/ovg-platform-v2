'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import ClientAuthCard from '@/components/auth/ClientAuthCard';

const NEURAL_MESSAGES = [
  "ZEEDER AI: Neural Link establishing secure connection...",
  "AI Core: Optimizing ZEEDER AI platform...",
  "Hannah: Preparing your ZEEDER AI workspace...",
  "System Ready: ZEEDER AI client platform awaits..."
];

export default function ClientAuthPage() {
  const [displayedText, setDisplayedText] = useState('');
  const [isTyping, setIsTyping] = useState(true);
  const [currentGreeting, setCurrentGreeting] = useState(0);

  useEffect(() => {
    const currentMessage = NEURAL_MESSAGES[currentGreeting];
    let currentIndex = 0;
    let typingInterval: NodeJS.Timeout;
    let deleteTimeout: NodeJS.Timeout;

    const typeMessage = () => {
      if (currentIndex <= currentMessage.length) {
        setDisplayedText(currentMessage.slice(0, currentIndex));
        currentIndex++;
        typingInterval = setTimeout(typeMessage, 50);
      } else {
        setIsTyping(false);
        deleteTimeout = setTimeout(() => {
          setIsTyping(true);
          setCurrentGreeting((prev) => (prev + 1) % NEURAL_MESSAGES.length);
        }, 3000);
      }
    };

    typeMessage();

    return () => {
      clearTimeout(typingInterval);
      clearTimeout(deleteTimeout);
    };
  }, [currentGreeting]);

  return (
    <div className="flex min-h-screen w-full items-center justify-center p-4">
      {/* Production Excellence: Fixed Branding Header */}
      <header className="fixed top-0 left-0 right-0 z-20 bg-black/40 backdrop-blur-md border-b border-white/10">
        <div className="max-w-7xl mx-auto px-6 py-3 flex justify-between items-center">
          {/* Left Branding: POWERED BY ZEEDER AI */}
          <div className="flex items-center gap-0.5">
            <span className="text-zinc-400 text-xs tracking-widest font-normal uppercase">
              POWERED BY ZEEDER
            </span>
            <span className="text-blue-400 animate-pulse font-bold text-xs tracking-wider uppercase">
              AI
            </span>
          </div>

          {/* Right Branding: ZEEDER AI CLIENT */}
          <div className="flex items-center space-x-4">
            <span className="text-zinc-200 font-medium tracking-wide text-xs uppercase">
              ZEEDER
              <span className="text-cyan-400 font-bold ml-1">AI</span>
            </span>
            <div className="w-px h-3 bg-white/20" />
            <span className="text-cyan-400 text-xs font-semibold tracking-widest uppercase">
              CLIENT LOGIN
            </span>
          </div>
        </div>
      </header>

      <div className="w-full max-w-md relative z-10">
        <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl shadow-2xl overflow-hidden">
          {/* Typewriter Status */}
          <div className="px-8 pt-6 pb-2 flex items-center justify-center">
            <p className="text-cyan-400 text-xs sm:text-sm font-mono drop-shadow-[0_0_10px_rgba(0,255,255,0.5)] drop-shadow-[0_0_20px_rgba(0,255,255,0.3)]">
              {displayedText}
            </p>
            {isTyping && (
              <motion.span
                animate={{ opacity: [1, 0, 1] }}
                transition={{ duration: 0.8, repeat: Infinity }}
                className="ml-1 text-cyan-400 text-xs sm:text-sm font-mono"
              >
                |
              </motion.span>
            )}
          </div>

          {/* Client Auth Card */}
          <div className="p-8">
            <ClientAuthCard />
          </div>
        </div>
      </div>
    </div>
  );
}