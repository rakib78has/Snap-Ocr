import { describe, expect, it } from 'vitest';
import { characterErrorRate, editDistance, normalizeForComparison } from '../e2e/ocr-match.ts';

describe('OCR comparison helper used by the e2e tests', () => {
  it('computes edit distance in code points', () => {
    expect(editDistance('', '')).toBe(0);
    expect(editDistance('Snap', 'Shap')).toBe(1);
    expect(editDistance('kitten', 'sitting')).toBe(3);
    expect(editDistance('日本語', '日本')).toBe(1);
  });

  it('normalises only line endings and runs of spaces', () => {
    expect(normalizeForComparison('  a  b\r\nc\t\td \n')).toBe('a b\nc d');
    // Case and punctuation are not normalised away.
    expect(normalizeForComparison('Hello, World')).toBe('Hello, World');
  });

  it('measures errors per expected character', () => {
    expect(characterErrorRate('Shap OCR', 'Snap OCR')).toBeCloseTo(1 / 8);
    expect(characterErrorRate('same text', 'same text')).toBe(0);
    expect(characterErrorRate('', '')).toBe(0);
    expect(characterErrorRate('noise', '')).toBe(1);
  });

  it('still counts a lost line break as an error', () => {
    expect(characterErrorRate('one two', 'one\ntwo')).toBeGreaterThan(0);
  });
});
