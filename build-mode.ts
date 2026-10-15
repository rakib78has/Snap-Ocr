import { resolve } from 'node:path';
import { loadEnv } from 'vite';
import { parseFirebaseSettings } from './src/core/firebase-settings.ts';

/**
 * Build modes shared by both Vite configs.
 *
 * - `production` (the default): the shippable extension in dist/. Needs the
 *   real Firebase settings (.env.production.local locally, repository
 *   variables in CI) and refuses to build without them, so an extension that
 *   cannot sign anyone in is never produced by accident.
 * - `e2e`: dist-e2e/, wired to the local Firebase emulators (.env.e2e) and
 *   given a host permission in place of the activeTab grant that automation
 *   cannot trigger (see tests/e2e/fixtures.ts). Never packaged.
 */
export const ROOT = import.meta.dirname;

export function outDirFor(mode: string): string {
  return resolve(ROOT, mode === 'e2e' ? 'dist-e2e' : 'dist');
}

export function assertFirebaseSettings(mode: string): void {
  const result = parseFirebaseSettings(loadEnv(mode, ROOT, 'VITE_'));
  if (!result.ok) {
    throw new Error(
      `Missing Firebase settings for the "${mode}" build: ${result.missing.join(', ')}.\n` +
        'Copy .env.example to .env.production.local and fill it in (see docs/firebase-setup.md).'
    );
  }
}
