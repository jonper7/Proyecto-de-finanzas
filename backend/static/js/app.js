/* =====================================================================
   Finanzas — lógica de la interfaz.

   La aplicación lee y escribe siempre en el dispositivo. La
   sincronización con el servidor ocurre aparte, en segundo plano,
   y nunca bloquea lo que el usuario está haciendo.
   ===================================================================== */

(() => {

  const estado = {
    mes: new Date(),
    tipo: "",
    movimientos: [],
    subcategoriasPorId: new Map(),
    categoriasPorId: new Map(),
    mediosPorId: new Map(),
    subcategorias: [],
    editando: null,
  };

  const $ = (selector) => document.querySelector(selector);

  // ------------------------------------------------------------------
  // Formatos
  // ------------------------------------------------------------------

  const euros = new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
  });

  const mesLargo = new Intl.DateTimeFormat("es-ES", {
    month: "long",
    year: "numeric",
  });

  const diaLargo = new Intl.DateTimeFormat("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

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

  /** Acepta la coma decimal, que es como se escribe aquí. */
  function normalizarMonto(texto) {
    return String(texto).trim().replace(/\./g, "").replace(",", ".");
  }

  function identificador() {
    if (crypto.randomUUID) return crypto.randomUUID();
    // Reserva para navegadores antiguos y para http sin cifrar.
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
    avisar._temporizador = setTimeout(() => { aviso.hidden = true; }, 2600);
  }

  // ------------------------------------------------------------------
  // Pantallas
  // ------------------------------------------------------------------

  function mostrarLogin() {
    $("#pantalla-app").hidden = true;
    $("#pantalla-resumen").hidden = true;
    $("#pantalla-login").hidden = false;
  }

  function mostrarApp() {
    $("#pantalla-login").hidden = true;
    $("#pantalla-app").hidden = false;
  }

  // ------------------------------------------------------------------
  // Catálogos
  // ------------------------------------------------------------------

  async function cargarCatalogos() {

    const [categorias, subcategorias, medios] = await Promise.all([
      DB.catalogo("categorias"),
      DB.catalogo("subcategorias"),
      DB.catalogo("medios_pago"),
    ]);

    estado.categoriasPorId = new Map(categorias.map((c) => [c.id, c]));
    estado.subcategoriasPorId = new Map(subcategorias.map((s) => [s.id, s]));
    estado.mediosPorId = new Map(medios.map((m) => [m.id, m]));
    estado.subcategorias = subcategorias;

    rellenarSelectores();
  }

  function rellenarSelectores() {

    const porCategoria = new Map();

    estado.subcategorias
      .filter((s) => s.activo !== false)
      .forEach((sub) => {
        if (!porCategoria.has(sub.categoria_id)) {
          porCategoria.set(sub.categoria_id, []);
        }
        porCategoria.get(sub.categoria_id).push(sub);
      });

    const select = $("#subcategoria");
    select.innerHTML = "";

    porCategoria.forEach((subs, categoriaId) => {

      const categoria = estado.categoriasPorId.get(categoriaId);

      const grupo = document.createElement("optgroup");
      grupo.label = categoria ? categoria.nombre : "Otros";

      subs.forEach((sub) => {
        const opcion = document.createElement("option");
        opcion.value = sub.id;
        opcion.textContent = sub.nombre;
        grupo.appendChild(opcion);
      });

      select.appendChild(grupo);
    });

    const medios = $("#medio-pago");
    medios.innerHTML = '<option value="">—</option>';

    estado.mediosPorId.forEach((medio) => {
      if (medio.activo === false) return;
      const opcion = document.createElement("option");
      opcion.value = medio.id;
      opcion.textContent = medio.nombre;
      medios.appendChild(opcion);
    });
  }

  // ------------------------------------------------------------------
  // Datos del mes
  // ------------------------------------------------------------------

  function delMesActual(movimiento) {

    const [anio, mes] = movimiento.fecha.split("-").map(Number);

    return (
      anio === estado.mes.getFullYear() &&
      mes === estado.mes.getMonth() + 1
    );
  }

  async function refrescar() {

    const todos = await DB.movimientos();

    estado.movimientos = todos
      .filter(delMesActual)
      .filter((m) => !estado.tipo || m.tipo === estado.tipo);

    pintarResumen(todos.filter(delMesActual));
    pintarLista();

    await pintarEstadoSync();
  }

  function pintarResumen(delMes) {

    let ingresos = 0;
    let gastos = 0;

    delMes.forEach((m) => {
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

    lista.innerHTML = "";

    if (!estado.movimientos.length) {
      lista.innerHTML = `
        <div class="vacio">
          <span class="vacio__signo">—</span>
          Sin movimientos este mes
        </div>`;
      return;
    }

    const porDia = new Map();

    estado.movimientos.forEach((mov) => {
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

    const subcategoria = estado.subcategoriasPorId.get(mov.subcategoria_id);
    const medio = estado.mediosPorId.get(mov.medio_pago_id);

    const meta = [
      subcategoria ? subcategoria.nombre : null,
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
      mov.descripcion || (subcategoria ? subcategoria.nombre : "Movimiento");

    const metaNodo = fila.querySelector(".mov__meta");
    metaNodo.textContent = meta;

    // Marca discreta de que aún no ha llegado al servidor.
    if (mov.pendiente === 1) {
      const punto = document.createElement("span");
      punto.className = "mov__pendiente";
      punto.title = "Sin sincronizar";
      metaNodo.prepend(punto);
    }

    fila.addEventListener("click", () => abrirHoja(mov));

    return fila;
  }

  // ------------------------------------------------------------------
  // Estado de la sincronización
  // ------------------------------------------------------------------

  async function pintarEstadoSync() {

    const chip = $("#sync");
    const pendientes = await DB.contarPendientes();
    const ultima = await DB.ajuste("ultima_sync");

    chip.classList.toggle("sync--pendiente", pendientes > 0);
    chip.classList.toggle("sync--sin-red", !navigator.onLine);

    if (!navigator.onLine) {
      chip.textContent = pendientes
        ? `Sin conexión · ${pendientes}`
        : "Sin conexión";
      return;
    }

    if (pendientes) {
      chip.textContent = `${pendientes} sin enviar`;
      return;
    }

    if (!ultima) {
      chip.textContent = "Sin sincronizar";
      return;
    }

    chip.textContent = `Al día · ${hace(new Date(ultima))}`;
  }

  function hace(fecha) {

    const minutos = Math.round((Date.now() - fecha.getTime()) / 60000);

    if (minutos < 1) return "ahora";
    if (minutos < 60) return `hace ${minutos} min`;

    const horas = Math.round(minutos / 60);

    if (horas < 24) return `hace ${horas} h`;

    return `hace ${Math.round(horas / 24)} d`;
  }

  /**
   * Sincroniza y refresca. Si falla, la app sigue funcionando.
   */
  async function sincronizar({ manual = false } = {}) {

    if (!navigator.onLine) {
      if (manual) avisar("Sin conexión con el servidor", true);
      await pintarEstadoSync();
      return;
    }

    $("#sync").classList.add("sync--trabajando");

    try {

      const resumen = await SYNC.sincronizar();

      await cargarCatalogos();
      await refrescar();

      if (manual && resumen) {
        avisar(
          resumen.rechazados
            ? `Sincronizado, ${resumen.rechazados} con error`
            : "Sincronizado"
        );
      }

    } catch (error) {

      if (error.estado === 401) {
        if (manual) avisar("Vuelve a entrar para sincronizar", true);
      } else if (manual) {
        avisar(error.message, true);
      }

      await pintarEstadoSync();

    } finally {
      $("#sync").classList.remove("sync--trabajando");
    }
  }

  // ------------------------------------------------------------------
  // Resumen
  //
  // Se calcula sobre TODO lo que hay en el dispositivo, no solo sobre
  // el mes visible, porque la evolución necesita seis meses.
  // ------------------------------------------------------------------

  async function mostrarResumen() {

    $("#pantalla-app").hidden = true;
    $("#pantalla-resumen").hidden = false;

    await pintarPantallaResumen();
  }

  function volverAMovimientos() {
    $("#pantalla-resumen").hidden = true;
    $("#pantalla-app").hidden = false;
  }

  async function pintarPantallaResumen() {

    const todos = await DB.movimientos();

    RESUMEN.pintar({
      todos,
      mes: estado.mes,
      categorias: estado.categoriasPorId,
      subcategorias: new Map(
        estado.subcategorias.map((s) => [s.id, s])
      ),
    });
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

    if (!monto || Number(monto) <= 0 || Number.isNaN(Number(monto))) {
      error.textContent = "Escribe un importe mayor que cero.";
      error.hidden = false;
      return;
    }

    if (!$("#subcategoria").value) {
      error.textContent = "Elige una categoría.";
      error.hidden = false;
      return;
    }

    const datos = {
      uuid: estado.editando ? estado.editando.uuid : identificador(),
      id: estado.editando ? estado.editando.id : null,
      fecha: $("#fecha").value,
      monto: monto,
      tipo: tipoSeleccionado(),
      subcategoria_id: Number($("#subcategoria").value),
      medio_pago_id: $("#medio-pago").value
        ? Number($("#medio-pago").value)
        : null,
      descripcion: $("#descripcion").value.trim() || null,
      comentario: $("#comentario").value.trim() || null,
      origen: "movil",
      eliminado: false,
    };

    // Se guarda en el dispositivo y la pantalla responde al momento.
    await DB.guardar(datos);

    cerrarHoja();
    avisar(estado.editando ? "Actualizado" : "Guardado");
    await refrescar();

    // El envío al servidor va por detrás, sin hacer esperar a nadie.
    SYNC.intentar().then(async (resumen) => {
      if (resumen) {
        await cargarCatalogos();
        await refrescar();
      }
    });
  }

  async function eliminar() {

    if (!estado.editando) return;
    if (!confirm("¿Eliminar este movimiento?")) return;

    await DB.eliminar(estado.editando.uuid);

    cerrarHoja();
    avisar("Eliminado");
    await refrescar();

    SYNC.intentar().then(() => refrescar());
  }

  // ------------------------------------------------------------------
  // Acceso
  // ------------------------------------------------------------------

  async function entrar(evento) {

    evento.preventDefault();

    const formulario = evento.target;
    const boton = formulario.querySelector("button[type=submit]");
    const error = $("#login-error");

    error.hidden = true;
    boton.disabled = true;
    boton.textContent = "Entrando…";

    try {

      await API.entrar(
        formulario.email.value.trim(),
        formulario.password.value
      );

      await DB.guardarAjuste("usuario", formulario.email.value.trim());

      formulario.reset();

      mostrarApp();

      // Primera descarga completa: catálogos y movimientos.
      await sincronizar({ manual: true });

    } catch (fallo) {
      error.textContent = fallo.message;
      error.hidden = false;
    } finally {
      boton.disabled = false;
      boton.textContent = "Entrar";
    }
  }

  async function salir() {

    const pendientes = await DB.contarPendientes();

    const mensaje = pendientes
      ? `Hay ${pendientes} movimiento(s) sin sincronizar que se ` +
        "perderán. ¿Cerrar sesión igualmente?"
      : "¿Cerrar sesión? Se borrarán los datos de este dispositivo.";

    if (!confirm(mensaje)) return;

    API.borrarToken();
    await DB.vaciar();

    location.reload();
  }

  // ------------------------------------------------------------------
  // Arranque
  // ------------------------------------------------------------------

  async function iniciar() {

    await DB.abrir();

    const usuario = await DB.ajuste("usuario");

    // Sin usuario configurado hace falta conexión para entrar la
    // primera vez. Después la aplicación abre siempre en local,
    // aunque el token haya caducado.
    if (!usuario) {
      mostrarLogin();
      return;
    }

    mostrarApp();

    await cargarCatalogos();
    await refrescar();

    sincronizar();
  }

  function conectarEventos() {

    $("#form-login").addEventListener("submit", entrar);
    $("#salir").addEventListener("click", salir);
    $("#sync").addEventListener("click", () => sincronizar({ manual: true }));

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
        refrescar();
      });
    });

    $("#abrir-resumen").addEventListener("click", mostrarResumen);
    $("#volver-resumen").addEventListener("click", volverAMovimientos);

    $("#res-anterior").addEventListener("click", async () => {
      estado.mes = new Date(
        estado.mes.getFullYear(), estado.mes.getMonth() - 1, 1
      );
      await refrescar();
      await pintarPantallaResumen();
    });

    $("#res-siguiente").addEventListener("click", async () => {
      estado.mes = new Date(
        estado.mes.getFullYear(), estado.mes.getMonth() + 1, 1
      );
      await refrescar();
      await pintarPantallaResumen();
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

    document.addEventListener("keydown", (evento) => {
      if (evento.key !== "Escape") return;
      if (!$("#hoja").hidden) cerrarHoja();
      else if (!$("#pantalla-resumen").hidden) volverAMovimientos();
    });

    // Al recuperar la conexión, ponerse al día solo.
    window.addEventListener("online", () => sincronizar());
    window.addEventListener("offline", () => pintarEstadoSync());

    // Y también al volver a la aplicación.
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) sincronizar();
    });
  }

  conectarEventos();
  iniciar();

})();
