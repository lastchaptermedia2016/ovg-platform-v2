import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Reseller Console | OVG Platform",
  description: "White-label reseller management console",
};

export default function ResellerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <div className="min-h-screen bg-slate-900">
          {/* Reseller-specific branding header */}
          <header className="bg-gradient-to-r from-blue-900 to-slate-900 border-b border-yellow-500/30">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-yellow-400 to-yellow-600 flex items-center justify-center">
                    <svg
                      className="w-6 h-6 text-slate-900"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M13 10V3L4 14h7v7l9-11h-7z"
                      />
                    </svg>
                  </div>
                  <div>
                    <h1 className="text-xl font-bold text-white">Reseller Console</h1>
                    <p className="text-xs text-blue-200">Partner Portal</p>
                  </div>
                </div>
                <nav className="flex items-center gap-6">
                  <a
                    href="/reseller/dashboard"
                    className="text-sm text-blue-100 hover:text-yellow-400 transition-colors"
                  >
                    Dashboard
                  </a>
                  <a
                    href="/reseller/clients"
                    className="text-sm text-blue-100 hover:text-yellow-400 transition-colors"
                  >
                    Clients
                  </a>
                  <a
                    href="/reseller/settings"
                    className="text-sm text-blue-100 hover:text-yellow-400 transition-colors"
                  >
                    Settings
                  </a>
                </nav>
              </div>
            </div>
          </header>
          <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
