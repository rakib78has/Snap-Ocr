#!/usr/bin/env node
/**
 * Validates the built extension before it can be packaged or released.
 *
 * A successful `vite build` only proves the TypeScript compiled. It does not
 * prove the manifest is loadable, that every path the manifest names actually
 * exists, that the OCR engine files were emitted, or that the permission set
 * has not quietly grown. Those are the failures that reach users, so they get
 * their own gate.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** `--strict` (used by the release workflow) treats every warning as an error. */
const strict = process.argv.includes('--strict');
const dist = join(root, 'dist');

/** Permissions the extension is allowed to request. Any addition must be a
 *  deliberate edit here and a justification in the security documentation. */
const ALLOWED_PERMISSIONS = new Set(['activeTab', 'notifications', 'scripting', 'storage']);

/** Chrome Web Store listing limit for the manifest description. */
const MAX_DESCRIPTION_LENGTH = 132;

const errors = [];
const warnings = [];

const fail = (message) => errors.push(message);
const warn = (message) => warnings.push(message);

function requireFile(relativePath, reason) {
  const full = join(dist, relativePath);
  if (!existsSync(full)) {
    fail(`Missing ${relativePath} (${reason})`);
    return false;
  }
  if (statSync(full).size === 0) {
    fail(`${relativePath} is empty (${reason})`);
    return false;
  }
  return true;
}

if (!existsSync(dist)) {
  console.error('✖ dist/ does not exist. Run `npm run build` first.');
  process.exit(1);
}

// --- Manifest ---------------------------------------------------------------

let manifest;
try {
  manifest = JSON.parse(readFileSync(join(dist, 'manifest.json'), 'utf8'));
} catch (error) {
  console.error(`✖ dist/manifest.json is missing or not valid JSON: ${error.message}`);
  process.exit(1);
}

if (manifest.manifest_version !== 3) {
  fail(`manifest_version must be 3, found ${manifest.manifest_version}`);
}

if (!/^\d+(\.\d+){0,3}$/.test(manifest.version ?? '')) {
  fail(`version "${manifest.version}" is not a valid Chrome extension version`);
}

if (!manifest.name || manifest.name.length > 75) {
  fail('name must be present and at most 75 characters');
}

if (!manifest.description) {
  fail('description must be present');
} else if (manifest.description.length > MAX_DESCRIPTION_LENGTH) {
  // Chrome loads the extension fine; the Web Store rejects the upload. Kept a
  // warning until the listing copy is rewritten (tracked in the audit).
  warn(
    `description is ${manifest.description.length} characters; the Chrome Web Store ` +
      `accepts at most ${MAX_DESCRIPTION_LENGTH}.`
  );
}

// --- Permissions ------------------------------------------------------------

for (const permission of manifest.permissions ?? []) {
  if (!ALLOWED_PERMISSIONS.has(permission)) {
    fail(
      `Permission "${permission}" is not in the approved set. ` +
        `Add it to ALLOWED_PERMISSIONS and justify it in the security documentation.`
    );
  }
}

if (manifest.host_permissions?.length) {
  fail(
    `host_permissions must stay empty — activeTab covers capture. ` +
      `Found: ${manifest.host_permissions.join(', ')}`
  );
}

const csp = manifest.content_security_policy?.extension_pages ?? '';
if (!csp.includes("'wasm-unsafe-eval'")) {
  fail("content_security_policy.extension_pages must allow 'wasm-unsafe-eval' for the OCR engine");
}
if (/https?:|'unsafe-eval'|'unsafe-inline'/.test(csp)) {
  fail(`content_security_policy.extension_pages allows remote or eval'd script: ${csp}`);
}

// --- Referenced files -------------------------------------------------------

requireFile(manifest.background.service_worker, 'background.service_worker');

for (const [size, path] of Object.entries(manifest.icons ?? {})) {
  requireFile(path, `icons.${size}`);
}
for (const [size, path] of Object.entries(manifest.action?.default_icon ?? {})) {
  requireFile(path, `action.default_icon.${size}`);
}

// Files opened or loaded at runtime but not named in the manifest, so a build
// that drops one fails only in the user's browser.
requireFile('result/result.html', 'opened by the service worker after a capture');
requireFile(manifest.options_ui?.page ?? 'account/account.html', 'account page (options_ui)');
requireFile('selection-overlay.js', 'injected by chrome.scripting for area selection');
requireFile('lib/tesseract.min.js', 'OCR engine, loaded by result.html');
requireFile('lib/worker.min.js', 'OCR web worker');
requireFile('lib/tesseract-core.wasm.js', 'OCR WASM core');
requireFile('lib/eng.traineddata', 'bundled English model');

// --- Firebase -----------------------------------------------------------------

// The e2e build talks to local emulators. If its settings ever leak into the
// production build, nobody could sign in, so look for them in what ships.
const shippedScripts = [
  'service-worker.js',
  ...readdirSync(join(dist, 'assets'))
    .filter((name) => name.endsWith('.js'))
    .map((name) => `assets/${name}`),
];
for (const file of shippedScripts) {
  const source = readFileSync(join(dist, file), 'utf8');
  // The e2e project id appears only in .env.e2e. (Emulator host strings are
  // not a usable signal: the Firebase SDK mentions them in its own comments.)
  if (source.includes('demo-snap-ocr')) {
    fail(`${file} contains Firebase emulator settings; production must use the real project.`);
  }
  if (source.includes('snapOcrE2E')) {
    fail(`${file} contains the e2e test hook, which must never ship.`);
  }
}

// --- Module type ------------------------------------------------------------

if (manifest.background.type !== 'module') {
  fail('background.type must be "module" — the built worker uses ES import syntax.');
}

const workerSource = readFileSync(join(dist, manifest.background.service_worker), 'utf8');
for (const match of workerSource.matchAll(/^import\s.*?from\s+["'](\.[^"']+)["']/gm)) {
  if (!existsSync(join(dist, match[1]))) {
    fail(`Service worker imports "${match[1]}" which was not emitted.`);
  }
}

// The overlay is injected as a classic script, so top-level module syntax
// there would fail silently at runtime rather than at build time.
const overlaySource = readFileSync(join(dist, 'selection-overlay.js'), 'utf8');
if (/^\s*(import|export)\s/m.test(overlaySource)) {
  fail('selection-overlay.js contains module syntax but is injected as a classic script.');
}

// --- Report -----------------------------------------------------------------

if (strict) {
  errors.push(...warnings.map((warning) => `${warning} (strict mode)`));
} else {
  for (const warning of warnings) console.warn(`⚠ ${warning}`);
}

if (errors.length > 0) {
  for (const error of errors) console.error(`✖ ${error}`);
  console.error(`\nBuild validation failed with ${errors.length} error(s).`);
  process.exit(1);
}

console.log(`✔ Build valid — ${manifest.name} v${manifest.version}`);
console.log(`  Permissions: ${(manifest.permissions ?? []).join(', ') || 'none'}`);
console.log(`  Host permissions: ${(manifest.host_permissions ?? []).join(', ') || 'none'}`);
