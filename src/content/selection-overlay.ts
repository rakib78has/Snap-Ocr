import {
  dimensionsLabelPosition,
  EMPTY_RECT,
  handlePositions,
  HANDLE_NAMES,
  isCapturable,
  moveRect,
  rectFromDrag,
  resizeRect,
  toolbarPosition,
  type HandleName,
  type Rect,
  type Size,
} from '../core/geometry.ts';
import { REGION_SELECTED, type RegionSelectedMessage } from '../shared/messages.ts';

/**
 * Drag-to-select overlay, injected into the active tab on demand.
 *
 * Built as a classic IIFE script because chrome.scripting.executeScript runs
 * files that way. It can be injected repeatedly into the same page, so state
 * that must survive re-injection lives on `window`.
 */

declare global {
  interface Window {
    __snapOCRActive?: boolean;
    __snapOCRReset?: (() => void) | undefined;
  }
}

/**
 * idle      – waiting for the first mousedown, no box yet
 * drawing   – dragging out the initial box
 * adjusting – box exists, waiting for the user
 * resizing  – dragging a handle
 * moving    – dragging the whole box
 */
type Mode = 'idle' | 'drawing' | 'adjusting' | 'resizing' | 'moving';

const HANDLE_SIZE = 12;

const STYLES = `
  .overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background: rgba(0, 0, 0, 0.25);
    cursor: crosshair;
    z-index: 2147483647;
  }
  .hint {
    position: fixed;
    top: 16px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(20, 20, 20, 0.85);
    color: #fff;
    font: 13px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    padding: 8px 14px;
    border-radius: 6px;
    pointer-events: none;
    white-space: nowrap;
  }
  .selection {
    position: fixed;
    border: 2px solid #2563eb;
    background: rgba(37, 99, 235, 0.12);
    box-shadow: 0 0 0 2000px rgba(0, 0, 0, 0.25);
    display: none;
  }
  .selection.adjusting {
    cursor: move;
  }
  .dims {
    position: fixed;
    background: rgba(20, 20, 20, 0.85);
    color: #fff;
    font: 11px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    padding: 2px 6px;
    border-radius: 4px;
    pointer-events: none;
    display: none;
    white-space: nowrap;
  }
  .handle {
    position: fixed;
    width: ${HANDLE_SIZE}px;
    height: ${HANDLE_SIZE}px;
    background: #fff;
    border: 2px solid #2563eb;
    border-radius: 50%;
    display: none;
    box-sizing: border-box;
  }
  .handle.nw, .handle.se { cursor: nwse-resize; }
  .handle.ne, .handle.sw { cursor: nesw-resize; }
  .handle.n, .handle.s { cursor: ns-resize; }
  .handle.e, .handle.w { cursor: ew-resize; }
  .toolbar {
    position: fixed;
    display: none;
    gap: 8px;
    background: rgba(20, 20, 20, 0.9);
    padding: 8px;
    border-radius: 8px;
    font: 13px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  }
  .toolbar button {
    font: inherit;
    border: none;
    border-radius: 6px;
    padding: 6px 14px;
    cursor: pointer;
  }
  .toolbar button.capture {
    background: #2563eb;
    color: #fff;
  }
  .toolbar button.recapture {
    background: #4b5563;
    color: #fff;
  }
  .toolbar button.cancel {
    background: #374151;
    color: #fff;
  }
`;

const HINT_DRAW = 'Drag to select an area — Esc to cancel';
const HINT_ADJUST =
  'Drag corners/edges to resize, drag the box to move — Enter to capture, Esc to cancel';

function createElement(className: string, text?: string): HTMLDivElement {
  const el = document.createElement('div');
  el.className = className;
  if (text) el.textContent = text;
  return el;
}

function createButton(className: string, label: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.className = className;
  button.textContent = label;
  return button;
}

/** Resolves once a frame painted after this call has been produced. */
function nextPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

function viewportSize(): Size {
  return { w: window.innerWidth, h: window.innerHeight };
}

