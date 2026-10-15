import type { Page, Worker } from '@playwright/test';
import {
  answerCheckout,
  checkoutSessions,
  createUser,
  resetEmulators,
  setPaidRole,
  writeAsUser,
} from './emulator.ts';
import { expect, extensionUrl, openTextPage, test, TEST_ORIGIN } from './fixtures.ts';

test.beforeEach(async () => {
  await resetEmulators();
});

/** Does what clicking the toolbar icon on the test page does. */
async function clickToolbarIcon(worker: Worker): Promise<void> {
  await worker.evaluate(async (origin) => {
    const [tab] = await chrome.tabs.query({ url: `${origin}/*` });
    const hooks = (globalThis as { snapOcrE2E?: { startSelection(tab: unknown): Promise<void> } })
      .snapOcrE2E;
    if (!hooks) throw new Error('e2e hooks missing: is this the e2e build?');
    await hooks.startSelection(tab);
  }, TEST_ORIGIN);
}

async function signInOnAccountPage(page: Page, email: string, password: string): Promise<void> {
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.locator('#signInBtn').click();
  await expect(page.locator('#userEmail')).toHaveText(email);
}

test.describe('paywall', () => {
  test('a signed-out user gets the account page instead of the overlay', async ({
    context,
    serviceWorker,
  }) => {
    const page = await openTextPage(context, 'Paywalled text');
    const accountPagePromise = context.waitForEvent('page');
    await clickToolbarIcon(serviceWorker);

    const account = await accountPagePromise;
    await expect(account).toHaveURL(/\/account\/account\.html\?reason=signed-out$/);
    await expect(account.locator('#reason')).toHaveText('Sign in to use Snap OCR.');
    await expect(account.locator('#signedOut')).toBeVisible();
    await expect(page.locator('#snapocr-host')).toHaveCount(0);
  });

  test('a signed-in user without a subscription is asked to subscribe', async ({
    context,
    serviceWorker,
    extensionId,
  }) => {
    const user = await createUser('free@example.com');
    const account = await context.newPage();
    await account.goto(extensionUrl(extensionId, 'account/account.html'));
    await signInOnAccountPage(account, user.email, user.password);
    await expect(account.locator('#planStatus')).toHaveText('You have no active subscription.');
    await expect(account.locator('#subscribeBtn')).toBeVisible();
    await expect(account.locator('#manageBtn')).toBeHidden();

    const page = await openTextPage(context, 'Still paywalled');
    const accountPagePromise = context.waitForEvent('page');
    await clickToolbarIcon(serviceWorker);
    const prompt = await accountPagePromise;
    await expect(prompt).toHaveURL(/reason=no-subscription$/);
    await expect(prompt.locator('#reason')).toHaveText(
      'Start your free trial or subscribe to use Snap OCR.'
    );
    await expect(page.locator('#snapocr-host')).toHaveCount(0);
  });

  test('free trial checkout unlocks the extension once the subscription is active', async ({
    context,
    serviceWorker,
    extensionId,
  }) => {
    const user = await createUser('trial@example.com');
    const account = await context.newPage();
    await account.goto(extensionUrl(extensionId, 'account/account.html?reason=no-subscription'));
    await signInOnAccountPage(account, user.email, user.password);

    // Stands in for Stripe's hosted checkout page.
    await context.route(`${TEST_ORIGIN}/**`, (route) =>
      route.fulfill({ contentType: 'text/html', body: '<h1>Stripe checkout</h1>' })
    );

    // The account page asks for checkout by writing a session document...
    const checkoutTabPromise = context.waitForEvent('page');
    await account.locator('#subscribeBtn').click();
    await expect.poll(async () => (await checkoutSessions(user.uid)).length).toBe(1);
    const [session] = await checkoutSessions(user.uid);
    expect(session.fields?.price?.stringValue).toBe('price_e2e_monthly');
    expect(session.fields?.trial_from_plan?.booleanValue).toBe(true);

    // ...which the Stripe extension answers with a checkout URL that opens in a tab.
    await answerCheckout(session.name, `${TEST_ORIGIN}/stripe-checkout`);
    const checkoutTab = await checkoutTabPromise;
    await expect(checkoutTab).toHaveURL(`${TEST_ORIGIN}/stripe-checkout`);
    await checkoutTab.close();
    await expect(account.locator('#infoText')).toContainText('Complete checkout in the new tab');

    // Payment completes: the Stripe extension sets the paid role. The account
    // page notices on its own by polling.
    await setPaidRole(user.uid, true);
    await expect(account.locator('#planStatus')).toHaveText('Your subscription is active.', {
      timeout: 20_000,
    });
    await expect(account.locator('#manageBtn')).toBeVisible();
    await expect(account.locator('#subscribeBtn')).toBeHidden();
    await expect(account.locator('#reason')).toBeHidden();
    await expect(account.locator('#infoText')).toContainText("You're all set");

    // And the toolbar icon now starts a selection.
    const page = await openTextPage(context, 'Unlocked text');
    await clickToolbarIcon(serviceWorker);
    await expect(page.locator('#snapocr-host .overlay')).toBeVisible();
  });

  test('a purchase is honoured at once even though the worker holds an older token (regression)', async ({
    context,
    serviceWorker,
    extensionId,
  }) => {
    const user = await createUser('fresh@example.com');
    const account = await context.newPage();
    await account.goto(extensionUrl(extensionId, 'account/account.html'));
    await signInOnAccountPage(account, user.email, user.password);
    await account.close();

    // The worker checks once and caches a token without the paid role...
    const page = await openTextPage(context, 'Bought just now');
    const promptPromise = context.waitForEvent('page');
    await clickToolbarIcon(serviceWorker);
    await (await promptPromise).close();

    // ...then the purchase completes, with no page around to refresh anything.
    await setPaidRole(user.uid, true);
    await clickToolbarIcon(serviceWorker);
    await expect(page.locator('#snapocr-host .overlay')).toBeVisible();
  });

  test('cancelling the subscription locks the extension again', async ({
    context,
    serviceWorker,
    extensionId,
  }) => {
    const user = await createUser('cancel@example.com');
    await setPaidRole(user.uid, true);
    const account = await context.newPage();
    await account.goto(extensionUrl(extensionId, 'account/account.html'));
    await signInOnAccountPage(account, user.email, user.password);
    await expect(account.locator('#planStatus')).toHaveText('Your subscription is active.');

    await setPaidRole(user.uid, false);
    await account.locator('#refreshBtn').click();
    await expect(account.locator('#planStatus')).toHaveText('You have no active subscription.');

    const page = await openTextPage(context, 'Locked again');
    const accountPagePromise = context.waitForEvent('page');
    await clickToolbarIcon(serviceWorker);
    await expect(await accountPagePromise).toHaveURL(/reason=no-subscription$/);
    await expect(page.locator('#snapocr-host')).toHaveCount(0);
  });
});

