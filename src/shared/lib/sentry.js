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
 * Capture an error with enriched context (user role, current route).
 * Use instead of raw console.error in catch blocks.
 */
export function captureError(error, context = {}) {
  if (import.meta.env.DEV) {
    console.error('[captureError]', error, context)
    return
  }
  if (!SentryModule) return

  const enriched = {
    tags: {
      route: window.location.pathname,
      ...context.tags,
    },
    extra: context.extra,
  }
  if (error instanceof Error) {
    SentryModule.captureException(error, enriched)
  } else {
    SentryModule.captureMessage(String(error), { level: 'error', ...enriched })
  }
}

/** Get Sentry module (may be null if not loaded) */
export function getSentry() {
  return SentryModule
}
