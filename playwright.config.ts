import { defineConfig } from '@playwright/test';

/**
 * End-to-end tests run against the *built* extension in a real Chromium.
 *
 * A Chrome extension cannot be loaded by an ordinary Playwright `page` test:
 * it needs a persistent context launched with --load-extension, which the
 * fixtures in tests/e2e/fixtures.ts set up. Tests import from those fixtures
 * rather than from '@playwright/test' directly.
 */
export default defineConfig({
  testDir: './tests/e2e',
  // Each test launches its own Chromium with the extension; running them in
  // parallel mostly measures CPU contention in the OCR worker.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  // Real OCR, including engine start-up, runs inside these tests.
  timeout: 60_000,
  expect: { timeout: 30_000 },
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
});
