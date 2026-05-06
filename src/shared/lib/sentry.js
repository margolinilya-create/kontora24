let SentryModule = null

export async function initSentry() {
  if (import.meta.env.PROD && import.meta.env.VITE_SENTRY_DSN) {
    SentryModule = await import('@sentry/react')
    SentryModule.init({
      dsn: import.meta.env.VITE_SENTRY_DSN,
      environment: import.meta.env.MODE,
      tracesSampleRate: 0.1,
      replaysSessionSampleRate: 0,
      replaysOnErrorSampleRate: 0.1,
    })
  }
}

/**
 * Capture an error to Sentry with enriched context (route auto-tagged).
 * Use instead of raw console.error in catch blocks.
 *
 * @param {Error|string} error
 * @param {object} [context] - { tags, extra }
 * @returns {string|null} eventId for support reference, or null if Sentry
 *                        unavailable. In DEV returns synthetic 'dev-<ts>'.
 */
export function captureError(error, context = {}) {
  if (import.meta.env.DEV) {
    console.error('[captureError]', error, context)
    return `dev-${Date.now()}`
  }
  if (!SentryModule) return null

  const enriched = {
    tags: {
      route: window.location.pathname,
      ...context.tags,
    },
    extra: context.extra,
  }
  if (error instanceof Error) {
    return SentryModule.captureException(error, enriched)
  } else {
    return SentryModule.captureMessage(String(error), { level: 'error', ...enriched })
  }
}

/** Get Sentry module (may be null if not loaded) */
export function getSentry() {
  return SentryModule
}
