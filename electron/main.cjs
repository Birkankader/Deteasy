// Electron main process. Boots a tiny HTTP proxy on a random localhost port
// that mirrors the Vite dev proxy, then loads the built React app from disk.
//
// Uses electron-updater + GitHub Releases for automatic update download &
// install on Windows NSIS builds. The renderer drives the install UX via
// IPC messages.

const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron')
const path = require('node:path')
const http = require('node:http')
const https = require('node:https')
const { URL } = require('node:url')
const { autoUpdater } = require('electron-updater')

const UPSTREAM = 'https://yetkiliapi.detsis.gov.tr'
const ORIGIN = 'https://yetkili.detsis.gov.tr'
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

const UPDATE_INTERVAL_MS = 30 * 60 * 1000 // 30 minutes

const isDev = process.env.ELECTRON_DEV === '1'

let proxyPort = 0
let mainWin = null
let lastUpdateState = null // last payload pushed to renderer (for re-emits)

// ---- HTTP proxy --------------------------------------------------------------

function startProxy() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      res.setHeader('Access-Control-Allow-Origin', '*')
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Accept')

      if (req.method === 'OPTIONS') {
        res.writeHead(204)
        res.end()
        return
      }
      if (!req.url.startsWith('/detsis/')) {
        res.writeHead(404)
        res.end('Not found')
        return
      }
      const upstreamPath = req.url.replace(/^\/detsis/, '')
      const target = new URL(upstreamPath, UPSTREAM)
      const upReq = https.request(
        {
          method: req.method,
          host: target.hostname,
          path: target.pathname + target.search,
          headers: {
            Host: target.hostname,
            Origin: ORIGIN,
            Referer: ORIGIN + '/',
            'User-Agent': UA,
            Accept: 'application/json, text/plain, */*',
            'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.8',
          },
          timeout: 30_000,
        },
        (upRes) => {
          res.writeHead(upRes.statusCode || 502, upRes.headers)
          upRes.pipe(res)
        }
      )
      upReq.on('timeout', () => upReq.destroy(new Error('upstream timeout')))
      upReq.on('error', (err) => {
        if (!res.headersSent) {
          res.writeHead(502, { 'Content-Type': 'application/json' })
        }
        res.end(JSON.stringify({ Message: `Proxy hatası: ${err.code || err.message}` }))
      })
      req.pipe(upReq)
    })

    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      proxyPort = server.address().port
      console.log('[proxy] listening on 127.0.0.1:' + proxyPort)
      resolve(proxyPort)
    })
  })
}

// ---- Auto-updater ------------------------------------------------------------

function sendUpdate(channel, payload) {
  lastUpdateState = { channel, payload }
  if (mainWin && !mainWin.isDestroyed()) {
    mainWin.webContents.send(channel, payload || {})
  }
}

function configureUpdater() {
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.allowPrerelease = false
  autoUpdater.allowDowngrade = false

  autoUpdater.on('checking-for-update', () => sendUpdate('update:checking', {}))

  autoUpdater.on('update-available', (info) =>
    sendUpdate('update:available', {
      version: info.version,
      releaseDate: info.releaseDate,
      releaseNotes:
        typeof info.releaseNotes === 'string'
          ? info.releaseNotes
          : Array.isArray(info.releaseNotes)
          ? info.releaseNotes.map((n) => n.note || '').join('\n\n')
          : '',
      currentVersion: app.getVersion(),
    })
  )

  autoUpdater.on('update-not-available', (info) =>
    sendUpdate('update:not-available', {
      version: info?.version,
      currentVersion: app.getVersion(),
    })
  )

  autoUpdater.on('download-progress', (p) =>
    sendUpdate('update:download-progress', {
      percent: p.percent,
      transferred: p.transferred,
      total: p.total,
      bytesPerSecond: p.bytesPerSecond,
    })
  )

  autoUpdater.on('update-downloaded', (info) =>
    sendUpdate('update:downloaded', {
      version: info.version,
      currentVersion: app.getVersion(),
    })
  )

  autoUpdater.on('error', (err) =>
    sendUpdate('update:error', { message: err?.message || String(err) })
  )
}

function isPortable() {
  return Boolean(process.env.PORTABLE_EXECUTABLE_DIR || process.env.PORTABLE_EXECUTABLE_FILE)
}

function canAutoUpdate() {
  if (isDev) return false
  if (!app.isPackaged) return false
  if (isPortable()) return false
  return true
}

async function checkForUpdates(userTriggered = false) {
  if (!canAutoUpdate()) {
    if (userTriggered) {
      sendUpdate('update:unsupported', {
        reason: isPortable()
          ? 'Portable çalışıyor — auto-update için NSIS kurulum sürümü gerekli.'
          : 'Dev ortamı, güncelleme devre dışı.',
      })
    }
    return
  }
  try {
    await autoUpdater.checkForUpdates()
  } catch (err) {
    sendUpdate('update:error', { message: err?.message || String(err) })
  }
}

// ---- App lifecycle -----------------------------------------------------------

async function createWindow() {
  await startProxy()

  mainWin = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0f172a',
    title: 'Detseasy',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.cjs'),
      additionalArguments: [
        `--detsis-proxy-port=${proxyPort}`,
        `--detseasy-version=${app.getVersion()}`,
        `--detseasy-can-auto-update=${canAutoUpdate() ? '1' : '0'}`,
      ],
    },
  })

  mainWin.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (isDev) {
    await mainWin.loadURL('http://localhost:5173')
    mainWin.webContents.openDevTools({ mode: 'detach' })
  } else {
    await mainWin.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }

  // Re-emit cached state on reload so the banner survives renderer reloads.
  mainWin.webContents.on('did-finish-load', () => {
    if (lastUpdateState) {
      mainWin.webContents.send(lastUpdateState.channel, lastUpdateState.payload)
    }
  })

  // Initial + periodic checks (only when auto-update is supported).
  if (canAutoUpdate()) {
    setTimeout(() => checkForUpdates(false), 4_000)
    setInterval(() => checkForUpdates(false), UPDATE_INTERVAL_MS)
  }
}

// IPC: manual check, quit-and-install, open external (release page).
ipcMain.handle('update:check', () => checkForUpdates(true))
ipcMain.handle('update:install', () => {
  if (!canAutoUpdate()) return false
  // Silent install: NSIS runs with /S, no wizard window. App quits then
  // installer restarts the new binary. isForceRunAfter=true ensures relaunch.
  setImmediate(() => autoUpdater.quitAndInstall(true, true))
  return true
})
ipcMain.handle('update:open', (_evt, url) => {
  if (typeof url === 'string') shell.openExternal(url)
})

app.whenReady().then(() => {
  configureUpdater()
  createWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
