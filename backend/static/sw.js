/* =====================================================================
   Service worker.

   Guarda la aplicación en el dispositivo para que abra sin conexión.
   Solo cachea la interfaz: los datos viven en IndexedDB y las
   llamadas de sincronización nunca se cachean.
   ===================================================================== */

const CACHE = "finanzas-v3";

const ARCHIVOS = [
  "/",
  "/static/css/estilos.css",
  "/static/js/config.js",
  "/static/js/db.js",
  "/static/js/api.js",
  "/static/js/sync.js",
  "/static/js/resumen.js",
  "/static/js/app.js",
  "/static/iconos/icono-192.png",
  "/manifest.json",
];

self.addEventListener("install", (evento) => {
  evento.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(ARCHIVOS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    caches.keys()
      .then((claves) => Promise.all(
        claves.filter((clave) => clave !== CACHE)
              .map((clave) => caches.delete(clave))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (evento) => {

  const url = new URL(evento.request.url);

  if (evento.request.method !== "GET") return;
  if (url.origin !== self.location.origin) return;

  // La sincronización y el acceso siempre van a la red.
  if (url.pathname.startsWith("/sync") || url.pathname.startsWith("/auth")) {
    return;
  }

  // Para la interfaz: primero lo guardado, y se refresca por detrás.
  evento.respondWith(
    caches.match(evento.request).then((guardado) => {

      const desdeRed = fetch(evento.request)
        .then((respuesta) => {

          if (respuesta && respuesta.status === 200) {
            const copia = respuesta.clone();
            caches.open(CACHE).then((cache) =>
              cache.put(evento.request, copia)
            );
          }

          return respuesta;
        })
        .catch(() => guardado);

      return guardado || desdeRed;
    })
  );
});
