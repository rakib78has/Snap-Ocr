/** Firebase Auth enforces at least this many characters by default. */
export const MIN_PASSWORD_LENGTH = 6;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isPlausibleEmail(email: string): boolean {
  return EMAIL_PATTERN.test(email.trim());
}

/** Checks the sign-in / sign-up form before anything is sent. Returns an error message or null. */
export function validateCredentials(email: string, password: string): string | null {
  if (!isPlausibleEmail(email)) return 'Enter a valid email address.';
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Use a password of at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  return null;
}

const AUTH_ERROR_MESSAGES: Record<string, string> = {
  // Firebase deliberately reports wrong email and wrong password the same way.
  'auth/invalid-credential': 'Email or password is incorrect.',
  'auth/wrong-password': 'Email or password is incorrect.',
  'auth/user-not-found': 'Email or password is incorrect.',
  'auth/invalid-email': 'Enter a valid email address.',
  'auth/email-already-in-use': 'An account with this email already exists. Sign in instead.',
  'auth/weak-password': `Use a password of at least ${MIN_PASSWORD_LENGTH} characters.`,
  'auth/too-many-requests': 'Too many attempts. Wait a few minutes, then try again.',
  'auth/network-request-failed': "Couldn't reach the sign-in service. Check your connection.",
  'auth/user-disabled': 'This account has been disabled.',
};

/** Maps a Firebase error (which carries a `code`) to a message for people, never raw codes. */
export function describeAuthError(error: unknown): string {
  const code =
    typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
  return AUTH_ERROR_MESSAGES[code] ?? 'Something went wrong. Please try again.';
}
