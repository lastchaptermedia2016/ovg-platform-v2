"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

interface StrategySlidesProps {
  isOpen: boolean;
  onClose: () => void;
}

const totalSlides = 14;

export default function StrategySlides({ isOpen, onClose }: StrategySlidesProps) {
  const [currentSlide, setCurrentSlide] = useState(0);

  const nextSlide = () => {
    if (currentSlide < totalSlides - 1) {
      setCurrentSlide(currentSlide + 1);
    }
  };

  const prevSlide = () => {
    if (currentSlide > 0) {
      setCurrentSlide(currentSlide - 1);
    }
  };

  const goToSlide = (index: number) => {
    setCurrentSlide(index);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-2xl">
      <AnimatePresence mode="wait">
        <motion.div
          key={currentSlide}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.3, ease: "easeInOut" }}
          className="relative w-full max-w-6xl mx-auto"
        >
          {/* Strategy Vault Container - Reseller Card Style */}
          <div className="relative bg-black/40 backdrop-blur-3xl border border-[#FFD700]/20 rounded-2xl overflow-hidden shadow-[0_0_50px_rgba(255,215,0,0.15)]">
            
            {/* Close Button - Minimalist Gold Circle */}
            <button
              onClick={onClose}
              className="absolute top-4 right-4 z-10 w-8 h-8 flex items-center justify-center bg-transparent border border-[#FFD700] rounded-full text-[#FFD700] hover:bg-[#FFD700]/10 hover:rotate-90 transition-all duration-200"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Image Container - High-Fidelity Presentation */}
            <div className="relative w-full aspect-video bg-black/20">
              <AnimatePresence mode="wait">
                <motion.div
                  key={currentSlide}
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  transition={{ duration: 0.3, ease: "easeInOut" }}
                  className="relative w-full h-full flex items-center justify-center"
                >
                  <Image
                    src={`/${currentSlide + 1}.jpg`}
                    alt={`Strategy Slide ${currentSlide + 1}`}
                    fill
                    className="object-contain"
                    priority={currentSlide === 0}
                    sizes="(max-width: 768px) 100vw, (max-width: 1200px) 80vw, 70vw"
                  />
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Control Room Navigation - Minimalist Chevrons */}
            <button
              onClick={prevSlide}
              disabled={currentSlide === 0}
              className="hidden sm:flex absolute left-4 top-1/2 -translate-y-1/2 w-16 h-16 items-center justify-center bg-transparent border border-[#FFD700]/20 rounded-full text-[#FFD700] opacity-40 hover:opacity-100 hover:border-[#FFD700] hover:bg-[#FFD700]/5 transition-all duration-300 disabled:opacity-20 disabled:cursor-not-allowed z-10"
            >
              <ChevronLeft className="w-8 h-8" />
            </button>

            <button
              onClick={nextSlide}
              disabled={currentSlide === totalSlides - 1}
              className="hidden sm:flex absolute right-4 top-1/2 -translate-y-1/2 w-16 h-16 items-center justify-center bg-transparent border border-[#FFD700]/20 rounded-full text-[#FFD700] opacity-40 hover:opacity-100 hover:border-[#FFD700] hover:bg-[#FFD700]/5 transition-all duration-300 disabled:opacity-20 disabled:cursor-not-allowed z-10"
            >
              <ChevronRight className="w-8 h-8" />
            </button>

            {/* Mobile Bottom Action Bar */}
            <div className="sm:hidden absolute bottom-4 left-4 right-4 flex justify-between items-center bg-black/60 backdrop-blur-sm border border-[#FFD700]/10 rounded-full p-2">
              <button
                onClick={prevSlide}
                disabled={currentSlide === 0}
                className="w-12 h-12 flex items-center justify-center bg-transparent border border-[#FFD700]/20 rounded-full text-[#FFD700] opacity-40 hover:opacity-100 hover:border-[#FFD700] hover:bg-[#FFD700]/5 transition-all duration-300 disabled:opacity-20 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
              
              <div className="text-[#FFD700] text-xs font-mono tracking-widest">
                {'PHASE ' + String(currentSlide + 1).padStart(2, '0') + ' // ' + String(totalSlides).padStart(2, '0')}
              </div>
              
              <button
                onClick={nextSlide}
                disabled={currentSlide === totalSlides - 1}
                className="w-12 h-12 flex items-center justify-center bg-transparent border border-[#FFD700]/20 rounded-full text-[#FFD700] opacity-40 hover:opacity-100 hover:border-[#FFD700] hover:bg-[#FFD700]/5 transition-all duration-300 disabled:opacity-20 disabled:cursor-not-allowed"
              >
                <ChevronRight className="w-6 h-6" />
              </button>
            </div>

            {/* Slide Counter - Space Mono */}
            <div className="absolute bottom-4 right-20 bg-black/60 backdrop-blur-sm border border-[#FFD700]/10 px-4 py-2 rounded-full">
              <span className="text-[#FFD700] text-sm font-mono tracking-widest">
                {'PHASE ' + String(currentSlide + 1).padStart(2, '0') + ' // ' + String(totalSlides).padStart(2, '0')}
              </span>
            </div>

            {/* Slide Indicators */}
            <div className="absolute bottom-4 right-4 flex space-x-2 items-center">
              {Array.from({ length: totalSlides }, (_, index) => (
                <button
                  key={index}
                  onClick={() => goToSlide(index)}
                  className={`w-2 h-2 rounded-full transition-all duration-200 ${
                    index === currentSlide 
                      ? 'bg-[#FFD700] w-6' 
                      : 'bg-white/30 hover:bg-white/50'
                  }`}
                />
              ))}
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
