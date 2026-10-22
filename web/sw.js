/* =====================================================================
   Service worker.

   Guarda la aplicación en el dispositivo para que abra sin conexión.
   Los datos viven en IndexedDB y no pasan por aquí.

   Las rutas son relativas para que funcione publicada en un
   subdirectorio, como ocurre en GitHub Pages.
   ===================================================================== */

const CACHE = "finanzas-v17";

const ARCHIVOS = [
  "./",
  "./index.html",
  "./css/estilos.css",
  "./js/config.js",
  "./js/datos.js",
  "./js/copia.js",
  "./js/importar_csv.js",
  "./js/inteligencia.js",
  "./js/resumen.js",
  "./js/nucleo.js",
  "./js/dialogos.js",
  "./js/hoja_mov.js",
  "./js/vista_inicio.js",
  "./js/vista_movimientos.js",
  "./js/vista_analisis.js",
  "./js/vista_planificar.js",
  "./js/vista_ajustes.js",
  "./js/main.js",
  "./manifest.json",
  "./iconos/icono-192.png",
  "./iconos/icono-512.png",
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

  if (evento.request.method !== "GET") return;

  const url = new URL(evento.request.url);

  if (url.origin !== self.location.origin) return;

  // Primero lo guardado, y se refresca por detrás para la próxima vez.
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
