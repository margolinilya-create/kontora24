import { captureError } from '@/shared/lib/sentry'
import { toast } from '@/shared/stores/toast-store'
import { translateError } from './error-translator'

/**
 * Wrap an async operation: catches throws, sends to Sentry, optionally
 * shows toast and calls onError. Never throws.
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
