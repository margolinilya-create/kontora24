const CACHE_VERSION = 'v2'
const STATIC_CACHE = `kontora24-static-${CACHE_VERSION}`
const DYNAMIC_CACHE = `kontora24-dynamic-${CACHE_VERSION}`

// App shell — pre-cached on install
const APP_SHELL = [
  '/',
  '/manifest.json',
  '/offline.html',
  '/favicon.svg',
]

// Install: pre-cache app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(APP_SHELL))
  )
  self.skipWaiting()
})

// Activate: clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== STATIC_CACHE && k !== DYNAMIC_CACHE)
          .map((k) => caches.delete(k))
      )
    )
  )
  self.clients.claim()
})

// Fetch: strategy per resource type
self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Skip non-GET and cross-origin API calls (Supabase)
  if (request.method !== 'GET') return
  if (url.hostname.includes('supabase')) return

  // Strategy: Cache-first for static assets (JS, CSS, images, fonts)
  if (url.pathname.match(/\.(js|css|png|jpg|svg|woff2?|ico)$/) || url.pathname.startsWith('/assets/')) {
    event.respondWith(cacheFirst(request))
    return
  }

  // Strategy: Network-first for navigation (HTML pages)
  if (request.mode === 'navigate' || request.headers.get('Accept')?.includes('text/html')) {
    event.respondWith(networkFirst(request))
    return
  }

  // Strategy: Stale-while-revalidate for everything else
  event.respondWith(staleWhileRevalidate(request))
})

// --- Cache Strategies ---

async function cacheFirst(request) {
  const cached = await caches.match(request)
  if (cached) return cached
  try {
    const response = await fetch(request)
    if (response.ok) {
      const cache = await caches.open(STATIC_CACHE)
      cache.put(request, response.clone())
    }
    return response
  } catch {
    return new Response('', { status: 503 })
  }
}

async function networkFirst(request) {
  try {
    const response = await fetch(request)
    if (response.ok) {
      const cache = await caches.open(DYNAMIC_CACHE)
      cache.put(request, response.clone())
    }
    return response
  } catch {
    const cached = await caches.match(request)
    if (cached) return cached
    return caches.match('/offline.html')
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(DYNAMIC_CACHE)
  const cached = await cache.match(request)
  const fetchPromise = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone())
      return response
    })
    .catch(() => cached)
  return cached || fetchPromise
}
