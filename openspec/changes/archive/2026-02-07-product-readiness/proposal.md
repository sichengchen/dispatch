## Why

Dispatch works well in development but cannot ship as a standalone desktop app. The Electron main process has a placeholder for packaged-mode server startup ("Server bootstrap for packaged app is not configured yet"), there's no first-run experience to guide users through API key and source setup, and release infrastructure (versioning, license, code signing) is missing. These gaps must be closed before distributing the app to users.

## What Changes

- Bundle `@dispatch/server` into the packaged Electron app so it runs standalone without pnpm or a monorepo checkout
- Add a first-run onboarding flow that walks new users through provider/API key configuration and adding their first source
- Add release infrastructure: LICENSE file, version bumping strategy, code signing/notarization config for macOS, and auto-update support
- Add custom app icons and branding assets to replace the default electron-vite placeholder logos
- Add React error boundaries so the app shows user-friendly error states instead of blank screens

## Capabilities

### New Capabilities
- `standalone-packaging`: Bundle the server as a standalone Node.js process within the Electron app, configure production resource paths (DB, settings, vectors), and ensure the DMG/NSIS/AppImage installers produce fully self-contained apps
- `first-run-onboarding`: Welcome screen and setup wizard shown on first launch — guides users through API key entry, provider selection, and adding an initial news source
- `release-infrastructure`: Versioning scheme, LICENSE file, macOS code signing and notarization config, auto-update via `electron-updater`, and CHANGELOG generation

### Modified Capabilities
_(none — these are all new capabilities layered on top of existing functionality)_

## Impact

- **`apps/desktop/electron/main.ts`**: Major changes to server startup logic for packaged mode; new IPC for onboarding state
- **`apps/desktop/electron-builder.json5`**: Extra files config for bundled server, code signing env vars, auto-update publisher config
- **`apps/desktop/src/components/`**: New onboarding components, error boundary wrapper
- **`apps/desktop/src/App.tsx`**: Conditional routing for first-run vs normal mode
- **`apps/desktop/package.json`**: New dependencies (`electron-updater`), build scripts for server bundling
- **`package.json` (root)**: Version management, possible `release` script
- **New files**: LICENSE, CHANGELOG.md, app icon assets (`.icns`, `.ico`, `.png`)
- **CI/CD** (`.github/workflows/`): Potential additions for signed release builds
