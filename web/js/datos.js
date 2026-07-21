/* =====================================================================
   Almacén del dispositivo (IndexedDB).

   Aquí vive todo: movimientos y catálogos. No hay servidor, así que
   este archivo es la única fuente de verdad de la aplicación.
   ===================================================================== */

const DATOS = (() => {

  const NOMBRE = "finanzas";
  const VERSION = 1;

  let conexion = null;

  // ------------------------------------------------------------------
  // Catálogo inicial
  //
  // Se crea la primera vez que se abre la aplicación para que se
  // pueda apuntar un gasto de inmediato. Todo es editable después.
  // ------------------------------------------------------------------

  const CATALOGO_INICIAL = {

    categorias: [
      { id: 1,  nombre: "Alimentación", tipo: "gasto" },
      { id: 2,  nombre: "Hogar",        tipo: "gasto" },
      { id: 3,  nombre: "Transporte",   tipo: "gasto" },
      { id: 4,  nombre: "Salud",        tipo: "gasto" },
      { id: 5,  nombre: "Ocio",         tipo: "gasto" },
      { id: 6,  nombre: "Compras",      tipo: "gasto" },
      { id: 7,  nombre: "Otros gastos", tipo: "gasto" },
      { id: 8,  nombre: "Salario",      tipo: "ingreso" },
      { id: 9,  nombre: "Otros ingresos", tipo: "ingreso" },
    ],

    subcategorias: [
      { id: 1,  nombre: "Supermercado",   categoria_id: 1 },
      { id: 2,  nombre: "Restaurante",    categoria_id: 1 },
      { id: 3,  nombre: "Café",           categoria_id: 1 },
      { id: 4,  nombre: "Alquiler",       categoria_id: 2 },
      { id: 5,  nombre: "Luz",            categoria_id: 2 },
      { id: 6,  nombre: "Agua",           categoria_id: 2 },
      { id: 7,  nombre: "Internet",       categoria_id: 2 },
      { id: 8,  nombre: "Gasolina",       categoria_id: 3 },
      { id: 9,  nombre: "Transporte público", categoria_id: 3 },
      { id: 10, nombre: "Taller",         categoria_id: 3 },
      { id: 11, nombre: "Farmacia",       categoria_id: 4 },
      { id: 12, nombre: "Médico",         categoria_id: 4 },
      { id: 13, nombre: "Gimnasio",       categoria_id: 5 },
      { id: 14, nombre: "Suscripciones",  categoria_id: 5 },
      { id: 15, nombre: "Salidas",        categoria_id: 5 },
      { id: 16, nombre: "Ropa",           categoria_id: 6 },
      { id: 17, nombre: "Tecnología",     categoria_id: 6 },
      { id: 18, nombre: "Regalos",        categoria_id: 6 },
      { id: 19, nombre: "Varios",         categoria_id: 7 },
      { id: 20, nombre: "Nómina",         categoria_id: 8 },
      { id: 21, nombre: "Extras",         categoria_id: 9 },
    ],

    medios_pago: [
      { id: 1, nombre: "Efectivo" },
      { id: 2, nombre: "Tarjeta" },
      { id: 3, nombre: "Transferencia" },
      { id: 4, nombre: "Domiciliado" },
      { id: 5, nombre: "Bizum" },
    ],
  };

  // ------------------------------------------------------------------
  // Conexión
  // ------------------------------------------------------------------

  function abrir() {

    if (conexion) return Promise.resolve(conexion);

    return new Promise((resolver, rechazar) => {

      const solicitud = indexedDB.open(NOMBRE, VERSION);

      solicitud.onupgradeneeded = (evento) => {

        const db = evento.target.result;

        if (!db.objectStoreNames.contains("movimientos")) {
          const almacen = db.createObjectStore("movimientos", {
            keyPath: "uuid",
          });
          almacen.createIndex("fecha", "fecha");
        }

        if (!db.objectStoreNames.contains("catalogos")) {
          db.createObjectStore("catalogos", { keyPath: "clave" });
        }

        if (!db.objectStoreNames.contains("ajustes")) {
          db.createObjectStore("ajustes", { keyPath: "clave" });
        }
      };

      solicitud.onsuccess = () => {
        conexion = solicitud.result;
        resolver(conexion);
      };

      solicitud.onerror = () => rechazar(solicitud.error);
    });
  }

  async function transaccion(almacenes, modo, trabajo) {

    const db = await abrir();

    return new Promise((resolver, rechazar) => {

      const tx = db.transaction(almacenes, modo);
      const stores = almacenes.map((nombre) => tx.objectStore(nombre));

      let resultado;

      try {
        resultado = trabajo(...stores);
      } catch (error) {
        rechazar(error);
        return;
      }

      tx.oncomplete = () => resolver(resultado);
      tx.onerror = () => rechazar(tx.error);
      tx.onabort = () => rechazar(tx.error);
    });
  }

  function promesa(solicitud) {
    return new Promise((resolver, rechazar) => {
      solicitud.onsuccess = () => resolver(solicitud.result);
      solicitud.onerror = () => rechazar(solicitud.error);
    });
  }

  const api = {

    abrir,

    /**
     * Prepara el catálogo la primera vez que se usa la aplicación.
     */
    async preparar() {

      await abrir();

      const listo = await api.ajuste("catalogo_creado");

      if (listo) return;

      await api.guardarCatalogo("categorias", CATALOGO_INICIAL.categorias);
      await api.guardarCatalogo("subcategorias", CATALOGO_INICIAL.subcategorias);
      await api.guardarCatalogo("medios_pago", CATALOGO_INICIAL.medios_pago);

      await api.guardarAjuste("catalogo_creado", true);
    },

    // ----------------------------------------------------------------
    // Movimientos
    // ----------------------------------------------------------------

    async movimientos() {

      const todos = await transaccion(["movimientos"], "readonly",
        (almacen) => promesa(almacen.getAll())
      );

      return todos.sort((a, b) => {
        if (a.fecha !== b.fecha) return a.fecha < b.fecha ? 1 : -1;
        return (b.actualizado || "").localeCompare(a.actualizado || "");
      });
    },

    async guardar(movimiento) {

      const registro = {
        ...movimiento,
        actualizado: new Date().toISOString(),
      };

      await transaccion(["movimientos"], "readwrite", (almacen) =>
        almacen.put(registro)
      );

      return registro;
    },

    async eliminar(uuid) {
      await transaccion(["movimientos"], "readwrite", (almacen) =>
        almacen.delete(uuid)
      );
    },

    async escribirVarios(registros) {

      if (!registros.length) return;

      await transaccion(["movimientos"], "readwrite", (almacen) => {
        registros.forEach((registro) => almacen.put(registro));
      });
    },

    // ----------------------------------------------------------------
    // Catálogos
    // ----------------------------------------------------------------

    async catalogo(clave) {

      const fila = await transaccion(["catalogos"], "readonly", (almacen) =>
        promesa(almacen.get(clave))
      );

      return fila ? fila.elementos : [];
    },

    async guardarCatalogo(clave, elementos) {
      await transaccion(["catalogos"], "readwrite", (almacen) =>
        almacen.put({ clave, elementos })
      );
    },

    /**
     * Añade un elemento al catálogo con el siguiente identificador libre.
     */
    async anadirAlCatalogo(clave, elemento) {

      const elementos = await api.catalogo(clave);

      const siguiente = elementos.reduce(
        (maximo, e) => Math.max(maximo, e.id), 0
      ) + 1;

      const nuevo = { ...elemento, id: siguiente };

      await api.guardarCatalogo(clave, [...elementos, nuevo]);

      return nuevo;
    },

    async renombrarEnCatalogo(clave, id, nombre) {

      const elementos = await api.catalogo(clave);

      await api.guardarCatalogo(
        clave,
        elementos.map((e) => (e.id === id ? { ...e, nombre } : e))
      );
    },

    async quitarDelCatalogo(clave, id) {

      const elementos = await api.catalogo(clave);

      await api.guardarCatalogo(
        clave,
        elementos.filter((e) => e.id !== id)
      );
    },

    // ----------------------------------------------------------------
    // Ajustes
    // ----------------------------------------------------------------

    async ajuste(clave, porDefecto = null) {

      const fila = await transaccion(["ajustes"], "readonly", (almacen) =>
        promesa(almacen.get(clave))
      );

      return fila ? fila.valor : porDefecto;
    },

    async guardarAjuste(clave, valor) {
      await transaccion(["ajustes"], "readwrite", (almacen) =>
        almacen.put({ clave, valor })
      );
    },

    async vaciarMovimientos() {
      await transaccion(["movimientos"], "readwrite", (almacen) =>
        almacen.clear()
      );
    },
  };

  return api;

})();
