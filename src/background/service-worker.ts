import { checkAccess } from '../infra/account.ts';
import { captureRegion } from './capture.ts';
import { createBackgroundHandlers, SELECTION_SCRIPT } from './handlers.ts';

async function notify(message: string): Promise<void> {
  try {
    await chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: 'Snap OCR',
      message,
    });
  } catch (error) {
    console.warn('Snap OCR: could not show notification', error);
  }
}

const handlers = createBackgroundHandlers({
  checkAccess: () => checkAccess(),
  injectSelection: (tabId) =>
    chrome.scripting.executeScript({ target: { tabId }, files: [SELECTION_SCRIPT] }),
  captureRegion,
  setSessionValue: (key, value) => chrome.storage.session.set({ [key]: value }),
  openTab: (path) => chrome.tabs.create({ url: chrome.runtime.getURL(path) }),
  queryActiveTab: async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab;
  },
  notify,
  newCaptureId: () => crypto.randomUUID(),
  logError: (message, error) => console.error(message, error),
});

// Listeners are registered synchronously at the top level so Chrome can wake
// the worker for them after it has been suspended.
chrome.action.onClicked.addListener((tab) => {
  void handlers.startSelection(tab);
});

chrome.commands.onCommand.addListener((command) => {
  void handlers.onCommand(command);
});

chrome.runtime.onMessage.addListener((message, sender) => {
  void handlers.onMessage(message, sender.tab);
  // No response is ever sent back to the overlay.
  return false;
});

// The e2e build exposes the handlers so tests can do what a toolbar click
// does; automation cannot click browser UI. `import.meta.env.MODE` is a
// build-time constant, so production bundles drop this block entirely
// (scripts/validate-build.mjs checks that it is gone).
if (import.meta.env.MODE === 'e2e') {
  (globalThis as { snapOcrE2E?: typeof handlers }).snapOcrE2E = handlers;
}
