/**
 * Who may use Snap OCR.
 *
 * Access requires a signed-in user whose Stripe subscription is active or in
 * its free trial. The "Run Payments with Stripe" Firebase extension reports
 * that by setting a `stripeRole` custom claim on the user's ID token, taken
 * from the `firebaseRole` metadata of the Stripe product.
 *
 * OCR itself runs locally, so this check is the only thing a subscription
 * unlocks. A short offline grace period keeps a paying user working when
 * the subscription cannot be re-checked (no network, Firebase unreachable).
 */

/** `firebaseRole` metadata value on the Stripe product. */
export const PAID_ROLE = 'premium';

/** How long a successful check is trusted when a fresh one cannot be made. */
export const OFFLINE_GRACE_MS = 7 * 24 * 60 * 60 * 1000;

export function hasPaidRole(claims: Record<string, unknown> | undefined): boolean {
  return claims?.stripeRole === PAID_ROLE;
}

/** The last successful subscription check, kept in chrome.storage.local. */
export interface CachedEntitlement {
  uid: string;
  active: boolean;
  checkedAt: number;
}

export function isCachedEntitlement(value: unknown): value is CachedEntitlement {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.uid === 'string' &&
    typeof v.active === 'boolean' &&
    typeof v.checkedAt === 'number' &&
    Number.isFinite(v.checkedAt)
  );
}

/** Result of asking Firebase right now. */
export type LiveCheck = { ok: true; active: boolean } | { ok: false };

export type DenyReason = 'signed-out' | 'no-subscription' | 'unverified';

export type AccessDecision =
  { allowed: true; source: 'live' | 'cached' } | { allowed: false; reason: DenyReason };

export interface AccessInput {
  /** Signed-in user, or null. */
  uid: string | null;
  live: LiveCheck;
  cached: CachedEntitlement | null;
  now: number;
}

export function decideAccess({ uid, live, cached, now }: AccessInput): AccessDecision {
  if (!uid) return { allowed: false, reason: 'signed-out' };

  if (live.ok) {
    return live.active
      ? { allowed: true, source: 'live' }
      : { allowed: false, reason: 'no-subscription' };
  }

  // Firebase could not be reached. Fall back to this user's last good check,
  // provided it is recent and not from the future (a changed system clock).
  const age = cached ? now - cached.checkedAt : Infinity;
  if (cached?.uid === uid && cached.active && age >= 0 && age <= OFFLINE_GRACE_MS) {
    return { allowed: true, source: 'cached' };
  }
  return { allowed: false, reason: 'unverified' };
}

/** Explanation shown on the account page when access was refused. */
export const DENY_MESSAGES: Record<DenyReason, string> = {
  'signed-out': 'Sign in to use Snap OCR.',
  'no-subscription': 'Start your free trial or subscribe to use Snap OCR.',
  unverified:
    "Snap OCR couldn't confirm your subscription. Check your internet connection, then try again.",
};

export function isDenyReason(value: unknown): value is DenyReason {
  return typeof value === 'string' && value in DENY_MESSAGES;
}
