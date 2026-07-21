/* =====================================================================
   Copia de seguridad en JSON.

   El archivo guarda los movimientos con el NOMBRE de su categoría y
   medio de pago, no solo con el número interno. Así se puede leer a
   simple vista y se puede importar en otro dispositivo o en la base
   de datos del ordenador aunque allí los identificadores no coincidan.
   ===================================================================== */

const COPIA = (() => {

  const VERSION = 1;

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

      const [categorias, subcategorias, medios, movimientos] =
        await Promise.all([
          DATOS.catalogo("categorias"),
          DATOS.catalogo("subcategorias"),
          DATOS.catalogo("medios_pago"),
          DATOS.movimientos(),
        ]);

      const categoriaPorId = new Map(categorias.map((c) => [c.id, c]));
      const subPorId = new Map(subcategorias.map((s) => [s.id, s]));
      const medioPorId = new Map(medios.map((m) => [m.id, m]));

      return {
        aplicacion: "finanzas",
        version: VERSION,
        exportado_en: new Date().toISOString(),
        categorias,
        subcategorias,
        medios_pago: medios,
        movimientos: movimientos.map((m) => {

          const sub = subPorId.get(m.subcategoria_id);
          const categoria = sub
            ? categoriaPorId.get(sub.categoria_id)
            : null;
          const medio = medioPorId.get(m.medio_pago_id);

          return {
            uuid: m.uuid,
            fecha: m.fecha,
            monto: String(m.monto),
            tipo: m.tipo,
            categoria: categoria ? categoria.nombre : null,
            subcategoria: sub ? sub.nombre : null,
            medio_pago: medio ? medio.nombre : null,
            descripcion: m.descripcion || null,
            comentario: m.comentario || null,
            actualizado: m.actualizado,
          };
        }),
      };
    },

    /**
     * Descarga la copia como archivo.
     */
    async exportar() {

      const copia = await this.construir();
      const texto = JSON.stringify(copia, null, 2);

      const enlace = document.createElement("a");
      const url = URL.createObjectURL(
        new Blob([texto], { type: "application/json" })
      );

      enlace.href = url;
      enlace.download = nombreArchivo();
      document.body.appendChild(enlace);
      enlace.click();
      document.body.removeChild(enlace);

      URL.revokeObjectURL(url);

      await DATOS.guardarAjuste("ultima_copia", new Date().toISOString());

      return copia.movimientos.length;
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

      const movimientos = [];

      for (const entrada of copia.movimientos) {

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

        movimientos.push({
          uuid: entrada.uuid,
          fecha: entrada.fecha,
          monto: entrada.monto,
          tipo: entrada.tipo,
          subcategoria_id: sub ? sub.id : null,
          medio_pago_id: medio ? medio.id : null,
          descripcion: entrada.descripcion || null,
          comentario: entrada.comentario || null,
          actualizado: entrada.actualizado || new Date().toISOString(),
        });
      }

      await DATOS.guardarCatalogo("categorias", categorias);
      await DATOS.guardarCatalogo("subcategorias", subcategorias);
      await DATOS.guardarCatalogo("medios_pago", medios);
      await DATOS.escribirVarios(movimientos);

      return movimientos.length;
    },
  };

})();
