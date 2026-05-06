import { captureError } from '@/shared/lib/sentry'
import { toast } from '@/shared/stores/toast-store'
import { translateError } from './error-translator'

/**
 * Wrapper around try/catch that:
 * - sends errors to Sentry via captureError
 * - optionally shows toast (via translateError)
 * - calls onError callback
 * - returns { data, error } instead of throwing
 *
 * USE WHEN: writing custom action handlers outside data-fetching hooks
 * where you need all three (Sentry + toast + recovery callback) in one call.
 *
 * DON'T USE WHEN:
 * - Inside data-fetching hooks (useXxx) — use try/catch + setError(err) instead,
 *   error propagates to UI via ErrorState
 * - For non-critical RPCs — use safeRpc helper (no toast, log-only)
 * - For simple toast-on-catch — use direct translateError(err).message in catch
 *
 * @template T
 * @param {() => Promise<T> | T} fn
 * @param {Object} [options]
 * @param {boolean} [options.showToast=false]
 * @param {(err: unknown) => void} [options.onError]
 * @param {{ tags?: Record<string,string>, extra?: any }} [options.context]
 * @returns {Promise<{ data: T | null, error: unknown | null }>}
 */
export async function safeAsync(fn, options = {}) {
  try {
    const data = await fn()
    return { data, error: null }
  } catch (err) {
    captureError(err, options.context || {})

    if (options.showToast) {
      toast.error(translateError(err).message)
    }

    if (typeof options.onError === 'function') {
      try {
        options.onError(err)
      } catch (cbErr) {
        captureError(cbErr, { tags: { source: 'safeAsync.onError' } })
      }
    }

    return { data: null, error: err }
  }
}
