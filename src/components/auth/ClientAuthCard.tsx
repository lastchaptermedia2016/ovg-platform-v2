"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";

type AuthMode = 'signin' | 'signup';

export default function ClientAuthCard() {
  const router = useRouter();
  const [authMode, setAuthMode] = useState<AuthMode>('signin');
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAuthSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setIsSubmitting(true);
      setError(null);

      try {
        const supabase = createClient();
        if (authMode === "signup") {
          if (password !== confirmPassword) {
            setError("Passwords do not match");
            setIsSubmitting(false);
            return;
          }

          const { data, error: signUpError } =
            await supabase.auth.signUp({
              email,
              password,
              options: {
                emailRedirectTo: `${window.location.origin}/client/dashboard`,
              },
            });

          if (signUpError) {
            setError(
              signUpError.message ??
                "Account creation failed. Please try again.",
            );
            setIsSubmitting(false);
            return;
          }

          if (data.session) {
            router.replace("/client/dashboard");
            router.refresh();
            return;
          }

          setError(
            "Account created. Please verify your email before continuing.",
          );
          setIsSubmitting(false);
          return;
        }

        const { error: signInError } =
          await supabase.auth.signInWithPassword({
            email,
            password,
          });

        if (signInError) {
          setError(
            signInError.message ?? "Sign-in failed. Please try again.",
          );
          setIsSubmitting(false);
          return;
        }

        router.replace("/client/dashboard");
        router.refresh();
      } catch {
        setError("An unexpected error occurred. Please try again.");
        setIsSubmitting(false);
      }
    },
    [
      authMode,
      email,
      password,
      confirmPassword,
      router,
      setIsSubmitting,
      setError,
    ],
  );

  return (
    <div className="w-full max-w-md mx-auto bg-slate-950/15 backdrop-blur-xl border border-white/10 shadow-[0_0_50px_rgba(0,229,255,0.1)] rounded-2xl p-6 shadow-2xl relative overflow-hidden font-agrandir">
      {/* Top Terminal Status Indicator — Ticker Tape */}
      <div className="text-center mb-5 border-b border-cyan-950/60 pb-3 overflow-hidden">
        <span className="block whitespace-nowrap text-[10px] font-mono text-cyan-400 tracking-widest animate-marquee">
          System Ready: ZEEDER AI client platform | System Ready: ZEEDER AI client platform |
        </span>
      </div>

      <div className="flex flex-col items-center">
        {/* Compact Logo Capsule */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-full px-4 py-1.5 flex items-center gap-1.5 mb-6 shadow-inner">
          <span className="font-agrandir font-black text-xs tracking-wider text-white">ZEEDER</span>
          <span className="font-agrandir font-light text-xs text-blue-400 tracking-wide animate-pulse lowercase">engage</span>
        </div>

        {/* Scaled-down Headers */}
        <h2 className="font-agrandir font-black text-lg md:text-xl text-white tracking-wide text-center mb-1.5">
          Client Portal
        </h2>
        <p className="font-agrandir font-light text-[11px] md:text-xs text-zinc-300/90 text-center max-w-xs mb-6 leading-relaxed">
          {authMode === 'signin'
            ? 'Sign in to manage your intelligent agent configurations'
            : 'Create an account to get started'}
        </p>

        {/* Compact Toggle Tabs */}
        <div className="grid grid-cols-2 gap-2 w-full bg-slate-950/80 p-1 rounded-lg border border-slate-900/80 mb-6">
          <button
            onClick={() => setAuthMode('signin')}
            className={`py-1.5 rounded-md text-[11px] font-medium transition-all duration-300 ${
              authMode === 'signin'
                ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 shadow-sm shadow-cyan-500/5'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Sign In
          </button>
          <button
            onClick={() => setAuthMode('signup')}
            className={`py-1.5 rounded-md text-[11px] font-medium transition-all duration-300 ${
              authMode === 'signup'
                ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 shadow-sm shadow-cyan-500/5'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Sign Up
          </button>
        </div>

        {/* Input Form with Compact Typography */}
        <form onSubmit={handleAuthSubmit} className="w-full space-y-4">
          <div className="space-y-1">
            <label className="block text-[9px] font-bold text-slate-500 tracking-widest uppercase ml-0.5">
              Email Address
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full bg-slate-900/50 border border-slate-800/80 rounded-lg px-3 py-2 text-[11px] md:text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 transition-all"
              placeholder="name@company.com"
            />
          </div>

          <div className="space-y-1 relative">
            <label className="block text-[9px] font-bold text-slate-500 tracking-widest uppercase ml-0.5">
              Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full bg-slate-900/50 border border-slate-800/80 rounded-lg px-3 py-2 text-[11px] md:text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 transition-all pr-12"
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white transition-colors"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {authMode === 'signup' && (
            <div className="space-y-1">
              <label className="block text-[9px] font-bold text-slate-500 tracking-widest uppercase ml-0.5">
                Confirm Password
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                className="w-full bg-slate-900/50 border border-slate-800/80 rounded-lg px-3 py-2 text-[11px] md:text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 transition-all"
                placeholder="••••••••"
              />
            </div>
          )}

          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
              <p className="text-red-400 text-xs">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 text-white font-semibold text-[11px] md:text-xs py-2 rounded-lg mt-2 shadow-lg shadow-cyan-500/10 hover:shadow-cyan-500/20 transition-all duration-300 disabled:opacity-50 disabled:pointer-events-none"
          >
            {isSubmitting
              ? authMode === 'signin'
                ? 'Signing In...'
                : 'Creating Account...'
              : authMode === 'signin'
                ? 'Sign In'
                : 'Create Account'}
          </button>
        </form>

        {/* Compact Back Navigation */}
        <div className="flex justify-center mt-6">
          <Link
            href="/"
            className="text-[10px] text-zinc-400 hover:text-white transition-colors inline-flex items-center gap-1"
          >
            ← Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
}