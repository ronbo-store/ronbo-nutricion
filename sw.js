/*
 * RONBO FIT — Service Worker (instalable PWA, 2026-10-25)
 *
 * Estrategia (ARRANQUE RÁPIDO + CACHÉ AMPLIO, AUTH-2026-11-04-238;
 * diagnóstico de velocidad del 2026-11-04: la cáscara se servía con
 * max-age=600 y el SW era «red primero», así que pasados 10 minutos
 * cada apertura volvía a pagar los ~1,13 MB de la cáscara):
 *
 * - CÁSCARA (mismo origen, GET, no imagen): CACHÉ PRIMERO. Abrir la
 *   app ya no espera a la red por index.html / app.js / styles.css /
 *   iconos / manifiesto: lo que la caché tiene se sirve al instante
 *   y la red solo se toca si falta la pieza. La adopción de una
 *   versión nueva NO depende de revalidar: cada promoción sube el
 *   sello (SW_VERSION y los ?v=), los bytes de este SW cambian, el
 *   navegador instala el SW nuevo — que precarga la cáscara NUEVA
 *   desde la red en su `install` —, `activate` borra la caché vieja
 *   y toma el control, y app.js recarga una sola vez por
 *   `controllerchange` (su guarda anti-bucle, intacta). Un despliegue
 *   nuevo jamás queda invisible tras esta caché: a la siguiente
 *   apertura — y normalmente dentro de la misma sesión, por la
 *   comprobación de actualización al volver a primer plano — la app
 *   corre la versión nueva. Sin conexión, la caché es el respaldo
 *   que abre la cáscara offline, como siempre.
 *
 * - IMÁGENES YA VISTAS (cualquier origen, GET con destino imagen):
 *   caché primero en una caché PROPIA y persistente entre versiones
 *   (`ronbofit-img-v1`, con tope FIFO de 300 entradas) y revalidación
 *   en segundo plano: reabrir una ficha de la biblioteca o una foto
 *   ya servida no la re-descarga para pintarla, y si la imagen cambió
 *   en el origen, la copia se refresca por detrás para la próxima
 *   vez. Las fotos de progreso viajan como dataURL dentro de los
 *   documentos de Firestore (no son peticiones de red): su caché es
 *   la caché persistente de Firestore, no esta.
 *
 * SEGURIDAD: solo se interceptan peticiones GET (de la cáscara del
 * mismo origen y de imágenes). Todo lo demás —
 * firestore.googleapis.com, identitytoolkit, securetoken,
 * googleapis en general, gstatic y el Worker de IA
 * (ronbo-nutri-m8…workers.dev) — pasa DIRECTO sin respondWith: la
 * autenticación y los datos NUNCA tocan la caché del SW (los datos
 * viven en la caché de Firestore, gobernada por el SDK). De la
 * cáscara solo se cachean respuestas 200; de imágenes, 200 u opacas
 * (las <img> de otro origen llegan opacas por CORS).
 *
 * DISCIPLINA DE VERSIÓN: SW_VERSION replica el sello `?v=` de
 * index.html. Cada promoción futura debe subir AMBOS sellos a la vez
 * (igual que ya se sube el de styles.css/app.js): el navegador detecta
 * el SW nuevo porque sus bytes cambian, la caché vieja de la cáscara
 * se borra en `activate` y el cliente termina en la versión nueva sin
 * que nadie borre la caché a mano (recarga única controlada desde
 * app.js). La caché de imágenes NO se borra entre versiones: guarda
 * contenido ya visto, con su tope.
 */
const SW_VERSION = '20261105-voz-ayudante';
const CACHE_NAME = 'ronbofit-shell-' + SW_VERSION;
const IMG_CACHE_NAME = 'ronbofit-img-v1';
const IMG_CACHE_MAX = 300;
const SHELL_URLS = [
  './',
  './index.html',
  './styles.css?v=20261105-voz-ayudante',
  './app.js?v=20261105-voz-ayudante',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/logo-franja.png'
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
    await Promise.all(
      names.filter((n) => n !== CACHE_NAME && n !== IMG_CACHE_NAME)
        .map((n) => caches.delete(n))
    );
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  let url;
  try { url = new URL(req.url); } catch (e) { return; }
  /* Imágenes ya vistas: cualquier origen (las fotos de la biblioteca
     viven en el repo de activos, otro origen). */
  if (req.destination === 'image') {
    event.respondWith(imageCacheFirst(req));
    return;
  }
  /* Cáscara: solo mismo origen. Cualquier otro origen (Firebase
     Auth/Firestore, APIs de Google, gstatic, el Worker) pasa
     directo, sin tocar. */
  if (url.origin !== self.location.origin) return;
  event.respondWith(shellCacheFirst(req));
});

/* Cáscara, caché primero: lo cacheado se sirve sin tocar la red.
   La frescura la gobierna la sustitución del SW (ver la cabecera):
   un sello nuevo = un SW nuevo = una caché nueva precargada. */
async function shellCacheFirst(req) {
  const cache = await caches.open(CACHE_NAME);
  const exact = await cache.match(req);
  if (exact) return exact;
  try {
    const fresh = await fetch(req);
    if (fresh && fresh.status === 200) {
      try { await cache.put(req, fresh.clone()); } catch (e) { /* sin caché, no sin respuesta */ }
    }
    return fresh;
  } catch (err) {
    const fuzzy = await cache.match(req, { ignoreSearch: true });
    if (fuzzy) return fuzzy;
    if (req.mode === 'navigate') {
      const shell = await cache.match('./index.html');
      if (shell) return shell;
    }
    throw err;
  }
}

/* Imágenes, caché primero + revalidación en segundo plano, con
   tope FIFO: el contenido ya visto no se re-descarga para pintar. */
async function imageCacheFirst(req) {
  const cache = await caches.open(IMG_CACHE_NAME);
  const hit = await cache.match(req);
  const revalidate = fetch(req).then(async (fresh) => {
    if (fresh && (fresh.status === 200 || fresh.type === 'opaque')) {
      try {
        await cache.put(req, fresh.clone());
        const keys = await cache.keys();
        if (keys.length > IMG_CACHE_MAX) {
          await Promise.all(keys.slice(0, keys.length - IMG_CACHE_MAX).map((k) => cache.delete(k)));
        }
      } catch (e) { /* sin caché, no sin imagen */ }
    }
    return fresh;
  }).catch(() => null);
  if (hit) { revalidate.catch(() => {}); return hit; }
  const fresh = await revalidate;
  if (fresh) return fresh;
  throw new Error('image offline and not cached');
}