test.describe('account page', () => {
  test('creates an account, signs out, and signs back in', async ({ context, extensionId }) => {
    const account = await context.newPage();
    await account.goto(extensionUrl(extensionId, 'account/account.html'));

    await account.locator('#email').fill('new@example.com');
    await account.locator('#password').fill('a-good-password');
    await account.locator('#createBtn').click();
    await expect(account.locator('#userEmail')).toHaveText('new@example.com');

    await account.locator('#signOutBtn').click();
    await expect(account.locator('#signedOut')).toBeVisible();
    await expect(account.locator('#password')).toHaveValue('');

    await signInOnAccountPage(account, 'new@example.com', 'a-good-password');
    await account.reload();
    // The session survives a reload.
    await expect(account.locator('#userEmail')).toHaveText('new@example.com');
  });

  test('signing out clears the remembered subscription', async ({
    context,
    serviceWorker,
    extensionId,
  }) => {
    const user = await createUser('paid@example.com');
    await setPaidRole(user.uid, true);
    const account = await context.newPage();
    await account.goto(extensionUrl(extensionId, 'account/account.html'));
    await signInOnAccountPage(account, user.email, user.password);
    await expect(account.locator('#planStatus')).toHaveText('Your subscription is active.');
    const cached = () =>
      serviceWorker.evaluate(() => chrome.storage.local.get('snapocr_entitlement'));
    expect(await cached()).toHaveProperty('snapocr_entitlement.active', true);

    await account.locator('#signOutBtn').click();
    await expect(account.locator('#signedOut')).toBeVisible();
    expect(await cached()).toEqual({});
  });

  test('explains wrong credentials and invalid input without sending bad requests', async ({
    context,
    extensionId,
  }) => {
    await createUser('exists@example.com', 'right-password');
    const account = await context.newPage();
    await account.goto(extensionUrl(extensionId, 'account/account.html'));
    const error = account.locator('#errorText');

    await account.locator('#email').fill('not-an-email');
    await account.locator('#password').fill('whatever-long');
    await account.locator('#signInBtn').click();
    await expect(error).toHaveText('Enter a valid email address.');

    await account.locator('#email').fill('exists@example.com');
    await account.locator('#password').fill('wrong-password');
    await account.locator('#signInBtn').click();
    await expect(error).toHaveText('Email or password is incorrect.');

    await account.locator('#password').fill('another-password');
    await account.locator('#createBtn').click();
    await expect(error).toHaveText('An account with this email already exists. Sign in instead.');
  });

  test('password reset never reveals whether an account exists', async ({
    context,
    extensionId,
  }) => {
    await createUser('known@example.com');
    const account = await context.newPage();
    await account.goto(extensionUrl(extensionId, 'account/account.html'));
    const message = 'If an account exists for that email, a password reset link is on its way.';

    await account.locator('#resetBtn').click();
    await expect(account.locator('#errorText')).toContainText('Enter your email address first');

    for (const email of ['known@example.com', 'unknown@example.com']) {
      await account.locator('#email').fill(email);
      await account.locator('#resetBtn').click();
      await expect(account.locator('#infoText')).toHaveText(message);
    }
  });

  test('is reachable as the extension options page and keyboard-operable', async ({
    context,
    serviceWorker,
    extensionId,
  }) => {
    const manifest = await serviceWorker.evaluate(() => chrome.runtime.getManifest());
    expect(manifest.options_ui?.page).toBe('account/account.html');

    await createUser('keys@example.com', 'keyboard-pass');
    const account = await context.newPage();
    await account.goto(extensionUrl(extensionId, 'account/account.html'));
    // The form appears once Firebase has reported that nobody is signed in.
    await expect(account.locator('#signedOut')).toBeVisible();
    await account.locator('#email').focus();
    await account.keyboard.type('keys@example.com');
    await account.keyboard.press('Tab');
    await account.keyboard.type('keyboard-pass');
    await account.keyboard.press('Enter');
    await expect(account.locator('#userEmail')).toHaveText('keys@example.com');
  });
});

