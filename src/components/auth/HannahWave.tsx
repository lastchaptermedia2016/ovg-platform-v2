'use client';

import { useEffect, useState, useRef } from 'react';

interface HannahWaveProps {
  isSpeaking: boolean;
  message: string;
  analyserRef?: React.RefObject<AnalyserNode | null>;
  isMuted?: boolean;
}

export function HannahWave({ isSpeaking, message, analyserRef, isMuted }: HannahWaveProps) {
  const [bars, setBars] = useState<number[]>([50, 70, 60, 80, 65]);
  const animationRef = useRef<number | null>(null);

  useEffect(() => {
    if (isMuted) {
      // Muted state - dimmed, static bars
      setBars([15, 20, 18, 22, 19]); // Very low, static heights
      return;
    }

    if (!isSpeaking) {
      // Idle pulse - steady low pulse
      const idleInterval = setInterval(() => {
        setBars([30, 40, 35, 45, 38]);
      }, 1000);
      
      return () => clearInterval(idleInterval);
    } else {
      // Audio-reactive animation
      const animateBars = () => {
        if (analyserRef?.current) {
          const analyser = analyserRef.current;
          const dataArray = new Uint8Array(analyser.frequencyBinCount);
          analyser.getByteFrequencyData(dataArray);
          
          // Calculate average volume from frequency data
          const average = dataArray.reduce((sum, value) => sum + value, 0) / dataArray.length;
          const normalizedVolume = average / 255; // Normalize to 0-1
          
          // Generate bar heights based on volume
          const newBars = Array(5).fill(0).map((_, i) => {
            const baseHeight = 20 + (normalizedVolume * 60); // 20-80% base
            const variation = Math.sin(Date.now() / 100 + i) * 10; // Slight variation
            const randomFactor = Math.random() * 10; // Random factor
            return Math.min(100, Math.max(10, baseHeight + variation + randomFactor));
          });
          
          setBars(newBars);
        }
        
        animationRef.current = requestAnimationFrame(animateBars);
      };
      
      animateBars();
      
      return () => {
        if (animationRef.current) {
          cancelAnimationFrame(animationRef.current);
        }
      };
    }
  }, [isSpeaking, isMuted]);

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-1 h-8">
        {bars.map((height, index) => (
          <div
            key={index}
            className={`w-1 rounded-full transition-all duration-150 ease-out ${
              isMuted ? 'bg-cyan-400/30' : 'bg-cyan-400'
            }`}
            style={{ height: `${height}%` }}
          />
        ))}
      </div>
      {message && (
        <span className="text-white/80 text-sm font-light tracking-wide">
          "{message}"
        </span>
      )}
    </div>
  );
}
