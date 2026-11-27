// Guarda la "cáscara" de la app en el celular: así abre aunque la PC esté apagada (y avisa que no responde).
// Lo de /api nunca se guarda: siempre va a la PC.
const CACHE = 'jarvis-movil-6';
const ARCHIVOS = 'jarvis-archivos'; // lo que se guardó en el celular (no se toca al actualizar la app)
const CASCARA = ['/', '/index.html', '/app.js', '/app.css', '/manifest.webmanifest', '/icono-192.png', '/icono-512.png', '/icono-maskable.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CASCARA)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE && k !== ARCHIVOS).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
// Primero la PC (versión nueva si se actualizó Jarvis); si no contesta en 4 s, lo guardado.
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/') || url.pathname.startsWith('/local/')) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const r = await Promise.race([fetch(e.request), new Promise((_, mal) => setTimeout(() => mal(new Error('tiempo')), 4000))]);
      if (r.ok && CASCARA.includes(url.pathname)) cache.put(e.request, r.clone());
      return r;
    } catch {
      return (await cache.match(e.request, { ignoreSearch: true })) || (await cache.match('/index.html')) || Response.error();
    }
  })());
});
