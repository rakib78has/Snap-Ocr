import { expect, test } from './fixtures.ts';

test('the extension loads with its service worker and declared permissions', async ({
  serviceWorker,
}) => {
  const manifest = await serviceWorker.evaluate(() => chrome.runtime.getManifest());
  expect(manifest.name).toBe('Snap OCR');
  expect(manifest.manifest_version).toBe(3);
  expect(manifest.permissions).toEqual(['activeTab', 'scripting', 'storage', 'notifications']);
});
