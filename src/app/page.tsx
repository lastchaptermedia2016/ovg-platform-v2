"use client";

import { useEffect, useState, useRef } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { Zap, Mic, Brain } from "lucide-react";

// Interactive Particle Canvas Component
function ParticleCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef({ x: 0, y: 0 });
  const particlesRef = useRef<Array<{ x: number; y: number; vx: number; vy: number; size: number; color: string }>>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Initialize particles
    const particleCount = 100;
    particlesRef.current = Array.from({ length: particleCount }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.5,
      vy: (Math.random() - 0.5) * 0.5,
      size: Math.random() * 3 + 1,
      color: Math.random() > 0.5 ? '#0097b2' : '#D4AF37'
    }));

    const handlePointerMove = (e: MouseEvent | TouchEvent) => {
      let x: number, y: number;
      
      if ('touches' in e && e.touches.length > 0) {
        // Touch event
        x = e.touches[0].clientX;
        y = e.touches[0].clientY;
      } else {
        // Mouse event
        x = (e as MouseEvent).clientX;
        y = (e as MouseEvent).clientY;
      }
      
      mouseRef.current = { x, y };
    };

    // Unified pointer event listeners for instant touch response
    window.addEventListener('mousemove', handlePointerMove);
    window.addEventListener('touchstart', handlePointerMove, { passive: true });
    window.addEventListener('touchmove', handlePointerMove, { passive: true });

    const animate = () => {
      // Clear canvas completely for transparency
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      particlesRef.current.forEach(particle => {
        // Mouse interaction
        const dx = mouseRef.current.x - particle.x;
        const dy = mouseRef.current.y - particle.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance < 100) {
          const force = (100 - distance) / 100;
          particle.vx += (dx / distance) * force * 0.2;
          particle.vy += (dy / distance) * force * 0.2;
        }

        // Update position
        particle.x += particle.vx;
        particle.y += particle.vy;

        // Damping
        particle.vx *= 0.98;
        particle.vy *= 0.98;

        // Boundaries
        if (particle.x < 0 || particle.x > canvas.width) particle.vx *= -1;
        if (particle.y < 0 || particle.y > canvas.height) particle.vy *= -1;

        // Keep particles in bounds
        particle.x = Math.max(0, Math.min(canvas.width, particle.x));
        particle.y = Math.max(0, Math.min(canvas.height, particle.y));

        // Draw particle
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
        ctx.fillStyle = particle.color;
        ctx.fill();

        // Draw connections
        particlesRef.current.forEach(otherParticle => {
          const dx = otherParticle.x - particle.x;
          const dy = otherParticle.y - particle.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          
          if (distance < 80 && distance > 0) {
            ctx.beginPath();
            ctx.moveTo(particle.x, particle.y);
            ctx.lineTo(otherParticle.x, otherParticle.y);
            ctx.strokeStyle = `${particle.color}20`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        });
      });

      requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      window.removeEventListener('mousemove', handlePointerMove);
      window.removeEventListener('touchstart', handlePointerMove);
      window.removeEventListener('touchmove', handlePointerMove);
    };
  }, []);

  return <canvas ref={canvasRef} className="absolute inset-0 z-0" />;
}

