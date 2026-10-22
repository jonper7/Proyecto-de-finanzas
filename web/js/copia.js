/* =====================================================================
   Copia de seguridad en JSON.

   El archivo guarda los movimientos con el NOMBRE de su categoría y
   medio de pago, no solo con el número interno. Así se puede leer a
   simple vista y se puede importar en otro dispositivo o en la base
   de datos del ordenador aunque allí los identificadores no coincidan.
   ===================================================================== */

const COPIA = (() => {

  const VERSION = 2;

  function nombreArchivo() {

    const ahora = new Date();

    const sello = [
      ahora.getFullYear(),
      String(ahora.getMonth() + 1).padStart(2, "0"),
      String(ahora.getDate()).padStart(2, "0"),
    ].join("-");

    return `finanzas-${sello}.json`;
  }

  return {

    /**
     * Construye el objeto de la copia.
     */
    async construir() {

      const [categorias, subcategorias, medios, movimientos, fijos, presupuestos] =
        await Promise.all([
          DATOS.catalogo("categorias"),
          DATOS.catalogo("subcategorias"),
          DATOS.catalogo("medios_pago"),
          DATOS.movimientos(),
          DATOS.ajuste("fijos", []),
          DATOS.ajuste("presupuestos", {}),
        ]);

      const categoriaPorId = new Map(categorias.map((c) => [c.id, c]));
      const subPorId = new Map(subcategorias.map((s) => [s.id, s]));
      const medioPorId = new Map(medios.map((m) => [m.id, m]));

      // Nombres en vez de números: así la copia sirve en otro dispositivo.
      const nombres = (subId, medioId) => {
        const sub = subPorId.get(subId);
        const categoria = sub ? categoriaPorId.get(sub.categoria_id) : null;
        const medio = medioPorId.get(medioId);
        return {
          categoria: categoria ? categoria.nombre : null,
          subcategoria: sub ? sub.nombre : null,
          medio_pago: medio ? medio.nombre : null,
        };
      };

      const topes = {};
      Object.entries(presupuestos).forEach(([id, monto]) => {
        const categoria = categoriaPorId.get(Number(id));
        if (categoria) topes[categoria.nombre] = monto;
      });

      return {
        aplicacion: "finanzas",
        version: VERSION,
        exportado_en: new Date().toISOString(),
        categorias,
        subcategorias,
        medios_pago: medios,
        movimientos: movimientos.map((m) => ({
          uuid: m.uuid,
          fecha: m.fecha,
          monto: String(m.monto),
          tipo: m.tipo,
          ...nombres(m.subcategoria_id, m.medio_pago_id),
          descripcion: m.descripcion || null,
          comentario: m.comentario || null,
          fijo_id: m.fijo_id || null,
          actualizado: m.actualizado,
        })),
        fijos: fijos.map((f) => ({
          id: f.id,
          nombre: f.nombre,
          monto: String(f.monto),
          dia: f.dia,
          tipo: f.tipo,
          activo: f.activo !== false,
          ...nombres(f.subcategoria_id, f.medio_pago_id),
        })),
        presupuestos: topes,
      };
    },

    /**
     * Guarda la copia.
     *
     * En el teléfono abre el menú de compartir de Android con el archivo
     * ya preparado: se elige «Drive» y la carpeta, y queda guardada. Si
     * el dispositivo no puede compartir archivos (ordenador), se
     * descarga como antes.
     *
     * Devuelve { total, via, motivo } o null si la persona canceló.
     */
    async exportar() {

      const copia = await this.construir();
      const texto = JSON.stringify(copia, null, 2);
      const nombre = nombreArchivo();

      let via = "descarga";
      let motivo = "";

      // Se prueba primero como JSON; algunos navegadores solo aceptan
      // ciertos tipos de archivo, así que después se intenta como texto.
      const intentos = [
        new File([texto], nombre, { type: "application/json" }),
        new File([texto], nombre, { type: "text/plain" }),
      ];

      if (!navigator.share || !navigator.canShare) {
        motivo = "Este navegador no puede compartir archivos";
      } else {

        const archivo = intentos.find((f) => navigator.canShare({ files: [f] }));

        if (!archivo) {
          motivo = "El teléfono no acepta compartir este tipo de archivo";
        } else {
          try {
            await navigator.share({ files: [archivo], title: "Copia de Finanzas" });
            via = "compartir";
          } catch (error) {
            // Cerrar el menú sin elegir nada no es un fallo: no se da por hecha.
            if (error && error.name === "AbortError") return null;
            motivo = `No se pudo abrir el menú (${(error && error.name) || "error"})`;
          }
        }
      }

      if (via === "descarga") {

        const enlace = document.createElement("a");
        const url = URL.createObjectURL(
          new Blob([texto], { type: "application/json" })
        );

        enlace.href = url;
        enlace.download = nombre;
        document.body.appendChild(enlace);
        enlace.click();
        document.body.removeChild(enlace);

        URL.revokeObjectURL(url);
      }

      await DATOS.guardarAjuste("ultima_copia", new Date().toISOString());

      return { total: copia.movimientos.length, via, motivo };
    },

    /**
     * Carga una copia.
     *
     * Los movimientos se identifican por uuid, así que importar dos
     * veces el mismo archivo no duplica nada. Las categorías se
     * buscan por nombre y se crean si faltan.
     */
    async importar(texto, { reemplazar = false } = {}) {

      let copia;

      try {
        copia = JSON.parse(texto);
      } catch (error) {
        throw new Error("El archivo no es un JSON válido.");
      }

      if (copia.aplicacion !== "finanzas" || !Array.isArray(copia.movimientos)) {
        throw new Error("Este archivo no es una copia de Finanzas.");
      }

      if (reemplazar) {
        await DATOS.vaciarMovimientos();
      }

      // --- Catálogos: se completa lo que falte, por nombre ---------

      const categorias = await DATOS.catalogo("categorias");
      const subcategorias = await DATOS.catalogo("subcategorias");
      const medios = await DATOS.catalogo("medios_pago");

      const buscarCategoria = (nombre) =>
        categorias.find(
          (c) => c.nombre.toLowerCase() === String(nombre).toLowerCase()
        );

      const buscarSub = (nombre, categoriaId) =>
        subcategorias.find(
          (s) =>
            s.nombre.toLowerCase() === String(nombre).toLowerCase() &&
            (categoriaId === undefined || s.categoria_id === categoriaId)
        );

      const buscarMedio = (nombre) =>
        medios.find(
          (m) => m.nombre.toLowerCase() === String(nombre).toLowerCase()
        );

      const siguienteId = (lista) =>
        lista.reduce((maximo, e) => Math.max(maximo, e.id), 0) + 1;

      // Busca por nombre y crea lo que falte. Sirve igual para movimientos
      // y para gastos fijos.
      const resolver = (entrada) => {

        let categoria = entrada.categoria
          ? buscarCategoria(entrada.categoria)
          : null;

        if (entrada.categoria && !categoria) {
          categoria = {
            id: siguienteId(categorias),
            nombre: entrada.categoria,
            tipo: entrada.tipo === "ingreso" ? "ingreso" : "gasto",
          };
          categorias.push(categoria);
        }

        let sub = entrada.subcategoria
          ? buscarSub(entrada.subcategoria, categoria ? categoria.id : undefined)
          : null;

        if (entrada.subcategoria && !sub) {
          sub = {
            id: siguienteId(subcategorias),
            nombre: entrada.subcategoria,
            categoria_id: categoria ? categoria.id : null,
          };
          subcategorias.push(sub);
        }

        let medio = entrada.medio_pago ? buscarMedio(entrada.medio_pago) : null;

        if (entrada.medio_pago && !medio) {
          medio = {
            id: siguienteId(medios),
            nombre: entrada.medio_pago,
          };
          medios.push(medio);
        }

        return { sub, medio };
      };

      const movimientos = copia.movimientos.map((entrada) => {

        const { sub, medio } = resolver(entrada);

        return {
          uuid: entrada.uuid,
          fecha: entrada.fecha,
          monto: entrada.monto,
          tipo: entrada.tipo,
          subcategoria_id: sub ? sub.id : null,
          medio_pago_id: medio ? medio.id : null,
          descripcion: entrada.descripcion || null,
          comentario: entrada.comentario || null,
          ...(entrada.fijo_id ? { fijo_id: entrada.fijo_id } : {}),
          actualizado: entrada.actualizado || new Date().toISOString(),
        };
      });

      // Gastos fijos (copias de versión 2 en adelante).
      const fijosCopia = Array.isArray(copia.fijos)
        ? copia.fijos.map((f) => {
            const { sub, medio } = resolver(f);
            return {
              id: f.id,
              nombre: f.nombre,
              monto: f.monto,
              dia: f.dia,
              tipo: f.tipo === "ingreso" ? "ingreso" : "gasto",
              activo: f.activo !== false,
              subcategoria_id: sub ? sub.id : null,
              medio_pago_id: medio ? medio.id : null,
            };
          }).filter((f) => f.id && f.subcategoria_id)
        : [];

      await DATOS.guardarCatalogo("categorias", categorias);
      await DATOS.guardarCatalogo("subcategorias", subcategorias);
      await DATOS.guardarCatalogo("medios_pago", medios);
      // Una copia antigua no sabe de gastos fijos: que no borre el vínculo
      // de un movimiento que ya lo tenía.
      const existentes = new Map((await DATOS.movimientos()).map((m) => [m.uuid, m]));
      movimientos.forEach((m) => {
        const previo = existentes.get(m.uuid);
        if (!m.fijo_id && previo && previo.fijo_id) m.fijo_id = previo.fijo_id;
      });

      await DATOS.escribirVarios(movimientos);

      if (Array.isArray(copia.fijos)) {
        const actuales = reemplazar ? [] : await DATOS.ajuste("fijos", []);
        const ids = new Set(fijosCopia.map((f) => f.id));
        await DATOS.guardarAjuste("fijos", [
          ...actuales.filter((f) => !ids.has(f.id)),
          ...fijosCopia,
        ]);
      }

      // Presupuestos: se traducen de nombre de categoría a identificador.
      if (copia.presupuestos && typeof copia.presupuestos === "object") {
        const topes = reemplazar ? {} : await DATOS.ajuste("presupuestos", {});
        Object.entries(copia.presupuestos).forEach(([nombre, monto]) => {
          const categoria = buscarCategoria(nombre);
          if (categoria && Number(monto) > 0) topes[categoria.id] = Number(monto);
        });
        await DATOS.guardarAjuste("presupuestos", topes);
      }

      return movimientos.length;
    },
  };

})();
