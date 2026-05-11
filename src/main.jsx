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

// Service worker отключён 2026-05-12.
// История: SW делал cache-first для /assets/*.js и не апдейтил сам себя при
// чанк-хеш-смене → после каждого деплоя пользователи зависали на stale-чанках
// с «Приложение обновилось». Для 6 человек в цеху на wifi оффлайн-режим
// PWA того не стоит. Сейчас: пассивно унрегистрируем любой существующий SW
// и чистим все кэши — на следующей загрузке всё будет приходить с CDN.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    registrations.forEach((r) => r.unregister())
  }).catch(() => {})
  if ('caches' in window) {
    caches.keys().then((keys) => keys.forEach((k) => caches.delete(k))).catch(() => {})
  }
}
