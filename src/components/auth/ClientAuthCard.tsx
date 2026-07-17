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

  const handleOAuthSignIn = useCallback(async (provider: 'google' | 'apple') => {
    setIsSubmitting(true);
    setError(null);

    try {
      const supabase = createClient();
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: `${window.location.origin}/api/auth/callback?next=/client/dashboard`,
        },
      });

      if (oauthError) {
        setError(oauthError.message);
        setIsSubmitting(false);
      }
    } catch {
      setError('An unexpected error occurred. Please try again.');
      setIsSubmitting(false);
    }
  }, [setIsSubmitting, setError]);

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

        {/* OAuth Providers */}
        <div className="space-y-4 mb-6">
          <button
            onClick={() => handleOAuthSignIn('google')}
            disabled={isSubmitting}
            className="w-full h-12 flex items-center justify-center gap-4 px-5 bg-white/5 border border-cyan-500/40 rounded-lg text-white text-sm font-medium tracking-wide hover:border-cyan-400 hover:bg-white/10 hover:shadow-[0_0_15px_rgba(0,229,255,0.2)] transition-all duration-200 disabled:opacity-50"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.03 2.53-2.16 3.31v2.77h3.49c2.04-1.88 3.24-4.64 3.24-7.89z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.49-2.77c-.98.66-2.23 1.06-3.79 1.06-2.91 0-5.37-1.96-6.25-4.63H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.75 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.57-2.84z" fill="#FBBC05"/>
              <path d="M12 5.38c1.64 0 3.11.56 4.27 1.67l3.2-3.2C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.57 2.84c.88-2.67 3.34-4.53 6.25-4.53z" fill="#EA4335"/>
            </svg>
            Continue with Google
          </button>
          {process.env.NEXT_PUBLIC_ENABLE_APPLE_AUTH === 'true' && (
            <button
              onClick={() => handleOAuthSignIn('apple')}
              disabled={isSubmitting}
              className="w-full h-12 flex items-center justify-center gap-4 px-5 bg-white/5 border border-cyan-500/40 rounded-lg text-white text-sm font-medium tracking-wide hover:border-cyan-400 hover:bg-white/10 hover:shadow-[0_0_15px_rgba(0,229,255,0.2)] transition-all duration-200 disabled:opacity-50"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="currentColor">
                <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
              </svg>
              Continue with Apple
            </button>
          )}
        </div>

        {/* Divider */}
        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-slate-800/80"></div>
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-2 bg-transparent text-slate-400 text-xs">Or continue with email</span>
          </div>
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