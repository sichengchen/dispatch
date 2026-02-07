## 1. Server Bundle Build Script

- [x] 1.1 Create `scripts/bundle-server.sh` that compiles workspace packages (`@dispatch/db`, `@dispatch/lib`, `@dispatch/server`) via `tsc` and copies their `dist/` outputs into a flat `server-dist/` directory
- [x] 1.2 Add production `node_modules` to `server-dist/` using `pnpm deploy --prod` (or equivalent pruning) for `@dispatch/server` with its workspace dependencies
- [x] 1.3 Run `electron-rebuild` against `server-dist/node_modules` to compile `better-sqlite3` and `@lancedb/lancedb` native addons for the target Electron version
- [x] 1.4 Exclude Playwright browsers from the server bundle (ensure `playwright` is in `devDependencies` or explicitly pruned)
- [x] 1.5 Add `extraResources` entry in `electron-builder.json5` pointing to `server-dist/`
- [x] 1.6 Add a `bundle:server` script to `apps/desktop/package.json` and wire it into the `build` script before `electron-builder` runs

## 2. Packaged-Mode Server Startup

- [x] 2.1 Update `startServer()` in `electron/main.ts` to handle the `app.isPackaged` branch: spawn `process.execPath` with `ELECTRON_RUN_AS_NODE=1` env var, pointing to `server-dist/packages/server/dist/index.js` under `process.resourcesPath`
- [x] 2.2 Pass `DISPATCH_SETTINGS_PATH`, `DISPATCH_DB_PATH`, and `DISPATCH_VECTOR_PATH` (all resolving to `app.getPath('userData')`) in the server env
- [x] 2.3 Add a `getVectorPath()` helper in `electron/main.ts` mirroring the existing `getDbPath()`/`getSettingsPath()` pattern, defaulting to `<userData>/dispatch.vectors` in packaged mode
- [x] 2.4 Implement graceful shutdown: on `before-quit`, send SIGTERM to the server child process and wait up to 5 seconds before force-killing
- [x] 2.5 Pipe server child process stderr to a log file at `<userData>/server.log` for debugging packaged builds

## 3. First-Run Onboarding

- [x] 3.1 Add `onboardingComplete` boolean field to the settings schema in `packages/server/src/services/settings.ts` (default: `false`)
- [x] 3.2 Create `apps/desktop/src/components/OnboardingWizard.tsx` with a 3-step stepper: Welcome, Provider Setup, Add Source
- [x] 3.3 Implement the Welcome step: app name, brief description, "Get Started" button to advance
- [x] 3.4 Implement the Provider Setup step: reuse form logic from `ProvidersSection` — allow adding an Anthropic or OpenAI-compatible provider with API key; include a "Skip" option with a warning
- [x] 3.5 Implement the Add Source step: URL input field that calls `sources.create` mutation on submit; include a "Skip" option
- [x] 3.6 On wizard completion, call `settings.update` with `onboardingComplete: true` and transition to the home view
- [x] 3.7 Gate `App.tsx` rendering: if `onboardingComplete` is falsy, render `<OnboardingWizard>` instead of the tab-based UI
- [x] 3.8 Add a "Re-run Setup" button in the General tab of `SettingsPage` that sets `onboardingComplete: false` and shows the wizard

## 4. Release Infrastructure

- [x] 4.1 Create a LICENSE file at the project root (license type TBD — use MIT as placeholder)
- [x] 4.2 Bump version in `apps/desktop/package.json` from `0.0.0` to `0.1.0` and add a matching `version` field to root `package.json`
- [x] 4.3 Add `electron-updater` dependency to `apps/desktop/package.json`
- [x] 4.4 Add `publish` configuration to `electron-builder.json5` with provider `github` and the repository owner/name
- [x] 4.5 Add auto-update logic in `electron/main.ts`: import `autoUpdater` from `electron-updater`, call `autoUpdater.checkForUpdates()` after window creation, send IPC event to renderer on `update-available`
- [x] 4.6 Add update notification in the renderer: listen for the IPC update event and show a toast via Sonner with "Update available — restart to install"
- [x] 4.7 Add macOS code signing config to `electron-builder.json5`: `afterSign` notarize hook, `mac.hardenedRuntime`, `mac.entitlements` (gated on `CSC_LINK` env presence)
- [x] 4.8 Create `.github/workflows/release.yml`: triggered on version tag push, runs build + sign + publish to GitHub Releases for macOS, Windows, and Linux

## 5. App Icons and Branding

- [ ] ~5.1 Deferred — user will design custom icons later~
- [ ] ~5.2 Deferred — using default Electron icon~
- [ ] ~5.3 Deferred — using default Electron icon~

## 6. Error Boundary

- [x] 6.1 Create `apps/desktop/src/components/ErrorBoundary.tsx` as a React class component with `componentDidCatch` logging and a fallback UI showing the error message and a "Reload" button
- [x] 6.2 Wrap the `<main>` content area in `App.tsx` with `<ErrorBoundary>`, keeping the header and navigation outside the boundary

## 7. Verification

- [ ] 7.1 Run `pnpm build` end-to-end and verify the server bundle is included in the output
- [x] 7.2 Run `pnpm lint` and fix any issues introduced by new files
- [x] 7.3 Run `pnpm test` and verify existing tests still pass
- [ ] 7.4 Launch the built packaged app on macOS and verify: server starts, onboarding shows, completing onboarding lands on home view
