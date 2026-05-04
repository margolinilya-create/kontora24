import { initSentry, captureError } from '@/shared/lib/sentry'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/App'
import './styles/globals.css'

initSentry()

// Capture unhandled promise rejections
window.addEventListener('unhandledrejection', (event) => {
  captureError(event.reason || 'Unhandled promise rejection', {
    tags: { source: 'unhandledrejection' },
  })
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
)

// Register service worker for offline support + handle updates
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then((registration) => {
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing
        if (!newWorker) return
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'activated' && navigator.serviceWorker.controller) {
            // New version available — notify user
            const shouldRefresh = window.confirm('Доступна новая версия. Обновить?')
            if (shouldRefresh) window.location.reload()
          }
        })
      })
    }).catch(() => {})
  })
}
