import { describe, expect, it } from 'vitest';
import {
  describeAuthError,
  isPlausibleEmail,
  MIN_PASSWORD_LENGTH,
  validateCredentials,
} from '../../src/core/auth-messages.ts';
import {
  decideAccess,
  DENY_MESSAGES,
  hasPaidRole,
  isCachedEntitlement,
  isDenyReason,
  OFFLINE_GRACE_MS,
  PAID_ROLE,
} from '../../src/core/entitlement.ts';
import { parseFirebaseSettings, REQUIRED_ENV_VARS } from '../../src/core/firebase-settings.ts';

const NOW = 1_800_000_000_000;
const offline = { ok: false } as const;

describe('hasPaidRole', () => {
  it('requires the stripeRole claim set by the Stripe extension', () => {
    expect(hasPaidRole({ stripeRole: PAID_ROLE })).toBe(true);
    expect(hasPaidRole({ stripeRole: 'basic' })).toBe(false);
    expect(hasPaidRole({})).toBe(false);
    expect(hasPaidRole(undefined)).toBe(false);
  });
});

describe('decideAccess', () => {
  it('refuses a signed-out user, whatever is cached', () => {
    const cached = { uid: 'u1', active: true, checkedAt: NOW };
    expect(decideAccess({ uid: null, live: offline, cached, now: NOW })).toEqual({
      allowed: false,
      reason: 'signed-out',
    });
  });

  it('follows a live check when one succeeded', () => {
    expect(
      decideAccess({ uid: 'u1', live: { ok: true, active: true }, cached: null, now: NOW })
    ).toEqual({ allowed: true, source: 'live' });
  });

  it('lets a live "not subscribed" win over an older cached "subscribed"', () => {
    const cached = { uid: 'u1', active: true, checkedAt: NOW - 1000 };
    expect(
      decideAccess({ uid: 'u1', live: { ok: true, active: false }, cached, now: NOW })
    ).toEqual({ allowed: false, reason: 'no-subscription' });
  });

  it('allows a cached subscription up to the end of the offline grace period', () => {
    const cached = { uid: 'u1', active: true, checkedAt: NOW - OFFLINE_GRACE_MS };
    expect(decideAccess({ uid: 'u1', live: offline, cached, now: NOW })).toEqual({
      allowed: true,
      source: 'cached',
    });
  });

  it.each([
    ['expired', { uid: 'u1', active: true, checkedAt: NOW - OFFLINE_GRACE_MS - 1 }],
    ['for another user', { uid: 'u2', active: true, checkedAt: NOW }],
    ['inactive', { uid: 'u1', active: false, checkedAt: NOW }],
    ['from the future', { uid: 'u1', active: true, checkedAt: NOW + 60_000 }],
    ['missing', null],
  ])('refuses offline when the cache is %s', (_label, cached) => {
    expect(decideAccess({ uid: 'u1', live: offline, cached, now: NOW })).toEqual({
      allowed: false,
      reason: 'unverified',
    });
  });
});

describe('stored values', () => {
  it('accepts only well-formed cached entitlements', () => {
    expect(isCachedEntitlement({ uid: 'u', active: true, checkedAt: 1 })).toBe(true);
    expect(isCachedEntitlement({ uid: 'u', active: 'yes', checkedAt: 1 })).toBe(false);
    expect(isCachedEntitlement({ uid: 'u', active: true, checkedAt: NaN })).toBe(false);
    expect(isCachedEntitlement(null)).toBe(false);
  });

  it('recognises each deny reason, and nothing else', () => {
    for (const reason of Object.keys(DENY_MESSAGES)) expect(isDenyReason(reason)).toBe(true);
    expect(isDenyReason('nope')).toBe(false);
    expect(isDenyReason(undefined)).toBe(false);
  });
});

describe('credentials', () => {
  it('checks email shape and password length before anything is sent', () => {
    expect(isPlausibleEmail(' person@example.com ')).toBe(true);
    expect(isPlausibleEmail('person@example')).toBe(false);
    expect(validateCredentials('bad', 'longenough')).toMatch(/valid email/);
    expect(validateCredentials('a@b.co', 'x'.repeat(MIN_PASSWORD_LENGTH - 1))).toMatch(/at least/);
    expect(validateCredentials('a@b.co', 'x'.repeat(MIN_PASSWORD_LENGTH))).toBeNull();
  });

  it('maps Firebase error codes to plain messages and never shows raw codes', () => {
    expect(describeAuthError({ code: 'auth/invalid-credential' })).toBe(
      'Email or password is incorrect.'
    );
    expect(describeAuthError({ code: 'auth/email-already-in-use' })).toMatch(/already exists/);
    for (const unknown of [{ code: 'auth/brand-new' }, new Error('boom'), null]) {
      expect(describeAuthError(unknown)).toBe('Something went wrong. Please try again.');
    }
  });
});

describe('parseFirebaseSettings', () => {
  const complete = {
    VITE_FIREBASE_API_KEY: 'key',
    VITE_FIREBASE_AUTH_DOMAIN: 'p.firebaseapp.com',
    VITE_FIREBASE_PROJECT_ID: 'p',
    VITE_FIREBASE_APP_ID: '1:2:web:3',
    VITE_STRIPE_PRICE_ID: 'price_1',
  };

  it('reads a complete configuration and fills defaults', () => {
    expect(parseFirebaseSettings(complete)).toEqual({
      ok: true,
      settings: {
        apiKey: 'key',
        authDomain: 'p.firebaseapp.com',
        projectId: 'p',
        appId: '1:2:web:3',
        stripePriceId: 'price_1',
        functionsRegion: 'us-central1',
        emulatorHost: null,
      },
    });
  });

  it('honours an explicit region and emulator host', () => {
    const result = parseFirebaseSettings({
      ...complete,
      VITE_FIREBASE_FUNCTIONS_REGION: 'europe-west1',
      VITE_FIREBASE_EMULATOR_HOST: '127.0.0.1',
    });
    expect(result.ok && result.settings.functionsRegion).toBe('europe-west1');
    expect(result.ok && result.settings.emulatorHost).toBe('127.0.0.1');
  });

  it('reports every missing or blank variable at once', () => {
    expect(parseFirebaseSettings({})).toEqual({ ok: false, missing: [...REQUIRED_ENV_VARS] });
    expect(parseFirebaseSettings({ ...complete, VITE_FIREBASE_APP_ID: '  ' })).toEqual({
      ok: false,
      missing: ['VITE_FIREBASE_APP_ID'],
    });
  });
});
