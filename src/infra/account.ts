import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  type User,
} from 'firebase/auth/web-extension';
import { addDoc, collection, doc, getDoc } from 'firebase/firestore/lite';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { raceAbortable } from '../core/abortable.ts';
import {
  decideAccess,
  hasPaidRole,
  isCachedEntitlement,
  type AccessDecision,
  type CachedEntitlement,
  type LiveCheck,
} from '../core/entitlement.ts';
import { ENTITLEMENT_KEY } from '../shared/storage-keys.ts';
import { firebase } from './firebase.ts';

/** A subscription check that takes longer than this counts as "offline". */
const LIVE_CHECK_TIMEOUT_MS = 10_000;

const CHECKOUT_POLL_MS = 1_000;
const CHECKOUT_TIMEOUT_MS = 60_000;

// --- Session persistence ----------------------------------------------------

// Where Firebase Auth keeps the signed-in user. This is an implementation
// detail of the SDK (unchanged since v9), used only to confirm a write; if it
// ever changes, waitForPersistedSession simply times out and nothing breaks.
const AUTH_DB = 'firebaseLocalStorageDb';
const AUTH_STORE = 'firebaseLocalStorage';
const AUTH_USER_KEY_PREFIX = 'firebase:authUser:';
const PERSIST_POLL_MS = 50;
const PERSIST_TIMEOUT_MS = 5_000;

/** The uid Firebase has committed to IndexedDB, or null when none is stored. */
function storedUid(): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(AUTH_DB);
    open.onerror = () => reject(open.error ?? new Error('IndexedDB open failed'));
    open.onsuccess = () => {
      const db = open.result;
      if (!db.objectStoreNames.contains(AUTH_STORE)) {
        db.close();
        resolve(null);
        return;
      }
      const request = db.transaction(AUTH_STORE, 'readonly').objectStore(AUTH_STORE).getAll();
      request.onerror = () => {
        db.close();
        reject(request.error ?? new Error('IndexedDB read failed'));
      };
      request.onsuccess = () => {
        db.close();
        const rows = request.result as { fbase_key?: unknown; value?: { uid?: unknown } }[];
        const user = rows.find(
          (row) =>
            typeof row.fbase_key === 'string' && row.fbase_key.startsWith(AUTH_USER_KEY_PREFIX)
        );
        resolve(typeof user?.value?.uid === 'string' ? user.value.uid : null);
      };
    };
  });
}

/**
 * Waits until Firebase's session write for `uid` (or its removal, for null)
 * has been committed.
 *
 * Firebase reports sign-in and sign-out as done once its IndexedDB write has
 * *succeeded*, which is before the transaction *commits*. If the page is
 * reloaded or closed in that window, the write is lost: the user who just
 * signed in is signed out again (observed on slow machines and CI). A fresh
 * read transaction only sees committed data, so polling one closes the gap.
 * Never throws; after the timeout the session behaves as Firebase alone would.
 */
async function waitForPersistedSession(uid: string | null): Promise<void> {
  const deadline = Date.now() + PERSIST_TIMEOUT_MS;
  try {
    while (Date.now() < deadline) {
      if ((await storedUid()) === uid) return;
      await new Promise((resolve) => setTimeout(resolve, PERSIST_POLL_MS));
    }
    console.warn('Snap OCR: could not confirm the saved session in time');
  } catch (error) {
    console.warn('Snap OCR: could not inspect the saved session', error);
  }
}

// --- Signing in and out -----------------------------------------------------

export async function currentUser(): Promise<User | null> {
  const { auth } = firebase();
  await auth.authStateReady();
  return auth.currentUser;
}

/**
 * Calls `listener` with the signed-in user (or null) whenever it changes,
 * but only once that state has been saved, so a page never shows a session
 * that a reload would lose.
 */
export function onUserChanged(listener: (user: User | null) => void): () => void {
  let latest = 0;
  return onAuthStateChanged(firebase().auth, (user) => {
    const call = ++latest;
    void waitForPersistedSession(user?.uid ?? null).then(() => {
      // Skip if the state changed again while waiting.
      if (call === latest) listener(user);
    });
  });
}

export async function signIn(email: string, password: string): Promise<void> {
  const { user } = await signInWithEmailAndPassword(firebase().auth, email.trim(), password);
  await waitForPersistedSession(user.uid);
}

