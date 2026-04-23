"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Zap, Mic, Brain } from "lucide-react";

export default function Home() {
  const [displayText, setDisplayText] = useState("");
  const fullText = "OVG Platform v2: Phoenix Rising";

  useEffect(() => {
    let index = 0;
    const interval = setInterval(() => {
      if (index < fullText.length) {
        setDisplayText(fullText.slice(0, index + 1));
        index++;
      } else {
        clearInterval(interval);
      }
    }, 50);
    return () => clearInterval(interval);
  }, []);

  const features = [
    {
      icon: Zap,
      title: "Groq LLM",
      description: "Lightning-fast inference with real-time streaming",
    },
    {
      icon: Mic,
      title: "ElevenLabs TTS",
      description: "Ultra-realistic voice synthesis in 29 languages",
    },
    {
      icon: Brain,
      title: "xAI Integration",
      description: "Advanced reasoning with cutting-edge AI models",
    },
  ];

  return (
    <div className="min-h-screen bg-cover bg-center bg-no-repeat relative overflow-hidden" style={{ backgroundImage: "url('/home-bg.jpg')" }}>
      {/* Floating HUD Geometric Shapes */}
      <motion.div
        className="absolute top-20 left-10 w-16 h-16 border border-[#0097b2]/30 rounded-full"
        animate={{ rotate: 360 }}
        transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
        style={{ willChange: "transform" }}
      />
      <motion.div
        className="absolute top-40 right-20 w-12 h-12 border border-[#D4AF37]/30"
        animate={{ rotate: -360, scale: [1, 1.2, 1] }}
        transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
        style={{ willChange: "transform" }}
      />
      <motion.div
        className="absolute bottom-32 left-1/4 w-8 h-8 border border-[#0097b2]/20"
        animate={{ rotate: 180, y: [0, -20, 0] }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
        style={{ willChange: "transform" }}
      />

      {/* Breathing Electric Blue Glow Behind Text */}
      <motion.div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-[#0097b2]/10 rounded-full blur-3xl"
        animate={{ scale: [1, 1.05, 1] }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        style={{ willChange: "transform" }}
      />

      {/* Hero Content */}
      <div className="min-h-screen flex flex-col items-center justify-center p-8 relative z-10">
        <h1 className="text-[#0097b2] text-4xl md:text-6xl font-bold mb-8 drop-shadow-lg font-mono">
          {displayText}
          <motion.span
            className="inline-block w-0.5 h-8 bg-[#0097b2] ml-1"
            animate={{ opacity: [1, 0, 1] }}
            transition={{ duration: 0.8, repeat: Infinity }}
          />
        </h1>
        <p className="text-[#D4AF37] text-lg md:text-xl drop-shadow-md mb-8 max-w-2xl text-center">
          Enterprise-grade AI voice infrastructure for white-label SaaS
        </p>

        {/* Create Your Agent Button with Glow-Track Effect */}
        <motion.button
          className="relative px-8 py-3 bg-transparent border-2 border-[#D4AF37]/50 text-[#D4AF37] font-semibold rounded-lg overflow-hidden group"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          style={{ willChange: "transform" }}
        >
          <motion.div
            className="absolute inset-0 bg-[#D4AF37]/10"
            initial={{ x: "-100%" }}
            whileHover={{ x: "100%" }}
            transition={{ duration: 0.5 }}
          />
          <span className="relative z-10">Create Your Agent</span>
        </motion.button>
      </div>

      {/* Feature Grid with Glassmorphism */}
      <div className="absolute bottom-0 left-0 right-0 p-8 z-10">
        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6">
          {features.map((feature, index) => {
            const Icon = feature.icon;
            return (
              <motion.div
                key={index}
                className="relative backdrop-blur-md bg-white/5 border border-white/10 rounded-xl p-6 overflow-hidden"
                animate={{ y: [0, -10, 0] }}
                transition={{
                  duration: 4,
                  repeat: Infinity,
                  ease: "easeInOut",
                  delay: index * 0.5,
                }}
                style={{ willChange: "transform" }}
              >
                {/* Shimmer Effect */}
                <motion.div
                  className="absolute top-0 left-0 w-32 h-32 bg-gradient-to-br from-[#D4AF37]/20 to-transparent"
                  animate={{ x: [-100, 200], y: [-100, 200] }}
                  transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                  style={{ willChange: "transform" }}
                />

                <Icon className="w-10 h-10 text-[#0097b2] mb-4 relative z-10" />
                <h3 className="text-white font-semibold text-lg mb-2 relative z-10">
                  {feature.title}
                </h3>
                <p className="text-white/70 text-sm relative z-10">
                  {feature.description}
                </p>
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
