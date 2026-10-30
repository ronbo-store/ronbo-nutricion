/*
 * RONBO FIT — Service Worker (instalable PWA, 2026-10-25)
 *
 * Estrategia: RED PRIMERO para la cáscara (navegaciones y archivos de
 * la app del MISMO ORIGEN). Con red, la red siempre gana: un despliegue
 * nuevo llega al instante. La caché es SOLO el respaldo sin conexión
 * (la cáscara abre offline); jamás sirve contenido viejo habiendo red.
 *
 * SEGURIDAD: este SW solo intercepta peticiones GET del mismo origen.
 * Todo lo demás — firestore.googleapis.com, identitytoolkit,
 * securetoken, googleapis en general, gstatic y el Worker de IA
 * (ronbo-nutri-m8…workers.dev) — pasa DIRECTO sin respondWith: la
 * autenticación y los datos NUNCA tocan la caché. Tampoco se cachean
 * respuestas que no sean 200 ni peticiones que no sean GET.
 *
 * DISCIPLINA DE VERSIÓN: SW_VERSION replica el sello `?v=` de
 * index.html. Cada promoción futura debe subir AMBOS sellos a la vez
 * (igual que ya se sube el de styles.css/app.js): el navegador detecta
 * el SW nuevo porque sus bytes cambian, la caché vieja se borra en
 * `activate` y el cliente termina en la versión nueva sin que nadie
 * borre la caché a mano (recarga única controlada desde app.js).
 */
const SW_VERSION = '20261030-puerta-business';
const CACHE_NAME = 'ronbofit-shell-' + SW_VERSION;
const SHELL_URLS = [
  './',
  './index.html',
  './styles.css?v=20261030-puerta-business',
  './app.js?v=20261030-puerta-business',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(SHELL_URLS);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  let url;
  try { url = new URL(req.url); } catch (e) { return; }
  /* Solo mismo origen: cualquier otro origen (Firebase Auth/Firestore,
     APIs de Google, gstatic, el Worker) pasa directo, sin tocar. */
  if (url.origin !== self.location.origin) return;
  event.respondWith(networkFirst(req));
});

async function networkFirst(req) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const fresh = await fetch(req);
    if (fresh && fresh.status === 200) {
      try { await cache.put(req, fresh.clone()); } catch (e) { /* sin caché, no sin respuesta */ }
    }
    return fresh;
  } catch (err) {
    const exact = await cache.match(req);
    if (exact) return exact;
    const fuzzy = await cache.match(req, { ignoreSearch: true });
    if (fuzzy) return fuzzy;
    if (req.mode === 'navigate') {
      const shell = await cache.match('./index.html');
      if (shell) return shell;
    }
    throw err;
  }
}