/** How many signed-in users Firebase has committed to its IndexedDB store, read once. */
function committedSessions(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      new Promise<number>((resolve, reject) => {
        const open = indexedDB.open('firebaseLocalStorageDb');
        open.onerror = () => reject(new Error('IndexedDB open failed'));
        open.onsuccess = () => {
          const db = open.result;
          const request = db
            .transaction('firebaseLocalStorage', 'readonly')
            .objectStore('firebaseLocalStorage')
            .getAll();
          request.onsuccess = () => {
            db.close();
            const rows = request.result as { fbase_key: string }[];
            resolve(rows.filter((row) => row.fbase_key.startsWith('firebase:authUser:')).length);
          };
        };
      })
  );
}

// Firebase reports sign-in and sign-out as done before its IndexedDB write
// commits. The account page must not show a state that is not saved yet, or a
// reload or closed tab in that window can lose it (seen on the CI runner). The
// gap is timing-dependent, so this checks the guarantee on every round of a
// slowed-down sign-up / sign-out / sign-in cycle, then reloads.
test('the account page only shows a session state once it is saved', async ({
  context,
  extensionId,
}) => {
  test.setTimeout(240_000);
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 });
  const url = extensionUrl(extensionId, 'account/account.html');

  for (let round = 0; round < 8; round++) {
    const email = `slow${round}@example.com`;
    await page.goto(url);
    await expect(page.locator('#signedOut')).toBeVisible();
    await page.locator('#email').fill(email);
    await page.locator('#password').fill('a-good-password');
    await page.locator('#createBtn').click();
    await expect(page.locator('#userEmail')).toHaveText(email);
    expect(await committedSessions(page), `round ${round}: after sign-up`).toBe(1);

    await page.locator('#signOutBtn').click();
    await expect(page.locator('#signedOut')).toBeVisible();
    expect(await committedSessions(page), `round ${round}: after sign-out`).toBe(0);

    await page.locator('#email').fill(email);
    await page.locator('#password').fill('a-good-password');
    await page.locator('#signInBtn').click();
    await expect(page.locator('#userEmail')).toHaveText(email);
    expect(await committedSessions(page), `round ${round}: after sign-in`).toBe(1);

    await page.reload();
    await expect(page.locator('#userEmail'), `round ${round}: after reload`).toHaveText(email);
    await page.locator('#signOutBtn').click();
    await expect(page.locator('#signedOut')).toBeVisible();
  }
});

test.describe('firestore rules', () => {
  test('users can create checkout sessions only for themselves', async () => {
    const alice = await createUser('alice@example.com');
    const bob = await createUser('bob@example.com');

    expect(await writeAsUser(alice, `customers/${alice.uid}/checkout_sessions`)).toBe(200);
    expect(await writeAsUser(alice, `customers/${bob.uid}/checkout_sessions`)).toBe(403);
    // Subscriptions are written only by the Stripe extension, never by users.
    expect(await writeAsUser(alice, `customers/${alice.uid}/subscriptions`)).toBe(403);
  });
});