export async function createAccount(email: string, password: string): Promise<void> {
  const { user } = await createUserWithEmailAndPassword(firebase().auth, email.trim(), password);
  await waitForPersistedSession(user.uid);
}

export async function sendPasswordReset(email: string): Promise<void> {
  await sendPasswordResetEmail(firebase().auth, email.trim());
}

export async function signOut(): Promise<void> {
  await firebaseSignOut(firebase().auth);
  // A cached entitlement must never outlive the session that earned it.
  await chrome.storage.local.remove(ENTITLEMENT_KEY);
  await waitForPersistedSession(null);
}

// --- Subscription status ----------------------------------------------------

async function readCachedEntitlement(): Promise<CachedEntitlement | null> {
  const { [ENTITLEMENT_KEY]: value } = await chrome.storage.local.get(ENTITLEMENT_KEY);
  return isCachedEntitlement(value) ? value : null;
}

/**
 * Decides whether the current user may use Snap OCR right now.
 *
 * Reads the subscription from the ID token's `stripeRole` claim. `refresh`
 * forces a new token from Firebase, which is needed right after a purchase
 * because claims only change when a token is issued.
 */
export async function checkAccess({ refresh = false } = {}): Promise<AccessDecision> {
  const user = await currentUser();
  const cached = await readCachedEntitlement();
  let live: LiveCheck = { ok: false };

  if (user) {
    try {
      const readToken = (force: boolean) =>
        raceAbortable(user.getIdTokenResult(force), { timeoutMs: LIVE_CHECK_TIMEOUT_MS });
      let token = await readToken(refresh);
      // A cached token can predate a purchase made moments ago, possibly in
      // another extension context, so a "not subscribed" answer is confirmed
      // with a fresh token before access is refused. (The reverse — a
      // cancellation — takes effect when the cached token expires, within
      // an hour.)
      if (!refresh && !hasPaidRole(token.claims)) token = await readToken(true);
      live = { ok: true, active: hasPaidRole(token.claims) };
      const entry: CachedEntitlement = {
        uid: user.uid,
        active: live.active,
        checkedAt: Date.now(),
      };
      await chrome.storage.local.set({ [ENTITLEMENT_KEY]: entry });
    } catch (error) {
      console.warn('Snap OCR: could not verify the subscription', error);
    }
  }

  return decideAccess({ uid: user?.uid ?? null, live, cached, now: Date.now() });
}

// --- Stripe checkout and billing portal ------------------------------------

/** Page shown by the browser after Stripe checkout or the billing portal. */
function returnUrl(): string {
  return `https://${firebase().settings.projectId}.web.app/checkout-complete.html`;
}

/**
 * Asks the Stripe extension for a checkout page for the monthly plan and
 * returns its URL. The extension's Cloud Function picks up the new document
 * and writes either `url` or `error` back to it, so it is polled until one
 * appears. The free trial comes from the Stripe price (`trial_from_plan`).
 */
export async function createCheckoutUrl(): Promise<string> {
  const { db, settings } = firebase();
  const user = await currentUser();
  if (!user) throw new Error('Sign in before subscribing.');

  const session = await addDoc(collection(db, 'customers', user.uid, 'checkout_sessions'), {
    price: settings.stripePriceId,
    success_url: returnUrl(),
    cancel_url: returnUrl(),
    trial_from_plan: true,
    allow_promotion_codes: true,
  });

  const deadline = Date.now() + CHECKOUT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const snapshot = await getDoc(doc(db, session.path));
    const data = snapshot.data() as { url?: unknown; error?: { message?: unknown } } | undefined;
    if (typeof data?.url === 'string') return data.url;
    if (data?.error) {
      const message = data.error.message;
      throw new Error(
        typeof message === 'string' && message ? message : 'Checkout could not be started.'
      );
    }
    await new Promise((resolve) => setTimeout(resolve, CHECKOUT_POLL_MS));
  }
  throw new Error('Checkout did not start in time. Please try again.');
}

/** Returns a Stripe billing-portal URL where the user manages or cancels their plan. */
export async function createPortalUrl(): Promise<string> {
  const { app, settings } = firebase();
  const createPortalLink = httpsCallable<{ returnUrl: string; locale: string }, { url: string }>(
    getFunctions(app, settings.functionsRegion),
    'ext-firestore-stripe-payments-createPortalLink'
  );
  const { data } = await createPortalLink({ returnUrl: returnUrl(), locale: 'auto' });
  return data.url;
}
