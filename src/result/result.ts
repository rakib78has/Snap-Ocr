import { DEFAULT_LANGUAGE, LANGUAGES, languageHint, languageLabel } from '../core/languages.ts';
import { normalizeOcrText, progressPercent } from '../core/ocr-text.ts';
import { nextTheme, normalizeTheme, THEME_LABELS, type Theme } from '../core/theme.ts';
import { recognizeText } from '../infra/ocr-engine.ts';
import { LAST_LANG_KEY, PENDING_IMAGE_KEY, THEME_KEY } from '../shared/storage-keys.ts';

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
const statusTextEl = byId('statusText');
const errorTextEl = byId('errorText');
const langSelectEl = byId<HTMLSelectElement>('langSelect');
const langHintEl = byId('langHint');

let capturedDataUrl: string | undefined;
let isRunning = false;

function showError(message: string): void {
  errorTextEl.textContent = message;
  errorTextEl.hidden = false;
  progressLabelEl.textContent = 'Failed';
}

function clearError(): void {
  errorTextEl.hidden = true;
  errorTextEl.textContent = '';
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

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : String(error);
}

async function runOCR(language: string): Promise<void> {
  if (!capturedDataUrl || isRunning) return;
  isRunning = true;
  clearError();
  copyBtn.disabled = true;
  docsBtn.disabled = true;
  langSelectEl.disabled = true;
  statusTextEl.textContent = '';
  setProgress('Starting OCR...', 0);

  try {
    const text = await recognizeText(capturedDataUrl, {
      language,
      onProgress: ({ status, progress }) => setProgress(status, progress),
    });
    outputEl.value = normalizeOcrText(text);
    setProgress('Done', 1);
    statusTextEl.textContent = outputEl.value ? '' : 'No text detected in this region.';
    copyBtn.disabled = false;
    docsBtn.disabled = false;
  } catch (error) {
    console.error('Snap OCR: recognition failed', error);
    showError(`OCR failed: ${errorMessage(error)}`);
  } finally {
    isRunning = false;
    langSelectEl.disabled = false;
  }
}

function applyTheme(theme: Theme): void {
  if (theme === 'system') {
    document.documentElement.removeAttribute('data-theme');
  } else {
    document.documentElement.setAttribute('data-theme', theme);
  }
  themeToggleEl.textContent = THEME_LABELS[theme];
}

async function storedTheme(): Promise<Theme> {
  const { [THEME_KEY]: stored } = await chrome.storage.local.get(THEME_KEY);
  return normalizeTheme(stored);
}

themeToggleEl.addEventListener('click', () => {
  void (async () => {
    const next = nextTheme(await storedTheme());
    await chrome.storage.local.set({ [THEME_KEY]: next });
    applyTheme(next);
  })();
});

langSelectEl.addEventListener('change', () => {
  const language = langSelectEl.value;
  langHintEl.textContent = languageHint(language);
  void chrome.storage.local.set({ [LAST_LANG_KEY]: language });
  void runOCR(language);
});

copyBtn.addEventListener('click', () => {
  void (async () => {
    try {
      await navigator.clipboard.writeText(outputEl.value);
      statusTextEl.textContent = 'Copied!';
      setTimeout(() => {
        statusTextEl.textContent = '';
      }, 1500);
    } catch {
      statusTextEl.textContent = 'Copy failed - select the text manually.';
    }
  })();
});

docsBtn.addEventListener('click', () => {
  void (async () => {
    try {
      await navigator.clipboard.writeText(outputEl.value);
      statusTextEl.textContent = 'Copied - paste with Ctrl+V in the new doc.';
    } catch {
      statusTextEl.textContent = '';
    }
    window.open('https://docs.new', '_blank');
  })();
});

async function init(): Promise<void> {
  const stored = await chrome.storage.session.get(PENDING_IMAGE_KEY);
  const image = stored[PENDING_IMAGE_KEY];
  capturedDataUrl = typeof image === 'string' ? image : undefined;

  if (!capturedDataUrl) {
    showError('No captured image found. Please select a region again from the page.');
    return;
  }

  previewEl.src = capturedDataUrl;
  void chrome.storage.session.remove(PENDING_IMAGE_KEY);

  const { [LAST_LANG_KEY]: lastLanguage } = await chrome.storage.local.get(LAST_LANG_KEY);
  const initialLanguage =
    typeof lastLanguage === 'string' && lastLanguage ? lastLanguage : DEFAULT_LANGUAGE;

  populateLanguageDropdown(initialLanguage);
  langHintEl.textContent = languageHint(initialLanguage);
  await runOCR(initialLanguage);
}

void storedTheme().then(applyTheme);
void init();
