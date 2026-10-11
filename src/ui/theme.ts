import { nextTheme, normalizeTheme, THEME_LABELS, type Theme } from '../core/theme.ts';
import { THEME_KEY } from '../shared/storage-keys.ts';

function applyTheme(theme: Theme, toggle: HTMLElement): void {
  if (theme === 'system') {
    document.documentElement.removeAttribute('data-theme');
  } else {
    document.documentElement.setAttribute('data-theme', theme);
  }
  toggle.textContent = THEME_LABELS[theme];
}

async function storedTheme(): Promise<Theme> {
  const { [THEME_KEY]: stored } = await chrome.storage.local.get(THEME_KEY);
  return normalizeTheme(stored);
}

/** Applies the saved theme and makes `toggle` cycle System → Light → Dark. */
export function setUpThemeToggle(toggle: HTMLElement): void {
  void storedTheme().then((theme) => applyTheme(theme, toggle));
  toggle.addEventListener('click', () => {
    void (async () => {
      const next = nextTheme(await storedTheme());
      await chrome.storage.local.set({ [THEME_KEY]: next });
      applyTheme(next, toggle);
    })();
  });
}
