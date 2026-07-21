/* =====================================================================
   Motor de sincronización.

   Orden deliberado: primero se envía lo pendiente y después se
   descarga. Así el servidor ya conoce los cambios del móvil cuando
   respondemos a la descarga, y no llegan versiones antiguas que
   pisen lo que se acaba de escribir.
   ===================================================================== */

const SYNC = (() => {

  let enCurso = false;

  /**
   * Convierte un movimiento local al formato que espera /sync/push.
   */
  function paraEnviar(movimiento) {
    return {
      uuid: movimiento.uuid,
      device_updated_at: movimiento.device_updated_at,
      eliminado: Boolean(movimiento.eliminado),
      fecha: movimiento.fecha,
      descripcion: movimiento.descripcion,
      monto: String(movimiento.monto),
      tipo: movimiento.tipo,
      subcategoria_id: movimiento.subcategoria_id,
      medio_pago_id: movimiento.medio_pago_id,
      comentario: movimiento.comentario,
      origen: "movil",
    };
  }

  /**
   * Envía los cambios locales.
   */
  async function enviar() {

    const pendientes = await DB.pendientes();

    if (!pendientes.length) {
      return { enviados: 0, rechazados: 0 };
    }

    const respuesta = await API.push({
      movimientos: pendientes.map(paraEnviar),
    });

    const porUuid = new Map(pendientes.map((m) => [m.uuid, m]));

    const confirmados = [];
    const olvidar = [];

    let rechazados = 0;

    respuesta.movimientos.forEach((resultado) => {

      const local = porUuid.get(resultado.uuid);

      if (!local) return;

      if (resultado.estado === "error") {
        rechazados += 1;
        return;
      }

      // Un borrado ya confirmado no hace falta guardarlo más.
      if (resultado.estado === "eliminado") {
        olvidar.push(resultado.uuid);
        return;
      }

      // Si el servidor tenía una versión más nueva, la descarga que
      // viene a continuación traerá la buena.
      confirmados.push({
        ...local,
        id: resultado.id || local.id,
        pendiente: 0,
      });
    });

    await DB.escribirDesdeServidor(confirmados);
    await DB.olvidar(olvidar);

    return {
      enviados: confirmados.length + olvidar.length,
      rechazados,
    };
  }

  /**
   * Descarga los cambios del servidor desde el último cursor.
   */
  async function descargar() {

    const cursor = await DB.ajuste("cursor");

    const cambios = await API.pull(cursor);

    // Los movimientos con cambios locales sin enviar no se tocan:
    // se resolverán en el siguiente envío.
    const pendientes = new Set(
      (await DB.pendientes()).map((m) => m.uuid)
    );

    const guardar = [];
    const borrar = [];

    cambios.movimientos.forEach((remoto) => {

      if (pendientes.has(remoto.uuid)) return;

      if (remoto.deleted_at) {
        borrar.push(remoto.uuid);
        return;
      }

      guardar.push({
        uuid: remoto.uuid,
        id: remoto.id,
        fecha: remoto.fecha,
        descripcion: remoto.descripcion,
        monto: remoto.monto,
        tipo: remoto.tipo,
        subcategoria_id: remoto.subcategoria_id,
        medio_pago_id: remoto.medio_pago_id,
        comentario: remoto.comentario,
        origen: remoto.origen,
        device_updated_at: remoto.updated_at,
        eliminado: false,
        pendiente: 0,
      });
    });

    await DB.escribirDesdeServidor(guardar);
    await DB.olvidar(borrar);

    const catalogos = cambios.catalogos || {};

    await DB.fusionarCatalogo("categorias", catalogos.categorias);
    await DB.fusionarCatalogo("subcategorias", catalogos.subcategorias);
    await DB.fusionarCatalogo("medios_pago", catalogos.medios_pago);

    await DB.guardarAjuste("cursor", cambios.server_time);

    return { recibidos: guardar.length + borrar.length };
  }

  return {

    /**
     * Ciclo completo. Devuelve un resumen o lanza el error si no se
     * ha podido contactar con el servidor.
     */
    async sincronizar() {

      if (enCurso) return null;

      enCurso = true;

      try {

        const subida = await enviar();
        const bajada = await descargar();

        await DB.guardarAjuste("ultima_sync", new Date().toISOString());

        return { ...subida, ...bajada };

      } finally {
        enCurso = false;
      }
    },

    /**
     * Sincroniza sin molestar: los fallos de red se ignoran porque
     * la aplicación funciona igual sin servidor.
     */
    async intentar() {

      if (!navigator.onLine) return null;

      try {
        return await this.sincronizar();
      } catch (error) {
        return null;
      }
    },
  };

})();
