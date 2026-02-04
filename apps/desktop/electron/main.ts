import type { IpcMainInvokeEvent } from 'electron'
import { spawn, type ChildProcess } from 'node:child_process'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import net from 'node:net'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const require = createRequire(import.meta.url)
const { app, BrowserWindow, ipcMain } = require('electron')
const __dirname = path.dirname(fileURLToPath(import.meta.url))

// The built directory structure
//
// ├─┬─┬ dist
// │ │ └── index.html
// │ │
// │ ├─┬ dist-electron
// │ │ ├── main.js
// │ │ └── preload.mjs
// │
process.env.APP_ROOT = path.join(__dirname, '..')

// 🚧 Use ['ENV_NAME'] avoid vite:define plugin - Vite@2.x
export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST

let serverProcess: ChildProcess | null = null

const SERVER_HOST = process.env.DISPATCH_HOST ?? '127.0.0.1'
let serverPort = Number(process.env.DISPATCH_PORT ?? 3001)

function getServerUrl() {
  return `http://${SERVER_HOST}:${serverPort}`
}

function findWorkspaceRoot(startDir: string) {
  let current = startDir
  for (let i = 0; i < 6; i += 1) {
    if (
      fs.existsSync(path.join(current, 'pnpm-workspace.yaml')) ||
      fs.existsSync(path.join(current, 'turbo.json'))
    ) {
      return current
    }
    const parent = path.dirname(current)
    if (parent === current) break
    current = parent
  }
  return null
}

function getDevRoot() {
  return (
    findWorkspaceRoot(process.cwd()) ??
    findWorkspaceRoot(process.env.APP_ROOT ?? '') ??
    process.cwd()
  )
}

function getSettingsPath() {
  if (process.env.DISPATCH_SETTINGS_PATH) {
    return process.env.DISPATCH_SETTINGS_PATH
  }
  if (app.isPackaged) {
    return path.join(app.getPath('userData'), 'dispatch.settings.json')
  }
  return path.join(getDevRoot(), 'dispatch.settings.json')
}

function getDbPath() {
  if (process.env.DISPATCH_DB_PATH) {
    return process.env.DISPATCH_DB_PATH
  }
  if (app.isPackaged) {
    return path.join(app.getPath('userData'), 'dispatch.db')
  }
  return path.join(getDevRoot(), 'dispatch.dev.db')
}

async function waitForServer(timeoutMs = 10000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${getServerUrl()}/health`)
      if (res.ok) return
    } catch {
      // ignore
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error('Server did not become ready in time')
}

async function checkPortAvailable(port: number) {
  return new Promise<boolean>((resolve) => {
    const tester = net.createServer()
    tester.once('error', () => resolve(false))
    tester.once('listening', () => tester.close(() => resolve(true)))
    tester.listen(port, SERVER_HOST)
  })
}

async function checkServerHealthy(port: number) {
  try {
    const res = await fetch(`http://${SERVER_HOST}:${port}/health`)
    return res.ok
  } catch {
    return false
  }
}

async function waitForServerHealthy(port: number, timeoutMs: number) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (await checkServerHealthy(port)) {
      return true
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  return false
}

async function findHealthyServerInRange(start: number, end: number) {
  for (let port = start; port <= end; port += 1) {
    if (await checkServerHealthy(port)) {
      return port
    }
  }
  return null
}

async function resolveServerPort() {
  if (Number.isFinite(serverPort)) {
    if (await checkServerHealthy(serverPort)) {
      return { reuse: true }
    }
    if (!process.env.DISPATCH_PORT && VITE_DEV_SERVER_URL) {
      if (await waitForServerHealthy(serverPort, 1500)) {
        return { reuse: true }
      }
    }
    if (await checkPortAvailable(serverPort)) {
      process.env.DISPATCH_PORT = String(serverPort)
      return { reuse: false }
    }
    if (await waitForServerHealthy(serverPort, 1500)) {
      return { reuse: true }
    }
  }

  if (!process.env.DISPATCH_PORT) {
    const existing = await findHealthyServerInRange(3001, 3010)
    if (existing) {
      serverPort = existing
      return { reuse: true }
    }
    for (let port = 3001; port <= 3010; port += 1) {
      if (await checkPortAvailable(port)) {
        serverPort = port
        process.env.DISPATCH_PORT = String(serverPort)
        return { reuse: false }
      }
    }
  }

  const fallbackPort = 0
  const probe = net.createServer()
  await new Promise<void>((resolve) => probe.listen(fallbackPort, SERVER_HOST, resolve))
  const address = probe.address()
  probe.close()
  if (address && typeof address === 'object') {
    serverPort = address.port
    process.env.DISPATCH_PORT = String(serverPort)
  }
  return { reuse: false }
}

async function startServer() {
  if (serverProcess) return

  const { reuse } = await resolveServerPort()
  if (reuse) return

  const serverEnv = {
    ...process.env,
    PORT: String(serverPort),
    HOST: SERVER_HOST,
    DISPATCH_SETTINGS_PATH: getSettingsPath(),
    DISPATCH_DB_PATH: getDbPath()
  }

  if (VITE_DEV_SERVER_URL || process.env.DISPATCH_E2E === "1") {
    const cmd = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
    serverProcess = spawn(cmd, ['--filter', '@dispatch/server', 'dev'], {
      cwd: process.env.APP_ROOT,
      env: serverEnv,
      stdio: 'inherit'
    })
  } else {
    console.warn('Server bootstrap for packaged app is not configured yet.')
    return
  }

  const timeoutMs = Number(process.env.DISPATCH_SERVER_TIMEOUT_MS ?? 10000)
  await waitForServer(Number.isFinite(timeoutMs) ? timeoutMs : 10000)
}

function createWindow() {
  const window = new BrowserWindow({
    icon: path.join(process.env.VITE_PUBLIC, 'electron-vite.svg'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
    },
  })
  // Test active push message to Renderer-process.
  window.webContents.on('did-finish-load', () => {
    window.webContents.send('main-process-message', (new Date).toLocaleString())
  })

  if (VITE_DEV_SERVER_URL) {
    window.loadURL(VITE_DEV_SERVER_URL)
  } else {
    // win.loadFile('dist/index.html')
    window.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }
}

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

ipcMain.handle('dispatch:request', async (_event: IpcMainInvokeEvent, payload: { path: string; init?: RequestInit }) => {
  const url = new URL(payload.path, getServerUrl())
  const response = await fetch(url, payload.init)
  const body = await response.text()
  return {
    status: response.status,
    statusText: response.statusText,
    headers: Array.from(response.headers.entries()),
    body
  }
})

app.on('before-quit', () => {
  serverProcess?.kill()
  serverProcess = null
})

app.whenReady().then(async () => {
  await startServer()
  createWindow()
})
