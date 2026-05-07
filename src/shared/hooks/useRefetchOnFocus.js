import { useEffect, useRef } from 'react'

const REFETCH_THROTTLE_MS = 30_000

/**
 * Refetch when tab returns from background, window regains focus, or network reconnects.
 * Browsers throttle background tabs and Supabase Realtime websockets die there — events that
 * happened during sleep are lost. This hook closes that gap.
 *
 * Throttled: skips if last triggered fewer than 30s ago, so SPA navigation that refocuses
 * the window doesn't cause a fetch storm.
 */
export function useRefetchOnFocus(refetch) {
  const refetchRef = useRef(refetch)
  const lastTriggerRef = useRef(0)

  useEffect(() => { refetchRef.current = refetch }, [refetch])

  useEffect(() => {
    // Mount time = baseline for throttle window. Avoids calling Date.now() during render.
    lastTriggerRef.current = Date.now()

    function trigger() {
      const now = Date.now()
      if (now - lastTriggerRef.current < REFETCH_THROTTLE_MS) return
      lastTriggerRef.current = now
      refetchRef.current?.()
    }

    function onVisibilityChange() {
      if (document.visibilityState === 'visible') trigger()
    }

    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('online', trigger)
    window.addEventListener('focus', trigger)

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('online', trigger)
      window.removeEventListener('focus', trigger)
    }
  }, [])
}
