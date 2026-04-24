'use client';

import { Trophy } from 'lucide-react';

interface Performer {
  id: string;
  name: string;
  value: string;
  change: string;
  trend: 'up' | 'down';
}

export function TopPerformers() {
  const performers: Performer[] = [
    { id: '1', name: 'Apex Motors', value: 'R12,450', change: '+15%', trend: 'up' },
    { id: '2', name: 'Premier Auto Group', value: 'R9,820', change: '+12%', trend: 'up' },
    { id: '3', name: 'TechFlow SaaS', value: 'R7,340', change: '+8%', trend: 'up' },
  ];

  return (
    <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-lg p-4 select-none">
      <div className="flex items-center gap-2 mb-4">
        <Trophy className="w-4 h-4 text-[#d4af37]" />
        <h3 className="text-sm font-semibold text-white tracking-tight" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
          Top Performers
        </h3>
      </div>
      <div className="space-y-2">
        {performers.map((performer, index) => (
          <div key={performer.id} className="flex items-center justify-between p-2 bg-white/5 rounded-lg border border-white/5 hover:border-white/10 transition-colors">
            <div className="flex items-center gap-3">
              <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-xs font-bold text-white/70">
                {index + 1}
              </div>
              <div>
                <p className="text-xs font-medium text-white" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
                  {performer.name}
                </p>
                <p className="text-[10px] text-white/50">{performer.value}</p>
              </div>
            </div>
            <span className={`text-[10px] font-medium ${performer.trend === 'up' ? 'text-green-400' : 'text-red-400'}`}>
              {performer.change}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
