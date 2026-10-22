/* =====================================================================
   Pestaña Planificar: gastos fijos y presupuestos.

   Gastos fijos
     Cada fijo es una plantilla: nombre, importe, día del mes, categoría
     y medio de pago. «Registrar» crea el movimiento del mes con un
     toque y lo vincula al fijo (fijo_id), así se sabe qué está pagado.

   Presupuestos
     Un tope mensual por categoría de gasto.
   ===================================================================== */

const FIJOS = (() => {

  const { $, $$, estado, euros, mesLargo, iso, identificador, avisar, avisarConAccion } = APP;

  const guardarFijos = async (lista) => {
    estado.fijos = lista;
    await DATOS.guardarAjuste("fijos", lista);
  };

  const esMesActual = () => {
    const hoy = new Date();
    return estado.mes.getFullYear() === hoy.getFullYear() && estado.mes.getMonth() === hoy.getMonth();
  };

  /** Fecha del movimiento al registrar un fijo en el mes que se está viendo. */
  function fechaParaFijo(fijo) {
    const anio = estado.mes.getFullYear();
    const mes = estado.mes.getMonth();
    const ultimo = new Date(anio, mes + 1, 0).getDate();
    let dia = Math.min(fijo.dia, ultimo);
    if (esMesActual()) dia = Math.min(dia, new Date().getDate());
    return iso(new Date(anio, mes, dia));
  }

  /**
   * Registra el fijo como movimiento del mes actual, con un toque.
   */
  async function registrar(fijo) {

    const movimiento = {
      uuid: identificador(),
      fecha: fechaParaFijo(fijo),
      monto: String(fijo.monto),
      tipo: fijo.tipo,
      subcategoria_id: fijo.subcategoria_id,
      medio_pago_id: fijo.medio_pago_id || null,
      descripcion: fijo.nombre,
      comentario: null,
      fijo_id: fijo.id,
    };

    const guardado = await DATOS.guardar(movimiento);
    await APP.refrescar();

    avisarConAccion(`${fijo.nombre} registrado`, "Deshacer", async () => {
      await DATOS.eliminar(guardado.uuid);
      await APP.refrescar();
    });
  }

  // ------------------------------------------------------------------
  // Formulario de fijo
  // ------------------------------------------------------------------

  async function formulario(fijo = null, plantilla = null) {

    const origen = fijo || plantilla || {};
    const medios = [{ valor: "", texto: "Sin medio de pago" }].concat(
      estado.medios.map((m) => ({ valor: String(m.id), texto: m.nombre }))
    );

    const subs = APP.opcionesSub();
    if (!subs.length) {
      avisar("Primero crea una categoría en Ajustes", true);
      return;
    }

    const respuesta = await DIALOGO.formulario({
      titulo: fijo ? "Editar gasto fijo" : "Nuevo gasto fijo",
      aceptar: fijo ? "Guardar cambios" : "Crear fijo",
      extra: fijo ? { texto: "Eliminar", valor: "eliminar" } : null,
      campos: [
        { id: "nombre", tipo: "texto", etiqueta: "Nombre", valor: origen.nombre || "", requerido: true, placeholder: "Internet", maxlength: 60 },
        { id: "monto", tipo: "monto", etiqueta: "Importe", valor: origen.monto ? String(origen.monto).replace(".", ",") : "", requerido: true, placeholder: "0,00" },
        { id: "dia", tipo: "numero", etiqueta: "Día del mes en que se paga", valor: origen.dia || 1, min: 1, max: 31 },
        { id: "sub", tipo: "select", etiqueta: "Categoría", valor: origen.subcategoria_id, opciones: subs },
        { id: "medio", tipo: "select", etiqueta: "Medio de pago", valor: origen.medio_pago_id || "", opciones: medios },
        ...(fijo ? [{
          id: "estado", tipo: "select", etiqueta: "Estado", valor: fijo.activo === false ? "pausa" : "activo",
          opciones: [{ valor: "activo", texto: "Activo" }, { valor: "pausa", texto: "En pausa (no se recuerda)" }],
        }] : []),
      ],
    });

    if (!respuesta) return;

    if (respuesta.__extra === "eliminar") {
      await eliminar(fijo);
      return;
    }

    const subId = Number(respuesta.sub);
    const sub = estado.subcategoriasPorId.get(subId);
    const cat = sub ? estado.categoriasPorId.get(sub.categoria_id) : null;

    const nuevo = {
      id: fijo ? fijo.id : identificador(),
      nombre: respuesta.nombre,
      monto: respuesta.monto,
      dia: respuesta.dia,
      tipo: cat ? cat.tipo : "gasto",
      subcategoria_id: subId,
      medio_pago_id: respuesta.medio ? Number(respuesta.medio) : null,
      activo: fijo ? respuesta.estado !== "pausa" : true,
    };

    const lista = fijo
      ? estado.fijos.map((f) => (f.id === fijo.id ? nuevo : f))
      : [...estado.fijos, nuevo];

    await guardarFijos(lista);
    avisar(fijo ? "Fijo actualizado" : "Fijo creado");
    pintar();
    APP.repintar();
  }

  async function eliminar(fijo) {

    const ok = await DIALOGO.confirmar({
      titulo: "Eliminar gasto fijo",
      mensaje: `«${fijo.nombre}» dejará de recordarse. Los movimientos que ya registraste no se borran.`,
      aceptar: "Eliminar",
      peligro: true,
    });

    if (!ok) return;

    await guardarFijos(estado.fijos.filter((f) => f.id !== fijo.id));
    avisar("Fijo eliminado");
    pintar();
  }

  async function alternarActivo(fijo) {
    await guardarFijos(estado.fijos.map((f) =>
      f.id === fijo.id ? { ...f, activo: f.activo === false } : f));
    pintar();
  }

  // ------------------------------------------------------------------
  // Pintado de la lista de fijos
  // ------------------------------------------------------------------

  function pintarFijos() {

    $("#fijos-mes").textContent = mesLargo.format(estado.mes);

    const lista = $("#fijos-lista");
    lista.innerHTML = "";

    const estados = INTEL.estadoFijos(estado.todos, estado.mes, estado.fijos)
      .sort((a, b) =>
        (a.fijo.activo === false) - (b.fijo.activo === false) || a.fijo.dia - b.fijo.dia);

    const activos = estados.filter((e) => e.fijo.activo !== false);
    const pagados = activos.filter((e) => e.pagado).length;
    const total = activos.reduce((t, e) => t + (Number(e.fijo.monto) || 0), 0);
    const pagadoMonto = activos.filter((e) => e.pagado).reduce((t, e) => t + (Number(e.fijo.monto) || 0), 0);

    const resumen = $("#fijos-resumen");
    resumen.hidden = !estado.fijos.length;
    if (estado.fijos.length) {
      APP.contar($("#fijos-total"), total);
      $("#fijos-detalle").textContent =
        `${pagados} de ${activos.length} registrados · ${euros.format(pagadoMonto)} de ${euros.format(total)}`;
      $("#fijos-progreso").style.width = `${activos.length ? (pagados / activos.length) * 100 : 0}%`;
    }

    if (!estado.fijos.length) {
      lista.innerHTML = `
        <div class="vacio">
          <span class="vacio__signo">↻</span>
          Aún no tienes gastos fijos.<br>Crea el primero con «Nuevo fijo» o elige uno sugerido.
        </div>`;
    }

    estados.forEach(({ fijo, pagado, movimiento }) => {

      const pausado = fijo.activo === false;
      const sub = estado.subcategoriasPorId.get(fijo.subcategoria_id);

      const fila = document.createElement("div");
      fila.className = "fijo" + (pausado ? " fijo--pausado" : "") + (pagado ? " fijo--pagado" : "");
      fila.innerHTML = `
        <button type="button" class="fijo__cuerpo" aria-label="Editar">
          <span class="fijo__dia"></span>
          <span class="fijo__texto">
            <span class="fijo__nombre"></span>
            <span class="fijo__meta"></span>
          </span>
        </button>
        <span class="fijo__lado">
          <span class="fijo__monto"></span>
          <span class="fijo__accion"></span>
        </span>`;

      fila.querySelector(".fijo__dia").textContent = fijo.dia;
      fila.querySelector(".fijo__nombre").textContent = fijo.nombre;
      fila.querySelector(".fijo__meta").textContent =
        [sub ? sub.nombre : null, pausado ? "En pausa" : null].filter(Boolean).join(" · ");
      fila.querySelector(".fijo__monto").textContent = euros.format(Number(fijo.monto));

      const accion = fila.querySelector(".fijo__accion");

      if (pausado) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "mini mini--suave";
        b.textContent = "Reactivar";
        b.addEventListener("click", () => alternarActivo(fijo));
        accion.appendChild(b);
      } else if (pagado) {
        const ok = document.createElement("span");
        ok.className = "mini mini--ok";
        ok.textContent = "✓ Registrado";
        accion.appendChild(ok);
      } else {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "mini mini--principal";
        b.textContent = "Registrar";
        b.addEventListener("click", () => registrar(fijo));
        accion.appendChild(b);
      }

      fila.querySelector(".fijo__cuerpo").addEventListener("click", () => formulario(fijo));

      lista.appendChild(fila);
    });

    pintarSugeridos();
  }

  function pintarSugeridos() {

    const bloque = $("#fijos-sugeridos");
    const lista = INTEL.sugerencias(estado.todos, estado.mes, estado.fijos, estado.descartados);

    bloque.hidden = !lista.length;
    const zona = $("#sugeridos-lista");
    zona.innerHTML = "";

    lista.forEach((r) => {

      const sub = estado.subcategoriasPorId.get(r.subcategoria_id);
      const nombre = r.descripcion || (sub ? sub.nombre : "Movimiento");

      const fila = document.createElement("div");
      fila.className = "sugerido";
      fila.innerHTML = `
        <span class="sugerido__texto">
          <span class="sugerido__nombre"></span>
          <span class="sugerido__meta"></span>
        </span>
        <button type="button" class="mini mini--principal">Añadir</button>
        <button type="button" class="chip__quitar" aria-label="Descartar">×</button>`;

      fila.querySelector(".sugerido__nombre").textContent = nombre;
      fila.querySelector(".sugerido__meta").textContent =
        `${euros.format(r.monto)} · hacia el día ${r.dia}`;

      fila.querySelector(".mini").addEventListener("click", () => formulario(null, {
        nombre,
        monto: r.monto,
        dia: r.dia,
        subcategoria_id: r.subcategoria_id,
        medio_pago_id: r.medio_pago_id,
      }));

      fila.querySelector(".chip__quitar").addEventListener("click", async () => {
        estado.descartados = [...estado.descartados, r.key];
        await DATOS.guardarAjuste("fijos_descartados", estado.descartados);
        pintarSugeridos();
      });

      zona.appendChild(fila);
    });
  }

  // ------------------------------------------------------------------
  // Presupuestos
  // ------------------------------------------------------------------

  function pintarPresupuestos() {

    $("#pres-mes").textContent = mesLargo.format(estado.mes);

    const zona = $("#pres-lista");
    zona.innerHTML = "";

    const gastado = new Map();
    APP.delMes().filter((m) => m.tipo === "gasto").forEach((m) => {
      const sub = estado.subcategoriasPorId.get(m.subcategoria_id);
      if (!sub) return;
      gastado.set(sub.categoria_id, (gastado.get(sub.categoria_id) || 0) + (Number(m.monto) || 0));
    });

    const categorias = estado.categorias.filter((c) => c.tipo === "gasto");

    const conTope = categorias.filter((c) => Number(estado.presupuestos[c.id]) > 0);
    const totalTope = conTope.reduce((t, c) => t + Number(estado.presupuestos[c.id]), 0);
    const totalGastado = conTope.reduce((t, c) => t + (gastado.get(c.id) || 0), 0);

    const resumen = $("#pres-resumen");
    resumen.hidden = !conTope.length;
    if (conTope.length) {
      const resto = totalTope - totalGastado;
      $("#pres-total").textContent = resto >= 0
        ? `Te quedan ${euros.format(resto)}`
        : `Te pasaste ${euros.format(-resto)}`;
      $("#pres-total").classList.toggle("neg", resto < 0);
      $("#pres-detalle").textContent = `${euros.format(totalGastado)} de ${euros.format(totalTope)} presupuestados`;
      const fr = totalTope ? totalGastado / totalTope : 0;
      const fill = $("#pres-progreso");
      fill.style.width = `${Math.min(fr, 1) * 100}%`;
      fill.className = "proy__fill" + (fr > 1 ? " proy__fill--alto" : fr >= 0.75 ? " proy__fill--medio" : "");
    }

    categorias
      .map((c) => ({ c, tope: Number(estado.presupuestos[c.id]) || 0, gastado: gastado.get(c.id) || 0 }))
      .sort((a, b) => (b.tope > 0) - (a.tope > 0) || (b.gastado / (b.tope || 1)) - (a.gastado / (a.tope || 1)))
      .forEach(({ c, tope, gastado: g }) => {

        const fraccion = tope ? g / tope : 0;
        const nivel = fraccion > 1 ? "alto" : fraccion >= 0.75 ? "medio" : "";

        const fila = document.createElement("button");
        fila.type = "button";
        fila.className = "pres-fila pres-fila--boton";
        fila.innerHTML = `
          <div class="pres__cab">
            <span class="pres__nombre"></span>
            <span class="pres__monto"></span>
          </div>
          <div class="pres__riel"><div class="pres__fill"></div></div>
          <div class="pres__resto"></div>`;

        fila.querySelector(".pres__nombre").textContent = c.nombre;
        fila.querySelector(".pres__monto").textContent = tope
          ? `${euros.format(g)} / ${euros.format(tope)}`
          : (g ? `${euros.format(g)} · sin tope` : "Sin tope");

        const fill = fila.querySelector(".pres__fill");
        fill.style.width = tope ? `${Math.min(fraccion, 1) * 100}%` : "0%";
        if (nivel) fill.classList.add(`pres__fill--${nivel}`);

        const nota = fila.querySelector(".pres__resto");
        if (!tope) {
          nota.textContent = "Toca para fijar un tope mensual";
        } else if (fraccion > 1) {
          nota.textContent = `Te pasaste ${euros.format(g - tope)} (${Math.round(fraccion * 100)}%)`;
          nota.classList.add("pres__resto--alto");
        } else {
          nota.textContent = `Te quedan ${euros.format(tope - g)} · ${Math.round(fraccion * 100)}% usado`;
        }

        fila.addEventListener("click", () => editarTope(c, tope));
        zona.appendChild(fila);
      });
  }

  async function editarTope(categoria, tope) {

    const respuesta = await DIALOGO.formulario({
      titulo: `Tope de ${categoria.nombre}`,
      mensaje: "Cuánto quieres gastar como máximo al mes en esta categoría. Déjalo vacío para quitar el tope.",
      aceptar: "Guardar",
      campos: [
        { id: "tope", tipo: "monto", etiqueta: "Tope mensual", valor: tope ? String(tope).replace(".", ",") : "", placeholder: "0,00", permiteCero: true },
      ],
    });

    if (!respuesta) return;

    const nuevo = Number(respuesta.tope) || 0;
    const topes = { ...estado.presupuestos };

    if (nuevo > 0) topes[categoria.id] = nuevo;
    else delete topes[categoria.id];

    estado.presupuestos = topes;
    await DATOS.guardarAjuste("presupuestos", topes);
    pintarPresupuestos();
  }

  // ------------------------------------------------------------------
  // Pestaña
  // ------------------------------------------------------------------

  function mostrarSub(sub) {
    estado.subPlanificar = sub;
    $$("#plan-segmentos button").forEach((b) => b.classList.toggle("segmento--activa", b.dataset.sub === sub));
    $("#plan-fijos").hidden = sub !== "fijos";
    $("#plan-presupuestos").hidden = sub !== "presupuestos";
    $("#nuevo-fijo").hidden = sub !== "fijos";
  }

  function pintar() {
    mostrarSub(estado.subPlanificar || "fijos");
    pintarFijos();
    pintarPresupuestos();
  }

  function conectar() {
    $$("#plan-segmentos button").forEach((b) => b.addEventListener("click", () => mostrarSub(b.dataset.sub)));
    $("#nuevo-fijo").addEventListener("click", () => formulario());
  }

  conectar();
  APP.registrar("planificar", { pintar });

  return { registrar, formulario };

})();
