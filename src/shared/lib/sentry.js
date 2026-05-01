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
        // Don't send if no DSN configured
        if (!import.meta.env.VITE_SENTRY_DSN) return null
        return event
      },
    })
  }
}

export { Sentry }
