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
    presupuestos: {},
    ignorados: [],
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

  /**
   * Aviso con un botón (por ejemplo «Deshacer»). Dura más para dar
   * tiempo a reaccionar.
   */
  function avisarConAccion(mensaje, etiqueta, accion) {

    const aviso = $("#aviso");

    aviso.className = "aviso";
    aviso.textContent = mensaje;

    const boton = document.createElement("button");
    boton.type = "button";
    boton.textContent = etiqueta;
    boton.addEventListener("click", async () => {
      aviso.hidden = true;
      await accion();
    });
    aviso.appendChild(boton);
    aviso.hidden = false;

    clearTimeout(avisar._temporizador);
    avisar._temporizador = setTimeout(() => { aviso.hidden = true; }, 5500);
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
    estado.presupuestos = await DATOS.ajuste("presupuestos", {});
    estado.ignorados = await DATOS.ajuste("recurrentes_ignorados", []);

    pintarResumen();
    pintarLista();
    await pintarAvisos();
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

    const envoltura = document.createElement("div");
    envoltura.className = "deslizable";
    envoltura.innerHTML = `
      <div class="deslizable__fondo" aria-hidden="true">
        <span class="acc acc--editar">Editar</span>
        <span class="acc acc--borrar">Eliminar</span>
      </div>`;

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

    envoltura.appendChild(fila);
    activarDeslizar(envoltura, fila, mov);

    return envoltura;
  }

  // ------------------------------------------------------------------
  // Deslizar una fila: a la derecha edita, a la izquierda elimina.
  //
  // La fila sigue al dedo 1:1; pasado el límite se frena como una goma;
  // al soltar se proyecta hacia dónde iba (velocidad) y vuelve con un
  // pequeño rebote si no se confirmó.
  // ------------------------------------------------------------------

  function activarDeslizar(envoltura, fila, mov) {

    const UMBRAL = 96;     // distancia para confirmar
    const LIBRE = 120;     // hasta aquí sigue 1:1
    const ANCHO = 300;

    let x0 = 0, y0 = 0, dx = 0;
    let activo = false, decidido = false, arrastrando = false, huboArrastre = false;
    let ultimaX = 0, ultimoT = 0, velocidad = 0, avisoHecho = false;

    // Más allá del límite: resistencia progresiva (efecto goma).
    function goma(x) {
      const abs = Math.abs(x);
      if (abs <= LIBRE) return x;
      const exceso = abs - LIBRE;
      const f = (exceso * ANCHO * 0.55) / (ANCHO + 0.55 * exceso);
      return Math.sign(x) * (LIBRE + f);
    }

    // Dónde acabaría con la inercia del gesto.
    function proyectar(v) {
      const d = 0.998;
      return ((v / 1000) * d) / (1 - d);
    }

    envoltura.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      activo = true; decidido = false; arrastrando = false;
      x0 = e.clientX; y0 = e.clientY; dx = 0;
      ultimaX = e.clientX; ultimoT = e.timeStamp; velocidad = 0; avisoHecho = false;
      fila.style.transition = "none";
    });

    envoltura.addEventListener("pointermove", (e) => {

      if (!activo) return;

      const mx = e.clientX - x0;
      const my = e.clientY - y0;

      if (!decidido) {
        if (Math.abs(mx) < 10 && Math.abs(my) < 10) return;
        decidido = true;
        arrastrando = Math.abs(mx) > Math.abs(my);
        if (arrastrando) {
          envoltura.setPointerCapture(e.pointerId);
          huboArrastre = true;
        } else {
          activo = false;
          return;
        }
      }

      dx = mx;
      const mover = goma(dx);
      fila.style.transform = `translateX(${mover}px)`;
      envoltura.dataset.lado = dx > 0 ? "editar" : "borrar";

      const listo = Math.abs(dx) >= UMBRAL;
      envoltura.classList.toggle("deslizable--listo", listo);
      if (listo && !avisoHecho) {
        avisoHecho = true;
        if (navigator.vibrate) navigator.vibrate(12);
      }
      if (!listo) avisoHecho = false;

      const dt = e.timeStamp - ultimoT;
      if (dt > 0) velocidad = ((e.clientX - ultimaX) / dt) * 1000;
      ultimaX = e.clientX; ultimoT = e.timeStamp;
    });

    function soltar() {

      if (!activo && !arrastrando) return;
      activo = false;

      if (!arrastrando) return;
      arrastrando = false;

      const final = dx + proyectar(velocidad);

      // Vuelve a su sitio con un rebote suave.
      fila.style.transition = "transform .5s cubic-bezier(.3,1.45,.5,1)";
      fila.style.transform = "";
      envoltura.classList.remove("deslizable--listo");
      setTimeout(() => { delete envoltura.dataset.lado; }, 300);

      if (final > UMBRAL * 1.15) {
        abrirHoja(mov);
      } else if (final < -UMBRAL * 1.15) {
        eliminarConDeshacer(mov, envoltura);
      }

      setTimeout(() => { huboArrastre = false; }, 60);
    }

    envoltura.addEventListener("pointerup", soltar);
    envoltura.addEventListener("pointercancel", soltar);

    // Un arrastre no debe contar como toque.
    fila.addEventListener("click", (e) => {
      if (huboArrastre) {
        e.preventDefault();
        return;
      }
      abrirHoja(mov);
    });
  }

  async function eliminarConDeshacer(mov, envoltura) {

    envoltura.style.height = `${envoltura.offsetHeight}px`;
    envoltura.getBoundingClientRect();
    envoltura.classList.add("quitando");

    await DATOS.eliminar(mov.uuid);
    await new Promise((r) => setTimeout(r, 280));
    await refrescar();

    avisarConAccion("Movimiento eliminado", "Deshacer", async () => {
      await DATOS.guardar(mov);
      await refrescar();
      avisar("Restaurado");
    });
  }

  // ------------------------------------------------------------------
  // Avisos al inicio: recurrentes pendientes y copia de seguridad
  // ------------------------------------------------------------------

  function nombreRecurrente(r) {
    const sub = estado.subcategoriasPorId.get(r.subcategoria_id);
    return r.descripcion || (sub ? sub.nombre : "Movimiento");
  }

  async function pintarAvisos() {

    const zona = $("#avisos-inicio");
    zona.innerHTML = "";

    // --- Copia de seguridad ---------------------------------------
    const ultima = await DATOS.ajuste("ultima_copia");
    const callarHasta = await DATOS.ajuste("copia_aviso_hasta", 0);
    const dias = ultima
      ? Math.floor((Date.now() - new Date(ultima).getTime()) / 86400000)
      : null;

    if (estado.todos.length >= 10 && Date.now() > callarHasta && (dias === null || dias >= 7)) {

      const tira = document.createElement("div");
      tira.className = "tira";
      tira.innerHTML = `
        <p class="tira__titulo"></p>
        <div class="tira__acciones">
          <button type="button" class="tira__boton tira__boton--si">Guardar en Drive</button>
          <button type="button" class="tira__boton tira__boton--no">Más tarde</button>
        </div>`;
      tira.querySelector(".tira__titulo").textContent = dias === null
        ? "Aún no has hecho ninguna copia. Tus datos solo viven en este teléfono."
        : `Hace ${dias} días que no haces copia de seguridad.`;

      tira.querySelector(".tira__boton--si").addEventListener("click", async () => {
        await exportar();
        await pintarAvisos();
      });
      tira.querySelector(".tira__boton--no").addEventListener("click", async () => {
        await DATOS.guardarAjuste("copia_aviso_hasta", Date.now() + 86400000);
        await pintarAvisos();
      });

      zona.appendChild(tira);
    }

    // --- Recurrentes que faltan este mes --------------------------
    const hoy = new Date();
    if (estado.mes.getFullYear() !== hoy.getFullYear() || estado.mes.getMonth() !== hoy.getMonth()) {
      return;
    }

    const pendientes = INTEL.recurrentes(estado.todos, estado.mes, estado.ignorados)
      .filter((r) => !r.hecho && !r.ignorado);

    if (!pendientes.length) return;

    const tira = document.createElement("div");
    tira.className = "tira";
    tira.innerHTML = '<p class="tira__titulo">Recurrentes que aún no has registrado este mes</p><div class="chips"></div>';
    const chips = tira.querySelector(".chips");

    pendientes.forEach((r) => {

      const chip = document.createElement("span");
      chip.className = "chip";
      chip.innerHTML = '<button type="button" class="chip__texto"></button><button type="button" class="chip__quitar" aria-label="No recordar más">×</button>';

      const texto = chip.querySelector(".chip__texto");
      texto.textContent = nombreRecurrente(r);
      const monto = document.createElement("b");
      monto.textContent = euros.format(r.monto);
      texto.appendChild(monto);

      texto.addEventListener("click", () => {
        const dia = Math.min(r.dia, hoy.getDate());
        abrirHoja(null, {
          ...r,
          fecha: iso(new Date(hoy.getFullYear(), hoy.getMonth(), dia)),
        });
      });

      chip.querySelector(".chip__quitar").addEventListener("click", async () => {
        estado.ignorados = [...estado.ignorados, r.key];
        await DATOS.guardarAjuste("recurrentes_ignorados", estado.ignorados);
        await pintarAvisos();
      });

      chips.appendChild(chip);
    });

    zona.appendChild(tira);
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

  function abrirHoja(movimiento = null, borrador = null) {

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
    } else if (borrador) {
      // Recurrente: se rellena con el último importe y queda como nuevo.
      $("#form-movimiento").reset();
      seleccionarTipo(borrador.tipo);
      $("#monto").value = String(borrador.monto).replace(".", ",");
      $("#descripcion").value = borrador.descripcion || "";
      $("#subcategoria").value = borrador.subcategoria_id;
      $("#medio-pago").value = borrador.medio_pago_id || "";
      $("#fecha").value = borrador.fecha;
    } else {
      seleccionarTipo("gasto");
      $("#form-movimiento").reset();
      $("#fecha").value = iso(new Date());
    }

    $("#velo").hidden = false;
    $("#hoja").hidden = false;

    if (!movimiento && !borrador) {
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
      presupuestos: estado.presupuestos,
      ignorados: estado.ignorados,
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
    await pintarPresupuestos();
    pintarRecurrentes();

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

  async function pintarPresupuestos() {

    const contenedor = $("#lista-presupuestos");
    contenedor.innerHTML = "";

    estado.categorias.filter((c) => c.tipo === "gasto").forEach((categoria) => {

      const tope = Number(estado.presupuestos[categoria.id]) || 0;

      const fila = document.createElement("button");
      fila.type = "button";
      fila.className = "fila-ajuste";
      fila.innerHTML = '<span class="fila-ajuste__nombre"></span><span class="fila-ajuste__valor"></span>';
      fila.querySelector(".fila-ajuste__nombre").textContent = categoria.nombre;

      const valor = fila.querySelector(".fila-ajuste__valor");
      valor.textContent = tope ? euros.format(tope) : "Sin tope";
      if (!tope) valor.classList.add("fila-ajuste__valor--apagado");

      fila.addEventListener("click", async () => {

        const respuesta = prompt(
          `Tope mensual para ${categoria.nombre}\n(vacío o 0 = sin tope):`,
          tope ? String(tope).replace(".", ",") : ""
        );

        if (respuesta === null) return;

        const nuevo = Number(normalizarMonto(respuesta)) || 0;
        const topes = { ...estado.presupuestos };

        if (nuevo > 0) topes[categoria.id] = nuevo;
        else delete topes[categoria.id];

        estado.presupuestos = topes;
        await DATOS.guardarAjuste("presupuestos", topes);
        await pintarPresupuestos();
      });

      contenedor.appendChild(fila);
    });
  }

  function pintarRecurrentes() {

    const contenedor = $("#lista-recurrentes");
    contenedor.innerHTML = "";

    const lista = INTEL.recurrentes(estado.todos, new Date(), estado.ignorados);

    if (!lista.length) {
      contenedor.innerHTML =
        '<p class="bloque__nota">Aún no hay movimientos que se repitan cada mes.</p>';
      return;
    }

    lista.forEach((r) => {

      const fila = document.createElement("button");
      fila.type = "button";
      fila.className = "fila-ajuste";
      fila.innerHTML = '<span class="fila-ajuste__nombre"></span><span class="fila-ajuste__valor"></span><span class="interruptor"></span>';
      fila.querySelector(".fila-ajuste__nombre").textContent = nombreRecurrente(r);
      fila.querySelector(".fila-ajuste__valor").textContent =
        `${euros.format(r.monto)} · día ${r.dia}`;
      fila.querySelector(".interruptor").classList.toggle("interruptor--on", !r.ignorado);

      fila.addEventListener("click", async () => {
        estado.ignorados = r.ignorado
          ? estado.ignorados.filter((k) => k !== r.key)
          : [...estado.ignorados, r.key];
        await DATOS.guardarAjuste("recurrentes_ignorados", estado.ignorados);
        pintarRecurrentes();
      });

      contenedor.appendChild(fila);
    });
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
      const resultado = await COPIA.exportar();

      // null = cerró el menú de compartir sin guardar.
      if (!resultado) return;

      avisar(resultado.via === "compartir"
        ? `Copia enviada · ${resultado.total} movimientos`
        : `Copia descargada · ${resultado.total} movimientos`);
      await pintarEstadoCopia();
    } catch (error) {
      avisar("No se pudo crear la copia", true);
    }
  }

  async function importar(evento) {

    // Se pueden elegir varios archivos a la vez (el CSV del histórico
    // y todas las copias JSON de Drive). Se procesan en orden y, como
    // cada movimiento lleva su uuid, lo que falta en uno lo completa
    // otro sin duplicar nada.
    const archivos = [...evento.target.files];

    if (!archivos.length) return;

    const reemplazar = confirm(
      "¿Reemplazar lo que hay ahora?\n\n" +
      "Aceptar = borra lo actual y deja solo lo que importes.\n" +
      "Cancelar = añade lo importado a lo que ya tienes."
    );

    // Los archivos se ordenan por nombre para que el CSV (histórico
    // grande) entre primero y las copias vayan encima.
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

          // Solo el primer archivo puede reemplazar; el resto se
          // acumula, para que "reemplazar" signifique dejar la unión
          // de todo lo seleccionado.
          const total = await COPIA.importar(texto, {
            reemplazar: reemplazar && i === 0,
          });

          totalGlobal += total;

        } catch (error) {
          errores += 1;
        }
      }

      await cargarCatalogos();
      await refrescar();
      await pintarAjustes();

      const resumen = errores
        ? `${totalGlobal} movimientos · ${errores} archivo(s) con error`
        : `${totalGlobal} movimientos importados`;

      avisar(resumen, errores > 0);

    } catch (error) {
      avisar(error.message, true);
    } finally {
      evento.target.value = "";
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
