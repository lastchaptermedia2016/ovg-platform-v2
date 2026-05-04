"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Zap, Mic, Brain, Upload, User, Settings, Sparkles, X } from "lucide-react";
import StrategySlides from "@/components/StrategySlides";
import { useRef } from "react";

export default function CreateAgent() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(1);
  const [statusText, setStatusText] = useState("");
  const [isTypingStatus, setIsTypingStatus] = useState(true);
  const [isStrategyModalOpen, setIsStrategyModalOpen] = useState(false);
  const [playedAudio, setPlayedAudio] = useState<Set<string>>(new Set());
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showUnmuteHint, setShowUnmuteHint] = useState(false);
  const [audioUnlocked, setAudioUnlocked] = useState(false);

  // Global Audio Reference for Exclusive Playback
  const currentAudio = useRef<HTMLAudioElement | null>(null);
  const audioContext = useRef<AudioContext | null>(null);
  const audioPreloaded = useRef(false);

  // State Guard: Prevent standalone Step 1 audio during initialization
  const isInitialBoot = useRef(true);

  // Audio file paths with absolute URLs for iPad Safari compatibility
  const audioFiles = {
    tab: '/ElevenLabs1.mp3',
    step1: '/ElevenLabs2.mp3',
    step2: '/ElevenLabs3.mp3',
    step3: '/ElevenLabs4.mp3',
    deploy: '/ElevenLabs5.mp3'
  };

  // Prime audio objects on first interaction
  const primeAudioObjects = () => {
    if (audioPreloaded.current) return;
    
    Object.values(audioFiles).forEach(filePath => {
      const audio = new Audio(filePath);
      audio.preload = 'auto';
      audio.load(); // Pre-fetch buffer for iPad
    });
    
    audioPreloaded.current = true;
  };

  // Initialize Audio Context and setup iPad compatibility
  useEffect(() => {
    // Initialize Web Audio API
    audioContext.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    
    // Resume audio context on user interaction
    const unlockAudio = async () => {
      if (audioContext.current && audioContext.current.state === 'suspended') {
        try {
          await audioContext.current.resume();
          setAudioUnlocked(true);
          setShowUnmuteHint(false);
        } catch (error) {
          console.log('Audio context resume failed:', error);
          setShowUnmuteHint(true);
        }
      }
    };

    // Add event listeners for user interaction
    const handleUserInteraction = () => {
      unlockAudio();
      primeAudioObjects(); // Prime audio objects for iPad
      // Play a silent audio to unlock hardware
      const silentAudio = new Audio('data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAAAQAEAAEAfAAAQAQABAAgAZGF0YQAAAAA=');
      silentAudio.volume = 0;
      silentAudio.play().catch(() => {});
    };

    window.addEventListener('touchstart', handleUserInteraction, { once: true });
    window.addEventListener('click', handleUserInteraction, { once: true });

    return () => {
      window.removeEventListener('touchstart', handleUserInteraction);
      window.removeEventListener('click', handleUserInteraction);
    };
  }, []);

  // Global Exit & Silence Hook
  const handleGlobalExit = () => {
    // EXECUTION PRIORITY: Kill any accidental sounds immediately
    if (currentAudio.current) {
      currentAudio.current.pause();
      currentAudio.current.currentTime = 0;
      currentAudio.current = null;
    }

    // UI Reset
    setShowAuthModal(false);

    // Console Update
    setStatusText("> SESSION TERMINATED. RETURNING TO MAIN INTERFACE...");

    // Navigate home
    setTimeout(() => {
      router.push('/');
    }, 1000);
  };

  // Autonomous status messages for each step
  const statusMessages = {
    1: "> Mapping neural pathways...",
    2: "> Calibrating synthesis protocols...",
    3: "> Injecting knowledge vectors...",
    4: "> Deploying agent to infrastructure..."
  };

  // Strict Relay Implementation - Chained Audio Relay (No Overlap)
  const playChainedAudio = (audioKey: string, audioFile: string, consoleMessage: string, triggerModal?: boolean, nextAudioKey?: string) => {
    // Play-once-per-session check
    if (playedAudio.has(audioKey)) {
      return;
    }

    // EXECUTION PRIORITY: Kill any accidental sounds immediately
    if (currentAudio.current) {
      currentAudio.current.pause();
      currentAudio.current.currentTime = 0;
      currentAudio.current = null;
    }

    try {
      // Use absolute path from audioFiles object for iPad Safari compatibility
      const absoluteAudioFile = audioFiles[audioKey as keyof typeof audioFiles] || audioFile;
      const audio = new Audio(absoluteAudioFile);
      audio.volume = 0.8;
      
      // Store in global ref
      currentAudio.current = audio;
      
      // STRICT RELAY: Only chain from tab->step1 during initial boot
      if (audioKey === 'tab' && nextAudioKey === 'step1' && isInitialBoot.current) {
        audio.onended = () => {
          // Clear the current audio reference
          currentAudio.current = null;
          
          // Mark initial boot as complete
          isInitialBoot.current = false;
          
          // Trigger ElevenLabs2.mp3 directly
          const step1Audio = new Audio('/ElevenLabs2.mp3');
          step1Audio.volume = 0.8;
          currentAudio.current = step1Audio;
          
          step1Audio.play().then(() => {
            setStatusText('> ANALYZING PERSONALITY MATRIX PARAMETERS...');
            setPlayedAudio(prev => new Set(prev).add('step1'));
          }).catch(error => {
            console.log('Step 1 audio failed:', error);
            setStatusText('> ANALYZING PERSONALITY MATRIX PARAMETERS...');
            setPlayedAudio(prev => new Set(prev).add('step1'));
          });
        };
      }
      
      // Enhanced audio play with iPad compatibility
      const playAudio = async () => {
        try {
          // Check if audio context is available and resume if needed
          if (audioContext.current && audioContext.current.state === 'suspended') {
            await audioContext.current.resume();
          }
          
          await audio.play();
          
          // Update console feed
          setStatusText(consoleMessage);
          // Mark as played
          setPlayedAudio(prev => new Set(prev).add(audioKey));
          setShowUnmuteHint(false);
          
          // Trigger modal if specified (for deploy stage)
          if (triggerModal) {
            setTimeout(() => {
              setShowAuthModal(true);
            }, 500);
          }
        } catch (error) {
          console.log(`Audio playback failed for ${audioKey}:`, error);
          // Show unmute hint for iPad users
          setShowUnmuteHint(true);
          // Still update console and mark as played to prevent retries
          setStatusText(consoleMessage);
          setPlayedAudio(prev => new Set(prev).add(audioKey));
          
          if (triggerModal) {
            setShowAuthModal(true);
          }
        }
      };
      
      // Call the enhanced play function
      playAudio();
    } catch (error) {
      console.log(`Audio system error for ${audioKey}:`, error);
      // Ensure UI remains functional
      setStatusText(consoleMessage);
      setPlayedAudio(prev => new Set(prev).add(audioKey));
      setShowUnmuteHint(true);
      
      if (triggerModal) {
        setShowAuthModal(true);
      }
    }
  };

  // Page mount audio - Chain Trigger for Sequential Playback
  useEffect(() => {
    // Play ElevenLabs1.mp3 on page mount with sequential chaining to step1
    const timer = setTimeout(() => {
      playChainedAudio('tab', '/ElevenLabs1.mp3', '> INITIALIZING VOCAL HANDSHAKE...', false, 'step1');
    }, 1000);
    
    return () => clearTimeout(timer);
  }, []);

  // Step transition audio triggers - 3-Step Flow (Non-chained for manual navigation)
  useEffect(() => {
    // STRICT RELAY: Block auto-play during initial boot to prevent premature ElevenLabs2.mp3
    if (isInitialBoot.current) {
      return; // Don't play any step audio during initial boot
    }
    
    // Trigger audio based on current step without chaining for manual navigation
    if (currentStep === 1) {
      playChainedAudio('step1', '/ElevenLabs2.mp3', '> ANALYZING PERSONALITY MATRIX PARAMETERS...');
    } else if (currentStep === 2) {
      playChainedAudio('step2', '/ElevenLabs3.mp3', '> CALIBRATING SYNTHESIS...');
    } else if (currentStep === 3) {
      playChainedAudio('step3', '/ElevenLabs4.mp3', '> INJECTING KNOWLEDGE...');
    }
  }, [currentStep]);

  // Status typewriter effect
  useEffect(() => {
    const currentMessage = statusMessages[currentStep as keyof typeof statusMessages];
    let index = 0;
    let typingInterval: NodeJS.Timeout;
    let deleteTimeout: NodeJS.Timeout;

    const typeStatusMessage = () => {
      if (index <= currentMessage.length) {
        setStatusText(currentMessage.slice(0, index));
        index++;
        typingInterval = setTimeout(typeStatusMessage, 50);
      } else {
        setIsTypingStatus(false);
        // Wait before starting next message
        deleteTimeout = setTimeout(() => {
          setIsTypingStatus(true);
        }, 3000);
      }
    };

    typeStatusMessage();

    return () => {
      clearTimeout(typingInterval);
      clearTimeout(deleteTimeout);
    };
  }, [currentStep]);

  return (
    <div className="min-h-screen bg-cover bg-center bg-no-repeat relative overflow-hidden" style={{ backgroundImage: "url('/home-bg.jpg')" }}>
      {/* Unmute Hint for iPad Users */}
      {showUnmuteHint && (
        <div className="fixed top-20 left-1/2 transform -translate-x-1/2 z-50 bg-black/80 backdrop-blur-md border border-[#FFD700]/30 rounded-lg p-4 max-w-sm">
          <div className="flex items-center space-x-3">
            <div className="text-[#FFD700] text-2xl">🔊</div>
            <div className="flex-1">
              <p className="text-white text-sm font-medium">Audio Unlocked</p>
              <p className="text-white/70 text-xs">Check your device's mute switch and volume</p>
            </div>
            <button
              onClick={() => setShowUnmuteHint(false)}
              className="text-white/60 hover:text-white transition-colors"
            >
              ✕
            </button>
          </div>
        </div>
      )}
      
      {/* Premium Navigation Header */}
      <header className="relative sm:fixed sm:top-0 sm:left-0 sm:right-0 z-50 bg-black/40 backdrop-blur-md border-b border-white/10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          {/* Left Branding: POWERED BY PIERRE AI */}
          <div className="flex items-center space-x-2">
            <span className="text-white/60 text-xs font-light tracking-wider uppercase">
              POWERED BY PIERRE
            </span>
            <motion.span
              animate={{
                scale: [1, 1.1, 1],
                opacity: [0.8, 1, 0.8]
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: "easeInOut"
              }}
              className="text-[#FFD700] text-xs font-bold tracking-wider uppercase drop-shadow-[0_0_15px_rgba(255,215,0,0.5)]"
            >
              AI
            </motion.span>
          </div>
          
          {/* Navigation Group: Dual Portal Entry Points */}
          <div className="flex flex-col sm:flex-row sm:items-center space-y-2 sm:space-y-0 sm:space-x-4">
            {/* Client Portal */}
            <div className="relative backdrop-blur-sm bg-white/10 border border-white/20 rounded-lg px-2 py-1 sm:px-4 sm:py-2">
              <Link 
                href="/"
                className="px-2 py-1 sm:px-4 sm:py-2 border border-gray-300/50 text-gray-600 font-medium rounded-lg hover:bg-gray-50 transition-colors duration-200 text-xs sm:text-sm"
              >
                CLIENT PORTAL
              </Link>
              <span className="absolute -top-5 -right-1 sm:-top-6 sm:-right-2 bg-gray-100 text-gray-500 text-[10px] sm:text-xs px-1 sm:px-2 py-1 rounded">
                Coming Soon
              </span>
            </div>
            
            {/* Reseller Portal */}
            <Link 
              href="/auth"
              className="px-3 py-1 sm:px-6 sm:py-2 border border-[#FFD700] text-white font-semibold rounded-lg hover:bg-[#FFD700]/10 transition-colors duration-200 text-xs sm:text-sm"
            >
              RESELLER ACCESS
            </Link>
          </div>
        </div>
      </header>

      {/* Agent Assembly Lab */}
      <div className="min-h-screen flex items-center justify-center p-8 relative z-10">
        <div className="w-full max-w-4xl mx-auto">
          {/* Main Lab Card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="relative backdrop-blur-3xl bg-black/40 border border-[#FFD700]/10 rounded-2xl p-8 shadow-2xl shadow-[#FFD700]/20"
          >
            {/* EXIT LAB Button - Top Right */}
            <motion.button
              onClick={handleGlobalExit}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="absolute top-4 right-4 px-4 py-2 bg-transparent border border-[#FFD700]/30 rounded-lg text-[#FFD700] text-sm font-medium hover:bg-[#FFD700]/10 hover:border-[#FFD700] hover:shadow-[0_0_15px_rgba(255,215,0,0.4)] transition-all duration-300 flex items-center space-x-2"
            >
              <X className="w-4 h-4" />
              <span>EXIT LAB</span>
            </motion.button>

            {/* Reference Guide - VIEW STRATEGY */}
            <div className="flex items-center justify-center mb-6">
              <motion.button
                onClick={() => setIsStrategyModalOpen(true)}
                className="px-6 py-3 bg-transparent backdrop-blur-md border border-[#FFD700]/10 rounded-lg text-[#FFD700] uppercase tracking-widest font-medium hover:bg-[#FFD700]/10 hover:border-[#FFD700]/20 hover:shadow-[0_0_15px_rgba(255,215,0,0.4)] transition-all duration-300 z-50 shadow-lg shadow-[#FFD700]/30"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                VIEW STRATEGY
              </motion.button>
            </div>

            {/* Step Indicator */}
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center space-x-4">
                {[1, 2, 3].map((step) => (
                  <div
                    key={step}
                    onClick={() => setCurrentStep(step)}
                    className={`relative w-12 h-12 rounded-full border border-[#FFD700] flex items-center justify-center cursor-pointer transition-all duration-300 backdrop-blur-sm ${
                      currentStep === step
                        ? 'bg-[#FFD700] border-[#FFD700] shadow-lg shadow-[#FFD700]/70'
                        : 'bg-black/10 border-[#FFD700]/10 hover:bg-[#FFD700]/5 hover:border-[#FFD700]/20'
                    }`}
                  >
                    <span className={`font-bold text-sm ${
                      currentStep === step ? 'text-white' : 'text-[#FFD700]'
                    }`}>
                      {step}
                    </span>
                  </div>
                ))}
              </div>
              
              {/* Step Labels */}
              <div className="hidden sm:flex sm:space-x-8">
                <div className="text-center">
                  <div className="text-[#FFD700] font-bold text-lg mb-1 pr-4">Step {currentStep}</div>
                  <div className="text-white/80 text-sm">
                    {currentStep === 1 && "Personality Matrix"}
                    {currentStep === 2 && "Voice Blueprint"}
                    {currentStep === 3 && "Knowledge Upload"}
                  </div>
                </div>
              </div>
            </div>

            {/* Step Content */}
            <div className="space-y-8">
              {/* Step 1: Personality Matrix */}
              {currentStep === 1 && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.4 }}
                  className="space-y-6"
                >
                  <h3 className="text-[#FFD700] text-xl font-light mb-4 flex items-center">
                    <Zap className="w-6 h-6 mr-3" />
                    Personality Matrix
                  </h3>
                  <p className="text-white/40 font-thin mb-6">
                    Configure cognitive parameters for your AI agent's behavioral patterns and response characteristics.
                  </p>
                  
                  {/* Cognitive Parameters */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-4">
                      <label className="text-[#FFD700] text-sm font-medium block mb-2">Cognitive Bias</label>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        defaultValue="50"
                        className="w-full h-0.5 bg-[#FFD700]/15 border border-[#FFD700]/20 rounded-full appearance-none cursor-pointer"
                      />
                      <div className="flex justify-between text-xs text-white/60 mt-2">
                        <span>Neutral</span>
                        <span>Biased</span>
                      </div>
                    </div>
                    
                    <div className="space-y-4">
                      <label className="text-[#FFD700] text-sm font-medium block mb-2">Reasoning Depth</label>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        defaultValue="75"
                        className="w-full h-0.5 bg-[#FFD700]/15 border border-[#FFD700]/20 rounded-full appearance-none cursor-pointer"
                      />
                      <div className="flex justify-between text-xs text-white/60 mt-2">
                        <span>Surface</span>
                        <span>Deep</span>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* Step 2: Voice Blueprint */}
              {currentStep === 2 && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.4 }}
                  className="space-y-6"
                >
                  <h3 className="text-[#FFD700] text-xl font-bold mb-4 flex items-center">
                    <Mic className="w-6 h-6 mr-3" />
                    Voice Blueprint
                  </h3>
                  <p className="text-white/70 mb-6">
                    Select and configure synthesis protocols for your AI agent's voice generation capabilities.
                  </p>
                  
                  {/* Synthesis Models */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {[
                      { name: 'Model Alpha', desc: 'Premium synthesis with advanced neural processing', icon: '⚡' },
                      { name: 'Model Sigma', desc: 'Enhanced vocal range with emotional intelligence', icon: '🎯' }
                    ].map((model, index) => (
                      <div
                        key={index}
                        className="relative bg-black/40 border border-[#FFD700]/30 rounded-lg p-6 cursor-pointer hover:border-[#FFD700]/50 hover:bg-[#FFD700]/10 transition-all duration-300"
                      >
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center space-x-3">
                            <span className="text-2xl">{model.icon}</span>
                            <span className="text-white font-bold text-lg">{model.name}</span>
                          </div>
                          <div className="w-6 h-6 bg-[#FFD700] rounded-full border-2 border-white/20 flex items-center justify-center">
                            <div className="w-2 h-2 bg-white rounded-full" />
                          </div>
                        </div>
                        <p className="text-white/70 text-sm leading-relaxed">{model.desc}</p>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}

              {/* Step 3: Knowledge Injection */}
              {currentStep === 3 && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.4 }}
                  className="space-y-6"
                >
                  <h3 className="text-[#FFD700] text-xl font-bold mb-4 flex items-center">
                    <Upload className="w-6 h-6 mr-3" />
                    Knowledge Injection
                  </h3>
                  <p className="text-white/70 mb-6">
                    Upload documents and data sources to enhance your AI agent's knowledge base and capabilities.
                  </p>
                  
                  {/* Drag and Drop Zone with Pulsing Gold Glow */}
                  <div
                    className="border-2 border-dashed border-[#FFD700]/50 rounded-xl p-12 text-center hover:border-[#FFD700] transition-all duration-300 relative overflow-hidden"
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.currentTarget.classList.add('border-[#FFD700]', 'bg-[#FFD700]/10');
                    }}
                    onDragLeave={(e) => {
                      e.preventDefault();
                      e.currentTarget.classList.remove('border-[#FFD700]', 'bg-[#FFD700]/10');
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.currentTarget.classList.remove('border-[#FFD700]', 'bg-[#FFD700]/10');
                    }}
                  >
                    {/* Pulsing Gold Glow Effect */}
                    <motion.div
                      animate={{
                        scale: [1, 1.1, 1],
                        opacity: [0.3, 0.6, 0.3]
                      }}
                      transition={{
                        duration: 2,
                        repeat: Infinity,
                        ease: "easeInOut"
                      }}
                      className="absolute inset-0 bg-gradient-to-r from-[#FFD700]/20 via-[#FFD700]/10 to-[#FFD700]/20 rounded-xl"
                    />
                    
                    <motion.div
                      animate={{ scale: [1, 1.05, 1] }}
                      transition={{ duration: 2, repeat: Infinity }}
                      className="relative z-10"
                    >
                      <Upload className="w-16 h-16 mb-6 text-[#FFD700] mx-auto" />
                      <p className="text-xl font-bold mb-3 text-white">Drag & Drop Knowledge Vectors</p>
                      <p className="text-sm text-white/60">
                        PDFs, documents, or data files for neural processing
                      </p>
                    </motion.div>
                  </div>
                </motion.div>
              )}
            </div>

            {/* Navigation Buttons */}
            <div className="flex flex-col sm:flex-row justify-between items-center pt-8 space-y-4 sm:space-y-0 sm:space-x-4">
              <div className="flex space-x-4">
                <button
                  onClick={() => setCurrentStep(Math.max(1, currentStep - 1))}
                  disabled={currentStep === 1}
                  className="px-6 py-3 bg-black/40 border border-[#FFD700]/30 rounded-lg text-white/60 hover:bg-black/60 hover:border-[#FFD700]/50 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
              </div>
              
              {currentStep < 3 ? (
                <motion.button
                  onClick={() => setCurrentStep(currentStep + 1)}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="w-full px-8 py-4 bg-[#FFD700] border border-[#FFD700] rounded-lg text-black text-sm font-black hover:bg-[#FFD700]/90 hover:border-[#FFD700]/90 hover:shadow-[0_0_20px_rgba(255,215,0,0.4)] transition-all duration-300 shadow-lg shadow-[#FFD700]/50"
                >
                  DEPLOY AGENT TO INFRASTRUCTURE
                </motion.button>
              ) : (
                <motion.button
                  onClick={async () => {
                    // Handle suspended context for iPad
                    if (audioContext.current && audioContext.current.state === 'suspended') {
                      await audioContext.current.resume();
                    }
                    playChainedAudio('deploy', audioFiles.deploy, '> AUTHENTICATION REQUIRED...', true);
                  }}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="px-8 py-4 bg-[#FFD700] border border-[#FFD700] rounded-lg text-black font-black hover:bg-[#FFD700]/90 hover:border-[#FFD700]/90 hover:shadow-[0_0_20px_rgba(255,215,0,0.4)] transition-all duration-300 shadow-lg shadow-[#FFD700]/50"
                >
                  DEPLOY AGENT TO INFRASTRUCTURE
                </motion.button>
              )}
            </div>

            {/* Hannah Console - Dedicated Sub-Panel */}
            <div className="mt-8 pt-6 border-t border-[#FFD700]/20">
              <div className="bg-black/60 backdrop-blur-sm rounded-lg p-4 border border-[#FFD700]/10">
                <div className="flex items-center justify-center">
                  <motion.p className="text-[#FFD700] text-sm font-mono drop-shadow-[0_0_10px_rgba(255,215,0,0.5)] drop-shadow-[0_0_20px_rgba(255,215,0,0.3)]">
                    {statusText}
                  </motion.p>
                  {isTypingStatus && (
                    <motion.span
                      animate={{ opacity: [1, 0, 1] }}
                      transition={{ duration: 0.8, repeat: Infinity }}
                      className="ml-1 text-[#FFD700] text-sm font-mono drop-shadow-[0_0_10px_rgba(255,215,0,0.5)] drop-shadow-[0_0_20px_rgba(255,215,0,0.3)]"
                    >
                      |
                    </motion.span>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
      
      {/* Strategy Slides Modal */}
      <StrategySlides 
        isOpen={isStrategyModalOpen} 
        onClose={() => setIsStrategyModalOpen(false)} 
      />

      {/* Authentication Modal - Obsidian & Gold Glass-Morphism */}
      {showAuthModal && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3, ease: "easeInOut" }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-3xl"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="relative bg-black/40 backdrop-blur-3xl border border-[#FFD700]/30 rounded-2xl p-8 max-w-md w-full"
          >
            {/* EXIT LAB Button - Modal Top Right */}
            <motion.button
              onClick={handleGlobalExit}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="absolute top-4 right-4 px-3 py-2 bg-transparent border border-[#FFD700]/30 rounded-lg text-[#FFD700] text-xs font-medium hover:bg-[#FFD700]/10 hover:border-[#FFD700] hover:shadow-[0_0_15px_rgba(255,215,0,0.4)] transition-all duration-300 flex items-center space-x-1"
            >
              <X className="w-3 h-3" />
              <span>EXIT</span>
            </motion.button>

            {/* Modal Content */}
            <div className="text-center space-y-6">
              <div className="w-16 h-16 mx-auto bg-[#FFD700]/10 border border-[#FFD700]/30 rounded-full flex items-center justify-center">
                <User className="w-8 h-8 text-[#FFD700]" />
              </div>
              
              <div className="space-y-4">
                <h2 className="text-[#FFD700] text-2xl font-light">
                  Authentication Required
                </h2>
                <p className="text-white/60 font-thin">
                  Neural parameters locked. To initialize this agent in a live environment, please authenticate your credentials.
                </p>
              </div>

              <div className="space-y-3">
                <Link href="/auth" className="block">
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className="w-full px-6 py-3 bg-[#FFD700] border border-[#FFD700] rounded-lg text-black font-black hover:bg-[#FFD700]/90 hover:border-[#FFD700]/90 transition-all duration-300"
                  >
                    SIGN IN
                  </motion.button>
                </Link>
                
                <Link href="/auth" className="block">
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className="w-full px-6 py-3 bg-transparent border border-[#FFD700]/50 rounded-lg text-[#FFD700] font-medium hover:bg-[#FFD700]/10 hover:border-[#FFD700] transition-all duration-300"
                  >
                    CREATE ACCOUNT
                  </motion.button>
                </Link>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </div>
  );
}
