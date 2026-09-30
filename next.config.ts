import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  turbopack: {
    // Pin the Turbopack project root to this directory so CI (and any
    // environment where Turbopack auto-infers the root from a lockfile) never
    // mis-resolves the project root and fails with
    // "Next.js package not found". Without this, Turbopack walks up the tree
    // looking for a lockfile and can land on a directory where `next` is not
    // installed, which surfaces as curl exit code 2 (connection refused) in
    // the live-curl regression gate.
    root: __dirname,
  },
  images: {
    qualities: [75, 100],
  },
};

export default nextConfig;