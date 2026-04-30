'use client';
import { useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';

const NAV_ITEMS = [
  { label: 'CLIENTS', href: '' },
  { label: 'BRANDING', href: 'branding' },
  { label: 'REVENUE', href: 'revenue' },
  { label: 'AI ENGINE', href: 'ai-engine' },
  { label: 'SIGNAL', href: 'signal' }
];

export default function SovereignNav({ slug }: { slug: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [isNavigating, setIsNavigating] = useState<string | null>(null);

  const handleNavigation = (path: string, href: string) => {
    setIsNavigating(href);
    router.push(path);
  };
  
  return (
    <nav className="grid grid-cols-2 md:grid-cols-5 gap-2 w-full group relative z-[999] pointer-events-auto mb-8">
      {NAV_ITEMS.map((item, index) => {
        const isActive = pathname.endsWith(item.href) || (item.href === '' && pathname.endsWith(slug));
        const isDimmed = isNavigating !== null && isNavigating !== item.href;
        const fullPath = item.href === '' 
          ? `/reseller/${slug}/clients` 
          : `/reseller/${slug}/${item.href}`;
        const isClients = item.label === 'CLIENTS';
        const isLast = index === NAV_ITEMS.length - 1;
        
        return (
          <button
            key={item.label}
            onClick={(e) => {
              e.stopPropagation();
              console.log("CORE SIGNAL:", item.label, "CLICKED");
              handleNavigation(fullPath, item.href);
            }}
            className={`backdrop-blur-xl bg-white/5 border border-white/10 rounded-lg transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] cursor-pointer pointer-events-auto hover:scale-[1.02] group-hover:border-[#0097b2] group-hover:shadow-[0_0_25px_rgba(0,151,178,0.6)] group-hover:bg-[rgba(34,102,131,0.3)] min-h-[44px] flex items-center justify-center ${isLast ? 'col-span-2 md:col-span-1' : ''} ${
              isActive ? 'border-[#0097b2] shadow-[0_0_25px_rgba(0,151,178,0.6)] bg-[rgba(34,102,131,0.3)]' : ''
            } ${isDimmed ? 'opacity-30' : ''}`}
            style={{
              transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
              outline: isClients ? '2px solid lime' : 'none'
            }}
          >
            <span 
              className={`block text-xs font-light tracking-[0.2em] uppercase text-center py-2 transition-all duration-300 hover:tracking-[0.25em] hover:text-white ${
                isActive ? 'text-white' : 'text-white/80'
              }`}
              style={{
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
              }}
              onMouseEnter={(e) => e.currentTarget.style.textShadow = '0 0 10px #0097b2'}
              onMouseLeave={(e) => {
                if (!isActive) e.currentTarget.style.textShadow = 'none';
              }}
            >
              {item.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
