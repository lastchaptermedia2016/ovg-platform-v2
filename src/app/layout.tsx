import type { Metadata } from "next";
import "./globals.css";
import { BrandingProvider } from "@/providers/branding-provider";
import { SessionBridgeInjector } from "@/components/session-bridge-injector";

// Dynamic metadata - base values, will be overridden by BrandingProvider
export const metadata: Metadata = {
  title: "Voice Platform",
  description: "Enterprise AI voice solutions",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased overflow-x-hidden">
      <body className="min-h-full flex flex-col overflow-x-hidden">
        <BrandingProvider>
          {children}
          <SessionBridgeInjector />
        </BrandingProvider>
      </body>
    </html>
  );
}
