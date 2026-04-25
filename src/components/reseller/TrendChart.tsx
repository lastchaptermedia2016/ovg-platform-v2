'use client';

import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';

interface TrendChartProps {
  data: Array<{ name: string; mrr: number; leads: number }>;
}

export function TrendChart({ data }: TrendChartProps) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
        <XAxis 
          dataKey="name" 
          stroke="#ffffff40"
          tick={{ fill: '#ffffff60', fontSize: 12 }}
        />
        <YAxis 
          stroke="#ffffff40"
          tick={{ fill: '#ffffff60', fontSize: 12 }}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: '#001A2C',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '8px',
            color: '#fff'
          }}
        />
        <Legend 
          wrapperStyle={{ color: '#ffffff80', fontSize: 12 }}
        />
        <Line
          type="monotone"
          dataKey="mrr"
          name="MRR (R)"
          stroke="#0097b2"
          strokeWidth={2}
          dot={false}
          style={{ filter: 'drop-shadow(0 0 8px #0097b2)' }}
        />
        <Line
          type="monotone"
          dataKey="leads"
          name="Leads"
          stroke="#D4AF37"
          strokeWidth={2}
          dot={false}
          style={{ filter: 'drop-shadow(0 0 8px #D4AF37)' }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
