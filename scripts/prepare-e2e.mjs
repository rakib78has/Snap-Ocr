#!/usr/bin/env node
/**
 * Makes dist-e2e/: the production build plus one manifest change.
 *
 * In real use, `activeTab` is granted when the user clicks the toolbar icon or
 * presses the shortcut. Automation can do neither — both are browser UI, out
 * of Playwright's reach — so without a grant the overlay cannot be injected and
 * captureVisibleTab is refused. The e2e copy adds a host permission to stand
 * in for that grant. Everything else is byte-for-byte the production build,
 * which itself is checked by validate-build.mjs to have no host permissions.
 */

import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const target = join(root, 'dist-e2e');

if (!existsSync(dist)) {
  console.error('✖ dist/ does not exist. Run `npm run build` first.');
  process.exit(1);
}

rmSync(target, { recursive: true, force: true });
cpSync(dist, target, { recursive: true });

const manifestPath = join(target, 'manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
manifest.host_permissions = ['<all_urls>'];
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

console.log('✔ dist-e2e/ ready (production build + <all_urls> in place of the activeTab grant)');
