"use client";

import { useEffect, useState, useRef } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { Zap, Mic, Brain } from "lucide-react";

function ParticleCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef({ x: 0, y: 0 });
  const particlesRef = useRef<Array<{ x: number; y: number; vx: number; vy: number; size: number; color: string }>>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);

    const particleCount = 80;
    particlesRef.current = Array.from({ length: particleCount }, () => ({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      vx: (Math.random() - 0.5) * 0.5,
      vy: (Math.random() - 0.5) * 0.5,
      size: Math.random() * 3 + 1,
      color: Math.random() > 0.5 ? "#0097b2" : "#D4AF37",
    }));

    const handlePointerMove = (e: MouseEvent | TouchEvent) => {
      if ("touches" in e && e.touches.length > 0) {
        mouseRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      } else {
        mouseRef.current = { x: (e as MouseEvent).clientX, y: (e as MouseEvent).clientY };
      }
    };

    window.addEventListener("mousemove", handlePointerMove);
    window.addEventListener("touchstart", handlePointerMove, { passive: true });
    window.addEventListener("touchmove", handlePointerMove, { passive: true });

    let animId: number;
    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particlesRef.current.forEach((particle) => {
        const dx = mouseRef.current.x - particle.x;
        const dy = mouseRef.current.y - particle.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance < 100) {
          const force = (100 - distance) / 100;
          particle.vx += (dx / distance) * force * 0.2;
          particle.vy += (dy / distance) * force * 0.2;
        }
        particle.x += particle.vx;
        particle.y += particle.vy;
        particle.vx *= 0.98;
        particle.vy *= 0.98;
        if (particle.x < 0 || particle.x > canvas.width) particle.vx *= -1;
        if (particle.y < 0 || particle.y > canvas.height) particle.vy *= -1;
        particle.x = Math.max(0, Math.min(canvas.width, particle.x));
        particle.y = Math.max(0, Math.min(canvas.height, particle.y));

        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
        ctx.fillStyle = particle.color;
        ctx.fill();

        particlesRef.current.forEach((other) => {
          const ddx = other.x - particle.x;
          const ddy = other.y - particle.y;
          const d = Math.sqrt(ddx * ddx + ddy * ddy);
          if (d < 80 && d > 0) {
            ctx.beginPath();
            ctx.moveTo(particle.x, particle.y);
            ctx.lineTo(other.x, other.y);
            ctx.strokeStyle = `${particle.color}20`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        });
      });
      animId = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", resizeCanvas);
      window.removeEventListener("mousemove", handlePointerMove);
      window.removeEventListener("touchstart", handlePointerMove);
      window.removeEventListener("touchmove", handlePointerMove);
    };
  }, []);

  return <canvas ref={canvasRef} className="fixed inset-0 z-0 pointer-events-none" />;
}

const blackBoxMessages = [
  "Hannah: Neural pathways calibrating...",
  "Black Box: Quantum processing matrix initialized",
  "System: Cognitive protocols engaged",
  "AI Core: Synthesis sequence activated",
  "Phoenix: Rising from the ashes of legacy systems",
  "Network: Distributed intelligence online",
  "Protocol: Advanced reasoning models loaded",
  "Matrix: Real-time inference engine ready",
];

