/**
 * Every Tesseract language pack, sorted by display name. Only English ships
 * inside the extension; any other language is downloaded once from the public
 * Tesseract data CDN the first time it is picked, then cached in IndexedDB.
 * Only the language model is fetched - never the image or its text.
 */
export interface Language {
  code: string;
  name: string;
}

export const LANGUAGES: readonly Language[] = (
  [
    { code: 'afr', name: 'Afrikaans' },
    { code: 'amh', name: 'Amharic' },
    { code: 'ara', name: 'Arabic' },
    { code: 'asm', name: 'Assamese' },
    { code: 'aze', name: 'Azerbaijani' },
    { code: 'aze_cyrl', name: 'Azerbaijani (Cyrillic)' },
    { code: 'bel', name: 'Belarusian' },
    { code: 'ben', name: 'Bengali' },
    { code: 'bod', name: 'Tibetan' },
    { code: 'bos', name: 'Bosnian' },
    { code: 'bre', name: 'Breton' },
    { code: 'bul', name: 'Bulgarian' },
    { code: 'cat', name: 'Catalan' },
    { code: 'ceb', name: 'Cebuano' },
    { code: 'ces', name: 'Czech' },
    { code: 'chi_sim', name: 'Chinese (Simplified)' },
    { code: 'chi_sim_vert', name: 'Chinese (Simplified, vertical)' },
    { code: 'chi_tra', name: 'Chinese (Traditional)' },
    { code: 'chi_tra_vert', name: 'Chinese (Traditional, vertical)' },
    { code: 'chr', name: 'Cherokee' },
    { code: 'cos', name: 'Corsican' },
    { code: 'cym', name: 'Welsh' },
    { code: 'dan', name: 'Danish' },
    { code: 'deu', name: 'German' },
    { code: 'div', name: 'Dhivehi' },
    { code: 'dzo', name: 'Dzongkha' },
    { code: 'ell', name: 'Greek' },
    { code: 'eng', name: 'English' },
    { code: 'enm', name: 'English, Middle (1100-1500)' },
    { code: 'epo', name: 'Esperanto' },
    { code: 'est', name: 'Estonian' },
    { code: 'eus', name: 'Basque' },
    { code: 'fao', name: 'Faroese' },
    { code: 'fas', name: 'Persian' },
    { code: 'fil', name: 'Filipino' },
    { code: 'fin', name: 'Finnish' },
    { code: 'fra', name: 'French' },
    { code: 'frk', name: 'German Fraktur' },
    { code: 'frm', name: 'French, Middle (ca. 1400-1600)' },
    { code: 'fry', name: 'Western Frisian' },
    { code: 'gla', name: 'Scottish Gaelic' },
    { code: 'gle', name: 'Irish' },
    { code: 'glg', name: 'Galician' },
    { code: 'grc', name: 'Greek, Ancient' },
    { code: 'guj', name: 'Gujarati' },
    { code: 'hat', name: 'Haitian Creole' },
    { code: 'heb', name: 'Hebrew' },
    { code: 'hin', name: 'Hindi' },
    { code: 'hrv', name: 'Croatian' },
    { code: 'hun', name: 'Hungarian' },
    { code: 'hye', name: 'Armenian' },
    { code: 'iku', name: 'Inuktitut' },
    { code: 'ind', name: 'Indonesian' },
    { code: 'isl', name: 'Icelandic' },
    { code: 'ita', name: 'Italian' },
    { code: 'ita_old', name: 'Italian (old)' },
    { code: 'jav', name: 'Javanese' },
    { code: 'jpn', name: 'Japanese' },
    { code: 'jpn_vert', name: 'Japanese (vertical)' },
    { code: 'kan', name: 'Kannada' },
    { code: 'kat', name: 'Georgian' },
    { code: 'kat_old', name: 'Georgian (old)' },
    { code: 'kaz', name: 'Kazakh' },
    { code: 'khm', name: 'Khmer' },
    { code: 'kir', name: 'Kyrgyz' },
    { code: 'kmr', name: 'Kurdish (Kurmanji)' },
    { code: 'kor', name: 'Korean' },
    { code: 'kor_vert', name: 'Korean (vertical)' },
    { code: 'lao', name: 'Lao' },
    { code: 'lat', name: 'Latin' },
    { code: 'lav', name: 'Latvian' },
    { code: 'lit', name: 'Lithuanian' },
    { code: 'ltz', name: 'Luxembourgish' },
    { code: 'mal', name: 'Malayalam' },
    { code: 'mar', name: 'Marathi' },
    { code: 'mkd', name: 'Macedonian' },
    { code: 'mlt', name: 'Maltese' },
    { code: 'mon', name: 'Mongolian' },
    { code: 'mri', name: 'Maori' },
    { code: 'msa', name: 'Malay' },
    { code: 'mya', name: 'Burmese' },
    { code: 'nep', name: 'Nepali' },
    { code: 'nld', name: 'Dutch' },
    { code: 'nor', name: 'Norwegian' },
    { code: 'oci', name: 'Occitan' },
    { code: 'ori', name: 'Oriya' },
    { code: 'pan', name: 'Punjabi' },
    { code: 'pol', name: 'Polish' },
    { code: 'por', name: 'Portuguese' },
    { code: 'pus', name: 'Pashto' },
    { code: 'que', name: 'Quechua' },
    { code: 'ron', name: 'Romanian' },
    { code: 'rus', name: 'Russian' },
    { code: 'san', name: 'Sanskrit' },
    { code: 'sin', name: 'Sinhala' },
    { code: 'slk', name: 'Slovak' },
    { code: 'slv', name: 'Slovenian' },
    { code: 'snd', name: 'Sindhi' },
    { code: 'spa', name: 'Spanish' },
    { code: 'spa_old', name: 'Spanish (old)' },
    { code: 'sqi', name: 'Albanian' },
    { code: 'srp', name: 'Serbian' },
    { code: 'srp_latn', name: 'Serbian (Latin)' },
    { code: 'sun', name: 'Sundanese' },
    { code: 'swa', name: 'Swahili' },
    { code: 'swe', name: 'Swedish' },
    { code: 'syr', name: 'Syriac' },
    { code: 'tam', name: 'Tamil' },
    { code: 'tat', name: 'Tatar' },
    { code: 'tel', name: 'Telugu' },
    { code: 'tgk', name: 'Tajik' },
    { code: 'tha', name: 'Thai' },
    { code: 'tir', name: 'Tigrinya' },
    { code: 'ton', name: 'Tonga' },
    { code: 'tur', name: 'Turkish' },
    { code: 'uig', name: 'Uyghur' },
    { code: 'ukr', name: 'Ukrainian' },
    { code: 'urd', name: 'Urdu' },
    { code: 'uzb', name: 'Uzbek' },
    { code: 'uzb_cyrl', name: 'Uzbek (Cyrillic)' },
    { code: 'vie', name: 'Vietnamese' },
    { code: 'yid', name: 'Yiddish' },
    { code: 'yor', name: 'Yoruba' },
  ] satisfies Language[]
).sort((a, b) => a.name.localeCompare(b.name));

export const DEFAULT_LANGUAGE = 'eng';

const BUNDLED_LANGUAGES: ReadonlySet<string> = new Set(['eng']);

export function isBundledLanguage(code: string): boolean {
  return BUNDLED_LANGUAGES.has(code);
}

/** Dropdown label: bundled languages are marked as working offline. */
export function languageLabel(language: Language): string {
  return isBundledLanguage(language.code) ? `${language.name} (offline)` : language.name;
}

/** Hint shown next to the dropdown for languages that need a one-off download. */
export function languageHint(code: string): string {
  return isBundledLanguage(code)
    ? ''
    : 'First use downloads this language once, then it works offline.';
}

/**
 * The language to start with: the stored choice if it is still a known
 * Tesseract code, otherwise the default. Guards against stale or corrupted
 * storage selecting nothing in the dropdown while OCR runs with a bad code.
 */
export function resolveInitialLanguage(stored: unknown): string {
  return typeof stored === 'string' && LANGUAGES.some((l) => l.code === stored)
    ? stored
    : DEFAULT_LANGUAGE;
}
