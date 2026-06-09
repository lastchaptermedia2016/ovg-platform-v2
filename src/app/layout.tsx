import type { Metadata } from "next";
import "./globals.css";
import { BrandingProvider } from "@/providers/branding-provider";

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
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <BrandingProvider>{children}</BrandingProvider>
      </body>
    </html>
  );
}
