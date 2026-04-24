import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Image from "next/image";

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
    <div className="relative min-h-screen">
      {/* Fixed Background Layer */}
      <div className="fixed inset-0 z-[-1]">
        <Image
          src="/reseller-bg.jpg"
          alt="Background"
          fill
          priority
          quality={100}
          className="object-cover"
        />
        <div className="absolute inset-0 bg-black/40" />
      </div>

      {/* THE CONTENT */}
      <div className="relative z-10">
        {children}
      </div>
    </div>
  );
}
