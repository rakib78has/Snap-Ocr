import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { defineConfig, type Plugin } from 'vite';
import { assertFirebaseSettings, outDirFor, ROOT } from './build-mode.ts';

const require = createRequire(import.meta.url);
const packageDir = (name: string) => dirname(require.resolve(`${name}/package.json`));

/**
 * Copies the OCR engine into dist/lib from the pinned npm packages.
 *
 * These files are byte-identical to what the extension previously vendored in
 * lib/, but now their versions come from the lockfile. They are emitted as-is
 * rather than bundled: tesseract.js's npm source is CommonJS that drags in
 * Node polyfills, while its prebuilt browser build is what the extension has
 * always run.
 *
 * tesseract-core.wasm is deliberately not copied: tesseract-core.wasm.js
 * embeds the same binary, so the separate file was 3.4 MB of dead weight.
 */
function tesseractAssets(): Plugin {
  const tesseract = packageDir('tesseract.js');
  const core = packageDir('tesseract.js-core');
  const engData = packageDir('@tesseract.js-data/eng');

  return {
    name: 'snap-ocr:tesseract-assets',
    generateBundle() {
      const emit = (fileName: string, source: Uint8Array) =>
        this.emitFile({ type: 'asset', fileName, source });

      emit('lib/tesseract.min.js', readFileSync(join(tesseract, 'dist/tesseract.min.js')));
      emit('lib/worker.min.js', readFileSync(join(tesseract, 'dist/worker.min.js')));
      emit('lib/tesseract-core.wasm.js', readFileSync(join(core, 'tesseract-core.wasm.js')));
      // Shipped uncompressed because the OCR worker loads it with `gzip: false`.
      emit(
        'lib/eng.traineddata',
        gunzipSync(readFileSync(join(engData, '4.0.0/eng.traineddata.gz')))
      );
    },
  };
}

/**
 * In the e2e build only, adds the host permission that stands in for the
 * activeTab grant (a toolbar click or shortcut, which automation cannot do).
 */
function e2eManifest(outDir: string): Plugin {
  return {
    name: 'snap-ocr:e2e-manifest',
    writeBundle() {
      const path = join(outDir, 'manifest.json');
      const manifest = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
      manifest.host_permissions = ['<all_urls>'];
      writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`);
    },
  };
}

/**
 * Builds the extension pages and the service worker.
 *
 * The injected selection overlay is built separately (vite.content.config.ts)
 * because `chrome.scripting.executeScript({ files })` evaluates a classic
 * script, not a module, so that bundle must be a self-contained IIFE.
 */
export default defineConfig(({ mode }) => {
  assertFirebaseSettings(mode);
  const outDir = outDirFor(mode);

  return {
    root: resolve(ROOT, 'src'),
    publicDir: resolve(ROOT, 'public'),
    // .env files live at the project root, not in src/.
    envDir: ROOT,
    base: './',
    plugins: [tesseractAssets(), ...(mode === 'e2e' ? [e2eManifest(outDir)] : [])],
    build: {
      outDir,
      emptyOutDir: true,
      target: 'chrome116',
      // Readable output keeps Chrome Web Store review (and our own debugging)
      // straightforward.
      minify: false,
      sourcemap: true,
      rollupOptions: {
        input: {
          result: resolve(ROOT, 'src/result/result.html'),
          account: resolve(ROOT, 'src/account/account.html'),
          'service-worker': resolve(ROOT, 'src/background/service-worker.ts'),
        },
        output: {
          // The manifest references the worker by a stable path, so it cannot
          // be hashed or nested.
          entryFileNames: (chunk) =>
            chunk.name === 'service-worker' ? 'service-worker.js' : 'assets/[name]-[hash].js',
          chunkFileNames: 'assets/[name]-[hash].js',
          assetFileNames: 'assets/[name]-[hash][extname]',
        },
      },
    },
  };
});
