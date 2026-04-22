"use client";

import { User } from "@supabase/supabase-js";

interface HeaderProps {
  user: User;
}

export function Header({ user }: HeaderProps) {
  return (
    <header className="bg-[#001A2C] border-b border-[var(--primary-gold)]/30 px-6 py-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-white font-semibold">Dashboard</h2>
          <p className="text-white/50 text-sm">Welcome back, {user.email}</p>
        </div>

        <div className="flex items-center gap-4">
          <div className="w-8 h-8 rounded-full bg-[var(--primary-gold)]/20 border border-[var(--primary-gold)] flex items-center justify-center">
            <span className="text-[var(--primary-gold)] text-sm font-semibold">
              {user.email?.[0]?.toUpperCase() || "U"}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}
