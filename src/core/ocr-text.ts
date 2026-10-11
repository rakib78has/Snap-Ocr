/**
 * Cleans raw engine output for display. Only surrounding whitespace is
 * removed; internal line breaks are kept because they mirror the source layout.
 */
export function normalizeOcrText(text: string | null | undefined): string {
  return text ? text.trim() : '';
}

/** Progress fraction (0–1, possibly out of range) as a whole percentage. */
export function progressPercent(fraction: number): number {
  return Math.round(Math.min(1, Math.max(0, fraction)) * 100);
}
