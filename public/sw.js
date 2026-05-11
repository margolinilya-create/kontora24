// Kill-switch: версия от 2026-05-12 заменяет старый кэширующий SW.
//
// Что было: старый SW делал cache-first для /assets/*.js и не апдейтился
// при смене хешей. После каждого деплоя клиенты висли на stale-чанках.
//
// Что сейчас: при install/activate этот SW чистит все кэши, дерегистрирует
// себя и перезагружает открытые вкладки. Браузер при следующем visit /sw.js
// увидит другие байты, скачает этот файл, активирует — и связки SW не станет.
//
// main.jsx больше не вызывает register(), так что новые посетители вообще
// без SW. Этот файл остаётся для добивки клиентов со старым кэшированным SW.

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    try {
      const keys = await caches.keys()
      await Promise.all(keys.map((k) => caches.delete(k)))
      await self.registration.unregister()
      const clients = await self.clients.matchAll({ type: 'window' })
      for (const client of clients) {
        try { client.navigate(client.url) } catch (_) {}
      }
    } catch (_) {
      // best-effort, не критично
    }
  })())
})

// Fetch passthrough — на случай если активен между install и activate,
// чтобы не интерфирить с загрузкой ресурсов.
self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request).catch(() => new Response('', { status: 503 })))
})
