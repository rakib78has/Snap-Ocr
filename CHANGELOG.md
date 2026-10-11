# Changelog

All notable changes to Snap OCR are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow the manifest
`version`. The release workflow refuses to release a version without a `## [x.y.z]` entry.

## [Unreleased]

### Added

- Accounts and a paid plan. Using Snap OCR now requires signing in with an active or trialing
  monthly subscription (Firebase Authentication, and Stripe via the "Run Payments with Stripe"
  Firebase extension). The new Account page, also the extension's options page, handles sign-in,
  sign-up, password reset, free trial checkout, subscription management and sign-out. A confirmed
  subscription keeps working offline for 7 days. OCR still runs entirely in the browser. Setup is
  in `docs/firebase-setup.md`.

### Changed

- Shortened the store description to 109 characters (the Chrome Web Store limit is 132), and
  removed "No accounts", which is no longer true.
- Ported the extension to strict TypeScript, built with Vite. OCR behaviour is unchanged.
- Tesseract.js 7.0.0, its WASM core and the English model are now pinned npm dependencies
  instead of committed files.
- Removed `tesseract-core.wasm` from the package; it was never loaded (3.4 MB smaller).

### Fixed

- Resize handles on the bottom and right edges of the selection could barely be grabbed; pressing
  one moved the box or started a new one.
- Enter and Escape in the selection overlay also reached the page (for example submitting a
  focused form).
- The overlay's page listeners were left behind after it closed.
- The capture now waits for a repaint without the overlay before the screenshot is taken.
- Two captures in quick succession could overwrite each other; reloading the result tab lost the
  image.
- A failed language download left the result page stuck forever. It now reports the failure.
- OCR could not be stopped: added Cancel, Try again and a 3-minute timeout.
- A language whose download failed was remembered and retried on every capture.
- Very large selections now get a clear "select a smaller area" message.

## [1.3.1]

Baseline: the JavaScript version of the extension before the TypeScript port.
