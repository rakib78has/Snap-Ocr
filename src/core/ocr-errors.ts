import { CancelledError, TimeoutError } from './abortable.ts';
import { isBundledLanguage } from './languages.ts';

const DOWNLOAD_HINT =
  'This language is downloaded on first use, so check your internet connection.';

/**
 * Turns an OCR failure into the message shown to the user, or `null` when the
 * user cancelled and no error should be shown.
 */
export function describeOcrFailure(error: unknown, language: string): string | null {
  if (error instanceof CancelledError) return null;

  const needsDownload = !isBundledLanguage(language);

  if (error instanceof TimeoutError) {
    return needsDownload
      ? `OCR took too long and was stopped. ${DOWNLOAD_HINT}`
      : 'OCR took too long and was stopped. Try selecting a smaller area.';
  }

  const detail = error instanceof Error && error.message ? error.message : String(error);
  return needsDownload ? `OCR failed: ${detail}. ${DOWNLOAD_HINT}` : `OCR failed: ${detail}`;
}
