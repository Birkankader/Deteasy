// Electron main process. Boots a tiny HTTP proxy on a random localhost port
// that mirrors the Vite dev proxy, then loads the built React app from disk.
//
// Also polls GitHub releases for app updates and notifies the renderer.

const { app, BrowserWindow, ipcMain, shell } = require('electron')
const path = require('node:path')
const http = require('node:http')
const https = require('node:https')
const { URL } = require('node:url')

const UPSTREAM = 'https://yetkiliapi.detsis.gov.tr'
const ORIGIN = 'https://yetkili.detsis.gov.tr'
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

const UPDATE_REPO = { owner: 'Birkankader', repo: 'Deteasy' }
const UPDATE_INTERVAL_MS = 30 * 60 * 1000 // 30 minutes

const isDev = process.env.ELECTRON_DEV === '1'

let proxyPort = 0
let mainWin = null
let latestUpdateInfo = null

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
      upReq.on('timeout', () => {
        upReq.destroy(new Error('upstream timeout'))
      })
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

// --- Update check (GitHub releases) -----------------------------------------

function compareVersions(a, b) {
  const pa = String(a).split(/[.-]/).map((p) => parseInt(p, 10) || 0)
  const pb = String(b).split(/[.-]/).map((p) => parseInt(p, 10) || 0)
  const len = Math.max(pa.length, pb.length)
  for (let i = 0; i < len; i++) {
    const da = pa[i] || 0
    const db = pb[i] || 0
    if (da > db) return 1
    if (da < db) return -1
  }
  return 0
}

function pickWinAsset(assets) {
  if (!Array.isArray(assets)) return null
  // Prefer portable; fall back to installer.
  const portable = assets.find(
    (a) => /\.exe$/i.test(a.name) && !/setup/i.test(a.name) && !/blockmap/i.test(a.name)
  )
  if (portable) return portable
  const installer = assets.find((a) => /Setup.*\.exe$/i.test(a.name))
  if (installer) return installer
  return assets.find((a) => /\.(exe|zip|dmg|AppImage|deb)$/i.test(a.name))
}

function fetchLatestRelease() {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        host: 'api.github.com',
        path: `/repos/${UPDATE_REPO.owner}/${UPDATE_REPO.repo}/releases/latest`,
        method: 'GET',
        headers: {
          'User-Agent': 'Deteasy-Updater',
          Accept: 'application/vnd.github+json',
        },
        timeout: 10_000,
      },
      (res) => {
        let body = ''
        res.on('data', (c) => (body += c))
        res.on('end', () => {
          if (res.statusCode !== 200) {
            return reject(new Error(`GitHub HTTP ${res.statusCode}`))
          }
          try {
            resolve(JSON.parse(body))
          } catch (e) {
            reject(e)
          }
        })
      }
    )
    req.on('timeout', () => req.destroy(new Error('GitHub timeout')))
    req.on('error', reject)
    req.end()
  })
}

async function checkForUpdates(triggeredByUser = false) {
  try {
    const release = await fetchLatestRelease()
    const latest = (release.tag_name || '').replace(/^v/, '').trim()
    const current = app.getVersion()
    if (!latest) return null

    const newer = compareVersions(latest, current) > 0
    if (!newer) {
      if (triggeredByUser && mainWin) {
        mainWin.webContents.send('update:none', { currentVersion: current })
      }
      return null
    }

    const asset = pickWinAsset(release.assets)
    latestUpdateInfo = {
      currentVersion: current,
      latestVersion: latest,
      releaseUrl: release.html_url,
      assetUrl: asset?.browser_download_url || release.html_url,
      assetName: asset?.name || null,
      releaseNotes: release.body || '',
      publishedAt: release.published_at,
    }
    if (mainWin) mainWin.webContents.send('update:available', latestUpdateInfo)
    return latestUpdateInfo
  } catch (e) {
    console.error('[update] check failed:', e.message)
    if (triggeredByUser && mainWin) {
      mainWin.webContents.send('update:error', { message: e.message })
    }
    return null
  }
}

// --- App lifecycle ----------------------------------------------------------

async function createWindow() {
  await startProxy()

  mainWin = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0f172a',
    title: 'Deteasy',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.cjs'),
      additionalArguments: [
        `--detsis-proxy-port=${proxyPort}`,
        `--deteasy-version=${app.getVersion()}`,
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

  // Re-send the cached update info to the renderer once it's ready (e.g. after
  // a reload), then run a fresh check.
  mainWin.webContents.on('did-finish-load', () => {
    if (latestUpdateInfo) {
      mainWin.webContents.send('update:available', latestUpdateInfo)
    }
  })

  // Initial check + periodic polling.
  setTimeout(() => checkForUpdates(false), 4_000)
  setInterval(() => checkForUpdates(false), UPDATE_INTERVAL_MS)
}

ipcMain.handle('update:check', () => checkForUpdates(true))
ipcMain.handle('update:open', (_evt, url) => {
  if (typeof url === 'string') shell.openExternal(url)
})

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
