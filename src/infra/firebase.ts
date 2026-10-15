import { initializeApp, type FirebaseApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, type Auth } from 'firebase/auth/web-extension';
import { connectFirestoreEmulator, getFirestore, type Firestore } from 'firebase/firestore/lite';
import { parseFirebaseSettings, type FirebaseSettings } from '../core/firebase-settings.ts';

/**
 * Lazily initialised Firebase services, shared by every extension context
 * (service worker, account page).
 *
 * `firebase/auth/web-extension` is the build of Firebase Auth made for
 * Manifest V3: it never loads remote scripts, which the extension CSP and
 * Chrome Web Store policy both forbid. Firestore Lite talks plain REST, which
 * is all the subscription flow needs and keeps the bundle small.
 */

export interface FirebaseServices {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
  settings: FirebaseSettings;
}

let services: FirebaseServices | undefined;

export function firebaseSettings(): FirebaseSettings {
  const result = parseFirebaseSettings(import.meta.env);
  // vite.config.ts refuses to build without these, so this only guards
  // against a broken build reaching users.
  if (!result.ok) throw new Error(`Snap OCR is missing settings: ${result.missing.join(', ')}`);
  return result.settings;
}

export function firebase(): FirebaseServices {
  if (services) return services;

  const settings = firebaseSettings();
  const app = initializeApp({
    apiKey: settings.apiKey,
    authDomain: settings.authDomain,
    projectId: settings.projectId,
    appId: settings.appId,
  });
  const auth = getAuth(app);
  const db = getFirestore(app);

  if (settings.emulatorHost) {
    connectAuthEmulator(auth, `http://${settings.emulatorHost}:9099`, { disableWarnings: true });
    connectFirestoreEmulator(db, settings.emulatorHost, 8080);
  }

  services = { app, auth, db, settings };
  return services;
}
