## Context

Dispatch is an Electron + React desktop app backed by a local Hono/tRPC server. In development, the Electron main process spawns the server via `pnpm --filter @dispatch/server dev`. The packaged-mode path in `electron/main.ts` (line 205) is a stub that logs a warning and returns. The server depends on native addons (`better-sqlite3` via `@dispatch/db`, `@lancedb/lancedb`) and Playwright (for SPA scraping), making simple JS bundling insufficient — the runtime must include platform-specific binaries.

The desktop app currently opens directly to the home digest view with no first-run experience. Settings (providers, models, schedules) are stored in `dispatch.settings.json` and managed via the Settings page, but new users have no guidance on initial setup. The app version is `0.0.0` and there is no license, code signing, or auto-update mechanism.

## Goals / Non-Goals

**Goals:**
- Produce self-contained platform installers (macOS DMG, Windows NSIS, Linux AppImage) that run without Node.js/pnpm
- Guide first-time users through provider and source setup before they see an empty digest
- Establish versioning, licensing, code signing, and auto-update infrastructure for ongoing releases
- Replace placeholder icons and add an error boundary for crash resilience

**Non-Goals:**
- App Store distribution (macOS App Store, Microsoft Store) — direct download only for now
- Offline mode or local-only LLM inference
- Multi-language / i18n support
- Theming / dark mode
- Crash reporting services (Sentry, etc.) — may be added later

## Decisions

### D1: Server bundling strategy — Node.js child process with pre-installed node_modules

**Decision:** Bundle the server as a pre-built directory (`server-dist/`) containing the compiled JS output of `@dispatch/server`, `@dispatch/db`, and `@dispatch/lib`, plus a pruned `node_modules` with production dependencies. Ship this directory via electron-builder's `extraResources`. At runtime, spawn it using Electron's bundled Node.js (`process.execPath` with `ELECTRON_RUN_AS_NODE=1`).

**Alternatives considered:**
- **Single-file bundler (esbuild/ncc):** Cannot handle `better-sqlite3` native addon and LanceDB's native bindings. Would require complex externals management that is fragile across platforms.
- **pkg / Node SEA (Single Executable Application):** Adds complexity for native addons and doesn't reduce distribution size meaningfully since Electron already ships Node.js.
- **In-process server (no child process):** Running Hono in Electron's main process would block the event loop during heavy scraping/LLM operations and complicate process isolation.

