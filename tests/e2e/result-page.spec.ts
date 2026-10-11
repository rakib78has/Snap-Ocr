import type { Page, Worker } from '@playwright/test';
import {
  expect,
  extensionUrl,
  openTextPage,
  renderTextImage,
  seedCapture,
  test,
  TEST_ORIGIN,
} from './fixtures.ts';

/** Renders `lines` to an image, hands it over as capture `captureId`, and opens its result page. */
async function openResultFor(
  page: Page,
  worker: Worker,
  extensionId: string,
  lines: string[],
  captureId?: string
): Promise<string> {
  const image = await renderTextImage(page, lines);
  const path = await seedCapture(worker, image, captureId);
  await page.goto(extensionUrl(extensionId, path));
  return image;
}

test.describe('result page', () => {
  test('extracts text from a captured image with the bundled English model', async ({
    context,
    serviceWorker,
    extensionId,
  }) => {
    const page = await context.newPage();
    const image = await openResultFor(page, serviceWorker, extensionId, [
      'Snap OCR reads this line',
      'Second line 2026',
    ]);

    await expect(page.locator('#progressLabel')).toHaveText('Done');
    const text = await page.locator('#output').inputValue();
    expect(text).toContain('Snap OCR reads this line');
    expect(text).toContain('Second line 2026');
    // Line structure is preserved, not flattened.
    expect(text.split('\n')).toHaveLength(2);

    await expect(page.locator('#errorText')).toBeHidden();
    await expect(page.locator('#copyBtn')).toBeEnabled();
    await expect(page.locator('#docsBtn')).toBeEnabled();
    await expect(page.locator('#cancelBtn')).toBeHidden();
    await expect(page.locator('#retryBtn')).toBeHidden();
    await expect(page.locator('#langSelect')).toHaveValue('eng');
    await expect(page.locator('#langSelect')).toBeEnabled();
    await expect(page.locator('#preview')).toHaveAttribute('src', image);
  });

  test('consumes the hand-off image so it does not linger in extension storage', async ({
    context,
    serviceWorker,
    extensionId,
  }) => {
    const page = await context.newPage();
    await openResultFor(page, serviceWorker, extensionId, ['Hello']);
    await expect(page.locator('#progressLabel')).toHaveText('Done');

    const remaining = await serviceWorker.evaluate(() => chrome.storage.session.get(null));
    expect(remaining).toEqual({});
  });

  test('keeps the capture across a reload of the result tab (regression: M1)', async ({
    context,
    serviceWorker,
    extensionId,
  }) => {
    const page = await context.newPage();
    await openResultFor(page, serviceWorker, extensionId, ['Survives a reload']);
    await expect(page.locator('#progressLabel')).toHaveText('Done');

    await page.reload();
    await expect(page.locator('#progressLabel')).toHaveText('Done');
    await expect(page.locator('#errorText')).toBeHidden();
    expect(await page.locator('#output').inputValue()).toContain('Survives a reload');
  });

  test('two captures in a row each show their own image (regression: M1)', async ({
    context,
    serviceWorker,
    extensionId,
  }) => {
    const scratch = await context.newPage();
    const first = await seedCapture(
      serviceWorker,
      await renderTextImage(scratch, ['First capture']),
      'one'
    );
    const second = await seedCapture(
      serviceWorker,
      await renderTextImage(scratch, ['Second capture']),
      'two'
    );

    const [pageOne, pageTwo] = [await context.newPage(), await context.newPage()];
    await Promise.all([
      pageOne.goto(extensionUrl(extensionId, first)),
      pageTwo.goto(extensionUrl(extensionId, second)),
    ]);

    await expect(pageOne.locator('#progressLabel')).toHaveText('Done');
    await expect(pageTwo.locator('#progressLabel')).toHaveText('Done');
    expect(await pageOne.locator('#output').inputValue()).toContain('First capture');
    expect(await pageTwo.locator('#output').inputValue()).toContain('Second capture');
  });

  test('reports when the image contains no text', async ({
    context,
    serviceWorker,
    extensionId,
  }) => {
    const page = await context.newPage();
    await openResultFor(page, serviceWorker, extensionId, []);

    await expect(page.locator('#progressLabel')).toHaveText('Done');
    await expect(page.locator('#output')).toHaveValue('');
    await expect(page.locator('#statusText')).toHaveText('No text detected in this region.');
  });

  test('explains when opened without a captured image', async ({ context, extensionId }) => {
    const page = await context.newPage();
    await page.goto(extensionUrl(extensionId, 'result/result.html?capture=missing'));

    await expect(page.locator('#errorText')).toHaveText(
      'No captured image found. Please select a region again from the page.'
    );
    await expect(page.locator('#progressLabel')).toHaveText('Failed');
    await expect(page.locator('#copyBtn')).toBeDisabled();
  });

  test('falls back to English when the stored language is unknown (regression: M8)', async ({
    context,
    serviceWorker,
    extensionId,
  }) => {
    await serviceWorker.evaluate(() =>
      chrome.storage.local.set({ snapocr_last_lang: 'not_a_language' })
    );
    const page = await context.newPage();
    await openResultFor(page, serviceWorker, extensionId, ['Back to English']);

    await expect(page.locator('#langSelect')).toHaveValue('eng');
    await expect(page.locator('#progressLabel')).toHaveText('Done');
    expect(await page.locator('#output').inputValue()).toContain('Back to English');
  });

  test('a language whose download fails is not remembered, and Try again recovers (regression: M8)', async ({
    context,
    serviceWorker,
    extensionId,
  }) => {
    const page = await context.newPage();
    await openResultFor(page, serviceWorker, extensionId, ['Recover after failure']);
    await expect(page.locator('#progressLabel')).toHaveText('Done');

    // A download that fails outright. (Offline emulation instead leaves the
    // request hanging, which is the case the Cancel test covers.)
    await context.route('https://cdn.jsdelivr.net/**', (route) =>
      route.abort('internetdisconnected')
    );
    await page.locator('#langSelect').selectOption('fra');
    await expect(page.locator('#errorText')).toContainText('check your internet connection');
    await expect(page.locator('#retryBtn')).toBeVisible();
    await expect(page.locator('#langSelect')).toBeEnabled();
    const stored = await serviceWorker.evaluate(() =>
      chrome.storage.local.get('snapocr_last_lang')
    );
    expect(stored.snapocr_last_lang).toBe('eng');

    await context.unroute('https://cdn.jsdelivr.net/**');
    await page.locator('#langSelect').selectOption('eng');
    await expect(page.locator('#progressLabel')).toHaveText('Done');
    await expect(page.locator('#errorText')).toBeHidden();
    await expect(page.locator('#retryBtn')).toBeHidden();
  });

  test('Cancel stops a stalled run and Try again runs it once more (regression: H4)', async ({
    context,
    serviceWorker,
    extensionId,
  }) => {
    const page = await context.newPage();
    await openResultFor(page, serviceWorker, extensionId, ['Cancel then retry']);
    await expect(page.locator('#progressLabel')).toHaveText('Done');

    // A language download that never answers: the case a timeout must cover.
    let stalled = false;
    await context.route('https://cdn.jsdelivr.net/**', () => {
      stalled = true;
    });
    await page.locator('#langSelect').selectOption('deu');
    await expect(page.locator('#cancelBtn')).toBeVisible();
    await expect.poll(() => stalled).toBe(true);
    await expect(page.locator('#langSelect')).toBeDisabled();

    await page.locator('#cancelBtn').click();
    await expect(page.locator('#statusText')).toHaveText('OCR cancelled.');
    await expect(page.locator('#progressLabel')).toHaveText('Cancelled');
    await expect(page.locator('#errorText')).toBeHidden();
    await expect(page.locator('#cancelBtn')).toBeHidden();
    await expect(page.locator('#langSelect')).toBeEnabled();
    // The earlier result is still there and can be copied.
    expect(await page.locator('#output').inputValue()).toContain('Cancel then retry');
    await expect(page.locator('#copyBtn')).toBeEnabled();

    await context.unroute('https://cdn.jsdelivr.net/**');
    await page.locator('#langSelect').selectOption('eng');
    await expect(page.locator('#progressLabel')).toHaveText('Done');
    await expect(page.locator('#retryBtn')).toBeHidden();
  });

  test('copies the extracted text to the clipboard', async ({
    context,
    serviceWorker,
    extensionId,
  }) => {
    const page = await context.newPage();
    await openResultFor(page, serviceWorker, extensionId, ['Copy me please']);
    await expect(page.locator('#copyBtn')).toBeEnabled();

    await page.locator('#copyBtn').click();
    await expect(page.locator('#statusText')).toHaveText('Copied!');
    const extracted = await page.locator('#output').inputValue();

    // Chrome refuses to grant permissions to chrome-extension:// origins, so
    // the shared clipboard is read back from an ordinary page instead.
    await context.grantPermissions(['clipboard-read'], { origin: TEST_ORIGIN });
    const reader = await openTextPage(context, 'clipboard reader');
    const clipboard = await reader.evaluate(() => navigator.clipboard.readText());
    expect(clipboard).toBe(extracted);
    expect(clipboard).toContain('Copy me please');
  });

  test('cycles and remembers the theme', async ({ context, extensionId }) => {
    const page = await context.newPage();
    await page.goto(extensionUrl(extensionId, 'result/result.html'));
    const toggle = page.locator('#themeToggle');
    const html = page.locator('html');

    await expect(toggle).toHaveText('🖥️ System');
    await toggle.click();
    await expect(toggle).toHaveText('☀️ Light');
    await expect(html).toHaveAttribute('data-theme', 'light');
    await toggle.click();
    await expect(toggle).toHaveText('🌙 Dark');
    await expect(html).toHaveAttribute('data-theme', 'dark');

    await page.reload();
    await expect(toggle).toHaveText('🌙 Dark');
    await toggle.click();
    await expect(toggle).toHaveText('🖥️ System');
    await expect(html).not.toHaveAttribute('data-theme', /.*/);
  });
});
