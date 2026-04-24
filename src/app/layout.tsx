import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { BrandingProvider } from "@/providers/branding-provider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

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
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <BrandingProvider>{children}</BrandingProvider>
      </body>
    </html>
  );
}
