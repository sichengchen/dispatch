## ADDED Requirements

### Requirement: Packaged app bundles server as standalone process
The Electron app SHALL include a pre-built copy of `@dispatch/server` and its dependencies so that the packaged installer (DMG, NSIS, AppImage) runs without requiring pnpm, Node.js, or a monorepo checkout on the user's machine.

#### Scenario: macOS DMG launches successfully on a clean machine
- **WHEN** a user installs the DMG on a Mac that has no developer tools installed
- **THEN** the app starts, the embedded server process becomes healthy, and the renderer connects to it

#### Scenario: Windows NSIS installer launches successfully
- **WHEN** a user runs the NSIS installer and opens Dispatch on Windows
- **THEN** the app starts and the embedded server is reachable at the configured port

#### Scenario: Linux AppImage launches successfully
- **WHEN** a user runs the AppImage on a Linux desktop
- **THEN** the app starts and the embedded server is reachable at the configured port

### Requirement: Electron main process starts bundled server in packaged mode
The `startServer()` function in `electron/main.ts` SHALL detect `app.isPackaged === true` and spawn the bundled server entry point instead of running `pnpm --filter @dispatch/server dev`. The bundled server MUST receive the same environment variables (PORT, HOST, DISPATCH_SETTINGS_PATH, DISPATCH_DB_PATH) as the dev-mode spawn.

#### Scenario: Packaged mode spawns bundled server
- **WHEN** `app.isPackaged` is `true` and no existing healthy server is found
- **THEN** the main process spawns the bundled server entry point with correct env vars and waits for the `/health` endpoint to return 200

#### Scenario: Dev mode is unchanged
- **WHEN** `VITE_DEV_SERVER_URL` is set (dev mode)
- **THEN** the existing `pnpm --filter @dispatch/server dev` spawn path is used unchanged

### Requirement: Production resource paths resolve to user data directory
In packaged mode, the database, settings file, and vector store SHALL be stored under `app.getPath('userData')` so data persists across app updates and the app does not write to its own installation directory.

#### Scenario: Database path in packaged mode
- **WHEN** the app is packaged and no `DISPATCH_DB_PATH` env override is set
- **THEN** the database file is created at `<userData>/dispatch.db`

#### Scenario: Settings path in packaged mode
- **WHEN** the app is packaged and no `DISPATCH_SETTINGS_PATH` env override is set
- **THEN** the settings file is created at `<userData>/dispatch.settings.json`

#### Scenario: Vector store path in packaged mode
- **WHEN** the app is packaged and no `DISPATCH_VECTOR_PATH` env override is set
- **THEN** the vector store directory is created at `<userData>/dispatch.vectors`

### Requirement: Build script produces server bundle
A build script SHALL compile `@dispatch/server` and its workspace dependencies (`@dispatch/db`, `@dispatch/lib`) into a self-contained bundle that can be included in the Electron app's `extraResources`. The bundle MUST include all npm dependencies and native addons required at runtime.

#### Scenario: Server bundle build succeeds
- **WHEN** the developer runs the server bundle build script
- **THEN** a directory or archive is produced containing the server entry point and all runtime dependencies

#### Scenario: electron-builder includes server bundle
- **WHEN** `electron-builder` runs to produce a platform installer
- **THEN** the server bundle is included in the app's `extraResources` and is accessible at runtime via `process.resourcesPath`

### Requirement: Graceful server shutdown on app quit
The main process SHALL send a termination signal to the server child process when the app quits and wait briefly for cleanup before force-killing.

#### Scenario: Clean shutdown
- **WHEN** the user quits the app
- **THEN** the server child process receives SIGTERM and the main process waits up to 5 seconds before force-killing
