/* =====================================================================
   Finanzas — lógica de la interfaz.

   Todo ocurre en el dispositivo: no hay servidor ni conexión.
   ===================================================================== */

(() => {

  const estado = {
    mes: new Date(),
    tipo: "",
    todos: [],
    delMes: [],
    categorias: [],
    subcategorias: [],
    medios: [],
    categoriasPorId: new Map(),
    subcategoriasPorId: new Map(),
    mediosPorId: new Map(),
    editando: null,
  };

  const $ = (selector) => document.querySelector(selector);

  // ------------------------------------------------------------------
  // Formatos
  // ------------------------------------------------------------------

  // La moneda y los formatos se definen en config.js
  const euros = FORMATO.dinero;
  const mesLargo = FORMATO.mesLargo;
  const diaLargo = FORMATO.diaLargo;

  /**
   * Fecha ISO en hora local. toISOString() pasa a UTC y puede
   * cambiar el día, que es justo lo que no queremos al fechar un gasto.
   */
  function iso(fecha) {
    const y = fecha.getFullYear();
    const m = String(fecha.getMonth() + 1).padStart(2, "0");
    const d = String(fecha.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  // Acepta tanto 45,50 como 45.50: ver config.js
  const normalizarMonto = FORMATO.normalizarMonto;

  function identificador() {
    if (crypto.randomUUID) return crypto.randomUUID();
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  function avisar(mensaje, esError = false) {

    const aviso = $("#aviso");

    aviso.textContent = mensaje;
    aviso.className = esError ? "aviso aviso--error" : "aviso";
    aviso.hidden = false;

    clearTimeout(avisar._temporizador);
    avisar._temporizador = setTimeout(() => { aviso.hidden = true; }, 2800);
  }

  // ------------------------------------------------------------------
  // Catálogos
  // ------------------------------------------------------------------

  async function cargarCatalogos() {

    const [categorias, subcategorias, medios] = await Promise.all([
      DATOS.catalogo("categorias"),
      DATOS.catalogo("subcategorias"),
      DATOS.catalogo("medios_pago"),
    ]);

    estado.categorias = categorias;
    estado.subcategorias = subcategorias;
    estado.medios = medios;

    estado.categoriasPorId = new Map(categorias.map((c) => [c.id, c]));
    estado.subcategoriasPorId = new Map(subcategorias.map((s) => [s.id, s]));
    estado.mediosPorId = new Map(medios.map((m) => [m.id, m]));

    rellenarSelectores();
  }

  function rellenarSelectores() {

    const select = $("#subcategoria");
    const anterior = select.value;

    select.innerHTML = "";

    estado.categorias.forEach((categoria) => {

      const subs = estado.subcategorias.filter(
        (s) => s.categoria_id === categoria.id
      );

      if (!subs.length) return;

      const grupo = document.createElement("optgroup");
      grupo.label = categoria.nombre;

      subs.forEach((sub) => {
        const opcion = document.createElement("option");
        opcion.value = sub.id;
        opcion.textContent = sub.nombre;
        grupo.appendChild(opcion);
      });

      select.appendChild(grupo);
    });

    if (anterior) select.value = anterior;

    const medios = $("#medio-pago");
    medios.innerHTML = '<option value="">—</option>';

    estado.medios.forEach((medio) => {
      const opcion = document.createElement("option");
      opcion.value = medio.id;
      opcion.textContent = medio.nombre;
      medios.appendChild(opcion);
    });
  }

  // ------------------------------------------------------------------
  // Lista y resumen
  // ------------------------------------------------------------------

  function delMesActual(movimiento) {

    const [anio, mes] = movimiento.fecha.split("-").map(Number);

    return (
      anio === estado.mes.getFullYear() &&
      mes === estado.mes.getMonth() + 1
    );
  }

  async function refrescar() {

    estado.todos = await DATOS.movimientos();
    estado.delMes = estado.todos.filter(delMesActual);

    pintarResumen();
    pintarLista();
  }

  function pintarResumen() {

    let ingresos = 0;
    let gastos = 0;

    estado.delMes.forEach((m) => {
      const monto = Number(m.monto) || 0;
      if (m.tipo === "ingreso") ingresos += monto;
      else gastos += monto;
    });

    const balance = ingresos - gastos;
    const cifra = $("#balance-total");

    cifra.textContent = euros.format(balance);
    cifra.classList.toggle("balance__cifra--negativo", balance < 0);

    $("#balance-ingresos").textContent = euros.format(ingresos);
    $("#balance-gastos").textContent = euros.format(gastos);
    $("#mes-actual").textContent = mesLargo.format(estado.mes);
  }

  function pintarLista() {

    const lista = $("#lista");
    const visibles = estado.delMes.filter(
      (m) => !estado.tipo || m.tipo === estado.tipo
    );

    lista.innerHTML = "";

    if (!visibles.length) {
      lista.innerHTML = `
        <div class="vacio">
          <span class="vacio__signo">—</span>
          Sin movimientos este mes
        </div>`;
      return;
    }

    const porDia = new Map();

    visibles.forEach((mov) => {
      if (!porDia.has(mov.fecha)) porDia.set(mov.fecha, []);
      porDia.get(mov.fecha).push(mov);
    });

    [...porDia.keys()].sort().reverse().forEach((fecha) => {

      const bloque = document.createElement("div");
      bloque.className = "dia";

      const titulo = document.createElement("p");
      titulo.className = "dia__fecha";
      // El mediodía evita saltos de día por zona horaria.
      titulo.textContent = diaLargo.format(new Date(`${fecha}T12:00:00`));
      bloque.appendChild(titulo);

      porDia.get(fecha).forEach((mov, indice) => {
        bloque.appendChild(filaMovimiento(mov, indice));
      });

      lista.appendChild(bloque);
    });
  }

  function filaMovimiento(mov, indice) {

    const sub = estado.subcategoriasPorId.get(mov.subcategoria_id);
    const medio = estado.mediosPorId.get(mov.medio_pago_id);

    const meta = [
      sub ? sub.nombre : null,
      medio ? medio.nombre : null,
    ].filter(Boolean).join(" · ");

    const signo = mov.tipo === "gasto" ? "−" : "+";

    const fila = document.createElement("button");

    fila.type = "button";
    fila.className = "mov";
    fila.style.animationDelay = `${Math.min(indice * 30, 240)}ms`;

    fila.innerHTML = `
      <span class="mov__barra mov__barra--${mov.tipo}"></span>
      <span class="mov__texto">
        <span class="mov__concepto"></span>
        <span class="mov__meta"></span>
      </span>
      <span class="mov__monto mov__monto--${mov.tipo}">
        ${signo}${euros.format(Number(mov.monto))}
      </span>`;

    // textContent y no innerHTML: el concepto lo escribe el usuario.
    fila.querySelector(".mov__concepto").textContent =
      mov.descripcion || (sub ? sub.nombre : "Movimiento");

    fila.querySelector(".mov__meta").textContent = meta;

    fila.addEventListener("click", () => abrirHoja(mov));

    return fila;
  }

  // ------------------------------------------------------------------
  // Formulario
  // ------------------------------------------------------------------

  function tipoSeleccionado() {
    return $(".tipo__opcion--activa").dataset.tipo;
  }

  function seleccionarTipo(tipo) {
    document.querySelectorAll(".tipo__opcion").forEach((boton) => {
      boton.classList.toggle(
        "tipo__opcion--activa",
        boton.dataset.tipo === tipo
      );
    });
  }

  function abrirHoja(movimiento = null) {

    estado.editando = movimiento;

    $("#form-error").hidden = true;
    $("#hoja-titulo").textContent = movimiento
      ? "Editar movimiento"
      : "Nuevo movimiento";

    $("#eliminar").hidden = !movimiento;

    if (movimiento) {
      seleccionarTipo(movimiento.tipo);
      $("#monto").value = String(movimiento.monto).replace(".", ",");
      $("#descripcion").value = movimiento.descripcion || "";
      $("#subcategoria").value = movimiento.subcategoria_id;
      $("#medio-pago").value = movimiento.medio_pago_id || "";
      $("#fecha").value = movimiento.fecha;
      $("#comentario").value = movimiento.comentario || "";
    } else {
      seleccionarTipo("gasto");
      $("#form-movimiento").reset();
      $("#fecha").value = iso(new Date());
    }

    $("#velo").hidden = false;
    $("#hoja").hidden = false;

    if (!movimiento) {
      setTimeout(() => $("#monto").focus(), 320);
    }
  }

  function cerrarHoja() {
    $("#velo").hidden = true;
    $("#hoja").hidden = true;
    estado.editando = null;
  }

  async function guardar(evento) {

    evento.preventDefault();

    const monto = normalizarMonto($("#monto").value);
    const error = $("#form-error");

    if (!monto || Number.isNaN(Number(monto)) || Number(monto) <= 0) {
      error.textContent = "Escribe un importe mayor que cero.";
      error.hidden = false;
      return;
    }

    if (!$("#subcategoria").value) {
      error.textContent = "Elige una categoría.";
      error.hidden = false;
      return;
    }

    const editaba = Boolean(estado.editando);

    await DATOS.guardar({
      uuid: editaba ? estado.editando.uuid : identificador(),
      fecha: $("#fecha").value,
      monto: monto,
      tipo: tipoSeleccionado(),
      subcategoria_id: Number($("#subcategoria").value),
      medio_pago_id: $("#medio-pago").value
        ? Number($("#medio-pago").value)
        : null,
      descripcion: $("#descripcion").value.trim() || null,
      comentario: $("#comentario").value.trim() || null,
    });

    cerrarHoja();
    avisar(editaba ? "Actualizado" : "Guardado");
    await refrescar();
    await recordarCopia();
  }

  async function eliminar() {

    if (!estado.editando) return;
    if (!confirm("¿Eliminar este movimiento?")) return;

    await DATOS.eliminar(estado.editando.uuid);

    cerrarHoja();
    avisar("Eliminado");
    await refrescar();
  }


  // ------------------------------------------------------------------
  // Resumen
  // ------------------------------------------------------------------

  function mostrarResumen() {
    $("#pantalla-app").hidden = true;
    $("#pantalla-ajustes").hidden = true;
    $("#pantalla-resumen").hidden = false;
    pintarPantallaResumen();
  }

  function pintarPantallaResumen() {
    RESUMEN.pintar({
      todos: estado.todos,
      mes: estado.mes,
      categorias: estado.categoriasPorId,
      subcategorias: estado.subcategoriasPorId,
    });
  }

  // ------------------------------------------------------------------
  // Ajustes
  // ------------------------------------------------------------------

  function mostrarAjustes() {
    $("#pantalla-app").hidden = true;
    $("#pantalla-resumen").hidden = true;
    $("#pantalla-ajustes").hidden = false;
    pintarAjustes();
  }

  function mostrarMovimientos() {
    $("#pantalla-ajustes").hidden = true;
    $("#pantalla-resumen").hidden = true;
    $("#pantalla-app").hidden = false;
  }

  async function pintarAjustes() {

    await pintarEstadoCopia();

    // --- Categorías con sus subcategorías -------------------------

    const contenedor = $("#lista-categorias");
    contenedor.innerHTML = "";

    estado.categorias.forEach((categoria) => {

      const bloque = document.createElement("div");
      bloque.className = "categoria";

      const cabecera = document.createElement("div");
      cabecera.className = "categoria__cabecera";

      const nombre = document.createElement("button");
      nombre.type = "button";
      nombre.className = "categoria__nombre";
      nombre.textContent = categoria.nombre;
      nombre.addEventListener("click", () => renombrar("categorias", categoria));

      const etiqueta = document.createElement("span");
      etiqueta.className = `etiqueta etiqueta--${categoria.tipo}`;
      etiqueta.textContent = categoria.tipo;

      const anadir = document.createElement("button");
      anadir.type = "button";
      anadir.className = "categoria__anadir";
      anadir.textContent = "+";
      anadir.title = "Añadir subcategoría";
      anadir.addEventListener("click", () => nuevaSubcategoria(categoria));

      cabecera.append(nombre, etiqueta, anadir);
      bloque.appendChild(cabecera);

      const subs = estado.subcategorias.filter(
        (s) => s.categoria_id === categoria.id
      );

      subs.forEach((sub) => {

        const fila = document.createElement("div");
        fila.className = "subcategoria";

        const texto = document.createElement("button");
        texto.type = "button";
        texto.className = "subcategoria__nombre";
        texto.textContent = sub.nombre;
        texto.addEventListener("click", () =>
          renombrar("subcategorias", sub)
        );

        const quitar = document.createElement("button");
        quitar.type = "button";
        quitar.className = "subcategoria__quitar";
        quitar.textContent = "×";
        quitar.setAttribute("aria-label", `Quitar ${sub.nombre}`);
        quitar.addEventListener("click", () =>
          borrarDelCatalogo("subcategorias", sub, "subcategoria_id")
        );

        fila.append(texto, quitar);
        bloque.appendChild(fila);
      });

      contenedor.appendChild(bloque);
    });

    // --- Medios de pago -------------------------------------------

    const medios = $("#lista-medios");
    medios.innerHTML = "";

    estado.medios.forEach((medio) => {

      const fila = document.createElement("div");
      fila.className = "subcategoria";

      const texto = document.createElement("button");
      texto.type = "button";
      texto.className = "subcategoria__nombre";
      texto.textContent = medio.nombre;
      texto.addEventListener("click", () => renombrar("medios_pago", medio));

      const quitar = document.createElement("button");
      quitar.type = "button";
      quitar.className = "subcategoria__quitar";
      quitar.textContent = "×";
      quitar.setAttribute("aria-label", `Quitar ${medio.nombre}`);
      quitar.addEventListener("click", () =>
        borrarDelCatalogo("medios_pago", medio, "medio_pago_id")
      );

      fila.append(texto, quitar);
      medios.appendChild(fila);
    });

    $("#sobre").textContent =
      `${estado.todos.length} movimientos guardados en este dispositivo.`;
  }

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

  async function renombrar(clave, elemento) {

    const nombre = prompt("Nombre:", elemento.nombre);

    if (!nombre || !nombre.trim()) return;

    await DATOS.renombrarEnCatalogo(clave, elemento.id, nombre.trim());
    await cargarCatalogos();
    await pintarAjustes();
  }

  async function nuevaCategoria() {

    const nombre = prompt("Nombre de la categoría:");

    if (!nombre || !nombre.trim()) return;

    const esIngreso = confirm(
      "¿Es una categoría de ingresos?\n\n" +
      "Aceptar = ingresos, Cancelar = gastos"
    );

    await DATOS.anadirAlCatalogo("categorias", {
      nombre: nombre.trim(),
      tipo: esIngreso ? "ingreso" : "gasto",
    });

    await cargarCatalogos();
    await pintarAjustes();
  }

  async function nuevaSubcategoria(categoria) {

    const nombre = prompt(`Nueva subcategoría en ${categoria.nombre}:`);

    if (!nombre || !nombre.trim()) return;

    await DATOS.anadirAlCatalogo("subcategorias", {
      nombre: nombre.trim(),
      categoria_id: categoria.id,
    });

    await cargarCatalogos();
    await pintarAjustes();
  }

  async function nuevoMedio() {

    const nombre = prompt("Nombre del medio de pago:");

    if (!nombre || !nombre.trim()) return;

    await DATOS.anadirAlCatalogo("medios_pago", { nombre: nombre.trim() });

    await cargarCatalogos();
    await pintarAjustes();
  }

  /**
   * No se deja borrar algo que esté en uso: se quedarían movimientos
   * huérfanos imposibles de interpretar.
   */
  async function borrarDelCatalogo(clave, elemento, campo) {

    const enUso = estado.todos.filter(
      (m) => m[campo] === elemento.id
    ).length;

    if (enUso) {
      alert(
        `No se puede quitar «${elemento.nombre}»: lo usan ` +
        `${enUso} movimiento(s). Cámbialos primero.`
      );
      return;
    }

    if (!confirm(`¿Quitar «${elemento.nombre}»?`)) return;

    await DATOS.quitarDelCatalogo(clave, elemento.id);
    await cargarCatalogos();
    await pintarAjustes();
  }

  // ------------------------------------------------------------------
  // Copia de seguridad
  // ------------------------------------------------------------------

  async function exportar() {

    try {
      const total = await COPIA.exportar();
      avisar(`Copia descargada · ${total} movimientos`);
      await pintarEstadoCopia();
    } catch (error) {
      avisar("No se pudo crear la copia", true);
    }
  }

  async function importar(evento) {

    const archivo = evento.target.files[0];

    if (!archivo) return;

    const reemplazar = confirm(
      "¿Reemplazar lo que hay ahora?\n\n" +
      "Aceptar = borra lo actual y deja solo la copia.\n" +
      "Cancelar = añade la copia a lo que ya tienes."
    );

    try {

      const texto = await archivo.text();
      const total = await COPIA.importar(texto, { reemplazar });

      await cargarCatalogos();
      await refrescar();
      await pintarAjustes();

      avisar(`Restaurados ${total} movimientos`);

    } catch (error) {
      avisar(error.message, true);
    } finally {
      evento.target.value = "";
    }
  }

  /**
   * Recuerda hacer copia cada cierto tiempo, sin ser pesado.
   */
  async function recordarCopia() {

    const ultima = await DATOS.ajuste("ultima_copia");

    if (!ultima) {
      if (estado.todos.length === 15) {
        avisar("Ve a ajustes y descarga una copia", true);
      }
      return;
    }

    const dias = (Date.now() - new Date(ultima).getTime()) / 86400000;

    if (dias > 21) {
      avisar("Hace semanas que no haces copia", true);
    }
  }

  // ------------------------------------------------------------------
  // Arranque
  // ------------------------------------------------------------------

  async function iniciar() {

    FORMATO.aplicarSimbolo();
    await DATOS.preparar();
    await cargarCatalogos();
    await refrescar();
  }

  function conectarEventos() {

    $("#mes-anterior").addEventListener("click", () => {
      estado.mes = new Date(
        estado.mes.getFullYear(), estado.mes.getMonth() - 1, 1
      );
      refrescar();
    });

    $("#mes-siguiente").addEventListener("click", () => {
      estado.mes = new Date(
        estado.mes.getFullYear(), estado.mes.getMonth() + 1, 1
      );
      refrescar();
    });

    document.querySelectorAll(".filtro").forEach((boton) => {
      boton.addEventListener("click", () => {
        document.querySelectorAll(".filtro").forEach((otro) =>
          otro.classList.remove("filtro--activo")
        );
        boton.classList.add("filtro--activo");
        estado.tipo = boton.dataset.tipo;
        pintarLista();
      });
    });

    $("#nuevo").addEventListener("click", () => abrirHoja());
    $("#cerrar-hoja").addEventListener("click", cerrarHoja);
    $("#velo").addEventListener("click", cerrarHoja);
    $("#eliminar").addEventListener("click", eliminar);
    $("#form-movimiento").addEventListener("submit", guardar);

    document.querySelectorAll(".tipo__opcion").forEach((boton) => {
      boton.addEventListener("click", () =>
        seleccionarTipo(boton.dataset.tipo)
      );
    });

    $("#abrir-resumen").addEventListener("click", mostrarResumen);
    $("#volver-resumen").addEventListener("click", mostrarMovimientos);

    $("#res-anterior").addEventListener("click", async () => {
      estado.mes = new Date(
        estado.mes.getFullYear(), estado.mes.getMonth() - 1, 1
      );
      await refrescar();
      pintarPantallaResumen();
    });

    $("#res-siguiente").addEventListener("click", async () => {
      estado.mes = new Date(
        estado.mes.getFullYear(), estado.mes.getMonth() + 1, 1
      );
      await refrescar();
      pintarPantallaResumen();
    });

    $("#abrir-ajustes").addEventListener("click", mostrarAjustes);
    $("#volver").addEventListener("click", mostrarMovimientos);

    $("#exportar").addEventListener("click", exportar);
    $("#elegir-archivo").addEventListener("click", () => $("#archivo").click());
    $("#archivo").addEventListener("change", importar);

    $("#nueva-categoria").addEventListener("click", nuevaCategoria);
    $("#nuevo-medio").addEventListener("click", nuevoMedio);

    document.addEventListener("keydown", (evento) => {
      if (evento.key !== "Escape") return;
      if (!$("#hoja").hidden) cerrarHoja();
      else if (!$("#pantalla-ajustes").hidden) mostrarMovimientos();
      else if (!$("#pantalla-resumen").hidden) mostrarMovimientos();
    });
  }

  conectarEventos();
  iniciar();

})();
