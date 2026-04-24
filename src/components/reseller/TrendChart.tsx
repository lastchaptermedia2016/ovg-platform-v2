'use client';

import { LineChart, Line, ResponsiveContainer } from 'recharts';
import { useEffect, useRef, useState } from 'react';

interface TrendChartProps {
  data: Array<{ name: string; mrr: number; leads: number }>;
}

export function TrendChart({ data }: TrendChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateDimensions = () => {
      requestAnimationFrame(() => {
        const { width, height } = container.getBoundingClientRect();
        // Strict dimension gate: only proceed if width > 0
        if (width > 0 && height > 0) {
          setDimensions({ width, height });
          setIsReady(true);
        }
      });
    };

    const resizeObserver = new ResizeObserver(() => {
      // 50ms debounce via setTimeout
      setTimeout(updateDimensions, 50);
    });

    resizeObserver.observe(container);

    // Initial check with debounce
    setTimeout(updateDimensions, 50);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  // Strict dimension gate: return null if dimensions are invalid
  if (!isReady || dimensions.width <= 0 || dimensions.height <= 0) {
    return null;
  }

  return (
    <div ref={containerRef} className="w-full h-[200px] aspect-[2/1]">
      <ResponsiveContainer 
        width="100%" 
        height="100%" 
        minWidth={0} 
        minHeight={undefined}
        key={`${dimensions.width}-${dimensions.height}`}
      >
        <LineChart data={data}>
          <Line
            type="monotone"
            dataKey="mrr"
            stroke="#0097b2"
            strokeWidth={2}
            dot={false}
            style={{ filter: 'drop-shadow(0 0 8px #0097b2)' }}
          />
          <Line
            type="monotone"
            dataKey="leads"
            stroke="#226683"
            strokeWidth={2}
            dot={false}
            style={{ filter: 'drop-shadow(0 0 8px #226683)' }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
