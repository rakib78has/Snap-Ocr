# CI/CD

Two GitHub Actions workflows live in `.github/workflows/`.

## `ci.yml`: every pull request and every push to `main`

| Job        | What it checks                                                                         |
| ---------- | -------------------------------------------------------------------------------------- |
| `quality`  | Prettier, ESLint, TypeScript, unit + integration tests with coverage thresholds         |
| `build`    | Production build, manifest validation, packaging; uploads `snap-ocr-<version>.zip` (30 days) |
| `e2e`      | Builds, then runs the Playwright suite in real Chromium (under xvfb), including real OCR |
| `security` | `npm audit`; high or critical advisories fail the job                                  |

The E2E suite needs no network access. Language downloads are simulated by request
interception, and English OCR uses the bundled model.

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
