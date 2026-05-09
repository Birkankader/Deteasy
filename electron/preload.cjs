// Preload — exposes the proxy port chosen by main process to the renderer.
// Renderer reads window.DETSIS_PROXY_BASE; api.js falls back to '/detsis'
// when undefined (browser dev mode via Vite).

const { contextBridge } = require('electron')

const portArg = process.argv.find((a) => a.startsWith('--detsis-proxy-port='))
const port = portArg ? portArg.split('=')[1] : ''
const base = port ? `http://127.0.0.1:${port}/detsis` : ''

contextBridge.exposeInMainWorld('DETSIS_PROXY_BASE', base)
