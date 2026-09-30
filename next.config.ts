import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    // Pin the Turbopack project root using process.cwd() to prevent
    // CI and Vercel runners from mis-inferring the root directory.
    root: process.cwd(),
  },
  images: {
    qualities: [75, 100],
  },
};

export default nextConfig;