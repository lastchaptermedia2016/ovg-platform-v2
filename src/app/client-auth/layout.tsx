import React from 'react';

export default function ClientAuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen w-full bg-cover bg-center bg-no-repeat relative" style={{ backgroundImage: "url('/clientsbg.jpg')" }}>
      <div className="absolute inset-0 bg-black/40" />
      <div className="relative z-10">
        {children}
      </div>
    </div>
  );
}