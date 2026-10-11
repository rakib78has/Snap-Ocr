import { describe, expect, it } from 'vitest';
import {
  clamp,
  cropRegion,
  dimensionsLabelPosition,
  handlePositions,
  isCapturable,
  MIN_SELECTION_SIZE,
  moveRect,
  rectFromDrag,
  resizeRect,
  toolbarPosition,
  type Rect,
} from '../../src/core/geometry.ts';

const viewport = { w: 1000, h: 800 };
const box: Rect = { x: 100, y: 100, width: 200, height: 100 };

describe('clamp', () => {
  it('keeps values inside the range', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(11, 0, 10)).toBe(10);
  });
});

describe('rectFromDrag', () => {
  it('normalises drags in every direction to a positive box', () => {
    const expected = { x: 10, y: 20, width: 40, height: 30 };
    expect(rectFromDrag(10, 20, 50, 50)).toEqual(expected);
    expect(rectFromDrag(50, 50, 10, 20)).toEqual(expected);
    expect(rectFromDrag(50, 20, 10, 50)).toEqual(expected);
  });
});

describe('isCapturable', () => {
  it('requires both sides to reach the minimum size', () => {
    expect(
      isCapturable({ x: 0, y: 0, width: MIN_SELECTION_SIZE, height: MIN_SELECTION_SIZE })
    ).toBe(true);
    expect(isCapturable({ x: 0, y: 0, width: MIN_SELECTION_SIZE - 1, height: 100 })).toBe(false);
    expect(isCapturable({ x: 0, y: 0, width: 100, height: MIN_SELECTION_SIZE - 1 })).toBe(false);
  });
});

describe('resizeRect', () => {
  it('moves only the edges a handle controls', () => {
    expect(resizeRect(box, 'e', 50, 999, viewport)).toEqual({ ...box, width: 250 });
    expect(resizeRect(box, 's', 999, 20, viewport)).toEqual({ ...box, height: 120 });
    expect(resizeRect(box, 'nw', -10, -20, viewport)).toEqual({
      x: 90,
      y: 80,
      width: 210,
      height: 120,
    });
  });

  it('never shrinks below the minimum size', () => {
    const shrunk = resizeRect(box, 'se', -1000, -1000, viewport);
    expect(shrunk.width).toBe(MIN_SELECTION_SIZE);
    expect(shrunk.height).toBe(MIN_SELECTION_SIZE);

    const fromLeft = resizeRect(box, 'w', 1000, 0, viewport);
    expect(fromLeft.width).toBe(MIN_SELECTION_SIZE);
    expect(fromLeft.x + fromLeft.width).toBe(box.x + box.width);
  });

  it('stays inside the viewport', () => {
    expect(resizeRect(box, 'nw', -500, -500, viewport)).toMatchObject({ x: 0, y: 0 });
    const grown = resizeRect(box, 'se', 5000, 5000, viewport);
    expect(grown.x + grown.width).toBe(viewport.w);
    expect(grown.y + grown.height).toBe(viewport.h);
  });
});

describe('moveRect', () => {
  it('translates the box without changing its size', () => {
    expect(moveRect(box, 30, -40, viewport)).toEqual({ ...box, x: 130, y: 60 });
  });

  it('pins the box to the viewport edges', () => {
    expect(moveRect(box, -500, -500, viewport)).toMatchObject({ x: 0, y: 0 });
    expect(moveRect(box, 5000, 5000, viewport)).toMatchObject({ x: 800, y: 700 });
  });

  it('pins to the origin when the box is larger than the viewport', () => {
    const huge = { x: 0, y: 0, width: 2000, height: 2000 };
    expect(moveRect(huge, 100, 100, viewport)).toMatchObject({ x: 0, y: 0 });
  });
});

describe('handlePositions', () => {
  it('places handles on corners and edge midpoints', () => {
    const p = handlePositions(box);
    expect(p.nw).toEqual([100, 100]);
    expect(p.n).toEqual([200, 100]);
    expect(p.se).toEqual([300, 200]);
    expect(p.w).toEqual([100, 150]);
  });
});

describe('label and toolbar placement', () => {
  it('puts the size label above the box, or below it at the top edge', () => {
    expect(dimensionsLabelPosition(box, viewport)).toEqual({ left: 100, top: 78 });
    expect(dimensionsLabelPosition({ ...box, y: 5 }, viewport)).toEqual({ left: 100, top: 111 });
  });

  it('puts the toolbar below the box, or above it near the bottom edge', () => {
    expect(toolbarPosition(box, viewport)).toEqual({ left: 100, top: 210 });
    expect(toolbarPosition({ ...box, y: 700 }, viewport).top).toBe(654);
    expect(toolbarPosition({ ...box, x: 990 }, viewport).left).toBe(740);
  });
});

describe('cropRegion', () => {
  it('scales CSS pixels to device pixels', () => {
    expect(cropRegion(box, 2, 2000, 1600)).toEqual({ sx: 200, sy: 200, sw: 400, sh: 200 });
  });

  it('rounds fractional device pixel ratios', () => {
    expect(cropRegion({ x: 1, y: 1, width: 3, height: 3 }, 1.5, 100, 100)).toEqual({
      sx: 2,
      sy: 2,
      sw: 5,
      sh: 5,
    });
  });

  it('clamps a selection that runs past the screenshot', () => {
    expect(cropRegion({ x: 900, y: 700, width: 500, height: 500 }, 1, 1000, 800)).toEqual({
      sx: 900,
      sy: 700,
      sw: 100,
      sh: 100,
    });
  });

  it('never produces an empty or negative crop', () => {
    const region = cropRegion({ x: 2000, y: 2000, width: 10, height: 10 }, 1, 1000, 800);
    expect(region.sw).toBe(1);
    expect(region.sh).toBe(1);
  });
});
