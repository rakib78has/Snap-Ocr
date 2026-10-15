import { expect } from '@playwright/test';

/**
 * OCR output compared the way OCR should be compared.
 *
 * The e2e tests render their own text, but each platform renders it with its
 * own fonts and anti-aliasing, so Tesseract can legitimately misread a letter
 * on one runner and not another (for example "Snap" read as "Shap" on Linux).
 * These tests check that the OCR pipeline works, not the engine's accuracy, so
 * they allow a small character error rate (CER) instead of an exact match.
 * Accuracy itself belongs in a separate benchmark.
 *
 * Normalisation, applied to both sides before comparing:
 * - line endings become "\n", and surrounding whitespace is trimmed;
 * - runs of spaces or tabs within a line become a single space.
 * Case, punctuation and line breaks are kept, so they still count as errors.
 */

/** Default tolerance: about one wrong character in twenty. */
export const MAX_CER = 0.05;

export function normalizeForComparison(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .trim();
}

/** Levenshtein distance in Unicode code points. */
export function editDistance(a: string, b: string): number {
  const x = [...a];
  const y = [...b];
  let previous = Array.from({ length: y.length + 1 }, (_, j) => j);
  for (let i = 1; i <= x.length; i++) {
    const current = [i];
    for (let j = 1; j <= y.length; j++) {
      const substitution = previous[j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1);
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, substitution);
    }
    previous = current;
  }
  return previous[y.length];
}

/** Edits needed to turn `actual` into `expected`, per expected character. */
export function characterErrorRate(actual: string, expected: string): number {
  const reference = normalizeForComparison(expected);
  const hypothesis = normalizeForComparison(actual);
  if (reference.length === 0) return hypothesis.length === 0 ? 0 : 1;
  return editDistance(hypothesis, reference) / [...reference].length;
}

/** Asserts that OCR output matches `expected` within `maxCer`, showing both texts on failure. */
export function expectOcrText(actual: string, expected: string, maxCer = MAX_CER): void {
  const cer = characterErrorRate(actual, expected);
  expect(
    cer,
    `OCR output ${JSON.stringify(actual)} vs expected ${JSON.stringify(expected)}: CER ${cer.toFixed(3)}`
  ).toBeLessThanOrEqual(maxCer);
}
