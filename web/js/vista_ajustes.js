/* =====================================================================
   Pestaña Ajustes: copia de seguridad, categorías y subcategorías
   (crear, editar, mover y eliminar), medios de pago y utilidades.

   Al eliminar algo que se está usando, nunca se pierden datos: la
   persona elige a dónde pasan los movimientos (y los gastos fijos).
   ===================================================================== */

const AJUSTES = (() => {

  const { $, $$, estado, euros, avisar, avisarConAccion, rutaSub } = APP;

  const abiertas = new Set();     // categorías desplegadas

  const ICONOS = {
    editar: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/></svg>',
    borrar: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/></svg>',
    mas: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
    flecha: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>',
  };

  const boton = (clase, icono, etiqueta, accion) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = `icono ${clase}`;
    b.innerHTML = ICONOS[icono];
    b.setAttribute("aria-label", etiqueta);
    b.addEventListener("click", (e) => { e.stopPropagation(); accion(); });
    return b;
  };

  const igual = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();

  // ------------------------------------------------------------------
  // Usos: qué depende de una subcategoría o de un medio de pago
  // ------------------------------------------------------------------

  const movimientosDe = (subIds) => estado.todos.filter((m) => subIds.includes(m.subcategoria_id));
  const fijosDe = (subIds) => estado.fijos.filter((f) => subIds.includes(f.subcategoria_id));

  async function recargar() {
    await APP.cargarCatalogos();
    await APP.refrescar();
  }

  /** Pasa movimientos y fijos de unas subcategorías a otra. */
  async function reasignar(subIds, destinoId) {

    const ahora = new Date().toISOString();

    const movs = movimientosDe(subIds).map((m) => ({ ...m, subcategoria_id: destinoId, actualizado: ahora }));
    await DATOS.escribirVarios(movs);

    if (fijosDe(subIds).length) {
      estado.fijos = estado.fijos.map((f) =>
        subIds.includes(f.subcategoria_id) ? { ...f, subcategoria_id: destinoId } : f);
      await DATOS.guardarAjuste("fijos", estado.fijos);
    }

    return movs.length;
  }

  const textoUsos = (nMov, nFijos) => {
    const partes = [];
    if (nMov) partes.push(`${nMov} movimiento${nMov === 1 ? "" : "s"}`);
    if (nFijos) partes.push(`${nFijos} gasto${nFijos === 1 ? "" : "s"} fijo${nFijos === 1 ? "" : "s"}`);
    return partes.join(" y ");
  };

  // ------------------------------------------------------------------
  // Categorías
  // ------------------------------------------------------------------

  async function nuevaCategoria() {

    const r = await DIALOGO.formulario({
      titulo: "Nueva categoría",
      aceptar: "Crear",
      campos: [
        { id: "nombre", tipo: "texto", etiqueta: "Nombre", requerido: true, maxlength: 40, placeholder: "Mascotas" },
        { id: "tipo", tipo: "select", etiqueta: "Tipo", valor: "gasto",
          opciones: [{ valor: "gasto", texto: "Gastos" }, { valor: "ingreso", texto: "Ingresos" }] },
      ],
      validar: (v) => estado.categorias.some((c) => igual(c.nombre, v.nombre))
        ? "Ya existe una categoría con ese nombre." : null,
    });

    if (!r) return;

    const nueva = await DATOS.anadirAlCatalogo("categorias", { nombre: r.nombre, tipo: r.tipo });
    abiertas.add(nueva.id);
    await APP.cargarCatalogos();
    avisar("Categoría creada");
    pintar();
  }

  async function editarCategoria(cat) {

    const subIds = estado.subcategorias.filter((s) => s.categoria_id === cat.id).map((s) => s.id);
    const enUso = movimientosDe(subIds).length + fijosDe(subIds).length > 0;

    const r = await DIALOGO.formulario({
      titulo: "Editar categoría",
      aceptar: "Guardar cambios",
      campos: [
        { id: "nombre", tipo: "texto", etiqueta: "Nombre", valor: cat.nombre, requerido: true, maxlength: 40 },
        { id: "tipo", tipo: "select", etiqueta: "Tipo", valor: cat.tipo, deshabilitado: enUso,
          ayuda: enUso ? "No se puede cambiar el tipo mientras tenga movimientos." : "",
          opciones: [{ valor: "gasto", texto: "Gastos" }, { valor: "ingreso", texto: "Ingresos" }] },
      ],
      validar: (v) => estado.categorias.some((c) => c.id !== cat.id && igual(c.nombre, v.nombre))
        ? "Ya existe una categoría con ese nombre." : null,
    });

    if (!r) return;

    await DATOS.guardarCatalogo("categorias", estado.categorias.map((c) =>
      c.id === cat.id ? { ...c, nombre: r.nombre, tipo: enUso ? c.tipo : r.tipo } : c));

    await APP.cargarCatalogos();
    avisar("Categoría actualizada");
    pintar();
  }

  async function eliminarCategoria(cat) {

    const subs = estado.subcategorias.filter((s) => s.categoria_id === cat.id);
    const subIds = subs.map((s) => s.id);
    const nMov = movimientosDe(subIds).length;
    const nFijos = fijosDe(subIds).length;

    let destino = null;

    if (nMov || nFijos) {

      const opciones = APP.opcionesSub({ tipo: cat.tipo, excluirCategoria: cat.id });

      if (!opciones.length) {
        await DIALOGO.confirmar({
          titulo: "No se puede eliminar",
          mensaje: `«${cat.nombre}» tiene ${textoUsos(nMov, nFijos)} y no hay otra categoría de ${cat.tipo === "gasto" ? "gastos" : "ingresos"} a la que pasarlos. Crea una primero.`,
          aceptar: "Entendido",
          cancelar: "Cerrar",
        });
        return;
      }

      const r = await DIALOGO.formulario({
        titulo: `Eliminar «${cat.nombre}»`,
        mensaje: `Tiene ${textoUsos(nMov, nFijos)}. Elige a qué subcategoría pasarán antes de eliminarla.`,
        aceptar: "Mover y eliminar",
        campos: [{ id: "destino", tipo: "select", etiqueta: "Pasar a", opciones }],
      });

      if (!r) return;
      destino = Number(r.destino);

    } else {

      const ok = await DIALOGO.confirmar({
        titulo: `Eliminar «${cat.nombre}»`,
        mensaje: subs.length
          ? `Se eliminarán también sus ${subs.length} subcategoría${subs.length === 1 ? "" : "s"}. No tiene movimientos.`
          : "No tiene movimientos.",
        aceptar: "Eliminar",
        peligro: true,
      });

      if (!ok) return;
    }

    if (destino !== null) await reasignar(subIds, destino);

    await DATOS.guardarCatalogo("subcategorias",
      estado.subcategorias.filter((s) => s.categoria_id !== cat.id));
    await DATOS.guardarCatalogo("categorias",
      estado.categorias.filter((c) => c.id !== cat.id));

    if (estado.presupuestos[cat.id]) {
      const topes = { ...estado.presupuestos };
      delete topes[cat.id];
      await DATOS.guardarAjuste("presupuestos", topes);
    }

    abiertas.delete(cat.id);
    await recargar();
    avisar("Categoría eliminada");
    pintar();
  }

  // ------------------------------------------------------------------
  // Subcategorías
  // ------------------------------------------------------------------

  async function nuevaSub(cat) {

    const r = await DIALOGO.formulario({
      titulo: `Nueva subcategoría en ${cat.nombre}`,
      aceptar: "Crear",
      campos: [{ id: "nombre", tipo: "texto", etiqueta: "Nombre", requerido: true, maxlength: 40 }],
      validar: (v) => estado.subcategorias.some((s) => s.categoria_id === cat.id && igual(s.nombre, v.nombre))
        ? "Esa categoría ya tiene una subcategoría con ese nombre." : null,
    });

    if (!r) return;

    await DATOS.anadirAlCatalogo("subcategorias", { nombre: r.nombre, categoria_id: cat.id });
    abiertas.add(cat.id);
    await APP.cargarCatalogos();
    avisar("Subcategoría creada");
    pintar();
  }

  async function editarSub(sub) {

    const cat = estado.categoriasPorId.get(sub.categoria_id);
    const mismas = estado.categorias
      .filter((c) => c.tipo === (cat ? cat.tipo : "gasto"))
      .map((c) => ({ valor: String(c.id), texto: c.nombre }));

    const r = await DIALOGO.formulario({
      titulo: "Editar subcategoría",
      aceptar: "Guardar cambios",
      campos: [
        { id: "nombre", tipo: "texto", etiqueta: "Nombre", valor: sub.nombre, requerido: true, maxlength: 40 },
        { id: "cat", tipo: "select", etiqueta: "Categoría", valor: sub.categoria_id, opciones: mismas,
          ayuda: "Si la cambias, sus movimientos pasan con ella." },
      ],
      validar: (v) => estado.subcategorias.some((s) =>
        s.id !== sub.id && s.categoria_id === Number(v.cat) && igual(s.nombre, v.nombre))
        ? "Esa categoría ya tiene una subcategoría con ese nombre." : null,
    });

    if (!r) return;

    await DATOS.guardarCatalogo("subcategorias", estado.subcategorias.map((s) =>
      s.id === sub.id ? { ...s, nombre: r.nombre, categoria_id: Number(r.cat) } : s));

    abiertas.add(Number(r.cat));
    await recargar();
    avisar("Subcategoría actualizada");
    pintar();
  }

  async function eliminarSub(sub) {

    const cat = estado.categoriasPorId.get(sub.categoria_id);
    const nMov = movimientosDe([sub.id]).length;
    const nFijos = fijosDe([sub.id]).length;

    let destino = null;

    if (nMov || nFijos) {

      const opciones = APP.opcionesSub({ tipo: cat ? cat.tipo : null, excluirSub: sub.id });

      if (!opciones.length) {
        await DIALOGO.confirmar({
          titulo: "No se puede eliminar",
          mensaje: `«${sub.nombre}» tiene ${textoUsos(nMov, nFijos)} y no hay otra subcategoría a la que pasarlos.`,
          aceptar: "Entendido",
          cancelar: "Cerrar",
        });
        return;
      }

      const r = await DIALOGO.formulario({
        titulo: `Eliminar «${sub.nombre}»`,
        mensaje: `Tiene ${textoUsos(nMov, nFijos)}. Elige a qué subcategoría pasarán.`,
        aceptar: "Mover y eliminar",
        campos: [{ id: "destino", tipo: "select", etiqueta: "Pasar a", opciones }],
      });

      if (!r) return;
      destino = Number(r.destino);

    } else {

      const ok = await DIALOGO.confirmar({
        titulo: `Eliminar «${sub.nombre}»`,
        mensaje: "No tiene movimientos.",
        aceptar: "Eliminar",
        peligro: true,
      });

      if (!ok) return;
    }

    if (destino !== null) await reasignar([sub.id], destino);

    await DATOS.quitarDelCatalogo("subcategorias", sub.id);
    await recargar();
    avisar("Subcategoría eliminada");
    pintar();
  }

  // ------------------------------------------------------------------
  // Pintado de categorías
  // ------------------------------------------------------------------

  function pintarCategorias() {

    const zona = $("#lista-categorias");
    zona.innerHTML = "";

    const usos = new Map();
    estado.todos.forEach((m) => usos.set(m.subcategoria_id, (usos.get(m.subcategoria_id) || 0) + 1));

    estado.categorias.forEach((cat) => {

      const subs = estado.subcategorias.filter((s) => s.categoria_id === cat.id);
      const nMov = subs.reduce((t, s) => t + (usos.get(s.id) || 0), 0);
      const abierta = abiertas.has(cat.id);

      const tarjeta = document.createElement("div");
      tarjeta.className = "cat" + (abierta ? " cat--abierta" : "");

      const cab = document.createElement("div");
      cab.className = "cat__cab";

      const titulo = document.createElement("button");
      titulo.type = "button";
      titulo.className = "cat__titulo";
      titulo.setAttribute("aria-expanded", String(abierta));
      titulo.innerHTML = `
        <span class="cat__flecha">${ICONOS.flecha}</span>
        <span class="cat__texto">
          <span class="cat__nombre"></span>
          <span class="cat__meta"></span>
        </span>
        <span class="etiqueta"></span>`;

      titulo.querySelector(".cat__nombre").textContent = cat.nombre;
      titulo.querySelector(".cat__meta").textContent =
        `${subs.length} subcategoría${subs.length === 1 ? "" : "s"} · ${nMov} movimiento${nMov === 1 ? "" : "s"}`;
      const etiqueta = titulo.querySelector(".etiqueta");
      etiqueta.textContent = cat.tipo;
      etiqueta.classList.add(`etiqueta--${cat.tipo}`);

      titulo.addEventListener("click", () => {
        if (abiertas.has(cat.id)) abiertas.delete(cat.id); else abiertas.add(cat.id);
        pintarCategorias();
      });

      cab.appendChild(titulo);
      cab.appendChild(boton("", "editar", `Editar ${cat.nombre}`, () => editarCategoria(cat)));
      cab.appendChild(boton("icono--peligro", "borrar", `Eliminar ${cat.nombre}`, () => eliminarCategoria(cat)));
      tarjeta.appendChild(cab);

      if (abierta) {

        const cuerpo = document.createElement("div");
        cuerpo.className = "cat__subs";

        subs.forEach((sub) => {

          const fila = document.createElement("div");
          fila.className = "sub";
          fila.innerHTML = '<span class="sub__nombre"></span><span class="sub__n"></span>';
          fila.querySelector(".sub__nombre").textContent = sub.nombre;
          fila.querySelector(".sub__n").textContent = usos.get(sub.id) || 0;

          fila.appendChild(boton("", "editar", `Editar ${sub.nombre}`, () => editarSub(sub)));
          fila.appendChild(boton("icono--peligro", "borrar", `Eliminar ${sub.nombre}`, () => eliminarSub(sub)));
          cuerpo.appendChild(fila);
        });

        const nueva = document.createElement("button");
        nueva.type = "button";
        nueva.className = "sub-nueva";
        nueva.innerHTML = `${ICONOS.mas}<span>Añadir subcategoría</span>`;
        nueva.addEventListener("click", () => nuevaSub(cat));
        cuerpo.appendChild(nueva);

        tarjeta.appendChild(cuerpo);
      }

      zona.appendChild(tarjeta);
    });
  }

  // ------------------------------------------------------------------
  // Medios de pago
  // ------------------------------------------------------------------

  async function nuevoMedio() {

    const r = await DIALOGO.formulario({
      titulo: "Nuevo medio de pago",
      aceptar: "Crear",
      campos: [{ id: "nombre", tipo: "texto", etiqueta: "Nombre", requerido: true, maxlength: 30, placeholder: "Tarjeta de crédito" }],
      validar: (v) => estado.medios.some((m) => igual(m.nombre, v.nombre)) ? "Ya existe ese medio de pago." : null,
    });

    if (!r) return;

    await DATOS.anadirAlCatalogo("medios_pago", { nombre: r.nombre });
    await APP.cargarCatalogos();
    avisar("Medio de pago creado");
    pintar();
  }

  async function editarMedio(medio) {

    const r = await DIALOGO.formulario({
      titulo: "Editar medio de pago",
      aceptar: "Guardar cambios",
      campos: [{ id: "nombre", tipo: "texto", etiqueta: "Nombre", valor: medio.nombre, requerido: true, maxlength: 30 }],
      validar: (v) => estado.medios.some((m) => m.id !== medio.id && igual(m.nombre, v.nombre)) ? "Ya existe ese medio de pago." : null,
    });

    if (!r) return;

    await DATOS.renombrarEnCatalogo("medios_pago", medio.id, r.nombre);
    await APP.cargarCatalogos();
    avisar("Medio de pago actualizado");
    pintar();
  }

  async function eliminarMedio(medio) {

    const movs = estado.todos.filter((m) => m.medio_pago_id === medio.id);
    const fijos = estado.fijos.filter((f) => f.medio_pago_id === medio.id);

    let destino = null;

    if (movs.length || fijos.length) {

      const opciones = [{ valor: "", texto: "Sin medio de pago" }].concat(
        estado.medios.filter((m) => m.id !== medio.id).map((m) => ({ valor: String(m.id), texto: m.nombre })));

      const r = await DIALOGO.formulario({
        titulo: `Eliminar «${medio.nombre}»`,
        mensaje: `Tiene ${textoUsos(movs.length, fijos.length)}. Elige con qué medio quedarán.`,
        aceptar: "Mover y eliminar",
        campos: [{ id: "destino", tipo: "select", etiqueta: "Pasar a", opciones }],
      });

      if (!r) return;
      destino = r.destino ? Number(r.destino) : null;

      const ahora = new Date().toISOString();
      await DATOS.escribirVarios(movs.map((m) => ({ ...m, medio_pago_id: destino, actualizado: ahora })));

      if (fijos.length) {
        estado.fijos = estado.fijos.map((f) => f.medio_pago_id === medio.id ? { ...f, medio_pago_id: destino } : f);
        await DATOS.guardarAjuste("fijos", estado.fijos);
      }

    } else {

      const ok = await DIALOGO.confirmar({
        titulo: `Eliminar «${medio.nombre}»`,
        mensaje: "No se está usando.",
        aceptar: "Eliminar",
        peligro: true,
      });

      if (!ok) return;
    }

    await DATOS.quitarDelCatalogo("medios_pago", medio.id);
    await recargar();
    avisar("Medio de pago eliminado");
    pintar();
  }

  function pintarMedios() {

    const zona = $("#lista-medios");
    zona.innerHTML = "";

    estado.medios.forEach((medio) => {

      const n = estado.todos.filter((m) => m.medio_pago_id === medio.id).length;

      const fila = document.createElement("div");
      fila.className = "sub sub--medio";
      fila.innerHTML = '<span class="sub__nombre"></span><span class="sub__n"></span>';
      fila.querySelector(".sub__nombre").textContent = medio.nombre;
      fila.querySelector(".sub__n").textContent = n;

      fila.appendChild(boton("", "editar", `Editar ${medio.nombre}`, () => editarMedio(medio)));
      fila.appendChild(boton("icono--peligro", "borrar", `Eliminar ${medio.nombre}`, () => eliminarMedio(medio)));
      zona.appendChild(fila);
    });
  }

  // ------------------------------------------------------------------
  // Unir subcategorías
  // ------------------------------------------------------------------

  function pintarUnir() {

    const usos = new Map();
    estado.todos.forEach((m) => usos.set(m.subcategoria_id, (usos.get(m.subcategoria_id) || 0) + 1));

    ["#mover-origen", "#mover-destino"].forEach((selector) => {

      const select = $(selector);
      const anterior = select.value;
      select.innerHTML = "";

      estado.categorias.forEach((categoria) => {

        const subs = estado.subcategorias.filter((s) => s.categoria_id === categoria.id);
        if (!subs.length) return;

        const grupo = document.createElement("optgroup");
        grupo.label = `${categoria.nombre} (${categoria.tipo})`;

        subs.forEach((sub) => {
          const opcion = document.createElement("option");
          opcion.value = sub.id;
          opcion.textContent = `${sub.nombre} · ${usos.get(sub.id) || 0}`;
          grupo.appendChild(opcion);
        });

        select.appendChild(grupo);
      });

      if (anterior) select.value = anterior;
    });
  }

  async function unirSubcategorias() {

    const origenId = Number($("#mover-origen").value);
    const destinoId = Number($("#mover-destino").value);

    if (!origenId || !destinoId) return;

    if (origenId === destinoId) {
      avisar("Elige dos subcategorías distintas", true);
      return;
    }

    const origen = estado.subcategoriasPorId.get(origenId);
    const destino = estado.subcategoriasPorId.get(destinoId);
    const catOrigen = estado.categoriasPorId.get(origen.categoria_id);
    const catDestino = estado.categoriasPorId.get(destino.categoria_id);

    // Un gasto no debe acabar en una categoría de ingresos, ni al revés.
    if (catOrigen && catDestino && catOrigen.tipo !== catDestino.tipo) {
      avisar("No se puede mover entre gastos e ingresos", true);
      return;
    }

    const afectados = movimientosDe([origenId]);

    if (!afectados.length && !fijosDe([origenId]).length) {
      avisar("Esa subcategoría no tiene movimientos", true);
    } else {

      const ok = await DIALOGO.confirmar({
        titulo: "Unir subcategorías",
        mensaje: `Se moverán ${textoUsos(afectados.length, fijosDe([origenId]).length)}\nde «${rutaSub(origenId)}»\na «${rutaSub(destinoId)}».`,
        aceptar: "Mover",
      });

      if (!ok) return;

      const originales = afectados.map((m) => ({ ...m }));
      const fijosAntes = estado.fijos.map((f) => ({ ...f }));

      await reasignar([origenId], destinoId);
      await APP.refrescar();
      pintar();

      avisarConAccion(`${afectados.length} movimientos movidos`, "Deshacer", async () => {
        await DATOS.escribirVarios(originales);
        estado.fijos = fijosAntes;
        await DATOS.guardarAjuste("fijos", fijosAntes);
        await APP.refrescar();
        pintar();
        avisar("Deshecho");
      });
    }

    // Si la de origen quedó vacía, se ofrece quitarla.
    const quedan = estado.todos.some((m) => m.subcategoria_id === origenId);

    if (!quedan) {
      const quitar = await DIALOGO.confirmar({
        titulo: "Subcategoría vacía",
        mensaje: `«${rutaSub(origenId)}» quedó sin movimientos. ¿Quieres quitarla?`,
        aceptar: "Quitarla",
        cancelar: "Dejarla",
      });

      if (quitar) {
        await DATOS.quitarDelCatalogo("subcategorias", origenId);
        await recargar();
        pintar();
      }
    }
  }

  // ------------------------------------------------------------------
  // Copia de seguridad
  // ------------------------------------------------------------------

  async function pintarEstadoCopia() {

    const ultima = await DATOS.ajuste("ultima_copia");
    const nota = $("#estado-copia");

    if (!ultima) {
      nota.textContent =
        "Nunca has hecho una copia. Tus datos están solo en este dispositivo.";
      nota.classList.add("bloque__nota--aviso");
      return;
    }

    const dias = Math.floor(
      (Date.now() - new Date(ultima).getTime()) / 86400000
    );

    nota.classList.toggle("bloque__nota--aviso", dias > 14);

    nota.textContent = dias < 1
      ? "Última copia: hoy."
      : `Última copia hace ${dias} día(s).`;
  }

  async function exportar() {

    try {
      const resultado = await COPIA.exportar();

      // null = cerró el menú de compartir sin guardar.
      if (!resultado) return;

      if (resultado.via === "compartir") {
        avisar(`Copia enviada · ${resultado.total} movimientos`);
      } else {
        // Sin menú de compartir el archivo queda en Descargas: se explica
        // por qué, para que no parezca que no pasó nada.
        await DIALOGO.confirmar({
          titulo: "Copia descargada",
          mensaje: `Se guardó en la carpeta Descargas (${resultado.total} movimientos).\n\nMotivo: ${resultado.motivo}.\n\nSúbela a Drive desde la app Archivos o Drive.`,
          aceptar: "Entendido",
          cancelar: "Cerrar",
        });
      }

      await pintarEstadoCopia();
    } catch (error) {
      avisar("No se pudo crear la copia", true);
    }
  }

  async function importar(evento) {

    // Se pueden elegir varios archivos a la vez (el CSV del histórico
    // y todas las copias JSON de Drive). Como cada movimiento lleva su
    // uuid, lo que falta en uno lo completa otro sin duplicar nada.
    const archivos = [...evento.target.files];

    if (!archivos.length) return;

    const modo = await DIALOGO.formulario({
      titulo: "Importar",
      mensaje: `${archivos.length} archivo${archivos.length === 1 ? "" : "s"} seleccionado${archivos.length === 1 ? "" : "s"}.`,
      aceptar: "Importar",
      campos: [{
        id: "modo", tipo: "select", etiqueta: "Qué hacer con lo que ya tienes", valor: "anadir",
        opciones: [
          { valor: "anadir", texto: "Añadir lo importado (recomendado)" },
          { valor: "reemplazar", texto: "Reemplazar todo lo actual" },
        ],
      }],
    });

    if (!modo) {
      evento.target.value = "";
      return;
    }

    const reemplazar = modo.modo === "reemplazar";

    // El CSV (histórico grande) entra primero y las copias van encima.
    archivos.sort((a, b) => a.name.localeCompare(b.name));

    let totalGlobal = 0;
    let errores = 0;

    try {

      for (let i = 0; i < archivos.length; i += 1) {

        const archivo = archivos[i];

        try {

          let texto = await archivo.text();

          if (IMPORTARCSV.pareceCSV(texto, archivo.name)) {
            texto = IMPORTARCSV.aCopiaJSON(texto);
          }

          // Solo el primer archivo puede reemplazar; el resto se acumula.
          const total = await COPIA.importar(texto, {
            reemplazar: reemplazar && i === 0,
          });

          totalGlobal += total;

        } catch (error) {
          errores += 1;
        }
      }

      await APP.cargarCatalogos();
      await APP.refrescar();
      pintar();

      avisar(errores
        ? `${totalGlobal} movimientos · ${errores} archivo(s) con error`
        : `${totalGlobal} movimientos importados`, errores > 0);

    } catch (error) {
      avisar(error.message, true);
    } finally {
      evento.target.value = "";
    }
  }

  // ------------------------------------------------------------------
  // Pestaña
  // ------------------------------------------------------------------

  function pintar() {
    pintarEstadoCopia();
    pintarCategorias();
    pintarMedios();
    pintarUnir();
    $("#sobre").textContent =
      `${estado.todos.length} movimientos guardados en este dispositivo.`;
  }

  function conectar() {
    $("#exportar").addEventListener("click", exportar);
    $("#elegir-archivo").addEventListener("click", () => $("#archivo").click());
    $("#archivo").addEventListener("change", importar);
    $("#nueva-categoria").addEventListener("click", nuevaCategoria);
    $("#nuevo-medio").addEventListener("click", nuevoMedio);
    $("#mover").addEventListener("click", unirSubcategorias);
  }

  conectar();
  APP.registrar("ajustes", { pintar });

  return { exportar };

})();
