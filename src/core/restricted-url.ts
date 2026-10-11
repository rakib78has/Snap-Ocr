const RESTRICTED_PREFIXES = ['chrome://', 'chrome-extension://', 'edge://', 'about:'];

/**
 * Pages Chrome never lets an extension inject into. Checking up front gives a
 * clear notification instead of a generic injection failure.
 */
export function isRestrictedUrl(url: string | undefined): boolean {
  const value = url ?? '';
  return RESTRICTED_PREFIXES.some((prefix) => value.startsWith(prefix));
}
