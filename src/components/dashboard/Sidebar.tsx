"use client";

interface SidebarProps {
  role: string;
}

export function Sidebar({ role }: SidebarProps) {
  return (
    <aside className="w-64 bg-[#001A2C] border-r border-[var(--primary-gold)]/30 flex flex-col">
      <div className="p-6 border-b border-[var(--primary-gold)]/20">
        <h1 className="text-[var(--primary-gold)] font-bold text-xl">
          OVG Platform
        </h1>
        <p className="text-white/50 text-xs mt-1 capitalize">
          {role} Dashboard
        </p>
      </div>

      <nav className="flex-1 p-4 space-y-2">
        <a
          href="/dashboard"
          className="block px-4 py-2 text-white/80 hover:text-[var(--primary-gold)] hover:bg-white/5 rounded-lg transition-colors"
        >
          Overview
        </a>
        {role === "reseller" && (
          <a
            href="/dashboard/tenants"
            className="block px-4 py-2 text-white/80 hover:text-[var(--primary-gold)] hover:bg-white/5 rounded-lg transition-colors"
          >
            Tenants
          </a>
        )}
        {role === "client" && (
          <a
            href="/dashboard/widget"
            className="block px-4 py-2 text-white/80 hover:text-[var(--primary-gold)] hover:bg-white/5 rounded-lg transition-colors"
          >
            Widget Settings
          </a>
        )}
        <a
          href="/dashboard/settings"
          className="block px-4 py-2 text-white/80 hover:text-[var(--primary-gold)] hover:bg-white/5 rounded-lg transition-colors"
        >
          Settings
        </a>
      </nav>

      <div className="p-4 border-t border-[var(--primary-gold)]/20">
        <a
          href="/sign-out"
          className="block px-4 py-2 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors text-sm"
        >
          Sign Out
        </a>
      </div>
    </aside>
  );
}
