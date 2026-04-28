export function SignalWave() {
  return (
    <div className="absolute bottom-0 left-0 right-0 h-8 overflow-hidden opacity-40 pointer-events-none z-0">
      <svg
        className="w-full h-full"
        viewBox="0 0 400 32"
        preserveAspectRatio="none"
      >
        <path
          d="M0,16 Q50,8 100,16 T200,16 T300,16 T400,16"
          fill="none"
          stroke="#0097b2"
          strokeWidth="2"
          className="animate-pulse"
        />
        <path
          d="M0,20 Q50,12 100,20 T200,20 T300,20 T400,20"
          fill="none"
          stroke="#0097b2"
          strokeWidth="1"
          opacity="0.5"
          className="animate-pulse"
          style={{ animationDelay: '0.2s' }}
        />
      </svg>
    </div>
  );
}