export default function Home() {
  const [displayText, setDisplayText] = useState("");
  const [statusText, setStatusText] = useState("");
  const [currentStatusIndex, setCurrentStatusIndex] = useState(0);
  const [isTypingStatus, setIsTypingStatus] = useState(true);
  const fullText = "OVG Platform v2: Phoenix Rising";

  // Black Box Status Messages
  const blackBoxMessages = [
    "Hannah: Neural pathways calibrating...",
    "Black Box: Quantum processing matrix initialized",
    "System: Cognitive protocols engaged",
    "AI Core: Synthesis sequence activated",
    "Phoenix: Rising from the ashes of legacy systems",
    "Network: Distributed intelligence online",
    "Protocol: Advanced reasoning models loaded",
    "Matrix: Real-time inference engine ready"
  ];

  // Main title typewriter effect
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

  // Status typewriter effect
  useEffect(() => {
    const currentMessage = blackBoxMessages[currentStatusIndex];
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
          setCurrentStatusIndex((prev) => (prev + 1) % blackBoxMessages.length);
        }, 3000);
      }
    };

    typeStatusMessage();

    return () => {
      clearTimeout(typingInterval);
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
    <div className="min-h-screen bg-cover bg-center bg-no-repeat relative overflow-hidden" style={{ backgroundImage: "url('/home-bg.jpg')" }}>
      {/* Interactive Particle Canvas */}
      <ParticleCanvas />
      
      {/* Premium Navigation Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-black/40 backdrop-blur-md border-b border-white/10">
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
          <div className="flex items-center space-x-2 sm:space-x-4 flex-wrap">
            {/* Client Portal */}
            <div className="relative backdrop-blur-sm bg-white/10 border border-white/20 rounded-lg px-2 py-1 sm:px-4 sm:py-2">
              <a 
                href="#"
                className="px-2 py-1 sm:px-4 sm:py-2 border border-gray-300/50 text-gray-600 font-medium rounded-lg hover:bg-gray-50 transition-colors duration-200 text-xs sm:text-sm"
              >
                CLIENT PORTAL
              </a>
              <span className="absolute -top-5 -right-1 sm:-top-6 sm:-right-2 bg-gray-100 text-gray-500 text-[10px] sm:text-xs px-1 sm:px-2 py-1 rounded">
                Coming Soon
              </span>
            </div>
            
            {/* Reseller Portal */}
            <a 
              href="/auth"
              className="px-3 py-1 sm:px-6 sm:py-2 border border-[#FFD700] text-white font-semibold rounded-lg hover:bg-[#FFD700]/10 transition-colors duration-200 text-xs sm:text-sm"
            >
              RESELLER ACCESS
            </a>
          </div>
        </div>
      </header>

      {/* Floating HUD Geometric Shapes */}
      <motion.div
        className="absolute top-20 left-10 w-16 h-16 border border-[#0097b2]/30 rounded-full"
        animate={{ rotate: 360 }}
        transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
      />
      <motion.div
        className="absolute top-40 right-20 w-12 h-12 border border-[#D4AF37]/30"
        animate={{ rotate: -360, scale: [1, 1.2, 1] }}
        transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
      />
      <motion.div
        className="absolute bottom-32 left-1/4 w-8 h-8 border border-[#0097b2]/20"
        animate={{ rotate: 180, y: [0, -20, 0] }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* Breathing Electric Blue Glow Behind Text */}
      <motion.div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-[#0097b2]/10 rounded-full blur-3xl"
        animate={{ scale: [1, 1.05, 1] }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* Hero Content */}
      <div className="min-h-screen flex flex-col items-center justify-center p-8 relative z-10 mt-20">
        <h1 className="text-[#0097b2] text-4xl md:text-6xl font-bold mb-4 drop-shadow-lg font-mono">
          {displayText}
          <motion.span
            className="inline-block w-0.5 h-8 bg-[#0097b2] ml-1"
            animate={{ opacity: [1, 0, 1] }}
            transition={{ duration: 0.8, repeat: Infinity }}
          />
        </h1>
        
        {/* Autonomous Status Loop */}
        <div className="flex items-center justify-center mb-4 md:mb-6 px-4">
          <motion.p className="text-[#FFD700] text-xs sm:text-sm font-mono drop-shadow-[0_0_10px_rgba(255,215,0,0.5)] drop-shadow-[0_0_20px_rgba(255,215,0,0.3)] text-center">
            {statusText}
          </motion.p>
          {isTypingStatus && (
            <motion.span
              animate={{ opacity: [1, 0, 1] }}
              transition={{ duration: 0.8, repeat: Infinity }}
              className="ml-1 text-[#FFD700] text-xs sm:text-sm font-mono drop-shadow-[0_0_10px_rgba(255,215,0,0.5)] drop-shadow-[0_0_20px_rgba(255,215,0,0.3)]"
            >
              |
            </motion.span>
          )}
        </div>
        
        <p className="text-[#D4AF37] text-lg md:text-xl drop-shadow-md mb-8 max-w-2xl text-center">
          Enterprise-grade AI voice infrastructure for white-label SaaS
        </p>

        {/* Create Your Agent Button with Glow-Track Effect */}
        <Link href="/create-agent">
          <motion.div
            className="relative px-8 py-3 bg-transparent border-2 border-[#D4AF37]/50 text-[#D4AF37] font-semibold rounded-lg overflow-hidden group cursor-pointer"
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
              >
                {/* Shimmer Effect */}
                <motion.div
                  className="absolute top-0 left-0 w-32 h-32 bg-gradient-to-br from-[#D4AF37]/20 to-transparent"
                  animate={{ x: [-100, 200], y: [-100, 200] }}
                  transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
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
