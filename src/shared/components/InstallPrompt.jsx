import { useState, useEffect } from 'react'

/**
 * PWA Install prompt — shows a dismissable banner when the browser
 * supports "Add to Home Screen". Dismissed state persists in localStorage.
 */
export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [dismissed, setDismissed] = useState(() => localStorage.getItem('pwa-install-dismissed') === '1')

  useEffect(() => {
    function handler(e) {
      e.preventDefault()
      setDeferredPrompt(e)
    }
    function installed() { setDeferredPrompt(null) }
    window.addEventListener('beforeinstallprompt', handler)
    window.addEventListener('appinstalled', installed)
    return () => {
      window.removeEventListener('beforeinstallprompt', handler)
      window.removeEventListener('appinstalled', installed)
    }
  }, [])

  if (!deferredPrompt || dismissed) return null

  async function handleInstall() {
    deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') setDeferredPrompt(null)
  }

  function handleDismiss() {
    setDismissed(true)
    localStorage.setItem('pwa-install-dismissed', '1')
  }

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 bg-sidebar text-white rounded-xl p-4 shadow-xl flex items-center justify-between gap-3 sm:left-auto sm:right-4 sm:max-w-sm safe-area-bottom">
      <div className="min-w-0">
        <p className="font-medium text-sm">Установить приложение</p>
        <p className="text-xs text-white/70 mt-0.5">Быстрый доступ с рабочего стола</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={handleDismiss}
          className="text-xs text-white/60 hover:text-white px-2 py-1.5 min-h-[44px] flex items-center"
        >
          Позже
        </button>
        <button
          onClick={handleInstall}
          className="bg-accent hover:bg-accent-hover text-on-accent text-sm font-medium px-4 py-2 rounded-lg min-h-[44px]"
        >
          Установить
        </button>
      </div>
    </div>
  )
}
