/* ECLADO Cowork — Service Worker (캐시 없음 버전) */
const CACHE_NAME = 'eclado-v10';

self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

/* 모든 요청을 항상 네트워크에서 직접 가져옴 — 캐시 없음 */
self.addEventListener('fetch', e => {
  e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
});
