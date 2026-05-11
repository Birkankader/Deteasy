// Preload — exposes proxy port + updater bridge to the renderer.

const { contextBridge, ipcRenderer } = require('electron')

const portArg = process.argv.find((a) => a.startsWith('--detsis-proxy-port='))
const port = portArg ? portArg.split('=')[1] : ''
const base = port ? `http://127.0.0.1:${port}/detsis` : ''

const versionArg = process.argv.find((a) => a.startsWith('--deteasy-version='))
const version = versionArg ? versionArg.split('=')[1] : ''

contextBridge.exposeInMainWorld('DETSIS_PROXY_BASE', base)
contextBridge.exposeInMainWorld('DETEASY', {
  version,
  updater: {
    onAvailable: (cb) => {
      const handler = (_e, payload) => cb(payload)
      ipcRenderer.on('update:available', handler)
      return () => ipcRenderer.removeListener('update:available', handler)
    },
    onNone: (cb) => {
      const handler = (_e, payload) => cb(payload)
      ipcRenderer.on('update:none', handler)
      return () => ipcRenderer.removeListener('update:none', handler)
    },
    onError: (cb) => {
      const handler = (_e, payload) => cb(payload)
      ipcRenderer.on('update:error', handler)
      return () => ipcRenderer.removeListener('update:error', handler)
    },
    check: () => ipcRenderer.invoke('update:check'),
    openUrl: (url) => ipcRenderer.invoke('update:open', url),
  },
})
