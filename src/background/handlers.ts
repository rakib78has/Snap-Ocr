import type { Rect } from '../core/geometry.ts';
import { isRestrictedUrl } from '../core/restricted-url.ts';
import { isRegionSelectedMessage } from '../shared/messages.ts';
import { PENDING_IMAGE_KEY } from '../shared/storage-keys.ts';

export const SELECTION_SCRIPT = 'selection-overlay.js';
export const RESULT_PAGE = 'result/result.html';
export const ACTIVATE_COMMAND = 'activate-selection';

export const MESSAGES = {
  restrictedPage:
    "Snap OCR can't run on this page (browser internal pages are restricted). Try it on a regular webpage, PDF, or video tab.",
  injectionFailed:
    "Snap OCR couldn't start on this page. Some pages (like the Chrome Web Store or internal pages) block extensions.",
  captureFailed: 'Snap OCR failed to capture that region. Please try again.',
} as const;

export interface TabRef {
  id?: number | undefined;
  windowId: number;
  url?: string | undefined;
}

/**
 * Everything the background logic needs from the outside world. Injected so
 * the flow can be tested without a browser; service-worker.ts supplies the
 * real Chrome implementations.
 */
export interface BackgroundDeps {
  injectSelection(tabId: number): Promise<unknown>;
  captureRegion(windowId: number, rect: Rect, devicePixelRatio: number): Promise<string>;
  setSessionValue(key: string, value: string): Promise<void>;
  openTab(path: string): Promise<unknown>;
  queryActiveTab(): Promise<TabRef | undefined>;
  notify(message: string): Promise<void>;
  logError(message: string, error: unknown): void;
}

export function createBackgroundHandlers(deps: BackgroundDeps) {
  async function startSelection(tab: TabRef | undefined): Promise<void> {
    if (!tab?.id) return;

    if (isRestrictedUrl(tab.url)) {
      await deps.notify(MESSAGES.restrictedPage);
      return;
    }

    try {
      await deps.injectSelection(tab.id);
    } catch (error) {
      deps.logError('Snap OCR: failed to inject content script', error);
      await deps.notify(MESSAGES.injectionFailed);
    }
  }

  async function onCommand(command: string): Promise<void> {
    if (command !== ACTIVATE_COMMAND) return;
    await startSelection(await deps.queryActiveTab());
  }

  /**
   * Handles a confirmed region. Returns the work as a promise (for tests), or
   * `undefined` when the message is not ours so other listeners can answer it.
   */
  function onMessage(message: unknown, senderTab: TabRef | undefined): Promise<void> | undefined {
    if (!isRegionSelectedMessage(message) || !senderTab) return undefined;

    return (async () => {
      try {
        const image = await deps.captureRegion(
          senderTab.windowId,
          message.rect,
          message.devicePixelRatio
        );
        await deps.setSessionValue(PENDING_IMAGE_KEY, image);
        await deps.openTab(RESULT_PAGE);
      } catch (error) {
        deps.logError('Snap OCR: capture failed', error);
        await deps.notify(MESSAGES.captureFailed);
      }
    })();
  }

  return { startSelection, onCommand, onMessage };
}
