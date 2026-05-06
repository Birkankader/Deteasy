import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const TARGET = 'https://yetkiliapi.detsis.gov.tr'
const ORIGIN = 'https://yetkili.detsis.gov.tr'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/detsis': {
        target: TARGET,
        changeOrigin: true,
        secure: true,
        timeout: 30_000,
        proxyTimeout: 30_000,
        rewrite: (p) => p.replace(/^\/detsis/, ''),
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            proxyReq.setHeader('Origin', ORIGIN)
            proxyReq.setHeader('Referer', ORIGIN + '/')
            proxyReq.setHeader('User-Agent',
              'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36')
            proxyReq.setHeader('Accept', 'application/json, text/plain, */*')
            proxyReq.setHeader('Accept-Language', 'tr-TR,tr;q=0.9,en;q=0.8')
          })
          proxy.on('error', (err, req, res) => {
            if (res && !res.headersSent) {
              res.writeHead(502, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ Message: `Proxy hatası: ${err.code || err.message}` }))
            }
          })
        }
      }
    }
  }
})
