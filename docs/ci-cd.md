# CI/CD

Two GitHub Actions workflows live in `.github/workflows/`.

## `ci.yml`: every pull request and every push to `main`

| Job        | What it checks                                                                         |
| ---------- | -------------------------------------------------------------------------------------- |
| `quality`  | Prettier, ESLint, TypeScript, unit + integration tests with coverage thresholds         |
| `build`    | Production build, manifest validation, packaging; uploads `snap-ocr-<version>.zip` (30 days) |
| `e2e`      | Builds, then runs the Playwright suite in real Chromium (under xvfb), including real OCR |
| `security` | `npm audit`: shipped dependencies fail on moderate+, dev tooling on critical (see below) |

The E2E suite needs no outside network access. It runs against the Firebase Auth and Firestore
emulators (Java 21 is installed for them), simulates language downloads and Stripe, and uses the
bundled English model.

The `build` job needs the Firebase settings as **repository variables** (see
[firebase-setup.md](firebase-setup.md#6-ci-and-releases)). Until they exist, it skips the
production build with a warning; every other job still runs.

### Dependency audit policy

The extension ships Tesseract.js and Firebase. Any advisory of moderate severity or worse in those
blocks a merge. `@grpc/grpc-js` is pinned to a patched version through `overrides` in
`package.json`. Firestore pulls it in only for Node.js, and it is not in the extension bundle.

Development tooling (Vite, Playwright, the Firebase emulator CLI) never ships, so only critical
advisories block there. Everything else is printed in the job log. Known open items, as of the
account/subscription change:

| Package     | Via                                | Why it stays                                             |
| ----------- | ---------------------------------- | -------------------------------------------------------- |
| `braces`    | firebase-tools → chokidar 3        | No fixed release exists (3.0.3 is the latest)             |
| `basic-ftp` | firebase-tools → proxy-agent       | Fixed only in v6; `get-uri` requires v5. Used only to fetch proxy-config files over FTP, which the emulators never do |

Re-check these when upgrading `firebase-tools`.

Suggested branch protection for `main`: require the four jobs above to pass before merging.

## `release.yml`: tags `v*` (or a manual run)

1. **verify:** checks the tag matches `public/manifest.json`'s `version` and that `CHANGELOG.md` has
   a `## [<version>]` entry. It then reruns every CI gate, with manifest validation in **strict**
   mode (warnings fail, for example a store description over 132 characters). Finally it packages
   the ZIP and records `SHA256SUMS.txt` and `BUILD-INFO.txt` (version and commit). The artifact is
   kept for 90 days.
2. **upload:** runs only for tag pushes, in the `chrome-web-store` environment. It re-checks the
   checksum, then uploads the ZIP to the Chrome Web Store **as a draft**. Nothing is published
   automatically; submit the draft for review from the developer dashboard.

### One-time setup before the first upload

1. In **Settings → Environments**, create `chrome-web-store` and add yourself as a required
   reviewer. That gives every upload a manual approval step.
2. Add these secrets to that environment: `CHROME_EXTENSION_ID`, `CHROME_CLIENT_ID`,
   `CHROME_CLIENT_SECRET`, `CHROME_REFRESH_TOKEN` (an OAuth client for the Chrome Web Store API).
   Until they are set, the upload job skips with a warning and the release stops at the verified
   artifact.

### Cutting a release

1. Bump `version` in `public/manifest.json` and `package.json`.
2. Move the `Unreleased` notes in `CHANGELOG.md` under `## [<version>]`.
3. Merge to `main`, then tag: `git tag v<version> && git push origin v<version>`.
