'use client';

interface VehicleBadgeProps {
  vin: string;
  industry: string;
}

export function VehicleBadge({ vin, industry }: VehicleBadgeProps) {
  if (industry.toUpperCase() !== 'AUTOMOTIVE') {
    return null;
  }

  // Truncate VIN for display: show first 8 chars + "..."
  const displayVin = vin.length > 11 ? `${vin.slice(0, 8)}...` : vin;

  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-1 text-[10px] tracking-[0.1em] bg-slate-900/40 border border-slate-400/50 rounded text-slate-300 uppercase font-mono"
      title={vin}
    >
      <svg
        className="w-3 h-3 text-slate-400 flex-shrink-0"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
        />
      </svg>
      {displayVin}
    </span>
  );
}