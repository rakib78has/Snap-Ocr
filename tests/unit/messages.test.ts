import { describe, expect, it } from 'vitest';
import { isRegionSelectedMessage, REGION_SELECTED } from '../../src/shared/messages.ts';

const valid = {
  type: REGION_SELECTED,
  rect: { x: 10, y: 20, width: 30, height: 40 },
  devicePixelRatio: 2,
};

describe('isRegionSelectedMessage', () => {
  it('accepts a well-formed message', () => {
    expect(isRegionSelectedMessage(valid)).toBe(true);
  });

  it.each([
    ['null', null],
    ['a string', 'SNAPOCR_REGION_SELECTED'],
    ['another message type', { ...valid, type: 'OTHER' }],
    ['a missing rect', { ...valid, rect: undefined }],
    ['a NaN coordinate', { ...valid, rect: { ...valid.rect, x: NaN } }],
    ['an infinite size', { ...valid, rect: { ...valid.rect, width: Infinity } }],
    ['a zero-size rect', { ...valid, rect: { ...valid.rect, height: 0 } }],
    ['a string coordinate', { ...valid, rect: { ...valid.rect, y: '20' } }],
    ['a zero pixel ratio', { ...valid, devicePixelRatio: 0 }],
    ['a missing pixel ratio', { type: REGION_SELECTED, rect: valid.rect }],
  ])('rejects %s', (_label, message) => {
    expect(isRegionSelectedMessage(message)).toBe(false);
  });
});
