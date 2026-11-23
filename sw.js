/* Service worker mínimo: permite instalar la tarjeta y abrirla sin conexión.
   Primero intenta la red (para ver siempre la última versión) y si falla usa la copia guardada.
   Solo guarda archivos propios y de cdnjs/Google Fonts: las consultas a Supabase nunca se guardan. */
var CACHE = 'fidelidad-barberias-v2';
var ARCHIVOS = ['./', './index.html', './app.css', './app.js', './datos.js', './datos-local.js', './config.js', './manifest.webmanifest', './iconos/icono.svg', './iconos/icono-192.png', './iconos/icono-512.png'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(ARCHIVOS); }).catch(function () {}));
  self.skipWaiting();
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (claves) {
    return Promise.all(claves.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  var propio = url.origin === self.location.origin;
  var cdn = /(cdnjs\.cloudflare\.com|fonts\.googleapis\.com|fonts\.gstatic\.com)$/.test(url.hostname);
  if (!propio && !cdn) return;
  e.respondWith(
    fetch(req).then(function (res) {
      if (res && (res.ok || res.type === 'opaque')) {
        var copia = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copia); }).catch(function () {});
      }
      return res;
    }).catch(function () {
      return caches.match(req).then(function (r) { return r || (req.mode === 'navigate' ? caches.match('./index.html') : Response.error()); });
    })
  );
});