**Rationale:** Using `ELECTRON_RUN_AS_NODE=1` reuses the exact Node.js version Electron ships, avoiding version mismatches. The `extraResources` approach keeps server files outside ASAR (which can't contain native addons). A build script will: (1) `tsc` compile all workspace packages, (2) copy dist outputs into a flat `server-dist/` layout, (3) run `pnpm deploy --prod` or equivalent to produce a pruned `node_modules`, (4) include platform-specific native addons. The main process will spawn: `process.execPath server-dist/packages/server/dist/index.js` with `ELECTRON_RUN_AS_NODE=1` in the environment.

### D2: Playwright in packaged builds — exclude and degrade gracefully

**Decision:** Do NOT bundle Playwright browsers in the packaged app. The scraper already has an RSS-first strategy; Playwright is only used for SPA sources that need JS rendering. In packaged mode, SPA scraping will be unavailable and the app should show a clear message when a user tries to add a source that requires it.

**Alternatives considered:**
- **Bundle Chromium:** Adds ~150-200MB per platform. Unacceptable for distribution size.
- **Use system Chrome via `playwright.chromium.channel`:** Fragile, version-dependent, hard to support.

**Rationale:** Most news sources serve RSS or static HTML. Excluding Playwright keeps the installer size manageable (~150MB vs ~350MB). This can be revisited when a lightweight headless solution is viable.

### D3: Onboarding flow — stepper component in `App.tsx` gated by settings flag

**Decision:** Add an `onboardingComplete` boolean to the settings schema. On app mount, if `onboardingComplete` is falsy, render an `<OnboardingWizard>` component instead of the normal tab-based UI. The wizard is a 3-step flow: (1) Welcome, (2) Provider + API key, (3) Add first source. On completion, persist `onboardingComplete: true` via `settings.update` mutation and transition to the home view.

**Alternatives considered:**
- **Separate Electron window:** Adds IPC complexity for no UX benefit.
- **Settings page redirect:** Confusing — settings page is for editing, not onboarding.
- **Local storage flag:** Wouldn't survive app data reset; settings file is the canonical store.

**Rationale:** Gating on the settings flag means the onboarding state is portable with the settings file and can be re-triggered from Settings. The wizard reuses existing `ProvidersSection` form logic and the `sources.create` mutation, minimizing new code.

### D4: Auto-update — `electron-updater` with GitHub Releases

**Decision:** Use `electron-updater` with the `github` provider. The electron-builder publish config will point to the repository's GitHub Releases. On startup, the main process checks for updates and sends an IPC message to the renderer if one is available. The renderer shows a toast notification with "Update available — restart to install".

**Alternatives considered:**
- **Custom update server (S3/CDN):** More control but unnecessary complexity at this stage.
- **Squirrel.Windows:** Only for Windows; electron-updater is cross-platform.

**Rationale:** GitHub Releases is free, integrates with the existing CI workflow, and `electron-updater` handles differential downloads (blockmap) which are already being generated by electron-builder.

### D5: Code signing — environment-variable-gated, CI-only

**Decision:** Add macOS code signing and notarization configuration to `electron-builder.json5`. Signing is activated only when `CSC_LINK` and Apple ID environment variables are present. Local development builds remain unsigned. A new CI workflow (`release.yml`) will handle signed builds on tag push.

**Rationale:** Keeps the developer experience unchanged (no certs needed locally) while enabling signed releases in CI. The existing `ci.yml` continues to handle lint/test; `release.yml` handles build + sign + publish.

### D6: Error boundary — class component wrapping `<main>` content area

**Decision:** Add an `ErrorBoundary` React class component that wraps the `<main>` content in `App.tsx`. The fallback UI shows the error message and a "Reload" button that calls `window.location.reload()`. The header/navigation remains visible so the user can switch tabs.

**Rationale:** Class component is required (React error boundaries don't work with hooks). Wrapping only `<main>` keeps navigation accessible during errors. A full-page reload is the simplest recovery path.

### D7: App icons — placeholder set with build-time path configuration

**Decision:** Create icon assets in `apps/desktop/build/` directory: `icon.icns` (macOS), `icon.ico` (Windows), `icon.png` (Linux, 512x512). Reference them in `electron-builder.json5` via the `mac.icon`, `win.icon`, and `linux.icon` fields. Update `createWindow()` to use the correct icon path. Initially, generate a simple branded icon from the app name; the user can replace the files later.

**Rationale:** electron-builder looks for `build/icon.*` by convention. Keeping icons in a dedicated `build/` directory follows the ecosystem convention and keeps them out of the renderer's `public/` folder.

## Risks / Trade-offs

**Native addon compatibility across platforms** → The `better-sqlite3` and `@lancedb/lancedb` native addons must be compiled for each target platform's architecture. Mitigate by using `electron-rebuild` in the build script and testing installers on each platform in CI.

**Server bundle size** → The pruned `node_modules` may still be large (50-100MB) due to dependencies like `ai`, `cheerio`, `jsdom`. Mitigate by auditing dependencies and considering lighter alternatives in future iterations. Accept this for v1.

**Playwright exclusion limits functionality** → Users cannot add SPA-only sources in the packaged app. Mitigate by showing clear UI feedback when SPA scraping is attempted and documenting the limitation. This is acceptable since RSS covers the majority of news sources.

**GitHub Releases as update server** → Rate limits on GitHub API could affect large user bases. Mitigate by monitoring and switching to a CDN-backed solution if needed. Acceptable for initial release.

**No crash reporting** → Errors in the main process or server child process may go unnoticed. Mitigate with the error boundary in the renderer and logging server stderr to a file in `userData`. Full crash reporting (Sentry) is a non-goal for this change.

## Open Questions

- **License type:** What license should be used? (MIT, Apache 2.0, proprietary, etc.) This needs a decision from the project owner before the LICENSE file is created.
- **Icon design:** The spec requires custom icons but actual graphic design is outside this change's scope. Should we generate a simple text-based icon as a placeholder, or block on having final artwork?
- **Playwright in future:** Should we plan an optional "install Playwright browsers" button in settings for power users who want SPA scraping, or defer entirely?
