export type Theme = 'system' | 'light' | 'dark';

export const THEME_ORDER: readonly Theme[] = ['system', 'light', 'dark'];

export const THEME_LABELS: Record<Theme, string> = {
  system: '🖥️ System',
  light: '☀️ Light',
  dark: '🌙 Dark',
};

/** Anything unrecognised in storage falls back to following the OS. */
export function normalizeTheme(value: unknown): Theme {
  return THEME_ORDER.includes(value as Theme) ? (value as Theme) : 'system';
}

export function nextTheme(current: Theme): Theme {
  return THEME_ORDER[(THEME_ORDER.indexOf(current) + 1) % THEME_ORDER.length];
}
