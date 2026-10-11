import { describe, expect, it, vi } from 'vitest';
import {
  createBackgroundHandlers,
  MESSAGES,
  resultPagePath,
  type BackgroundDeps,
} from '../../src/background/handlers.ts';
import { REGION_SELECTED } from '../../src/shared/messages.ts';
import { pendingImageKey } from '../../src/shared/storage-keys.ts';

const CROPPED = 'data:image/png;base64,CROPPED';

function setup(overrides: Partial<BackgroundDeps> = {}) {
  const deps = {
    injectSelection: vi.fn(async () => undefined),
    captureRegion: vi.fn(async () => CROPPED),
    setSessionValue: vi.fn(async () => undefined),
    openTab: vi.fn(async () => undefined),
    queryActiveTab: vi.fn(async () => ({ id: 7, windowId: 3, url: 'https://example.com' })),
    notify: vi.fn(async () => undefined),
    newCaptureId: vi.fn(() => 'capture-1'),
    logError: vi.fn(),
    ...overrides,
  } satisfies BackgroundDeps;
  return { deps, handlers: createBackgroundHandlers(deps) };
}

const regionMessage = {
  type: REGION_SELECTED,
  rect: { x: 1, y: 2, width: 30, height: 40 },
  devicePixelRatio: 1.25,
};
const senderTab = { id: 7, windowId: 3, url: 'https://example.com' };

describe('starting a selection', () => {
  it('injects the overlay into a normal page', async () => {
    const { deps, handlers } = setup();
    await handlers.startSelection(senderTab);
    expect(deps.injectSelection).toHaveBeenCalledWith(7);
    expect(deps.notify).not.toHaveBeenCalled();
  });

  it('explains instead of injecting on browser-internal pages', async () => {
    const { deps, handlers } = setup();
    await handlers.startSelection({ id: 7, windowId: 3, url: 'chrome://extensions' });
    expect(deps.injectSelection).not.toHaveBeenCalled();
    expect(deps.notify).toHaveBeenCalledWith(MESSAGES.restrictedPage);
  });

  it('notifies when the page refuses injection', async () => {
    const { deps, handlers } = setup({
      injectSelection: vi.fn(async () => {
        throw new Error('Cannot access contents of the page');
      }),
    });
    await handlers.startSelection(senderTab);
    expect(deps.notify).toHaveBeenCalledWith(MESSAGES.injectionFailed);
    expect(deps.logError).toHaveBeenCalled();
  });

  it('ignores a tab without an id', async () => {
    const { deps, handlers } = setup();
    await handlers.startSelection({ windowId: 3 });
    await handlers.startSelection(undefined);
    expect(deps.injectSelection).not.toHaveBeenCalled();
    expect(deps.notify).not.toHaveBeenCalled();
  });

  it('starts from the keyboard shortcut on the active tab', async () => {
    const { deps, handlers } = setup();
    await handlers.onCommand('activate-selection');
    expect(deps.queryActiveTab).toHaveBeenCalled();
    expect(deps.injectSelection).toHaveBeenCalledWith(7);
  });

  it('ignores unknown commands', async () => {
    const { deps, handlers } = setup();
    await handlers.onCommand('something-else');
    expect(deps.queryActiveTab).not.toHaveBeenCalled();
  });
});

describe('handling a confirmed region', () => {
  it('captures, hands the image over via session storage, then opens the result page', async () => {
    const order: string[] = [];
    const { deps, handlers } = setup({
      setSessionValue: vi.fn(async () => void order.push('store')),
      openTab: vi.fn(async () => void order.push('open')),
    });

    await handlers.onMessage(regionMessage, senderTab);

    expect(deps.captureRegion).toHaveBeenCalledWith(3, regionMessage.rect, 1.25);
    expect(deps.setSessionValue).toHaveBeenCalledWith(pendingImageKey('capture-1'), CROPPED);
    expect(deps.openTab).toHaveBeenCalledWith('result/result.html?capture=capture-1');
    // The result page reads the image on load, so it must be stored first.
    expect(order).toEqual(['store', 'open']);
  });

  it('notifies and opens nothing when the capture fails', async () => {
    const { deps, handlers } = setup({
      captureRegion: vi.fn(async () => {
        throw new Error('captureVisibleTab denied');
      }),
    });

    await handlers.onMessage(regionMessage, senderTab);

    expect(deps.notify).toHaveBeenCalledWith(MESSAGES.captureFailed);
    expect(deps.setSessionValue).not.toHaveBeenCalled();
    expect(deps.openTab).not.toHaveBeenCalled();
  });

  it('gives each capture its own storage key and result page (regression: M1)', async () => {
    const ids = ['first', 'second'];
    const { deps, handlers } = setup({ newCaptureId: vi.fn(() => ids.shift()!) });

    await Promise.all([
      handlers.onMessage(regionMessage, senderTab),
      handlers.onMessage(regionMessage, senderTab),
    ]);

    const keys = vi.mocked(deps.setSessionValue).mock.calls.map(([key]) => key);
    expect(keys).toEqual([pendingImageKey('first'), pendingImageKey('second')]);
    expect(vi.mocked(deps.openTab).mock.calls.map(([path]) => path)).toEqual([
      resultPagePath('first'),
      resultPagePath('second'),
    ]);
  });

  it('asks for a smaller selection when the image exceeds the storage quota', async () => {
    const { deps, handlers } = setup({
      setSessionValue: vi.fn(async () => {
        throw new Error('Session storage quota bytes exceeded. Values were not stored.');
      }),
    });

    await handlers.onMessage(regionMessage, senderTab);

    expect(deps.notify).toHaveBeenCalledWith(MESSAGES.selectionTooLarge);
    expect(deps.openTab).not.toHaveBeenCalled();
  });

  it('reports other storage failures as a generic capture failure', async () => {
    const { deps, handlers } = setup({
      setSessionValue: vi.fn(async () => {
        throw new Error('Storage unavailable');
      }),
    });

    await handlers.onMessage(regionMessage, senderTab);

    expect(deps.notify).toHaveBeenCalledWith(MESSAGES.captureFailed);
    expect(deps.openTab).not.toHaveBeenCalled();
  });

  it('ignores messages that are not a valid region', () => {
    const { deps, handlers } = setup();
    expect(handlers.onMessage({ type: 'OTHER' }, senderTab)).toBeUndefined();
    expect(
      handlers.onMessage(
        { ...regionMessage, rect: { x: NaN, y: 0, width: 1, height: 1 } },
        senderTab
      )
    ).toBeUndefined();
    expect(deps.captureRegion).not.toHaveBeenCalled();
  });

  it('ignores messages that did not come from a tab', () => {
    const { deps, handlers } = setup();
    expect(handlers.onMessage(regionMessage, undefined)).toBeUndefined();
    expect(deps.captureRegion).not.toHaveBeenCalled();
  });
});
