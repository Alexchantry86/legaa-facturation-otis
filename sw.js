/* Pilotage Logistique · LEGAA — service worker (v6.5)
   - Page et config.js : réseau d'abord (une mise à jour publiée est prise au chargement suivant), cache si hors ligne.
   - Bibliothèques CDN versionnées et polices : cache d'abord (démarrage rapide, fonctionnement hors ligne).
   - Firebase (authentification, Firestore, Storage) et toute autre requête : jamais interceptées. */
var VERSION = 'pl-v6.8';
var SHELL = ['./', './index.html', './config.js', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png', './icons/favicon-32.png'];
var CDN = [/^https:\/\/cdnjs\.cloudflare\.com\//, /^https:\/\/cdn\.jsdelivr\.net\//, /^https:\/\/www\.gstatic\.com\/firebasejs\//, /^https:\/\/fonts\.googleapis\.com\//, /^https:\/\/fonts\.gstatic\.com\//];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) {
    return Promise.all(SHELL.map(function (u) { return c.add(new Request(u, { cache: 'reload' })).catch(function () {}); }));
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (K) {
    return Promise.all(K.filter(function (k) { return k !== VERSION; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

function networkFirst(req, fallback) {
  return fetch(req).then(function (r) {
    if (r && r.ok) { var cp = r.clone(); caches.open(VERSION).then(function (c) { c.put(req, cp); }); }
    return r;
  }).catch(function () {
    return caches.match(req, { ignoreSearch: true }).then(function (m) { return m || (fallback ? caches.match(fallback) : undefined); })
      .then(function (m) { return m || new Response('Hors ligne', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }); });
  });
}

function cacheFirst(req) {
  return caches.match(req).then(function (m) {
    if (m) return m;
    return fetch(req).then(function (r) {
      if (r && (r.ok || r.type === 'opaque')) { var cp = r.clone(); caches.open(VERSION).then(function (c) { c.put(req, cp); }); }
      return r;
    });
  });
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin === self.location.origin) {
    if (req.mode === 'navigate') { e.respondWith(networkFirst(req, './index.html')); return; }
    if (/\/(config\.js|index\.html)$/.test(url.pathname)) { e.respondWith(networkFirst(req)); return; }
    if (/\/(icons\/|manifest\.webmanifest$)/.test(url.pathname)) { e.respondWith(cacheFirst(req)); return; }
    return;
  }
  if (CDN.some(function (rx) { return rx.test(req.url); })) e.respondWith(cacheFirst(req));
});
