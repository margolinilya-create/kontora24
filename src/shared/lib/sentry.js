import * as Sentry from '@sentry/react'

export function initSentry() {
  if (import.meta.env.PROD) {
    Sentry.init({
      dsn: import.meta.env.VITE_SENTRY_DSN || '',
      environment: import.meta.env.MODE,
      tracesSampleRate: 0.1,
      replaysSessionSampleRate: 0,
      replaysOnErrorSampleRate: 0.1,
      beforeSend(event) {
        if (!import.meta.env.VITE_SENTRY_DSN) return null
        return event
      },
    })
  }
}

/**
 * Capture an error with enriched context (user role, current route).
 * Use instead of raw console.error in catch blocks.
 */
export function captureError(error, context = {}) {
  const enriched = {
    tags: {
      route: window.location.pathname,
      ...context.tags,
    },
    extra: context.extra,
  }
  if (error instanceof Error) {
    Sentry.captureException(error, enriched)
  } else {
    Sentry.captureMessage(String(error), { level: 'error', ...enriched })
  }
  if (import.meta.env.DEV) {
    console.error('[captureError]', error, context)
  }
}

export { Sentry }
