'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { motion } from 'framer-motion';

// Production Excellence: Stable Neural Link Messages
const NEURAL_MESSAGES = [
  "ZEEDER AI: Neural Link establishing secure connection...",
  "Hannah: Preparing your ZEEDER AI workspace...",
  "AI Core: Optimizing ZEEDER AI platform...",
  "System Ready: ZEEDER AI reseller platform awaits..."
];

export default function AuthPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [currentGreeting, setCurrentGreeting] = useState(0);
  const [displayedText, setDisplayedText] = useState('');
  const [isTyping, setIsTyping] = useState(true);

  const router = useRouter();
  const supabase = createClient();

  // Production Excellence: Memoized messages for stability
  const greetings = useMemo(() => NEURAL_MESSAGES, []);

  // Production Excellence: Live slug generation
  const generateSlug = (name: string): string => {
    return name.toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '') // Remove special characters
      .replace(/\s+/g, '-') // Replace spaces with hyphens
      .replace(/-+/g, '-') // Replace multiple hyphens with single
      .trim() || 'your-company';
  };

  // Production Excellence: Typewriter Effect Implementation
  useEffect(() => {
    const currentMessage = greetings[currentGreeting];
    let currentIndex = 0;
    let typingInterval: NodeJS.Timeout;
    let deleteTimeout: NodeJS.Timeout;

    const typeMessage = () => {
      if (currentIndex <= currentMessage.length) {
        setDisplayedText(currentMessage.slice(0, currentIndex));
        currentIndex++;
        typingInterval = setTimeout(typeMessage, 50);
      } else {
        setIsTyping(false);
        // Wait before starting next message
        deleteTimeout = setTimeout(() => {
          setIsTyping(true);
          setCurrentGreeting((prev) => (prev + 1) % greetings.length);
        }, 3000);
      }
    };

    typeMessage();

    return () => {
      clearTimeout(typingInterval);
      clearTimeout(deleteTimeout);
    };
  }, [currentGreeting, greetings]);

  // Production Excellence: Active session guard — getUser + user_resellers
  useEffect(() => {
    const checkUser = async () => {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) return;

      const { data: userResellerData, error: linkError } = await supabase
        .from('user_resellers')
        .select(`
          role,
          resellers (
            slug,
            tenant_id
          )
        `)
        .eq('user_id', user.id)
        .maybeSingle();

      if (linkError) {
        console.error('OVG-PLATFORM-V2: Error querying user_resellers:', linkError);
        return;
      }

      const assignedReseller = userResellerData?.resellers as unknown as { slug: string; tenant_id: string } | null;
      const resellerSlug = assignedReseller?.slug || assignedReseller?.tenant_id;

      if (resellerSlug) {
        router.push(`/reseller/${resellerSlug}/clients`);
      } else {
        setError('Your account is not linked to a reseller. Please contact support.');
      }
    };

    checkUser();
  }, [router, supabase]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      if (!email || email.trim() === '') {
        setError('Email is required');
        setIsLoading(false);
        return;
      }

      if (!password || password.trim() === '') {
        setError('Password is required');
        setIsLoading(false);
        return;
      }

      const { data: { session }, error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: password,
      });

      if (authError) {
        setError(authError.message);
        setIsLoading(false);
        return;
      }

      if (session) {
        // Derive redirect from user_resellers table via nested join on resellers(slug)
        const { data: userResellerData, error: linkError } = await supabase
          .from('user_resellers')
          .select(`
            role,
            resellers (
              slug,
              tenant_id
            )
          `)
          .eq('user_id', session.user.id)
          .maybeSingle();

        if (linkError) {
          console.error('OVG-PLATFORM-V2: Error querying user_resellers:', linkError);
        }

        const assignedReseller = userResellerData?.resellers as unknown as { slug: string; tenant_id: string } | null;
        const resellerSlug = assignedReseller?.slug || assignedReseller?.tenant_id;

        if (resellerSlug) {
          router.push(`/reseller/${resellerSlug}/clients`);
        } else {
          setError('Your account is not linked to a reseller. Please contact support.');
        }
      } else {
        setError('Authentication failed. Please try again.');
      }

    } catch {
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    // Validate passwords match and company name provided
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      setIsLoading(false);
      return;
    }

    if (!companyName.trim()) {
      setError('Company name is required for reseller accounts');
      setIsLoading(false);
      return;
    }

    try {
      // Generate slug from company name for database trigger
      const slug = companyName.toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .trim();

      const { data, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            company_name: companyName.trim(),
            role: 'reseller',
            reseller_slug: slug,
          }
        }
      });

      if (authError) {
        setError(authError.message);
        setIsLoading(false);
        return;
      }

      // Production Excellence: Duplicate detection
      if (data.user && (!data.user.identities || data.user.identities.length === 0)) {
        setError('An account with this email already exists. Please sign in.');
        setIsLoading(false);
        return;
      }

      if (data.session) {
        router.push(`/reseller/${slug}/clients`);
      } else {
        setError('Please check your email to confirm your account.');
      }

    } catch {
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen relative flex flex-col justify-center p-4">
      {/* Production Excellence: Original Background Image - No Overlays */}
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{
          backgroundImage: "url('/reseller-bg.jpg')",
          backgroundSize: 'cover',
        }}
      />

      {/* Production Excellence: Fixed Branding Header */}
      <header className="fixed top-0 left-0 right-0 z-20 bg-black/40 backdrop-blur-md border-b border-white/10">
        <div className="max-w-7xl mx-auto px-6 py-3 flex justify-between items-center">
          {/* Left Branding: POWERED BY PIERRE AI */}
          <div className="flex items-center space-x-2">
            <span className="text-white/60 text-[10px] font-light tracking-wider uppercase">
              POWERED BY PIERRE
            </span>
            <motion.span
              animate={{
                scale: [1, 1.1, 1],
                opacity: [0.8, 1, 0.8]
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: "easeInOut"
              }}
              className="text-[#FFD700] text-[10px] font-bold tracking-wider uppercase drop-shadow-[0_0_15px_rgba(255,215,0,0.5)]"
            >
              AI
            </motion.span>
          </div>

          {/* Right Branding: ZEEDER AI RESELLER */}
          <div className="flex items-center space-x-4">
            <span className="text-white/80 text-[10px] font-medium tracking-wider uppercase">
              ZEEDER AI
            </span>
            <div className="w-px h-3 bg-white/20" />
            <span className="text-cyan-400 text-[10px] font-bold tracking-wider uppercase">
              RESELLER
            </span>
          </div>
        </div>
      </header>

      <div className="w-full max-w-md relative z-10 mt-16">
        <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="p-8 text-center">
            <div className="mb-6">
              <div className="px-12 py-4 bg-gradient-to-br from-cyan-400 to-blue-600 rounded-full mx-auto flex items-center justify-center shadow-lg shadow-cyan-400/50">
                <span className="text-white font-bold tracking-widest">ZEEDER AI</span>
              </div>
            </div>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, ease: "easeInOut" }}
              className="mb-4"
            >
              <h1 className="text-2xl font-light text-white mb-2">
                {mode === 'signin' ? 'Welcome Back' : 'Create Account'}
              </h1>
              <div className="flex items-center justify-center">
                <p className="text-cyan-400 text-sm font-mono drop-shadow-[0_0_10px_rgba(0,255,255,0.5)] drop-shadow-[0_0_20px_rgba(0,255,255,0.3)]">
                  {displayedText}
                </p>
                {isTyping && (
                  <motion.span
                    animate={{ opacity: [1, 0, 1] }}
                    transition={{ duration: 0.8, repeat: Infinity }}
                    className="ml-1 text-cyan-400 text-sm font-mono drop-shadow-[0_0_10px_rgba(0,255,255,0.5)] drop-shadow-[0_0_20px_rgba(0,255,255,0.3)]"
                  >
                    |
                  </motion.span>
                )}
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5, duration: 0.8 }}
              className="mt-4"
            >
              <p className="text-white/60 text-sm">
                {mode === 'signin'
                  ? 'Sign in to access your reseller dashboard'
                  : 'Sign up to start managing your clients'
                }
              </p>
            </motion.div>
          </div>

          {/* Mode Toggle */}
          <div className="px-8 pb-6">
            <div className="relative bg-white/5 rounded-lg p-1">
              <div className="flex">
                <button
                  onClick={() => setMode('signin')}
                  className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-all duration-200 ${
                    mode === 'signin'
                      ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                      : 'text-white/60 hover:text-white'
                  }`}
                >
                  Sign In
                </button>
                <button
                  onClick={() => setMode('signup')}
                  className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-all duration-200 ${
                    mode === 'signup'
                      ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                      : 'text-white/60 hover:text-white'
                  }`}
                >
                  Sign Up
                </button>
              </div>
            </div>
          </div>

          {/* Form */}
          <div className="px-8 pb-8">
            <form onSubmit={mode === 'signin' ? handleLogin : handleSignUp} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-white/80 mb-2">
                  Email Address
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-cyan-400 focus:bg-white/10 transition-all duration-200"
                  placeholder="Enter your email"
                  required
                  disabled={isLoading}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-white/80 mb-2">
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-cyan-400 focus:bg-white/10 transition-all duration-200"
                  placeholder="Enter your password"
                  required
                  disabled={isLoading}
                />
              </div>

              {mode === 'signup' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-white/80 mb-2">
                      Company Name
                    </label>
                    <input
                      type="text"
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      autoComplete="organization"
                      className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-cyan-400 focus:bg-white/10 transition-all duration-200"
                      placeholder="Enter your company name"
                      required
                      disabled={isLoading}
                    />
                    {companyName && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.3, ease: "easeOut" }}
                        className="mt-2 inline-flex items-center px-3 py-1 rounded-full bg-gradient-to-r from-cyan-500/20 to-blue-500/20 border border-cyan-400/30 shadow-lg shadow-cyan-400/20"
                      >
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 bg-cyan-400 rounded-full animate-pulse shadow-[0_0_8px_rgba(6,182,212,0.8)]" />
                          <span className="text-xs text-cyan-300 font-mono">
                            reseller/{generateSlug(companyName)}
                          </span>
                        </div>
                      </motion.div>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-white/80 mb-2">
                      Confirm Password
                    </label>
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      autoComplete="new-password"
                      className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-cyan-400 focus:bg-white/10 transition-all duration-200"
                      placeholder="Confirm your password"
                      required
                      disabled={isLoading}
                    />
                  </div>
                </>
              )}

              {error && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                  <p className="text-red-400 text-sm">{error}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3 bg-gradient-to-r from-cyan-500 to-blue-600 text-white rounded-lg font-medium hover:from-cyan-600 hover:to-blue-700 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-offset-2 focus:ring-offset-black transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <span className="flex items-center justify-center">
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    {mode === 'signin' ? 'Signing In...' : 'Creating Account...'}
                  </span>
                ) : (
                  mode === 'signin' ? 'Sign In' : 'Create Account'
                )}
              </button>
            </form>
          </div>

          {/* Footer */}
          <div className="px-8 py-4 border-t border-white/10 text-center">
            <p className="text-white/60 text-sm">
              {mode === 'signin' ? "Don't have an account?" : "Already have an account?"}{' '}
              <button
                onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
                className="text-cyan-400 hover:text-cyan-300 font-medium transition-colors duration-200"
              >
                {mode === 'signin' ? 'Sign Up' : 'Sign In'}
              </button>
            </p>
          </div>
        </div>

        {/* Back to Home */}
        <div className="mt-6 text-center">
          <Link
            href="/"
            className="text-white/60 hover:text-white text-sm transition-colors duration-200"
          >
            ← Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
}