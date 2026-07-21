/* =====================================================================
   Almacén local del dispositivo (IndexedDB).

   Todo lo que ve la aplicación sale de aquí. El servidor solo
   interviene al sincronizar, así que la app funciona igual sin
   conexión y sin el ordenador encendido.
   ===================================================================== */

const DB = (() => {

  const NOMBRE = "finanzas";
  const VERSION = 1;

  let conexion = null;

  /**
   * Abre la base y crea los almacenes la primera vez.
   */
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
          almacen.createIndex("pendiente", "pendiente");
        }

        // Catálogos y ajustes: pares clave/valor.
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

  /**
   * Envuelve una transacción en una promesa.
   */
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

  return {

    abrir,

    // ----------------------------------------------------------------
    // Movimientos
    // ----------------------------------------------------------------

    /**
     * Todos los movimientos vivos, del más reciente al más antiguo.
     *
     * Los marcados como eliminados se guardan hasta que el servidor
     * confirme el borrado, pero no se muestran.
     */
    async movimientos() {

      const todos = await transaccion(
        ["movimientos"], "readonly",
        (almacen) => promesa(almacen.getAll())
      );

      const lista = await todos;

      return lista
        .filter((m) => !m.eliminado)
        .sort((a, b) => {
          if (a.fecha !== b.fecha) return a.fecha < b.fecha ? 1 : -1;
          return (b.device_updated_at || "").localeCompare(
            a.device_updated_at || ""
          );
        });
    },

    async movimiento(uuid) {
      return transaccion(["movimientos"], "readonly", (almacen) =>
        promesa(almacen.get(uuid))
      ).then((p) => p);
    },

    /**
     * Guarda un movimiento creado o editado en el dispositivo.
     */
    async guardar(movimiento) {

      const registro = {
        ...movimiento,
        pendiente: 1,
        device_updated_at: new Date().toISOString(),
      };

      await transaccion(["movimientos"], "readwrite", (almacen) =>
        almacen.put(registro)
      );

      return registro;
    },

    /**
     * Marca un movimiento como eliminado, pendiente de propagar.
     */
    async eliminar(uuid) {

      const actual = await transaccion(["movimientos"], "readonly",
        (almacen) => promesa(almacen.get(uuid))
      );

      if (!actual) return;

      await transaccion(["movimientos"], "readwrite", (almacen) =>
        almacen.put({
          ...actual,
          eliminado: true,
          pendiente: 1,
          device_updated_at: new Date().toISOString(),
        })
      );
    },

    /**
     * Movimientos con cambios sin enviar al servidor.
     */
    async pendientes() {

      const todos = await transaccion(["movimientos"], "readonly",
        (almacen) => promesa(almacen.getAll())
      );

      return todos.filter((m) => m.pendiente === 1);
    },

    async contarPendientes() {
      return (await this.pendientes()).length;
    },

    /**
     * Escribe tal cual lo que llega del servidor, sin marcarlo
     * pendiente. Se usa al descargar.
     */
    async escribirDesdeServidor(registros) {

      if (!registros.length) return;

      await transaccion(["movimientos"], "readwrite", (almacen) => {
        registros.forEach((registro) => almacen.put(registro));
      });
    },

    async olvidar(uuids) {

      if (!uuids.length) return;

      await transaccion(["movimientos"], "readwrite", (almacen) => {
        uuids.forEach((uuid) => almacen.delete(uuid));
      });
    },

    // ----------------------------------------------------------------
    // Catálogos
    // ----------------------------------------------------------------

    async guardarCatalogo(clave, elementos) {
      await transaccion(["catalogos"], "readwrite", (almacen) =>
        almacen.put({ clave, elementos })
      );
    },

    async catalogo(clave) {

      const fila = await transaccion(["catalogos"], "readonly", (almacen) =>
        promesa(almacen.get(clave))
      );

      return fila ? fila.elementos : [];
    },

    /**
     * Mezcla por id: la descarga incremental solo trae lo cambiado.
     */
    async fusionarCatalogo(clave, novedades) {

      if (!novedades || !novedades.length) return;

      const actuales = await this.catalogo(clave);
      const porId = new Map(actuales.map((e) => [e.id, e]));

      novedades.forEach((elemento) => porId.set(elemento.id, elemento));

      await this.guardarCatalogo(clave, [...porId.values()]);
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

    /**
     * Borra todo lo guardado en el dispositivo (al cerrar sesión).
     */
    async vaciar() {
      await transaccion(
        ["movimientos", "catalogos", "ajustes"], "readwrite",
        (movimientos, catalogos, ajustes) => {
          movimientos.clear();
          catalogos.clear();
          ajustes.clear();
        }
      );
    },
  };

})();