function mountOverlay(): void {
  window.__snapOCRActive = true;

  const host = document.createElement('div');
  host.id = 'snapocr-host';
  Object.assign(host.style, {
    all: 'initial',
    position: 'fixed',
    top: '0',
    left: '0',
    width: '0',
    height: '0',
    zIndex: '2147483647',
  });

  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = STYLES;

  const overlay = createElement('overlay');
  const hint = createElement('hint', HINT_DRAW);
  const selection = createElement('selection');
  const dims = createElement('dims');

  const handles = {} as Record<HandleName, HTMLDivElement>;
  for (const name of HANDLE_NAMES) {
    handles[name] = createElement(`handle ${name}`);
  }

  const toolbar = createElement('toolbar');
  const captureBtn = createButton('capture', 'Capture');
  const recaptureBtn = createButton('recapture', 'Recapture');
  const cancelBtn = createButton('cancel', 'Cancel');
  toolbar.append(captureBtn, recaptureBtn, cancelBtn);

  shadow.append(style, overlay);
  // Handles come after the selection so they paint above it: they straddle
  // the box edge, and underneath it most of each handle could not be grabbed.
  overlay.append(hint, selection, ...HANDLE_NAMES.map((name) => handles[name]), dims, toolbar);
  document.documentElement.appendChild(host);

  let mode: Mode = 'idle';
  let rect: Rect = { ...EMPTY_RECT };
  let dragStartX = 0;
  let dragStartY = 0;
  let dragStartRect: Rect = { ...EMPTY_RECT };
  let activeHandle: HandleName | null = null;

  // Every listener on the page's document/window is registered with this
  // signal, so tearing the overlay down removes all of them at once.
  const listeners = new AbortController();
  const { signal } = listeners;

  function render(): void {
    const isBoxMode = mode === 'adjusting' || mode === 'resizing' || mode === 'moving';
    const hasBox = rect.width > 0 && rect.height > 0;
    selection.style.display = hasBox ? 'block' : 'none';
    selection.style.left = `${rect.x}px`;
    selection.style.top = `${rect.y}px`;
    selection.style.width = `${rect.width}px`;
    selection.style.height = `${rect.height}px`;
    selection.classList.toggle('adjusting', isBoxMode);

    const showHandles = isBoxMode && hasBox;
    const positions = handlePositions(rect);
    const half = HANDLE_SIZE / 2;
    for (const name of HANDLE_NAMES) {
      const [px, py] = positions[name];
      handles[name].style.display = showHandles ? 'block' : 'none';
      handles[name].style.left = `${px - half}px`;
      handles[name].style.top = `${py - half}px`;
    }

    if (hasBox) {
      const { left, top } = dimensionsLabelPosition(rect, viewportSize());
      dims.style.display = 'block';
      dims.textContent = `${Math.round(rect.width)} × ${Math.round(rect.height)}`;
      dims.style.left = `${left}px`;
      dims.style.top = `${top}px`;
    } else {
      dims.style.display = 'none';
    }

    if (mode === 'adjusting') {
      const { left, top } = toolbarPosition(rect, viewportSize());
      toolbar.style.display = 'flex';
      toolbar.style.left = `${left}px`;
      toolbar.style.top = `${top}px`;
    } else {
      toolbar.style.display = 'none';
    }

    hint.textContent = isBoxMode ? HINT_ADJUST : HINT_DRAW;
  }

  function resetSelection(): void {
    mode = 'idle';
    activeHandle = null;
    rect = { ...EMPTY_RECT };
    render();
  }

  function cleanup(): void {
    window.__snapOCRActive = false;
    window.__snapOCRReset = undefined;
    listeners.abort();
    host.remove();
  }

  async function confirmCapture(): Promise<void> {
    if (!isCapturable(rect)) return;
    const message: RegionSelectedMessage = {
      type: REGION_SELECTED,
      rect: { ...rect },
      devicePixelRatio: window.devicePixelRatio || 1,
    };
    cleanup();
    // The screenshot is taken from what is on screen, so wait until a frame
    // without the overlay has been painted; otherwise the dimming and the
    // selection border can end up inside the captured image.
    await nextPaint();
    try {
      await chrome.runtime.sendMessage(message);
    } catch (error) {
      // The worker reports capture failures itself; this only fires if the
      // message could not be delivered at all (e.g. the extension reloaded).
      console.warn('Snap OCR: could not reach the extension', error);
    }
  }

  function onKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      cleanup();
    } else if (e.key === 'Enter' && mode === 'adjusting') {
      void confirmCapture();
    } else {
      return;
    }
    // Handled keys belong to the overlay: without this, Enter could also
    // submit a focused form and Escape could close the page's own dialogs.
    e.preventDefault();
    e.stopImmediatePropagation();
  }

  function beginDrag(e: MouseEvent, next: Mode): void {
    mode = next;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    dragStartRect = { ...rect };
    e.preventDefault();
    e.stopPropagation();
  }

  overlay.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return; // left mouse button only
    // The box and handles stop propagation of their own mousedown, so reaching
    // here means the click was on the backdrop: start a fresh box.
    mode = 'drawing';
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    rect = { x: dragStartX, y: dragStartY, width: 0, height: 0 };
    render();
    e.preventDefault();
  });

  selection.addEventListener('mousedown', (e) => {
    if (e.button !== 0 || mode !== 'adjusting') return;
    beginDrag(e, 'moving');
  });

  for (const name of HANDLE_NAMES) {
    handles[name].addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      activeHandle = name;
      beginDrag(e, 'resizing');
    });
  }

  document.addEventListener(
    'mousemove',
    (e) => {
      const dx = e.clientX - dragStartX;
      const dy = e.clientY - dragStartY;

      if (mode === 'drawing') {
        rect = rectFromDrag(dragStartX, dragStartY, e.clientX, e.clientY);
      } else if (mode === 'resizing' && activeHandle) {
        rect = resizeRect(dragStartRect, activeHandle, dx, dy, viewportSize());
      } else if (mode === 'moving') {
        rect = moveRect(dragStartRect, dx, dy, viewportSize());
      } else {
        return;
      }
      render();
    },
    { signal }
  );

  document.addEventListener(
    'mouseup',
    () => {
      if (mode === 'drawing') {
        if (!isCapturable(rect)) {
          resetSelection();
          return;
        }
        mode = 'adjusting';
        render();
      } else if (mode === 'resizing' || mode === 'moving') {
        mode = 'adjusting';
        activeHandle = null;
        render();
      }
    },
    { signal }
  );

  // Capture phase on window, so the overlay sees keys before page handlers.
  window.addEventListener('keydown', onKeyDown, { capture: true, signal });

  // Toolbar clicks must not reach the backdrop, which would start a new box.
  const swallow = (e: Event) => {
    e.preventDefault();
    e.stopPropagation();
  };
  toolbar.addEventListener('mousedown', swallow);
  const bindButton = (button: HTMLButtonElement, action: () => void) => {
    button.addEventListener('mousedown', swallow);
    button.addEventListener('click', (e) => {
      swallow(e);
      action();
    });
  };
  bindButton(captureBtn, () => void confirmCapture());
  bindButton(recaptureBtn, resetSelection);
  bindButton(cancelBtn, cleanup);

  window.__snapOCRReset = resetSelection;
  render();
}

if (window.__snapOCRActive) {
  // Activated again while a previous box is still on screen: reset it to a
  // clean drag-to-draw state rather than silently doing nothing.
  window.__snapOCRReset?.();
} else {
  mountOverlay();
}
