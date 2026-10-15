/**
 * Talks to the local Firebase emulators (started by `npm run test:e2e`) as an
 * administrator would: resetting state, creating users, and setting the
 * custom claim that the Stripe extension sets on a real project.
 *
 * "Bearer owner" is the emulators' admin credential; it means nothing to a
 * real Firebase project, and the demo- project id cannot reach one anyway.
 */

const PROJECT = 'demo-snap-ocr';
const AUTH = 'http://127.0.0.1:9099';
const FIRESTORE = 'http://127.0.0.1:8080';
const API_KEY = 'demo-api-key';
const ADMIN = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
const DOCUMENTS = `${FIRESTORE}/v1/projects/${PROJECT}/databases/(default)/documents`;

async function call(url: string, init: RequestInit = {}): Promise<unknown> {
  const response = await fetch(url, init);
  const text = await response.text();
  if (!response.ok) throw new Error(`${init.method ?? 'GET'} ${url} → ${response.status} ${text}`);
  return text ? (JSON.parse(text) as unknown) : null;
}

export async function resetEmulators(): Promise<void> {
  await call(`${AUTH}/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' });
  await call(`${FIRESTORE}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, {
    method: 'DELETE',
  });
}

export interface TestUser {
  uid: string;
  idToken: string;
  email: string;
  password: string;
}

export async function createUser(email: string, password = 'correct-horse'): Promise<TestUser> {
  const data = (await call(
    `${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=${API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    }
  )) as { localId: string; idToken: string };
  return { uid: data.localId, idToken: data.idToken, email, password };
}

/** Grants or removes the paid role, as the Stripe extension does on purchase or cancellation. */
export async function setPaidRole(uid: string, paid: boolean): Promise<void> {
  await call(`${AUTH}/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:update`, {
    method: 'POST',
    headers: ADMIN,
    body: JSON.stringify({
      localId: uid,
      customAttributes: JSON.stringify(paid ? { stripeRole: 'premium' } : {}),
    }),
  });
}

interface FirestoreDocument {
  name: string;
  fields?: Record<string, { stringValue?: string; booleanValue?: boolean }>;
}

export async function checkoutSessions(uid: string): Promise<FirestoreDocument[]> {
  const data = (await call(`${DOCUMENTS}/customers/${uid}/checkout_sessions`, {
    headers: ADMIN,
  })) as { documents?: FirestoreDocument[] } | null;
  return data?.documents ?? [];
}

/** Plays the Stripe extension's part: answers a checkout session with a URL. */
export async function answerCheckout(documentName: string, url: string): Promise<void> {
  await call(`${FIRESTORE}/v1/${documentName}?updateMask.fieldPaths=url`, {
    method: 'PATCH',
    headers: ADMIN,
    body: JSON.stringify({ fields: { url: { stringValue: url } } }),
  });
}

/** Writes a document as `user` (not as admin), so firestore.rules apply. Returns the HTTP status. */
export async function writeAsUser(user: TestUser, collectionPath: string): Promise<number> {
  const response = await fetch(`${DOCUMENTS}/${collectionPath}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${user.idToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: { price: { stringValue: 'price_x' } } }),
  });
  return response.status;
}
