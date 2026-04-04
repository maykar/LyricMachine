// LyricMachine Service Worker — cache-first for assets, network-first for API
const CACHE_NAME = 'lyricmachine-v1'

// Assets to pre-cache on install
const PRECACHE = [
  '/',
  '/SloshRat.png',
  '/party.ogg',
  '/special.ogg',
]

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE))
  )
  self.skipWaiting()
})

self.addEventListener('activate', (e) => {
  // Evict old caches
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url)

  // Network-first for API calls and Spotify endpoints
  if (url.pathname.startsWith('/api/') || url.hostname.includes('spotify')) {
    e.respondWith(
      fetch(e.request).catch(() => caches.match(e.request))
    )
    return
  }

  // Cache-first for everything else (assets, fonts, etc.)
  e.respondWith(
    caches.match(e.request).then((cached) => {
      if (cached) return cached
      return fetch(e.request).then((response) => {
        // Only cache successful same-origin or font responses
        if (response.ok && (url.origin === self.location.origin || url.hostname.includes('fonts'))) {
          const clone = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone))
        }
        return response
      })
    })
  )
})
