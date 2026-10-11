/** Everything the extension needs to reach its Firebase project and Stripe plan. */
export interface FirebaseSettings {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
  stripePriceId: string;
  functionsRegion: string;
  /** Set only in the e2e build: host of the local Firebase emulators. */
  emulatorHost: string | null;
}

const REQUIRED = {
  apiKey: 'VITE_FIREBASE_API_KEY',
  authDomain: 'VITE_FIREBASE_AUTH_DOMAIN',
  projectId: 'VITE_FIREBASE_PROJECT_ID',
  appId: 'VITE_FIREBASE_APP_ID',
  stripePriceId: 'VITE_STRIPE_PRICE_ID',
} as const;

export const REQUIRED_ENV_VARS: readonly string[] = Object.values(REQUIRED);

export type SettingsResult =
  { ok: true; settings: FirebaseSettings } | { ok: false; missing: string[] };

/**
 * Reads settings from build-time environment variables (see .env.example).
 * Missing values are reported together so a misconfigured build fails once,
 * with the full list.
 */
export function parseFirebaseSettings(env: Record<string, unknown>): SettingsResult {
  const read = (name: string) => {
    const value = env[name];
    return typeof value === 'string' ? value.trim() : '';
  };

  const missing = REQUIRED_ENV_VARS.filter((name) => !read(name));
  if (missing.length > 0) return { ok: false, missing };

  return {
    ok: true,
    settings: {
      apiKey: read(REQUIRED.apiKey),
      authDomain: read(REQUIRED.authDomain),
      projectId: read(REQUIRED.projectId),
      appId: read(REQUIRED.appId),
      stripePriceId: read(REQUIRED.stripePriceId),
      functionsRegion: read('VITE_FIREBASE_FUNCTIONS_REGION') || 'us-central1',
      emulatorHost: read('VITE_FIREBASE_EMULATOR_HOST') || null,
    },
  };
}
