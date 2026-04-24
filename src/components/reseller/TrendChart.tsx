'use client';

import { LineChart, Line, ResponsiveContainer } from 'recharts';

interface TrendChartProps {
  data: Array<{ name: string; mrr: number; leads: number }>;
}

export function TrendChart({ data }: TrendChartProps) {
  return (
    <div className="w-full h-[200px]">
      <ResponsiveContainer width="100%" height="100%">
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
