'use client';

import { useState } from 'react';
import { checkClientStatus, ClientStatus } from '@/utils/heartbeat';

interface StatusDotProps {
  lastSeen?: string;
}

export function StatusDot({ lastSeen }: StatusDotProps) {
  const [isHovered, setIsHovered] = useState(false);
  const { status, lastSeenText } = checkClientStatus(lastSeen);

  const getStatusStyles = () => {
    switch (status) {
      case 'online':
        return {
          dotColor: 'bg-[#22c55e]',
          shadowColor: 'shadow-[0_0_8px_#22c55e]',
          animation: 'animate-pulse-green',
          tooltipColor: 'text-[#22c55e]'
        };
      case 'warning':
        return {
          dotColor: 'bg-[#FFB000]',
          shadowColor: 'shadow-[0_0_8px_#FFB000]',
          animation: 'animate-pulse',
          tooltipColor: 'text-[#FFB000]'
        };
      case 'offline':
        return {
          dotColor: 'bg-[#DC143C]',
          shadowColor: 'shadow-[0_0_8px_#DC143C]',
          animation: '',
          tooltipColor: 'text-[#DC143C]'
        };
      default:
        return {
          dotColor: 'bg-gray-500',
          shadowColor: '',
          animation: '',
          tooltipColor: 'text-gray-500'
        };
    }
  };

  const styles = getStatusStyles();

  return (
    <div 
      className="relative inline-block"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div 
        className={`w-2 h-2 rounded-full ${styles.dotColor} ${styles.shadowColor} ${styles.animation}`}
      />

      {isHovered && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 backdrop-blur-xl bg-white/10 border border-white/20 rounded text-[9px] whitespace-nowrap z-50">
          <span className={styles.tooltipColor}>
            {status === 'online' ? 'Online' : `Last signal: ${lastSeenText}`}
          </span>
        </div>
      )}
    </div>
  );
}
