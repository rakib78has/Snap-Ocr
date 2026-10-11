import { expect, openPage, openTextPage, startSelection, test } from './fixtures.ts';

const PAGE_TEXT = 'Capture this sentence';

test.describe('selection overlay and capture', () => {
  test('drag-select, capture, and read the text on the result page', async ({
    context,
    serviceWorker,
  }) => {
    const page = await openTextPage(context, PAGE_TEXT);
    await startSelection(serviceWorker);
    const overlay = page.locator('#snapocr-host .overlay');
    await expect(overlay).toBeVisible();

    const box = (await page.locator('#target').boundingBox())!;
    await page.mouse.move(box.x - 20, box.y - 20);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width + 20, box.y + box.height + 20, { steps: 5 });
    await page.mouse.up();

    // The box is adjustable before anything is captured.
    await expect(page.locator('#snapocr-host .toolbar')).toBeVisible();
    await expect(page.locator('#snapocr-host .handle.se')).toBeVisible();

    const resultPagePromise = context.waitForEvent('page');
    await page.locator('#snapocr-host button.capture').click();
    const result = await resultPagePromise;

    await expect(page.locator('#snapocr-host')).toHaveCount(0);
    await expect(result).toHaveURL(/\/result\/result\.html\?capture=[\w-]+$/);
    await expect(result.locator('#progressLabel')).toHaveText('Done');
    expect(await result.locator('#output').inputValue()).toContain(PAGE_TEXT);
  });

  test('Enter captures once the box is drawn', async ({ context, serviceWorker }) => {
    const page = await openTextPage(context, PAGE_TEXT);
    await startSelection(serviceWorker);

    const box = (await page.locator('#target').boundingBox())!;
    await page.mouse.move(box.x - 20, box.y - 20);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width + 20, box.y + box.height + 20, { steps: 5 });
    await page.mouse.up();

    const resultPagePromise = context.waitForEvent('page');
    await page.keyboard.press('Enter');
    const result = await resultPagePromise;
    await expect(result.locator('#progressLabel')).toHaveText('Done');
    expect(await result.locator('#output').inputValue()).toContain(PAGE_TEXT);
  });

  test('Escape removes the overlay without capturing', async ({ context, serviceWorker }) => {
    const page = await openTextPage(context, PAGE_TEXT);
    await startSelection(serviceWorker);
    await expect(page.locator('#snapocr-host .overlay')).toBeVisible();

    const pagesBefore = context.pages().length;
    await page.keyboard.press('Escape');
    await expect(page.locator('#snapocr-host')).toHaveCount(0);
    expect(context.pages()).toHaveLength(pagesBefore);
  });

  test('a drag smaller than the minimum size is discarded', async ({ context, serviceWorker }) => {
    const page = await openTextPage(context, PAGE_TEXT);
    await startSelection(serviceWorker);

    await page.mouse.move(300, 300);
    await page.mouse.down();
    await page.mouse.move(308, 308, { steps: 2 });
    await page.mouse.up();

    await expect(page.locator('#snapocr-host .selection')).toBeHidden();
    await expect(page.locator('#snapocr-host .toolbar')).toBeHidden();
  });

  test('Recapture clears the box, and re-activating resets an open overlay', async ({
    context,
    serviceWorker,
  }) => {
    const page = await openTextPage(context, PAGE_TEXT);
    await startSelection(serviceWorker);

    const drawBox = async () => {
      await page.mouse.move(100, 100);
      await page.mouse.down();
      await page.mouse.move(400, 300, { steps: 5 });
      await page.mouse.up();
      await expect(page.locator('#snapocr-host .toolbar')).toBeVisible();
    };

    await drawBox();
    await page.locator('#snapocr-host button.recapture').click();
    await expect(page.locator('#snapocr-host .selection')).toBeHidden();
    await expect(page.locator('#snapocr-host .hint')).toHaveText(
      'Drag to select an area — Esc to cancel'
    );

    await drawBox();
    await startSelection(serviceWorker);
    await expect(page.locator('#snapocr-host')).toHaveCount(1);
    await expect(page.locator('#snapocr-host .selection')).toBeHidden();
  });

  test('the box can be resized by a handle and moved by dragging', async ({
    context,
    serviceWorker,
  }) => {
    const page = await openTextPage(context, PAGE_TEXT);
    await startSelection(serviceWorker);

    await page.mouse.move(100, 100);
    await page.mouse.down();
    await page.mouse.move(300, 200, { steps: 5 });
    await page.mouse.up();
    const dims = page.locator('#snapocr-host .dims');
    await expect(dims).toHaveText('200 × 100');

    // Drag the north-west handle 50px left and 40px up, grabbing the part of
    // it outside the box (see the known-bug test below for the other handles).
    await page.mouse.move(96, 96);
    await page.mouse.down();
    await page.mouse.move(46, 56, { steps: 5 });
    await page.mouse.up();
    await expect(dims).toHaveText('250 × 140');
    const selection = page.locator('#snapocr-host .selection');
    const resized = (await selection.boundingBox())!;
    expect(Math.round(resized.x)).toBe(50);
    expect(Math.round(resized.y)).toBe(60);

    // Drag from inside the box: it moves, keeping its size.
    await page.mouse.move(200, 150);
    await page.mouse.down();
    await page.mouse.move(260, 190, { steps: 5 });
    await page.mouse.up();
    await expect(dims).toHaveText('250 × 140');
    const moved = (await selection.boundingBox())!;
    expect(Math.round(moved.x)).toBe(110);
    expect(Math.round(moved.y)).toBe(100);
  });

  test('every handle resizes when grabbed by its centre (regression: handles under the box)', async ({
    context,
    serviceWorker,
  }) => {
    const page = await openTextPage(context, PAGE_TEXT);
    await startSelection(serviceWorker);
    const dims = page.locator('#snapocr-host .dims');

    // Box (100,100) 200×100; each handle's centre is dragged by (+30, +20).
    const cases: [handle: string, x: number, y: number, expected: string][] = [
      ['nw', 100, 100, '170 × 80'],
      ['n', 200, 100, '200 × 80'],
      ['ne', 300, 100, '230 × 80'],
      ['e', 300, 150, '230 × 100'],
      ['se', 300, 200, '230 × 120'],
      ['s', 200, 200, '200 × 120'],
      ['sw', 100, 200, '170 × 120'],
      ['w', 100, 150, '170 × 100'],
    ];

    for (const [handle, x, y, expected] of cases) {
      await page.mouse.move(100, 100);
      await page.mouse.down();
      await page.mouse.move(300, 200, { steps: 5 });
      await page.mouse.up();
      await expect(dims, `before ${handle}`).toHaveText('200 × 100');

      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x + 30, y + 20, { steps: 5 });
      await page.mouse.up();
      await expect(dims, `after dragging ${handle}`).toHaveText(expected);
      await page.locator('#snapocr-host button.recapture').click();
    }
  });

  test('Enter captures without also submitting a focused page form (regression: M3)', async ({
    context,
    serviceWorker,
  }) => {
    const page = await openPage(
      context,
      `<form onsubmit="event.preventDefault(); window.submitted = true">
         <input id="field" style="position:absolute;left:20px;top:20px">
       </form>
       <p id="target" style="position:absolute;left:100px;top:150px;margin:0;
         font:40px Arial,sans-serif">${PAGE_TEXT}</p>`
    );
    await page.locator('#field').focus();
    await startSelection(serviceWorker);

    const box = (await page.locator('#target').boundingBox())!;
    await page.mouse.move(box.x - 20, box.y - 20);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width + 20, box.y + box.height + 20, { steps: 5 });
    await page.mouse.up();

    const resultPagePromise = context.waitForEvent('page');
    await page.keyboard.press('Enter');
    const result = await resultPagePromise;
    await expect(result.locator('#progressLabel')).toHaveText('Done');
    expect(
      await page.evaluate(() => (window as { submitted?: boolean }).submitted)
    ).toBeUndefined();
  });

  test('Escape closes the overlay without reaching the page, and stops listening afterwards (regression: M3, L1)', async ({
    context,
    serviceWorker,
  }) => {
    const page = await openPage(
      context,
      `<script>
         window.escapes = 0;
         document.addEventListener('keydown', (e) => { if (e.key === 'Escape') window.escapes++; });
       </script>`
    );
    const escapes = () => page.evaluate(() => (window as { escapes?: number }).escapes);

    await startSelection(serviceWorker);
    await expect(page.locator('#snapocr-host .overlay')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#snapocr-host')).toHaveCount(0);
    expect(await escapes()).toBe(0);

    // With the overlay gone, its listener is gone too: Escape is the page's again.
    await page.keyboard.press('Escape');
    expect(await escapes()).toBe(1);
  });

  test('the captured image contains the page only, not the overlay (regression: H1)', async ({
    context,
    serviceWorker,
  }) => {
    const page = await openPage(context, '');
    await startSelection(serviceWorker);

    await page.mouse.move(200, 200);
    await page.mouse.down();
    await page.mouse.move(400, 320, { steps: 5 });
    await page.mouse.up();

    const resultPagePromise = context.waitForEvent('page');
    await page.locator('#snapocr-host button.capture').click();
    const result = await resultPagePromise;
    await expect(result.locator('#progressLabel')).toHaveText('Done');

    // The page is plain white. Any dimming or blue selection border captured
    // along with it would show up as darker pixels.
    const darkest = await result.locator('#preview').evaluate(async (img: HTMLImageElement) => {
      await img.decode();
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
      let min = 255;
      for (let i = 0; i < data.length; i += 4) {
        min = Math.min(min, data[i], data[i + 1], data[i + 2]);
      }
      return { min, width: canvas.width, height: canvas.height };
    });
    expect(darkest.width).toBeGreaterThan(0);
    expect(darkest.min).toBeGreaterThanOrEqual(250);
  });
});
