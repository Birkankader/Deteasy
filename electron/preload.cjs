// Preload — exposes proxy port + updater bridge to the renderer.

const { contextBridge, ipcRenderer } = require('electron')

function readArg(flag) {
  const a = process.argv.find((x) => x.startsWith(flag + '='))
  return a ? a.split('=')[1] : ''
}

const port = readArg('--detsis-proxy-port')
const version = readArg('--detseasy-version')
const canAutoUpdate = readArg('--detseasy-can-auto-update') === '1'

const base = port ? `http://127.0.0.1:${port}/detsis` : ''

function listen(channel, cb) {
  const handler = (_e, payload) => cb(payload)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

contextBridge.exposeInMainWorld('DETSIS_PROXY_BASE', base)
contextBridge.exposeInMainWorld('DETSEASY', {
  version,
  canAutoUpdate,
  updater: {
    onChecking: (cb) => listen('update:checking', cb),
    onAvailable: (cb) => listen('update:available', cb),
    onNotAvailable: (cb) => listen('update:not-available', cb),
    onProgress: (cb) => listen('update:download-progress', cb),
    onDownloaded: (cb) => listen('update:downloaded', cb),
    onError: (cb) => listen('update:error', cb),
    onUnsupported: (cb) => listen('update:unsupported', cb),
    check: () => ipcRenderer.invoke('update:check'),
    install: () => ipcRenderer.invoke('update:install'),
    openUrl: (url) => ipcRenderer.invoke('update:open', url),
  },
})
