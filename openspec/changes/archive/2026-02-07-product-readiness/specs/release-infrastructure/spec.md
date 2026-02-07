## ADDED Requirements

### Requirement: Semantic versioning scheme
The project SHALL use semantic versioning (major.minor.patch). The version MUST be maintained in `apps/desktop/package.json` and propagated to the Electron app's `productVersion` at build time.

#### Scenario: Version appears in built app
- **WHEN** the app is built and installed
- **THEN** the About dialog (or `app.getVersion()`) returns the version from `package.json`

#### Scenario: Version is bumped before release
- **WHEN** a developer prepares a release
- **THEN** the version in `apps/desktop/package.json` is updated and the root `package.json` version is kept in sync

### Requirement: LICENSE file
The repository SHALL include a LICENSE file at the project root. The license type MUST be clearly stated.

#### Scenario: LICENSE file exists
- **WHEN** a user or contributor clones the repository
- **THEN** a LICENSE file is present at the repository root

### Requirement: macOS code signing and notarization
The electron-builder configuration SHALL support macOS code signing and notarization when the appropriate environment variables are set (`CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`). Builds without these variables MUST still succeed (unsigned).

#### Scenario: Signed build with credentials
- **WHEN** the build runs in CI with code signing environment variables set
- **THEN** the DMG is signed and notarized, and macOS Gatekeeper allows the app to launch

#### Scenario: Unsigned build without credentials
- **WHEN** the build runs locally without code signing environment variables
- **THEN** the build completes successfully and produces an unsigned DMG

### Requirement: Auto-update support
The app SHALL use `electron-updater` to check for updates on startup and notify the user when an update is available. The update server endpoint MUST be configurable via the electron-builder publish configuration.

#### Scenario: Update available notification
- **WHEN** the app starts and a newer version is available on the configured update server
- **THEN** the user is notified that an update is available and can choose to download and install it

#### Scenario: No update available
- **WHEN** the app starts and it is already on the latest version
- **THEN** no update notification is shown and the app starts normally

#### Scenario: Update check fails gracefully
- **WHEN** the app starts and cannot reach the update server (offline or server error)
- **THEN** the app starts normally without showing an error to the user

### Requirement: Custom app icons
The Electron app SHALL use custom branded icons for all target platforms instead of the default electron-vite placeholder. Icon files MUST be provided in the correct formats: `.icns` for macOS, `.ico` for Windows, and `.png` (256x256 minimum) for Linux.

#### Scenario: macOS icon
- **WHEN** the macOS DMG is built
- **THEN** the app bundle uses the custom `.icns` icon in the dock and Finder

#### Scenario: Windows icon
- **WHEN** the Windows NSIS installer is built
- **THEN** the installed app uses the custom `.ico` icon in the taskbar and Start menu

#### Scenario: Linux icon
- **WHEN** the Linux AppImage is built
- **THEN** the app uses the custom `.png` icon in the desktop environment

### Requirement: React error boundary
The desktop app SHALL wrap the main content area in a React error boundary that catches rendering errors and displays a user-friendly fallback UI instead of a blank screen.

#### Scenario: Component crash shows fallback
- **WHEN** a React component throws an error during rendering
- **THEN** the error boundary catches it and displays a fallback message with a "Reload" button

#### Scenario: Error boundary does not interfere with normal rendering
- **WHEN** all components render successfully
- **THEN** the error boundary is invisible and the app renders normally
