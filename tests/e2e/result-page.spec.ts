import {
  expect,
  extensionUrl,
  openTextPage,
  renderTextImage,
  seedPendingImage,
  test,
  TEST_ORIGIN,
} from './fixtures.ts';

test.describe('result page', () => {
  test('extracts text from a captured image with the bundled English model', async ({
    context,
    serviceWorker,
    extensionId,
  }) => {
    const scratch = await context.newPage();
    const image = await renderTextImage(scratch, ['Snap OCR reads this line', 'Second line 2026']);
    await scratch.close();
    await seedPendingImage(serviceWorker, image);

    const page = await context.newPage();
    await page.goto(extensionUrl(extensionId, 'result/result.html'));

    await expect(page.locator('#progressLabel')).toHaveText('Done');
    const text = await page.locator('#output').inputValue();
    expect(text).toContain('Snap OCR reads this line');
    expect(text).toContain('Second line 2026');
    // Line structure is preserved, not flattened.
    expect(text.split('\n')).toHaveLength(2);

    await expect(page.locator('#errorText')).toBeHidden();
    await expect(page.locator('#copyBtn')).toBeEnabled();
    await expect(page.locator('#docsBtn')).toBeEnabled();
    await expect(page.locator('#langSelect')).toHaveValue('eng');
    await expect(page.locator('#langSelect')).toBeEnabled();
    await expect(page.locator('#preview')).toHaveAttribute('src', image);
  });

  test('consumes the hand-off image so it does not linger in storage', async ({
    context,
    serviceWorker,
    extensionId,
  }) => {
    const scratch = await context.newPage();
    await seedPendingImage(serviceWorker, await renderTextImage(scratch, ['Hello']));
    await scratch.close();

    const page = await context.newPage();
    await page.goto(extensionUrl(extensionId, 'result/result.html'));
    await expect(page.locator('#progressLabel')).toHaveText('Done');

    const remaining = await serviceWorker.evaluate(() =>
      chrome.storage.session.get('snapocr_pending_image')
    );
    expect(remaining).toEqual({});
  });

  test('reports when the image contains no text', async ({
    context,
    serviceWorker,
    extensionId,
  }) => {
    const scratch = await context.newPage();
    await seedPendingImage(serviceWorker, await renderTextImage(scratch, []));
    await scratch.close();

    const page = await context.newPage();
    await page.goto(extensionUrl(extensionId, 'result/result.html'));

    await expect(page.locator('#progressLabel')).toHaveText('Done');
    await expect(page.locator('#output')).toHaveValue('');
    await expect(page.locator('#statusText')).toHaveText('No text detected in this region.');
  });

  test('explains when opened without a captured image', async ({ context, extensionId }) => {
    const page = await context.newPage();
    await page.goto(extensionUrl(extensionId, 'result/result.html'));

    await expect(page.locator('#errorText')).toHaveText(
      'No captured image found. Please select a region again from the page.'
    );
    await expect(page.locator('#progressLabel')).toHaveText('Failed');
    await expect(page.locator('#copyBtn')).toBeDisabled();
  });

  test('copies the extracted text to the clipboard', async ({
    context,
    serviceWorker,
    extensionId,
  }) => {
    const scratch = await context.newPage();
    await seedPendingImage(serviceWorker, await renderTextImage(scratch, ['Copy me please']));
    await scratch.close();

    const page = await context.newPage();
    await page.goto(extensionUrl(extensionId, 'result/result.html'));
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
