import { useEffect, useState } from 'react'

const DISMISS_KEY = 'detseasy:dismissedVersion'

// Banner state machine:
//   idle        -> initial / current
//   checking    -> checkForUpdates() in flight
//   available   -> server has newer version, download starting
//   downloading -> progress events streaming
//   downloaded  -> ready to install
//   error       -> error toast
//   unsupported -> portable / dev: cannot auto-update
export default function UpdateBanner() {
  const [state, setState] = useState('idle')
  const [info, setInfo] = useState(null)
  const [progress, setProgress] = useState(null)
  const [error, setError] = useState(null)
  const [toast, setToast] = useState(null)
  const [busy, setBusy] = useState(false)

  const u = typeof window !== 'undefined' ? window.DETSEASY?.updater : null
  const version = typeof window !== 'undefined' ? window.DETSEASY?.version : ''
  const canAutoUpdate =
    typeof window !== 'undefined' ? !!window.DETSEASY?.canAutoUpdate : false

  useEffect(() => {
    if (!u) return
    const offs = [
      u.onChecking(() => setState('checking')),
      u.onAvailable((p) => {
        const dismissed = (() => {
          try { return localStorage.getItem(DISMISS_KEY) } catch { return null }
        })()
        if (dismissed && dismissed === p.version) {
          // user said 'later' for this version; stay silent unless they manually check
          return
        }
        setInfo(p)
        setProgress(null)
        setState('available')
      }),
      u.onProgress((p) => {
        setProgress(p)
        setState('downloading')
      }),
      u.onDownloaded((p) => {
        setInfo((prev) => ({ ...(prev || {}), ...p }))
        setState('downloaded')
      }),
      u.onNotAvailable((p) => {
        // Only show 'up to date' toast for manual checks (state was 'checking').
        setState((s) => {
          if (s === 'checking') setToast({ type: 'ok', text: 'Güncel sürümdesiniz.' })
          return 'idle'
        })
      }),
      u.onError((e) => {
        setError(e?.message || 'Bilinmeyen hata')
        setState('error')
        setToast({ type: 'err', text: 'Güncelleme hatası: ' + (e?.message || '') })
      }),
      u.onUnsupported((e) => {
        setState('unsupported')
        setToast({ type: 'err', text: e?.reason || 'Auto-update bu kurulumda desteklenmiyor.' })
      }),
    ]
    return () => offs.forEach((off) => off && off())
  }, [])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(t)
  }, [toast])

  function dismiss() {
    if (info?.version) {
      try { localStorage.setItem(DISMISS_KEY, info.version) } catch {}
    }
    setInfo(null)
    setState('idle')
  }

  async function manualCheck() {
    if (!u) return
    setBusy(true)
    try {
      await u.check()
    } finally {
      setBusy(false)
    }
  }

  async function installNow() {
    if (!u) return
    setBusy(true)
    await u.install()
    // App will quit & restart; no further state to handle.
  }

  const visible =
    (state === 'available' || state === 'downloading' || state === 'downloaded') && info

  return (
    <>
      {visible && (
        <div className={'update-banner state-' + state} role="status">
          <div className="ub-left">
            <span className="ub-emoji">
              {state === 'downloaded' ? '✅' : state === 'downloading' ? '⬇️' : '⬆️'}
            </span>
            <div>
              <div className="ub-title">
                {state === 'downloaded' ? (
                  <>
                    Yeni sürüm <strong>v{info.version}</strong> indirildi · yüklemek için
                    yeniden başlat
                  </>
                ) : state === 'downloading' ? (
                  <>
                    Yeni sürüm <strong>v{info.version}</strong> indiriliyor
                    {progress ? ` · %${progress.percent.toFixed(0)}` : '…'}
                  </>
                ) : (
                  <>
                    Yeni sürüm <strong>v{info.version}</strong> bulundu · indirme başladı
                  </>
                )}
                <span className="ub-cur"> (şu an v{info.currentVersion || version})</span>
              </div>

              {state === 'downloading' && progress && (
                <div className="ub-progress">
                  <div className="ub-bar" style={{ width: `${progress.percent.toFixed(1)}%` }} />
                  <span>
                    {fmtBytes(progress.transferred)} / {fmtBytes(progress.total)} ·{' '}
                    {fmtBytes(progress.bytesPerSecond)}/s
                  </span>
                </div>
              )}
            </div>
          </div>
          <div className="ub-right">
            {state === 'downloaded' && (
              <button
                type="button"
                className="ub-primary"
                onClick={installNow}
                disabled={busy}
              >
                {busy ? 'Başlatılıyor…' : 'Yükle ve yeniden başlat'}
              </button>
            )}
            {(state === 'available' || state === 'downloading') && (
              <button type="button" className="ub-ghost" disabled>
                {state === 'available' ? 'İndirme hazırlanıyor…' : 'İndiriliyor'}
              </button>
            )}
            <button type="button" className="ub-ghost" onClick={dismiss}>
              Sonra
            </button>
          </div>
        </div>
      )}

      {toast && <div className={'update-toast ' + toast.type}>{toast.text}</div>}

      <button
        type="button"
        className="update-fab"
        onClick={manualCheck}
        title={
          (canAutoUpdate
            ? 'Otomatik güncelleme aktif'
            : 'Bu kurulumda otomatik güncelleme yok') +
          ` · v${version || '?'} · Şimdi kontrol et`
        }
        disabled={busy || state === 'checking' || state === 'downloading'}
      >
        v{version || '0.0.0'}
        {!canAutoUpdate && <span className="dot warn" />}
        {state === 'checking' && <span className="dot pulse" />}
      </button>
    </>
  )
}

function fmtBytes(n) {
  if (!n || !isFinite(n)) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let i = 0
  let v = n
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(v >= 100 ? 0 : 1)} ${units[i]}`
}
