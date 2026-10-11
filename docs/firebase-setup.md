# Setting up accounts and the paid plan

Snap OCR requires a signed-in user with an active (or trialing) monthly subscription. This uses:

- **Firebase Authentication** (email and password) for accounts.
- **Cloud Firestore** plus the official **Run Payments with Stripe** Firebase extension for
  checkout and subscriptions.
- **Firebase Hosting** for one static page that Stripe returns the user to after checkout.

OCR itself never leaves the user's browser. Only the email address and subscription status go
through Firebase and Stripe.

Do everything in **Stripe test mode** first. Switch to live keys only once the whole flow works.

## 1. Create the Firebase project

1. In the [Firebase console](https://console.firebase.google.com/), create a project, for example
   `snap-ocr`.
2. Upgrade it to the **Blaze** (pay-as-you-go) plan. The Stripe extension runs Cloud Functions,
   which require Blaze. A project of this size normally stays within the free usage quotas, but a
   billing account is mandatory.
3. **Build → Authentication → Get started → Sign-in method:** enable **Email/Password**.
4. **Build → Firestore Database → Create database:** production mode, in a region near your users.
5. **Project settings → General → Your apps:** add a **Web** app. Copy its config values into a new
   file `.env.production.local` (git-ignored), using `.env.example` as the template:

   ```
   VITE_FIREBASE_API_KEY=...
   VITE_FIREBASE_AUTH_DOMAIN=<project-id>.firebaseapp.com
   VITE_FIREBASE_PROJECT_ID=<project-id>
   VITE_FIREBASE_APP_ID=...
   ```

   These values identify the project and are public by design. Security comes from Auth and
   `firestore.rules`, not from keeping them hidden.

## 2. Deploy the security rules and the return page

From this repository:

```sh
npx firebase login
npx firebase use --add          # pick your project
npx firebase deploy --only firestore:rules,hosting
```

This deploys `firestore.rules`, which lets users read only their own data and create checkout
sessions only for themselves. It also deploys `hosting/checkout-complete.html` to
`https://<project-id>.web.app/checkout-complete.html`.

## 3. Create the product in Stripe

1. In the [Stripe dashboard](https://dashboard.stripe.com/test/products) (test mode), create a
   product, for example **Snap OCR**.
2. Add the product metadata key **`firebaseRole`** with the value **`premium`**. The extension
   copies this onto the user's login token as `stripeRole: premium`, and that claim is exactly what
   Snap OCR checks.
3. Add a **recurring, monthly** price in your currency. Copy its ID (`price_...`) into
   `.env.production.local` as `VITE_STRIPE_PRICE_ID`.
4. **Free trial:** checkout is created with `trial_from_plan: true`, so the trial comes from the
   price's trial period. Set the trial days on the price, then **confirm in a test checkout that the
   trial appears**. Stripe's handling of price-level trials has changed over time, so verify it
   rather than assume it.
5. **Settings → Billing → Customer portal:** enable it and allow cancelling subscriptions. The
   **Manage subscription** button opens this portal.

## 4. Install the Stripe extension

1. Firebase console → **Extensions** → install **Run Payments with Stripe**
   (`invertase/firestore-stripe-payments`).
2. Use the defaults for the collections (`products`, `customers`) and choose the same Functions
   region you will put in `VITE_FIREBASE_FUNCTIONS_REGION` (default `us-central1`).
3. Give it a **restricted** Stripe API key, with the permissions the extension's install page lists.
4. After installation, follow the extension's post-install instructions to add the **webhook** in
   Stripe (endpoint URL and events are shown there), then paste the webhook signing secret back into
   the extension's configuration.

## 5. Build and try it

```sh
npm run build          # fails, listing what is missing, until .env.production.local is complete
npm run validate:manifest
```

Load `dist/` in `chrome://extensions`, then:

1. Click the Snap OCR icon. The Account page opens: create an account.
2. Click **Start free trial** and pay with Stripe's test card `4242 4242 4242 4242` (any future
   date, any CVC).
3. Within a few seconds, the Account page shows **Your subscription is active**.
4. The icon now starts a selection as before.
5. **Manage subscription → cancel:** within an hour (when the login token renews), the icon sends
   you back to the Account page.

## 6. CI and releases

Add the same values as **repository variables** (GitHub → Settings → Secrets and variables →
Actions → **Variables**): `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`,
`VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID`, `VITE_STRIPE_PRICE_ID`,
`VITE_FIREBASE_FUNCTIONS_REGION`. Until they are set, CI skips the production build but still runs
every other check, including the e2e suite against the emulators. The release workflow fails until
they are set.

## How access is decided

- **Signed out:** the toolbar icon and shortcut open the Account page.
- **Signed in, `stripeRole` is `premium`:** allowed. That covers trialing and active subscriptions.
- **Signed in, no role:** the Account page offers the free trial. Before refusing, the extension
  fetches a fresh token once, so a purchase made seconds ago is honoured.
- **Subscription can't be checked** (offline, Firebase unreachable): allowed if a successful check
  for the same user happened within the last **7 days**; otherwise the Account page explains.
- Signing out clears the remembered check.

This check runs in the extension, on the user's machine. As with any client-side paywall, a
determined person could modify a local copy. The paywall keeps honest users honest; it is not
tamper-proof DRM.
