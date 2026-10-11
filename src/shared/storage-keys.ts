/**
 * chrome.storage.session: a cropped capture handed from the worker to the
 * result page. Each capture gets its own key so two quick captures cannot
 * overwrite each other before their result pages have read them.
 */
export const PENDING_IMAGE_PREFIX = 'snapocr_pending_image:';

export function pendingImageKey(captureId: string): string {
  return `${PENDING_IMAGE_PREFIX}${captureId}`;
}

/** Query parameter on the result page URL naming the capture to show. */
export const CAPTURE_PARAM = 'capture';

/** chrome.storage.local: the language the user last used successfully. */
export const LAST_LANG_KEY = 'snapocr_last_lang';

/** chrome.storage.local: the result page theme preference. */
export const THEME_KEY = 'snapocr_theme';

/** chrome.storage.local: the last successful subscription check (see core/entitlement.ts). */
export const ENTITLEMENT_KEY = 'snapocr_entitlement';
