import { expect, openTextPage, startSelection, test } from './fixtures.ts';

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
    await expect(result).toHaveURL(/\/result\/result\.html$/);
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

  // Known bug, inherited unchanged from v1.3.1: the selection box is appended
  // after the handles and, with its 2px border, covers their centres. Handles
  // are circles and hit-testing follows border-radius, so only a ~2px crescent
  // of the SE handle is grabbable; pressing on its centre moves the box, and
  // just outside it starts a new box. When this passes, remove `test.fail`.
  test('grabbing the centre of the south-east handle resizes the box', async ({
    context,
    serviceWorker,
  }) => {
    test.fail();
    const page = await openTextPage(context, PAGE_TEXT);
    await startSelection(serviceWorker);

    await page.mouse.move(100, 100);
    await page.mouse.down();
    await page.mouse.move(300, 200, { steps: 5 });
    await page.mouse.up();

    await page.mouse.move(300, 200);
    await page.mouse.down();
    await page.mouse.move(350, 240, { steps: 5 });
    await page.mouse.up();
    await expect(page.locator('#snapocr-host .dims')).toHaveText('250 × 140', { timeout: 2_000 });
  });
});
