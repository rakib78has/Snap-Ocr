import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import { outDirFor, ROOT } from './build-mode.ts';

/**
 * Builds the injected selection overlay as a single classic script.
 *
 * `emptyOutDir` is off because this runs after the main build and must not
 * delete its output.
 */
export default defineConfig(({ mode }) => ({
  // public/ is copied by the main build; copying it again here would
  // overwrite the e2e build's adjusted manifest.
  publicDir: false,
  build: {
    outDir: outDirFor(mode),
    emptyOutDir: false,
    target: 'chrome116',
    minify: false,
    sourcemap: true,
    lib: {
      entry: resolve(ROOT, 'src/content/selection-overlay.ts'),
      name: 'SnapOcrSelection',
      formats: ['iife'],
      fileName: () => 'selection-overlay.js',
    },
  },
}));
