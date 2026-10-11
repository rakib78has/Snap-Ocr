import type { Rect } from '../core/geometry.ts';

export const REGION_SELECTED = 'SNAPOCR_REGION_SELECTED';

/** Sent by the selection overlay when the user confirms a region. */
export interface RegionSelectedMessage {
  type: typeof REGION_SELECTED;
  /** Viewport-relative CSS pixels. */
  rect: Rect;
  devicePixelRatio: number;
}

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/**
 * Validates a runtime message before the worker acts on it. Anything that
 * reaches `onMessage` is untyped at runtime, and a NaN in the rect would
 * otherwise only surface as an OffscreenCanvas exception deep in the crop.
 */
export function isRegionSelectedMessage(value: unknown): value is RegionSelectedMessage {
  if (typeof value !== 'object' || value === null) return false;
  const message = value as Record<string, unknown>;
  if (message.type !== REGION_SELECTED) return false;
  if (!isFiniteNumber(message.devicePixelRatio) || message.devicePixelRatio <= 0) return false;

  const rect = message.rect as Record<string, unknown> | null | undefined;
  if (typeof rect !== 'object' || rect === null) return false;
  return (
    isFiniteNumber(rect.x) &&
    isFiniteNumber(rect.y) &&
    isFiniteNumber(rect.width) &&
    isFiniteNumber(rect.height) &&
    rect.width > 0 &&
    rect.height > 0
  );
}
