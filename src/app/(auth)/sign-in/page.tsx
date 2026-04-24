"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";

const TEST_CREDENTIALS = {
  email: "test-reseller@acme-corp.com",
  password: "TestPass123!",
};

const isDevelopment = process.env.NODE_ENV === "development";

export default function SignInPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoLoggedIn, setAutoLoggedIn] = useState(false);

  // Auto-login for development environment
  useEffect(() => {
    if (isDevelopment && !autoLoggedIn) {
      console.log("🚀 Development auto-login triggered");
      setEmail(TEST_CREDENTIALS.email);
      setPassword(TEST_CREDENTIALS.password);

      // Auto-login after a short delay to show the form briefly
      const timer = setTimeout(() => {
        handleSignIn(TEST_CREDENTIALS.email, TEST_CREDENTIALS.password);
        setAutoLoggedIn(true);
      }, 500);

      return () => clearTimeout(timer);
    }
  }, [autoLoggedIn]);

  const handleSignIn = async (emailToUse: string, passwordToUse: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const supabase = createClient();
      const { data, error: signInError } =
        await supabase.auth.signInWithPassword({
          email: emailToUse,
          password: passwordToUse,
        });

      if (signInError) {
        // Development: Auto-signup if user doesn't exist
        if (isDevelopment && signInError.message.includes("Invalid login credentials")) {
          console.log("🔧 User not found, attempting auto-signup...");
          
          const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
            email: emailToUse,
            password: passwordToUse,
            options: {
              data: {
                reseller_slug: "acme-corp",
                role: "reseller",
              },
            },
          });

          if (signUpError) {
            throw signUpError;
          }

          if (signUpData.user) {
            console.log("✅ Auto-signed up:", signUpData.user.email);
            console.log("⚠️  Note: User metadata set. Run SQL script to link to reseller in database.");
            
            // Redirect to dashboard (will use fallback branding)
            router.push(`/reseller/acme-corp`);
            return;
          }
        }
        throw signInError;
      }

      if (data.user) {
        console.log("✅ Signed in as:", data.user.email);
        console.log("🎨 Reseller ID:", data.user.user_metadata?.reseller_id);

        // Redirect to reseller dashboard (route group is invisible in URL)
        const resellerSlug = data.user.user_metadata?.reseller_slug || "acme-corp";
        router.push(`/reseller/${resellerSlug}`);
      }
    } catch (err) {
      console.error("Sign in error:", err);
      setError(err instanceof Error ? err.message : "Failed to sign in");
    } finally {
      setIsLoading(false);
    }
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSignIn(email, password);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100">
      <div className="w-full max-w-md p-8 bg-white rounded-2xl shadow-xl">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Reseller Sign In</h1>
          <p className="text-gray-500 mt-2">
            Access your white-label dashboard
          </p>
          {isDevelopment && (
            <p className="text-xs text-green-600 mt-2">
              ⚡ Development mode: Auto-login enabled
            </p>
          )}
        </div>

        <form onSubmit={onSubmit} className="space-y-6">
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
              placeholder="test-reseller@acme-corp.com"
              required
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
              placeholder="••••••••"
              required
            />
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Signing in...
              </>
            ) : (
              "Sign In"
            )}
          </button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-sm text-gray-500">
            Test Account: {TEST_CREDENTIALS.email}
          </p>
        </div>
      </div>
    </div>
  );
}
