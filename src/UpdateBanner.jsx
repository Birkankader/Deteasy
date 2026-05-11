import { useEffect, useState } from 'react'

const DISMISS_KEY = 'deteasy:dismissedVersion'

export default function UpdateBanner() {
  const [info, setInfo] = useState(null)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState(null)

  useEffect(() => {
    const u = typeof window !== 'undefined' ? window.DETEASY?.updater : null
    if (!u) return
    const offA = u.onAvailable((payload) => {
      const dismissed = (() => {
        try { return localStorage.getItem(DISMISS_KEY) } catch { return null }
      })()
      if (dismissed && dismissed === payload.latestVersion) return
      setInfo(payload)
    })
    const offN = u.onNone(() => setToast({ type: 'ok', text: 'Güncel sürümdesiniz.' }))
    const offE = u.onError((e) =>
      setToast({ type: 'err', text: 'Güncelleme kontrolü başarısız: ' + (e?.message || '') })
    )
    return () => {
      offA?.()
      offN?.()
      offE?.()
    }
  }, [])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3500)
    return () => clearTimeout(t)
  }, [toast])

  function dismiss() {
    if (info?.latestVersion) {
      try { localStorage.setItem(DISMISS_KEY, info.latestVersion) } catch {}
    }
    setInfo(null)
  }

  async function download() {
    if (!info) return
    setBusy(true)
    try {
      const url = info.assetUrl || info.releaseUrl
      await window.DETEASY?.updater?.openUrl(url)
    } finally {
      setBusy(false)
    }
  }

  async function manualCheck() {
    const u = window.DETEASY?.updater
    if (!u) return
    setBusy(true)
    try {
      await u.check()
    } finally {
      setBusy(false)
    }
  }

  // Always render the corner "check" button so users have a way to poll
  // manually; the full banner only appears when an update is found.
  return (
    <>
      {info && (
        <div className="update-banner" role="status">
          <div className="ub-left">
            <span className="ub-emoji">⬆️</span>
            <div>
              <div className="ub-title">
                Yeni sürüm <strong>v{info.latestVersion}</strong> mevcut
                <span className="ub-cur"> (şu an v{info.currentVersion})</span>
              </div>
              {info.assetName && (
                <div className="ub-meta">
                  {info.assetName}
                  {info.publishedAt && (
                    <> · {new Date(info.publishedAt).toLocaleDateString('tr-TR')}</>
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="ub-right">
            <button
              type="button"
              className="ub-primary"
              onClick={download}
              disabled={busy}
            >
              {busy ? 'Açılıyor…' : 'İndir / Güncelle'}
            </button>
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
        title={`Sürüm v${window.DETEASY?.version || '?'} · Güncelleme kontrolü`}
        disabled={busy}
      >
        v{window.DETEASY?.version || '0.0.0'}
      </button>
    </>
  )
}
