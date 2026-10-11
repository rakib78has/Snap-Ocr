import { bytesToPngDataUrl, dataUrlToBytes } from '../core/data-url.ts';
import { cropRegion, type Rect } from '../core/geometry.ts';

/**
 * Screenshots the visible tab and crops it to the selected region.
 *
 * Runs in the service worker, which has no DOM, so decoding and cropping go
 * through createImageBitmap and OffscreenCanvas.
 */
export async function captureRegion(
  windowId: number,
  rect: Rect,
  devicePixelRatio: number
): Promise<string> {
  const screenshot = await chrome.tabs.captureVisibleTab(windowId, { format: 'png' });
  const bitmap = await createImageBitmap(
    new Blob([dataUrlToBytes(screenshot)], { type: 'image/png' })
  );

  try {
    const { sx, sy, sw, sh } = cropRegion(rect, devicePixelRatio, bitmap.width, bitmap.height);
    const canvas = new OffscreenCanvas(sw, sh);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('OffscreenCanvas 2D context unavailable');
    ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, sw, sh);

    const cropped = await canvas.convertToBlob({ type: 'image/png' });
    return bytesToPngDataUrl(new Uint8Array(await cropped.arrayBuffer()));
  } finally {
    bitmap.close();
  }
}
