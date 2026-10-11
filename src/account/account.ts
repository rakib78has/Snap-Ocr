import type { User } from 'firebase/auth/web-extension';
import { describeAuthError, isPlausibleEmail, validateCredentials } from '../core/auth-messages.ts';
import { DENY_MESSAGES, isDenyReason, type AccessDecision } from '../core/entitlement.ts';
import {
  checkAccess,
  createAccount,
  createCheckoutUrl,
  createPortalUrl,
  onUserChanged,
  sendPasswordReset,
  signIn,
  signOut,
} from '../infra/account.ts';
import { setUpThemeToggle } from '../ui/theme.ts';

function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Snap OCR: #${id} missing from account.html`);
  return el as T;
}

const reasonEl = byId('reason');
const loadingEl = byId('loading');
const signedOutEl = byId('signedOut');
const signedInEl = byId('signedIn');
const authForm = byId<HTMLFormElement>('authForm');
const emailInput = byId<HTMLInputElement>('email');
const passwordInput = byId<HTMLInputElement>('password');
const createBtn = byId<HTMLButtonElement>('createBtn');
const resetBtn = byId<HTMLButtonElement>('resetBtn');
const userEmailEl = byId('userEmail');
const planStatusEl = byId('planStatus');
const subscribeBtn = byId<HTMLButtonElement>('subscribeBtn');
const manageBtn = byId<HTMLButtonElement>('manageBtn');
const refreshBtn = byId<HTMLButtonElement>('refreshBtn');
const signOutBtn = byId<HTMLButtonElement>('signOutBtn');
const errorTextEl = byId('errorText');
const infoTextEl = byId('infoText');

/** After checkout opens, the subscription is re-checked this often… */
const PURCHASE_POLL_MS = 5_000;
/** …for at most this long. */
const PURCHASE_POLL_LIMIT_MS = 15 * 60 * 1000;

let purchasePoll: ReturnType<typeof setInterval> | undefined;

function showError(message: string): void {
  errorTextEl.textContent = message;
  errorTextEl.hidden = false;
}

function showInfo(message: string): void {
  errorTextEl.hidden = true;
  infoTextEl.textContent = message;
}

function clearMessages(): void {
  errorTextEl.hidden = true;
  errorTextEl.textContent = '';
  infoTextEl.textContent = '';
}

/** Runs `action` with every button disabled, so nothing is submitted twice. */
async function busy(action: () => Promise<void>): Promise<void> {
  const buttons = [...document.querySelectorAll<HTMLButtonElement>('main button')];
  const previous = buttons.map((button) => button.disabled);
  buttons.forEach((button) => (button.disabled = true));
  try {
    await action();
  } finally {
    buttons.forEach((button, i) => (button.disabled = previous[i]!));
  }
}

function showReasonFromUrl(): void {
  const reason = new URLSearchParams(location.search).get('reason');
  if (isDenyReason(reason)) {
    reasonEl.textContent = DENY_MESSAGES[reason];
    reasonEl.hidden = false;
  }
}

function stopPurchasePoll(): void {
  clearInterval(purchasePoll);
  purchasePoll = undefined;
}

function renderPlan(decision: AccessDecision): void {
  if (decision.allowed) {
    planStatusEl.textContent =
      decision.source === 'live'
        ? 'Your subscription is active.'
        : 'Your subscription was confirmed recently. Snap OCR will re-check it when you are online.';
    subscribeBtn.hidden = true;
    manageBtn.hidden = false;
    stopPurchasePoll();
    if (!reasonEl.hidden) {
      reasonEl.hidden = true;
      showInfo(
        "You're all set. Click the Snap OCR icon or press Ctrl+Shift+U on any page to start."
      );
    }
    return;
  }

  subscribeBtn.hidden = decision.reason !== 'no-subscription';
  manageBtn.hidden = true;
  planStatusEl.textContent =
    decision.reason === 'no-subscription'
      ? 'You have no active subscription.'
      : DENY_MESSAGES[decision.reason];
}

async function refreshPlan(refresh: boolean): Promise<void> {
  renderPlan(await checkAccess({ refresh }));
}

function renderUser(user: User | null): void {
  loadingEl.hidden = true;
  signedOutEl.hidden = user !== null;
  signedInEl.hidden = user === null;
  if (!user) {
    stopPurchasePoll();
    return;
  }
  userEmailEl.textContent = user.email ?? '';
  planStatusEl.textContent = 'Checking your subscription…';
  void refreshPlan(false);
}

async function submitCredentials(mode: 'sign-in' | 'create'): Promise<void> {
  clearMessages();
  const email = emailInput.value;
  const password = passwordInput.value;
  const invalid = validateCredentials(email, password);
  if (invalid) {
    showError(invalid);
    return;
  }
  await busy(async () => {
    try {
      if (mode === 'sign-in') {
        await signIn(email, password);
      } else {
        await createAccount(email, password);
      }
      passwordInput.value = '';
    } catch (error) {
      showError(describeAuthError(error));
    }
  });
}

authForm.addEventListener('submit', (event) => {
  event.preventDefault();
  void submitCredentials('sign-in');
});

createBtn.addEventListener('click', () => void submitCredentials('create'));

resetBtn.addEventListener('click', () => {
  clearMessages();
  if (!isPlausibleEmail(emailInput.value)) {
    showError('Enter your email address first, then choose "Forgot password?".');
    emailInput.focus();
    return;
  }
  void busy(async () => {
    try {
      await sendPasswordReset(emailInput.value);
    } catch (error) {
      // Unknown addresses are not revealed; only other failures are shown.
      if ((error as { code?: unknown }).code !== 'auth/user-not-found') {
        showError(describeAuthError(error));
        return;
      }
    }
    showInfo('If an account exists for that email, a password reset link is on its way.');
  });
});

subscribeBtn.addEventListener('click', () => {
  clearMessages();
  void busy(async () => {
    try {
      showInfo('Opening secure checkout…');
      const url = await createCheckoutUrl();
      await chrome.tabs.create({ url });
      showInfo('Complete checkout in the new tab. This page updates once your trial starts.');
      const started = Date.now();
      stopPurchasePoll();
      purchasePoll = setInterval(() => {
        if (Date.now() - started > PURCHASE_POLL_LIMIT_MS) {
          stopPurchasePoll();
          return;
        }
        void refreshPlan(true);
      }, PURCHASE_POLL_MS);
    } catch (error) {
      console.error('Snap OCR: checkout failed', error);
      showError(
        `Couldn't open checkout: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  });
});

manageBtn.addEventListener('click', () => {
  clearMessages();
  void busy(async () => {
    try {
      await chrome.tabs.create({ url: await createPortalUrl() });
    } catch (error) {
      console.error('Snap OCR: billing portal failed', error);
      showError("Couldn't open subscription management. Please try again.");
    }
  });
});

refreshBtn.addEventListener('click', () => {
  clearMessages();
  void busy(() => refreshPlan(true));
});

signOutBtn.addEventListener('click', () => {
  clearMessages();
  void busy(signOut);
});

setUpThemeToggle(byId('themeToggle'));
showReasonFromUrl();
onUserChanged(renderUser);
