# Snap OCR — Chrome Extension

Snap OCR lets you drag-select any area of your screen and instantly get back editable text. OCR runs
locally in your browser using [Tesseract.js](https://github.com/naptha/tesseract.js). Your
screenshots and extracted text never leave your machine. (Picking a language other than English
downloads that language's model once; see [Using other languages](#using-other-languages).)

Using Snap OCR requires an account with an active subscription, which starts with a free trial. See
[Account and subscription](#account-and-subscription).

## Install (load as an unpacked extension)

Snap OCR is written in TypeScript and must be built once before Chrome can load it.

1. Install [Node.js](https://nodejs.org/) 20.19 or newer.
2. Put the Firebase and Stripe settings in `.env.production.local` (see
   [docs/firebase-setup.md](docs/firebase-setup.md)).
3. In this folder, run:
   ```sh
   npm ci
   npm run build
   ```
   This produces the loadable extension in `dist/`. The build stops, listing what is missing, if
   the settings are incomplete.
4. Open Chrome and go to `chrome://extensions`.
5. Turn on **Developer mode** (top right), click **Load unpacked**, and select the `dist` folder.
6. Pin Snap OCR from the puzzle-piece menu so its icon is always visible.

After a rebuild, click the reload icon on the Snap OCR card in `chrome://extensions`.

Optional: to use Snap OCR on PDF files opened from your disk (`file://` URLs), open **Details** for
Snap OCR in `chrome://extensions` and turn on **Allow access to file URLs**.

## Account and subscription

The first time you click the Snap OCR icon (or press the shortcut), the **Account** page opens.
Create an account with your email and a password, then choose **Start free trial**. Checkout is
handled by Stripe in a new tab, and the Account page updates on its own once your trial starts.

You can reopen the Account page at any time from **chrome://extensions → Snap OCR → Extension
options**. From there you can **Manage subscription** (change card, cancel) or **Sign out**.

If you're offline, Snap OCR keeps working for up to 7 days after it last confirmed your
subscription.

**Privacy:** your screenshots and the extracted text are processed only in your browser and are
never uploaded. Your email address and sign-in are handled by Firebase Authentication (Google), and
payments by Stripe. Snap OCR never sees your card details.

## Day-to-day usage

1. Go to any webpage, PDF (in Chrome's built-in viewer), or a playing/paused video.
2. Activate Snap OCR by clicking its toolbar icon or pressing **Ctrl+Shift+U** (**Cmd+Shift+U** on
   Mac).
3. The page dims and the cursor becomes a crosshair. Click and hold the left mouse button and drag a
   rectangle around the text.
4. Releasing the mouse doesn't capture yet. Handles appear so you can fine-tune the box:
   - Drag a handle to resize that edge or corner.
   - Drag inside the box to move it.
   - Click outside the box to discard it and draw a new one.
5. A toolbar appears next to the box:
   - **Capture** — runs OCR on the box (**Enter** does the same)
   - **Recapture** — clears the box so you can draw a new one
   - **Cancel** — backs out entirely (**Esc** does the same)
6. A new tab opens with a preview of the selection, a **Language** dropdown, a progress bar, and the
   extracted, editable text.
7. Use **Copy text** to copy it, or **Open Google Docs** to copy it and open a blank Google Doc
   (`docs.new`) to paste into.

### Using other languages

English is built in and works fully offline. The **Language** dropdown lists every language
Tesseract supports (100+):

- English is marked "(offline)".
- Any other language is downloaded once from the public Tesseract data CDN (jsDelivr) the first time
  you pick it, then cached by your browser, so later uses work offline too.
- Only the language model is downloaded. Your screenshots and extracted text are never uploaded.
- Your last-used language is remembered.
- If you're offline and pick a language you haven't used before, the download fails. Switch back to a
  previously used language, or reconnect and try again.

### Light / dark theme

The theme button next to the title on the result tab cycles **System → Light → Dark**. Your choice is
remembered. The selection overlay looks the same on every page.

## Troubleshooting

- **Nothing happens when I click the icon or press the shortcut.** Chrome blocks extensions on its
  own pages (`chrome://` pages, the Chrome Web Store, other extension pages). Use a normal webpage,
  PDF, or video. You'll get a notification when this happens.
- **It doesn't work on a PDF opened from my computer.** Turn on **Allow access to file URLs** (see
  Install).
- **The keyboard shortcut does nothing or conflicts.** Check or change it at
  `chrome://extensions/shortcuts`.
- **The text is wrong or missing words.** Tesseract works best on clear, reasonably large,
  horizontal, high-contrast text. Try a tighter or larger box, zoom the page in (Ctrl + `+`) first,
  or pause a video fully before selecting.
- **The first capture is slow.** The OCR engine and language model load on first use; later runs
  are faster.
- **Something looks broken after editing the source.** Run `npm run build`, reload the extension in
  `chrome://extensions`, then reload the page you were testing.

## Development

| Command                     | What it does                                                     |
| --------------------------- | ---------------------------------------------------------------- |
| `npm run build`             | Build the extension into `dist/`                                 |
| `npm run dev`               | Rebuild the pages and service worker on change                  |
| `npm run typecheck`         | Strict TypeScript check                                          |
| `npm run lint`              | ESLint (type-aware)                                              |
| `npm run format`            | Prettier                                                         |
| `npm test`                  | Unit and integration tests (Vitest)                              |
| `npm run test:coverage`     | The same, with a coverage report and thresholds                  |
| `npm run test:e2e`          | Builds `dist-e2e/`, starts the Firebase emulators, runs Playwright (real OCR, real Firebase Auth, Firestore rules) |
| `npm run emulators`         | Starts the Auth and Firestore emulators on their own, for manual testing |
| `npm run validate:manifest` | Checks the built manifest, permissions and required files        |
| `npm run package`           | Zips `dist/` for the Chrome Web Store                            |
| `npm run verify`            | Format, lint, types, tests, build and validation in one go       |

Run `npx playwright install chromium` once before the first `npm run test:e2e`. The Firebase
emulators need **Java 21** or newer on your `PATH`. `npm run build` and `npm run verify` need
`.env.production.local`.

### Layout

```
public/            manifest.json and icons, copied into dist/ as-is
src/
  background/      service worker: injection, capture and crop, hand-off to the result page
  content/         drag-to-select overlay (built as a classic script for executeScript)
  result/          result page: OCR, language picker, copy, theme
  account/         account page: sign in, free trial checkout, manage subscription
  core/            pure logic: geometry, data URLs, languages, theme, text helpers
  shared/          message contracts and storage keys used across contexts
  infra/           Tesseract.js adapter, Firebase (Auth, Firestore Lite) and Stripe flows
  ui/              small UI helpers shared by the pages
scripts/           build validation, packaging, e2e build preparation
tests/             unit, integration and e2e suites
```

### OCR engine

Tesseract.js, its WASM core and the English model are pinned npm dependencies (`tesseract.js`
7.0.0, `tesseract.js-core` 7.0.0, `@tesseract.js-data/eng` 1.0.0, model 4.0.0). The build copies
the prebuilt browser files into `dist/lib/`. They're byte-identical to the files previously vendored
in the repository, so OCR behaviour is unchanged.

### The e2e build

`npm run test:e2e` runs against `dist-e2e/`, built with `vite --mode e2e`. It differs from the
production build in three ways:

- It uses the Firebase emulators under the offline-only `demo-snap-ocr` project (`.env.e2e`).
- It adds `host_permissions: ["<all_urls>"]` in place of the `activeTab` grant. In real use that
  grant comes from clicking the toolbar icon or pressing the shortcut, which are browser UI that
  Playwright can't reach.
- Its service worker exposes its handlers so tests can do what a toolbar click does.

`scripts/validate-build.mjs` rejects a production build containing any of these.

## Licences

Tesseract.js, tesseract.js-core and the Tesseract English model are licensed under Apache-2.0.
