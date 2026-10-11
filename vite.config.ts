import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { defineConfig, type Plugin } from 'vite';

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
 * Builds the result page and the service worker.
 *
 * The injected selection overlay is built separately (vite.content.config.ts)
 * because `chrome.scripting.executeScript({ files })` evaluates a classic
 * script, not a module, so that bundle must be a self-contained IIFE.
 */
export default defineConfig({
  root: resolve(import.meta.dirname, 'src'),
  publicDir: resolve(import.meta.dirname, 'public'),
  base: './',
  plugins: [tesseractAssets()],
  build: {
    outDir: resolve(import.meta.dirname, 'dist'),
    emptyOutDir: true,
    target: 'chrome116',
    // Readable output keeps Chrome Web Store review (and our own debugging)
    // straightforward.
    minify: false,
    sourcemap: true,
    rollupOptions: {
      input: {
        result: resolve(import.meta.dirname, 'src/result/result.html'),
        'service-worker': resolve(import.meta.dirname, 'src/background/service-worker.ts'),
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
});
