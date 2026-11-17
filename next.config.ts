import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    // Pin the Turbopack project root using process.cwd() to prevent
    // CI and Vercel runners from mis-inferring the root directory.
    root: process.cwd(),
  },
  // Hide the dev-tools badge during local development. The badge renders
  // inside the embedded widget iframe (bottom-left of the /widget route),
  // covering the launcher bubble on host sites like the local WordPress
  // install. Compile/runtime errors still surface in the terminal and via
  // the error overlay.
  devIndicators: false,
  images: {
    qualities: [75, 100],
  },
};

export default nextConfig;