// Electron main process. Boots a tiny HTTP proxy on a random localhost port
// that mirrors the Vite dev proxy, then loads the built React app from disk.
//
// The proxy injects gov-style Origin / Referer / User-Agent headers so the
// Detsis upstream returns 200 instead of 403. The renderer talks to
// http://127.0.0.1:<port>/detsis/...

const { app, BrowserWindow, shell } = require('electron')
const path = require('node:path')
const http = require('node:http')
const https = require('node:https')
const { URL } = require('node:url')

const UPSTREAM = 'https://yetkiliapi.detsis.gov.tr'
const ORIGIN = 'https://yetkili.detsis.gov.tr'
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

const isDev = process.env.ELECTRON_DEV === '1'

let proxyPort = 0
let mainWin = null

function startProxy() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      // CORS not strictly needed (same origin), but harmless.
      res.setHeader('Access-Control-Allow-Origin', '*')
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Accept')

      if (req.method === 'OPTIONS') {
        res.writeHead(204)
        res.end()
        return
      }

      // Only proxy /detsis/* paths.
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
      additionalArguments: [`--detsis-proxy-port=${proxyPort}`],
    },
  })

  // Open external links in default browser instead of new Electron window.
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
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
