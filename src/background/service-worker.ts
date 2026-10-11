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
