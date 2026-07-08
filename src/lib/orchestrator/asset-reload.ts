import { promises as fs, statSync } from 'node:fs';
import path from 'node:path';

interface RootStat {
  mtimeMs: number;
  iso: string;
}

interface AssetReloadResult {
  status: string;
  checkedAt: string;
  roots: Record<string, RootStat>;
  signature: string;
}

// Curated repo roots inspected for cache-busting. All paths are resolved
// relative to the project root (process.cwd()) so the handler stays
// portable across environments.
const ASSET_ROOTS = ['package.json', 'next.config.ts', 'src', 'public'];

async function newestMtime(target: string): Promise<number> {
  let max = 0;

  const entries = await fs.readdir(target, { withFileTypes: true });
  for (const entry of entries) {
    if (
      entry.name === 'node_modules' ||
      entry.name === '.next' ||
      entry.name === '.git'
    ) {
      continue;
    }

    const childPath = path.join(target, entry.name);
    if (entry.isDirectory()) {
      max = Math.max(max, await newestMtime(childPath));
    } else {
      try {
        const m = statSync(childPath).mtimeMs;
        max = Math.max(max, m);
      } catch {
        // Skip unreadable entries without failing the whole scan.
      }
    }
  }

  return max;
}

export async function AssetReloadHandler(
  _payload?: unknown
): Promise<AssetReloadResult> {
  const cwd = process.cwd();
  const roots: Record<string, RootStat> = {};

  for (const rel of ASSET_ROOTS) {
    const abs = path.join(cwd, rel);
    try {
      const mtimeMs = statSync(abs).isDirectory()
        ? await newestMtime(abs)
        : statSync(abs).mtimeMs;

      roots[rel] = {
        mtimeMs,
        iso: new Date(mtimeMs).toISOString(),
      };
    } catch {
      console.log('[ORCHESTRATOR] asset-reload: path not found: ' + rel);
    }
  }

  const signature = Object.entries(roots)
    .map(([rel, stat]) => `${rel}:${Math.round(stat.mtimeMs)}`)
    .sort()
    .join('|');

  console.log('[ORCHESTRATOR] Asset reload cache-busting check complete at ' + cwd);

  return {
    status: 'CHECKED',
    checkedAt: new Date().toISOString(),
    roots,
    signature,
  };
}
