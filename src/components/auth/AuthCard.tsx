"use client";

import { useState } from "react";

export default function AuthCard() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    // Unified Reseller auth logic maps here using email identifier for /auth
    setIsSubmitting(false);
  };

  return (
    <div className="w-full max-w-md bg-zinc-900/80 backdrop-blur-md border border-zinc-800 rounded-2xl p-8 shadow-2xl">
      <div className="flex flex-col items-center mb-8">
        <h2 className="text-2xl font-bold text-white tracking-tight">
          {isSignUp ? "Create Reseller Account" : "Reseller Portal"}
        </h2>
        <p className="text-sm text-zinc-400 mt-1">
          {isSignUp ? "Register with your master credential" : "Sign in using your reseller email identifier"}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
            Reseller Email
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full px-4 py-3 bg-zinc-950 border border-zinc-800 rounded-xl text-white placeholder-zinc-600 focus:outline-none focus:border-cyan-500 transition-colors"
            placeholder="partner@zeeder.ai"
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
            className="w-full px-4 py-3 bg-zinc-950 border border-zinc-800 rounded-xl text-white placeholder-zinc-600 focus:outline-none focus:border-cyan-500 transition-colors"
            placeholder="••••••••"
          />
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full py-3 px-4 bg-zinc-100 hover:bg-white text-zinc-950 font-medium rounded-xl transition-all transform active:scale-[0.98] disabled:opacity-50"
        >
          {isSubmitting ? "Processing..." : isSignUp ? "Sign Up" : "Sign In"}
        </button>
      </form>

      <div className="mt-6 text-center">
        <button
          type="button"
          onClick={() => setIsSignUp(!isSignUp)}
          className="text-xs text-zinc-500 hover:text-cyan-400 transition-colors"
        >
          {isSignUp ? "Already have an account? Sign In" : "Need a reseller account? Register here"}
        </button>
      </div>
    </div>
  );
}