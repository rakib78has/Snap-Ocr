import { describe, expect, it } from 'vitest';
import { bytesToPngDataUrl, dataUrlToBytes } from '../../src/core/data-url.ts';
import {
  DEFAULT_LANGUAGE,
  isBundledLanguage,
  LANGUAGES,
  languageHint,
  languageLabel,
} from '../../src/core/languages.ts';
import { normalizeOcrText, progressPercent } from '../../src/core/ocr-text.ts';
import { isRestrictedUrl } from '../../src/core/restricted-url.ts';
import { nextTheme, normalizeTheme, THEME_LABELS } from '../../src/core/theme.ts';

describe('data URLs', () => {
  it('round-trips bytes through a PNG data URL', () => {
    const bytes = Uint8Array.from([0, 1, 127, 128, 255]);
    const url = bytesToPngDataUrl(bytes);
    expect(url.startsWith('data:image/png;base64,')).toBe(true);
    expect([...dataUrlToBytes(url)]).toEqual([...bytes]);
  });

  it('handles payloads larger than one conversion chunk', () => {
    const bytes = new Uint8Array(0x8000 * 3 + 17).map((_, i) => i % 256);
    expect(dataUrlToBytes(bytesToPngDataUrl(bytes))).toEqual(bytes);
  });

  it('encodes an empty image as an empty payload', () => {
    expect(bytesToPngDataUrl(new Uint8Array())).toBe('data:image/png;base64,');
  });
});

describe('isRestrictedUrl', () => {
  it.each(['chrome://settings', 'chrome-extension://abc/page.html', 'edge://flags', 'about:blank'])(
    'blocks %s',
    (url) => expect(isRestrictedUrl(url)).toBe(true)
  );

  it.each(['https://example.com', 'http://localhost:3000', 'file:///C:/doc.pdf'])(
    'allows %s',
    (url) => expect(isRestrictedUrl(url)).toBe(false)
  );

  it('treats a missing URL as allowed, leaving injection to decide', () => {
    expect(isRestrictedUrl(undefined)).toBe(false);
  });
});

describe('theme', () => {
  it('cycles system → light → dark → system', () => {
    expect(nextTheme('system')).toBe('light');
    expect(nextTheme('light')).toBe('dark');
    expect(nextTheme('dark')).toBe('system');
  });

  it('falls back to system for unknown stored values', () => {
    expect(normalizeTheme('dark')).toBe('dark');
    expect(normalizeTheme('purple')).toBe('system');
    expect(normalizeTheme(undefined)).toBe('system');
  });

  it('has a label for every theme', () => {
    expect(Object.keys(THEME_LABELS).sort()).toEqual(['dark', 'light', 'system']);
  });
});

describe('OCR text', () => {
  it('trims surrounding whitespace but keeps internal line breaks', () => {
    expect(normalizeOcrText('\n  Hello\nWorld  \n\n')).toBe('Hello\nWorld');
  });

  it('keeps Unicode and punctuation untouched', () => {
    expect(normalizeOcrText(' Café — naïve “quotes” 日本語 ')).toBe('Café — naïve “quotes” 日本語');
  });

  it('turns missing output into an empty string', () => {
    expect(normalizeOcrText(undefined)).toBe('');
    expect(normalizeOcrText(null)).toBe('');
    expect(normalizeOcrText('   ')).toBe('');
  });

  it('converts progress to a clamped whole percentage', () => {
    expect(progressPercent(0.456)).toBe(46);
    expect(progressPercent(-1)).toBe(0);
    expect(progressPercent(3)).toBe(100);
  });
});

describe('languages', () => {
  it('lists every Tesseract pack once, sorted by name', () => {
    expect(LANGUAGES).toHaveLength(123);
    expect(new Set(LANGUAGES.map((l) => l.code)).size).toBe(LANGUAGES.length);
    const names = LANGUAGES.map((l) => l.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });

  it('includes the default language, which is the only bundled one', () => {
    expect(LANGUAGES.some((l) => l.code === DEFAULT_LANGUAGE)).toBe(true);
    expect(LANGUAGES.filter((l) => isBundledLanguage(l.code)).map((l) => l.code)).toEqual(['eng']);
  });

  it('marks bundled languages as offline and hints at downloads for the rest', () => {
    expect(languageLabel({ code: 'eng', name: 'English' })).toBe('English (offline)');
    expect(languageLabel({ code: 'fra', name: 'French' })).toBe('French');
    expect(languageHint('eng')).toBe('');
    expect(languageHint('fra')).toMatch(/downloads this language once/);
  });
});
