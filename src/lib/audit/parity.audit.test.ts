import { describe, it, expect } from 'vitest';
import { FEATURE_REGISTRY, SYSTEM_COMMANDS } from './feature-registry';
import fs from 'fs';
import path from 'path';

function fileExists(relativePath: string): boolean {
  return fs.existsSync(path.join(process.cwd(), relativePath));
}

function verifyModalParity(action: string, entry: { uiModal?: string }): void {
  if (!entry.uiModal) return;
  const exists = fileExists(entry.uiModal);
  if (!exists) {
    console.error(`[PARITY ERROR] Action "${action}" requires missing UI modal component "${entry.uiModal}"`);
    throw new Error(`[PARITY ERROR] Action "${action}" requires missing UI modal component "${entry.uiModal}"`);
  }
}

describe('Parity Audit Suite', () => {
  it('all SYSTEM_COMMANDs are registered in FEATURE_REGISTRY', () => {
    for (const command of SYSTEM_COMMANDS) {
      expect(FEATURE_REGISTRY[command]).toBeDefined();
    }
  });

  it('registered uiModal components exist on disk', () => {
    for (const [action, entry] of Object.entries(FEATURE_REGISTRY)) {
      verifyModalParity(action, entry);
    }
  });
});
