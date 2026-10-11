import {
  LANGUAGES,
  languageHint,
  languageLabel,
  resolveInitialLanguage,
} from '../core/languages.ts';
import { describeOcrFailure } from '../core/ocr-errors.ts';
import { normalizeOcrText, progressPercent } from '../core/ocr-text.ts';
import { recognizeText } from '../infra/ocr-engine.ts';
import { setUpThemeToggle } from '../ui/theme.ts';
import { CAPTURE_PARAM, LAST_LANG_KEY, pendingImageKey } from '../shared/storage-keys.ts';

function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Snap OCR: #${id} missing from result.html`);
  return el as T;
}

const themeToggleEl = byId<HTMLButtonElement>('themeToggle');
const previewEl = byId<HTMLImageElement>('preview');
const progressLabelEl = byId('progressLabel');
const progressFillEl = byId('progressFill');
const outputEl = byId<HTMLTextAreaElement>('output');
const copyBtn = byId<HTMLButtonElement>('copyBtn');
const docsBtn = byId<HTMLButtonElement>('docsBtn');
const cancelBtn = byId<HTMLButtonElement>('cancelBtn');
const retryBtn = byId<HTMLButtonElement>('retryBtn');
const statusTextEl = byId('statusText');
const errorTextEl = byId('errorText');
const langSelectEl = byId<HTMLSelectElement>('langSelect');
const langHintEl = byId('langHint');

const STATUS_FLASH_MS = 1500;

let capturedDataUrl: string | undefined;
let currentRun: AbortController | null = null;
let statusTimer: ReturnType<typeof setTimeout> | undefined;

function showError(message: string): void {
  errorTextEl.textContent = message;
  errorTextEl.hidden = false;
  progressLabelEl.textContent = 'Failed';
}

function clearError(): void {
  errorTextEl.hidden = true;
  errorTextEl.textContent = '';
}

/** Sets the status line; a `flash` message clears itself unless replaced first. */
function setStatus(message: string, flash = false): void {
  clearTimeout(statusTimer);
  statusTextEl.textContent = message;
  if (flash) {
    statusTimer = setTimeout(() => {
      statusTextEl.textContent = '';
    }, STATUS_FLASH_MS);
  }
}

function setProgress(label: string, fraction: number): void {
  progressLabelEl.textContent = label;
  progressFillEl.style.width = `${progressPercent(fraction)}%`;
}

function populateLanguageDropdown(selected: string): void {
  langSelectEl.replaceChildren(
    ...LANGUAGES.map((language) => {
      const option = document.createElement('option');
      option.value = language.code;
      option.textContent = languageLabel(language);
      return option;
    })
  );
  langSelectEl.value = selected;
}

function setRunning(running: boolean): void {
  copyBtn.disabled = running;
  docsBtn.disabled = running;
  langSelectEl.disabled = running;
  cancelBtn.hidden = !running;
  if (running) retryBtn.hidden = true;
}

async function runOCR(language: string): Promise<void> {
  if (!capturedDataUrl || currentRun) return;
  const run = new AbortController();
  currentRun = run;

  clearError();
  setRunning(true);
  setStatus('');
  setProgress('Starting OCR...', 0);

  try {
    const text = await recognizeText(capturedDataUrl, {
      language,
      signal: run.signal,
      onProgress: ({ status, progress }) => setProgress(status, progress),
    });
    outputEl.value = normalizeOcrText(text);
    setProgress('Done', 1);
    setStatus(outputEl.value ? '' : 'No text detected in this region.');
    // Remembered only once it has worked, so a language whose download
    // failed is not retried automatically on every future capture.
    void chrome.storage.local.set({ [LAST_LANG_KEY]: language });
    setRunning(false);
  } catch (error) {
    setRunning(false);
    const message = describeOcrFailure(error, language);
    if (message === null) {
      setProgress('Cancelled', 0);
      setStatus('OCR cancelled.');
    } else {
      console.error('Snap OCR: recognition failed', error);
      showError(message);
    }
    // With nothing extracted, copying would only copy stale or empty text.
    copyBtn.disabled = !outputEl.value;
    docsBtn.disabled = !outputEl.value;
    retryBtn.hidden = false;
  } finally {
    currentRun = null;
  }
}

langSelectEl.addEventListener('change', () => {
  const language = langSelectEl.value;
  langHintEl.textContent = languageHint(language);
  void runOCR(language);
});

cancelBtn.addEventListener('click', () => currentRun?.abort());
retryBtn.addEventListener('click', () => void runOCR(langSelectEl.value));

copyBtn.addEventListener('click', () => {
  void (async () => {
    try {
      await navigator.clipboard.writeText(outputEl.value);
      setStatus('Copied!', true);
    } catch {
      setStatus('Copy failed - select the text manually.');
    }
  })();
});

docsBtn.addEventListener('click', () => {
  void (async () => {
    try {
      await navigator.clipboard.writeText(outputEl.value);
      setStatus('Copied - paste with Ctrl+V in the new doc.');
    } catch {
      setStatus('Copy failed - select the text manually, then paste it into the new doc.');
    }
    window.open('https://docs.new', '_blank');
  })();
});

/**
 * Takes this tab's capture out of extension session storage. A copy is kept in
 * the tab's own sessionStorage so a reload still has the image; it disappears
 * when the tab closes. That copy is best-effort: very large images exceed the
 * sessionStorage quota and simply aren't kept across reloads.
 */
async function loadCapture(): Promise<string | undefined> {
  const captureId = new URLSearchParams(location.search).get(CAPTURE_PARAM);
  if (!captureId) return undefined;
  const key = pendingImageKey(captureId);

  try {
    const kept = sessionStorage.getItem(key);
    if (kept) return kept;
  } catch {
    // Storage blocked; fall through to the hand-off copy.
  }

  const { [key]: image } = await chrome.storage.session.get(key);
  if (typeof image !== 'string') return undefined;
  void chrome.storage.session.remove(key);
  try {
    sessionStorage.setItem(key, image);
  } catch {
    // Too large for sessionStorage; a reload will report the image as gone.
  }
  return image;
}

async function init(): Promise<void> {
  capturedDataUrl = await loadCapture();

  if (!capturedDataUrl) {
    showError('No captured image found. Please select a region again from the page.');
    return;
  }

  previewEl.src = capturedDataUrl;

  const { [LAST_LANG_KEY]: lastLanguage } = await chrome.storage.local.get(LAST_LANG_KEY);
  const initialLanguage = resolveInitialLanguage(lastLanguage);

  populateLanguageDropdown(initialLanguage);
  langHintEl.textContent = languageHint(initialLanguage);
  await runOCR(initialLanguage);
}

setUpThemeToggle(themeToggleEl);
void init();
