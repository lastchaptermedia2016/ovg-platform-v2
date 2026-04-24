'use client';

export function ActivityMap() {
  const pings = [
    { x: 30, y: 40, delay: 0 },
    { x: 60, y: 55, delay: 1 },
    { x: 45, y: 70, delay: 2 },
    { x: 75, y: 35, delay: 1.5 },
  ];

  return (
    <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-lg p-4 select-none">
      <h3 className="text-sm font-semibold text-white mb-4 tracking-tight">Global Activity</h3>
      <div className="relative w-full h-[150px] bg-white/5 rounded-lg overflow-hidden">
        <svg viewBox="0 0 100 100" className="w-full h-full" preserveAspectRatio="xMidYMid slice">
          {/* Simplified world map outline */}
          <path
            d="M20,30 Q30,25 40,30 T60,28 T80,32 Q85,40 80,50 T75,65 Q70,75 60,72 T40,75 Q30,78 25,70 T20,50 Z"
            fill="none"
            stroke="rgba(255,255,255,0.1)"
            strokeWidth="0.5"
          />
          
          {/* Ping animations */}
          {pings.map((ping, index) => (
            <g key={index}>
              <circle
                cx={ping.x}
                cy={ping.y}
                r="2"
                fill="#0097b2"
                style={{
                  animation: `ping 2s cubic-bezier(0, 0, 0.2, 1) infinite`,
                  animationDelay: `${ping.delay}s`,
                }}
              />
              <circle
                cx={ping.x}
                cy={ping.y}
                r="1"
                fill="#d4af37"
              />
            </g>
          ))}
        </svg>
      </div>
      <style jsx>{`
        @keyframes ping {
          75%, 100% {
            transform: scale(3);
            opacity: 0;
          }
        }
      `}</style>
    </div>
  );
}
