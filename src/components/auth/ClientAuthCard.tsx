"use client";

import { useState } from "react";
import Link from "next/link";

type AuthMode = 'signin' | 'signup';

export default function ClientAuthCard() {
  const [authMode, setAuthMode] = useState<AuthMode>('signin');
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      if (authMode === 'signup') {
        if (password !== confirmPassword) {
          setError('Passwords do not match');
          setIsSubmitting(false);
          return;
        }
      }
    } catch {
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="w-full max-w-md bg-cyan-950/20 backdrop-blur-xl border border-cyan-500/30 shadow-[0_0_50px_rgba(0,229,255,0.1)] rounded-2xl p-8">
      {/* Premium Branding Badge */}
      <div className="flex justify-center mb-6">
        <div className="bg-gradient-to-r from-blue-500 to-cyan-500 text-white font-bold tracking-wider px-8 py-3 rounded-full text-sm shadow-lg shadow-cyan-500/20 uppercase mb-6">
          ZEEDER AI
        </div>
      </div>

      <div className="flex flex-col items-center mb-8">
        <h2 className="text-2xl font-bold text-white tracking-tight">
          Client Portal
        </h2>
        <p className="text-sm text-zinc-300 mt-1">
          {authMode === 'signin'
            ? 'Sign in to manage your intelligent agent configurations'
            : 'Create an account to get started'}
        </p>
      </div>

      {/* Mode Toggle */}
      <div className="px-8 pb-6">
        <div className="relative bg-white/5 rounded-lg p-1">
          <div className="flex">
            <button
              onClick={() => setAuthMode('signin')}
              className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-all duration-200 ${
                authMode === 'signin'
                  ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                  : 'text-white/60 hover:text-white'
              }`}
            >
              Sign In
            </button>
            <button
              onClick={() => setAuthMode('signup')}
              className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-all duration-200 ${
                authMode === 'signup'
                  ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                  : 'text-white/60 hover:text-white'
              }`}
            >
              Sign Up
            </button>
          </div>
        </div>
      </div>

      <form onSubmit={handleAuthSubmit} className="space-y-5">
        <div>
          <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
            Email Address
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full px-4 py-3 bg-zinc-950/40 border border-zinc-700/50 rounded-xl text-white placeholder-zinc-600 focus:outline-none focus:border-cyan-400 transition-colors"
            placeholder="name@company.com"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
            Password
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="w-full px-4 py-3 bg-zinc-950/40 border border-zinc-700/50 rounded-xl text-white placeholder-zinc-600 focus:outline-none focus:border-cyan-400 transition-colors"
            placeholder="••••••••"
          />
        </div>

        {authMode === 'signup' && (
          <div>
            <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
              Confirm Password
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              className="w-full px-4 py-3 bg-zinc-950/40 border border-zinc-700/50 rounded-xl text-white placeholder-zinc-600 focus:outline-none focus:border-cyan-400 transition-colors"
              placeholder="••••••••"
            />
          </div>
        )}

        {error && (
          <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full py-3 px-4 bg-gradient-to-r from-blue-600 to-cyan-500 text-white font-medium rounded-xl shadow-lg shadow-cyan-500/10 transition-all transform active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none hover:brightness-110"
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

      {/* Footer Integration */}
      <div className="flex justify-center mt-6">
        <Link
          href="/"
          className="text-sm text-zinc-400 hover:text-white transition-colors inline-flex items-center gap-2"
        >
          ← Back to Home
        </Link>
      </div>
    </div>
  );
}