/* =====================================================================
   Cliente de la API.

   Solo se usa al sincronizar y al entrar por primera vez: el resto
   del tiempo la aplicación trabaja contra el almacén local.

   La web se sirve desde el propio backend, así que las llamadas son
   a rutas relativas y no hay que configurar ninguna dirección.
   ===================================================================== */

const API = (() => {

  const CLAVE_TOKEN = "finanzas_token";

  function token() {
    return localStorage.getItem(CLAVE_TOKEN);
  }

  function guardarToken(valor) {
    localStorage.setItem(CLAVE_TOKEN, valor);
  }

  function borrarToken() {
    localStorage.removeItem(CLAVE_TOKEN);
  }

  class ErrorApi extends Error {
    constructor(mensaje, estado) {
      super(mensaje);
      this.estado = estado;
    }
  }

  /**
   * Extrae un mensaje legible del cuerpo de error de FastAPI.
   */
  function mensajeDeError(cuerpo, estado) {

    if (!cuerpo) return `Error ${estado}`;

    const detalle = cuerpo.detail;

    if (typeof detalle === "string") return detalle;

    if (Array.isArray(detalle) && detalle.length) {
      const primero = detalle[0];
      const campo = (primero.loc || []).slice(-1)[0];
      return campo ? `${campo}: ${primero.msg}` : primero.msg;
    }

    return `Error ${estado}`;
  }

  async function peticion(ruta, opciones = {}) {

    const cabeceras = { ...(opciones.headers || {}) };

    if (opciones.body !== undefined) {
      cabeceras["Content-Type"] = "application/json";
    }

    const acceso = token();

    if (acceso) {
      cabeceras["Authorization"] = `Bearer ${acceso}`;
    }

    let respuesta;

    try {
      respuesta = await fetch(ruta, {
        ...opciones,
        headers: cabeceras,
        body: opciones.body !== undefined
          ? JSON.stringify(opciones.body)
          : undefined,
      });
    } catch (fallo) {
      throw new ErrorApi("No hay conexión con el servidor.", 0);
    }

    if (respuesta.status === 401) {
      borrarToken();
      throw new ErrorApi("La sesión ha caducado.", 401);
    }

    if (respuesta.status === 204) return null;

    const cuerpo = await respuesta.json().catch(() => null);

    if (!respuesta.ok) {
      throw new ErrorApi(
        mensajeDeError(cuerpo, respuesta.status),
        respuesta.status
      );
    }

    return cuerpo;
  }

  return {

    ErrorApi,
    token,
    borrarToken,

    haySesion: () => Boolean(token()),

    async entrar(email, password) {

      const datos = await peticion("/auth/login", {
        method: "POST",
        body: { email, password },
      });

      guardarToken(datos.access_token);

      return datos;
    },

    // --- Sincronización ---------------------------------------------

    pull(cursor) {
      const ruta = cursor
        ? `/sync/pull?desde=${encodeURIComponent(cursor)}`
        : "/sync/pull";
      return peticion(ruta);
    },

    push(lote) {
      return peticion("/sync/push", { method: "POST", body: lote });
    },
  };

})();
