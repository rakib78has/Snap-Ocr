export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Size {
  w: number;
  h: number;
}

export type HandleName = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

export const HANDLE_NAMES: readonly HandleName[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

/** Smallest selection, in CSS pixels, that can be captured. */
export const MIN_SELECTION_SIZE = 16;

export const EMPTY_RECT: Rect = { x: 0, y: 0, width: 0, height: 0 };

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** The box spanned by a drag, whichever direction it went. */
export function rectFromDrag(startX: number, startY: number, x: number, y: number): Rect {
  return {
    x: Math.min(startX, x),
    y: Math.min(startY, y),
    width: Math.abs(x - startX),
    height: Math.abs(y - startY),
  };
}

export function isCapturable(rect: Rect, minSize = MIN_SELECTION_SIZE): boolean {
  return rect.width >= minSize && rect.height >= minSize;
}

/**
 * Resizes `start` by dragging `handle` by (dx, dy), keeping the box inside the
 * viewport and no smaller than `minSize` on either axis.
 */
export function resizeRect(
  start: Rect,
  handle: HandleName,
  dx: number,
  dy: number,
  viewport: Size,
  minSize = MIN_SELECTION_SIZE
): Rect {
  let left = start.x;
  let top = start.y;
  let right = start.x + start.width;
  let bottom = start.y + start.height;

  if (handle.includes('w')) left = clamp(start.x + dx, 0, right - minSize);
  if (handle.includes('e')) right = clamp(right + dx, left + minSize, viewport.w);
  if (handle.includes('n')) top = clamp(start.y + dy, 0, bottom - minSize);
  if (handle.includes('s')) bottom = clamp(bottom + dy, top + minSize, viewport.h);

  return { x: left, y: top, width: right - left, height: bottom - top };
}

/** Moves `start` by (dx, dy) without letting it leave the viewport. */
export function moveRect(start: Rect, dx: number, dy: number, viewport: Size): Rect {
  return {
    ...start,
    x: clamp(start.x + dx, 0, Math.max(0, viewport.w - start.width)),
    y: clamp(start.y + dy, 0, Math.max(0, viewport.h - start.height)),
  };
}

/** Centre point of each resize handle. */
export function handlePositions(rect: Rect): Record<HandleName, [number, number]> {
  const right = rect.x + rect.width;
  const bottom = rect.y + rect.height;
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  return {
    nw: [rect.x, rect.y],
    n: [cx, rect.y],
    ne: [right, rect.y],
    e: [right, cy],
    se: [right, bottom],
    s: [cx, bottom],
    sw: [rect.x, bottom],
    w: [rect.x, cy],
  };
}

/** Where the "W × H" label goes: above the box, or below it when there is no room. */
export function dimensionsLabelPosition(rect: Rect, viewport: Size): { left: number; top: number } {
  let top = rect.y - 22;
  if (top < 0) top = rect.y + rect.height + 6;
  return { left: clamp(rect.x, 4, viewport.w - 4), top };
}

/** Where the Capture / Recapture / Cancel toolbar goes: below the box, or above it near the bottom edge. */
export function toolbarPosition(rect: Rect, viewport: Size): { left: number; top: number } {
  let top = rect.y + rect.height + 10;
  if (top > viewport.h - 50) top = Math.max(8, rect.y - 46);
  return { left: clamp(rect.x, 8, Math.max(8, viewport.w - 260)), top };
}

export interface CropRegion {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

/**
 * Maps a CSS-pixel selection onto the device-pixel screenshot, clamped to the
 * bitmap so a selection touching the edge never reads outside it.
 */
export function cropRegion(
  rect: Rect,
  devicePixelRatio: number,
  bitmapWidth: number,
  bitmapHeight: number
): CropRegion {
  const sx = Math.max(0, Math.round(rect.x * devicePixelRatio));
  const sy = Math.max(0, Math.round(rect.y * devicePixelRatio));
  const sw = Math.max(1, Math.min(bitmapWidth - sx, Math.round(rect.width * devicePixelRatio)));
  const sh = Math.max(1, Math.min(bitmapHeight - sy, Math.round(rect.height * devicePixelRatio)));
  return { sx, sy, sw, sh };
}