export default function Home() {
  const [displayText, setDisplayText] = useState("");
  const [statusText, setStatusText] = useState("");
  const [currentStatusIndex, setCurrentStatusIndex] = useState(0);
  const [isTypingStatus, setIsTypingStatus] = useState(true);
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

  useEffect(() => {
    const currentMessage = blackBoxMessages[currentStatusIndex];
    let index = 0;
    let typingTimeout: NodeJS.Timeout;
    let deleteTimeout: NodeJS.Timeout;

    const typeStatusMessage = () => {
      if (index <= currentMessage.length) {
        setStatusText(currentMessage.slice(0, index));
        index++;
        typingTimeout = setTimeout(typeStatusMessage, 50);
      } else {
        setIsTypingStatus(false);
        deleteTimeout = setTimeout(() => {
          setIsTypingStatus(true);
          setCurrentStatusIndex((prev) => (prev + 1) % blackBoxMessages.length);
        }, 3000);
      }
    };
    typeStatusMessage();

    return () => {
      clearTimeout(typingTimeout);
      clearTimeout(deleteTimeout);
    };
  }, [currentStatusIndex]);

  const features = [
    {
      icon: Zap,
      title: "Proprietary Inference Engine",
      description: "Lightning-fast processing with real-time streaming",
    },
    {
      icon: Mic,
      title: "Synthesis Protocols",
      description: "Ultra-realistic voice generation in multiple languages",
    },
    {
      icon: Brain,
      title: "Advanced Reasoning Models",
      description: "Sophisticated cognitive processing with cutting-edge architecture",
    },
  ];

  return (
    <div
      className="min-h-screen bg-cover bg-center bg-no-repeat relative"
      style={{ backgroundImage: "url('/home-bg.jpg')" }}
    >
      {/* Particle canvas fixed behind everything */}
      <ParticleCanvas />

      {/* Breathing glow */}
      <motion.div
        className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-[#0097b2]/10 rounded-full blur-3xl pointer-events-none z-0"
        animate={{ scale: [1, 1.05, 1] }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* Floating HUD shapes */}
      <motion.div
        className="fixed top-20 left-10 w-16 h-16 border border-[#0097b2]/30 rounded-full pointer-events-none z-0"
        animate={{ rotate: 360 }}
        transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
      />
      <motion.div
        className="fixed top-40 right-20 w-12 h-12 border border-[#D4AF37]/30 pointer-events-none z-0"
        animate={{ rotate: -360, scale: [1, 1.2, 1] }}
        transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
      />

      {/* ── HEADER ── */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-black/40 backdrop-blur-md border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 sm:py-4 flex justify-between items-center gap-3">
          {/* Branding */}
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-white/60 text-[10px] sm:text-xs font-light tracking-wider uppercase leading-tight">
              POWERED BY<br className="sm:hidden" /> PIERRE
            </span>
            <motion.span
              animate={{ scale: [1, 1.1, 1], opacity: [0.8, 1, 0.8] }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
              className="text-[#FFD700] text-[10px] sm:text-xs font-bold tracking-wider uppercase drop-shadow-[0_0_15px_rgba(255,215,0,0.5)]"
            >
              AI
            </motion.span>
          </div>

          {/* Nav buttons */}
          <div className="flex items-center gap-2 sm:gap-4">
            {/* Client Portal */}
            <div className="relative">
              <span className="absolute -top-4 right-0 bg-gray-100 text-gray-500 text-[9px] px-1.5 py-0.5 rounded whitespace-nowrap">
                Coming Soon
              </span>
              <a
                href="#"
                className="block px-3 py-1.5 sm:px-4 sm:py-2 border border-gray-300/50 text-gray-400 font-medium rounded-lg text-[10px] sm:text-sm whitespace-nowrap"
              >
                CLIENT PORTAL
              </a>
            </div>

            {/* Reseller Access */}
            <a
              href="/auth"
              className="block px-3 py-1.5 sm:px-6 sm:py-2 border border-[#FFD700] text-white font-semibold rounded-lg hover:bg-[#FFD700]/10 transition-colors text-[10px] sm:text-sm whitespace-nowrap"
            >
              RESELLER ACCESS
            </a>
          </div>
        </div>
      </header>

      {/* ── PAGE BODY — normal document flow, not absolute ── */}
      <div className="relative z-10 flex flex-col min-h-screen pt-20">

        {/* Hero section */}
        <section className="flex-1 flex flex-col items-center justify-center px-4 sm:px-8 py-16 text-center">
          <h1 className="text-[#0097b2] text-3xl sm:text-4xl md:text-6xl font-bold mb-4 drop-shadow-lg font-mono break-words w-full max-w-3xl">
            {displayText}
            <motion.span
              className="inline-block w-0.5 h-7 sm:h-8 bg-[#0097b2] ml-1 align-middle"
              animate={{ opacity: [1, 0, 1] }}
              transition={{ duration: 0.8, repeat: Infinity }}
            />
          </h1>

          {/* Status ticker */}
          <div className="flex items-center justify-center mb-4 px-4 h-6">
            <p className="text-[#FFD700] text-xs sm:text-sm font-mono drop-shadow-[0_0_10px_rgba(255,215,0,0.5)] text-center">
              {statusText}
            </p>
            {isTypingStatus && (
              <motion.span
                animate={{ opacity: [1, 0, 1] }}
                transition={{ duration: 0.8, repeat: Infinity }}
                className="ml-1 text-[#FFD700] text-xs sm:text-sm font-mono"
              >
                |
              </motion.span>
            )}
          </div>

          <p className="text-[#D4AF37] text-base sm:text-lg md:text-xl drop-shadow-md mb-10 max-w-2xl">
            Enterprise-grade AI voice infrastructure for white-label SaaS
          </p>

          {/* CTA button */}
          <Link href="/create-agent">
            <motion.div
              className="relative px-8 py-3 bg-transparent border-2 border-[#D4AF37]/50 text-[#D4AF37] font-semibold rounded-lg overflow-hidden cursor-pointer"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <motion.div
                className="absolute inset-0 bg-[#D4AF37]/10"
                initial={{ x: "-100%" }}
                whileHover={{ x: "100%" }}
                transition={{ duration: 0.5 }}
              />
              <span className="relative z-10">Create Your Agent</span>
            </motion.div>
          </Link>
        </section>

        {/* Feature cards — in normal flow below hero */}
        <section className="w-full px-4 sm:px-8 pb-12">
          <div className="max-w-6xl mx-auto grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 sm:gap-6">
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
                >
                  <motion.div
                    className="absolute top-0 left-0 w-32 h-32 bg-gradient-to-br from-[#D4AF37]/20 to-transparent"
                    animate={{ x: [-100, 200], y: [-100, 200] }}
                    transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                  />
                  <Icon className="w-10 h-10 text-[#0097b2] mb-4 relative z-10" />
                  <h3 className="text-white font-semibold text-lg mb-2 relative z-10">
                    {feature.title}
                  </h3>
                  <p className="text-white/70 text-sm relative z-10">{feature.description}</p>
                </motion.div>
              );
            })}
          </div>
        </section>

      </div>
    </div>
  );
}
