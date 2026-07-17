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

  const handleOAuthSignIn = async (provider: 'google' | 'apple') => {
    setIsLoading(true);
    setError(null);

    try {
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: `${window.location.origin}/api/auth/callback?next=/reseller`,
        },
      });

      if (oauthError) {
        setError(oauthError.message);
        setIsLoading(false);
      }
    } catch {
      setError('An unexpected error occurred. Please try again.');
      setIsLoading(false);
    }
  };

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

          {/* OAuth Providers */}
          <div className="space-y-4">
            <button
              onClick={() => handleOAuthSignIn('google')}
              disabled={isLoading}
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
              disabled={isLoading}
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
              <div className="w-full border-t border-white/10"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-transparent text-white/60">Or continue with email</span>
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