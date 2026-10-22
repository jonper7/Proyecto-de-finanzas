/* =====================================================================
   Núcleo de la aplicación.

   Estado compartido, utilidades, carga de datos y el enrutador de
   pestañas. Cada pestaña vive en su propio archivo (vista_*.js) y se
   registra aquí con APP.registrar().
   ===================================================================== */

const APP = (() => {

  const hoy = new Date();

  const estado = {
    mes: new Date(hoy.getFullYear(), hoy.getMonth(), 1),
    todoElAnio: false,       // Movimientos: ver el año completo
    diaFiltro: null,         // Movimientos: un día elegido en el calendario
    tipo: "",                // Movimientos: "", "gasto" o "ingreso"
    todos: [],
    categorias: [],
    subcategorias: [],
    medios: [],
    categoriasPorId: new Map(),
    subcategoriasPorId: new Map(),
    mediosPorId: new Map(),
    presupuestos: {},        // { categoria_id: tope mensual }
    fijos: [],               // gastos frecuentes definidos por la persona
    descartados: [],         // sugerencias de fijos que se descartaron
    editando: null,
    vista: "inicio",
  };

  const $ = (selector, raiz = document) => raiz.querySelector(selector);
  const $$ = (selector, raiz = document) => [...raiz.querySelectorAll(selector)];

  // La moneda y los formatos se definen en config.js
  const euros = FORMATO.dinero;
  const mesLargo = FORMATO.mesLargo;
  const diaLargo = FORMATO.diaLargo;
  const normalizarMonto = FORMATO.normalizarMonto;

  const reducirMovimiento = () =>
    window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

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

  function identificador() {
    if (crypto.randomUUID) return crypto.randomUUID();
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  // ------------------------------------------------------------------
  // Avisos
  // ------------------------------------------------------------------

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
  // Cifras que "cuentan" hasta su valor
  // ------------------------------------------------------------------

  function contar(nodo, destino, formato = euros.format.bind(euros)) {

    if (!nodo) return;

    const desde = Number(nodo.dataset.valor);
    nodo.dataset.valor = String(destino);

    if (reducirMovimiento() || !Number.isFinite(desde) || desde === destino) {
      nodo.textContent = formato(destino);
      return;
    }

    cancelAnimationFrame(nodo._cuenta);
    const inicio = performance.now();
    const duracion = 650;

    const paso = (ahora) => {
      const t = Math.min((ahora - inicio) / duracion, 1);
      const suave = 1 - Math.pow(1 - t, 3);
      nodo.textContent = formato(desde + (destino - desde) * suave);
      if (t < 1) nodo._cuenta = requestAnimationFrame(paso);
    };

    nodo._cuenta = requestAnimationFrame(paso);
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

    if (api.alCambiarCatalogos) api.alCambiarCatalogos();
  }

  /**
   * Nombre legible de una subcategoría: «Categoría › Subcategoría».
   */
  function rutaSub(subId) {
    const sub = estado.subcategoriasPorId.get(subId);
    if (!sub) return "Sin categoría";
    const cat = estado.categoriasPorId.get(sub.categoria_id);
    return `${cat ? cat.nombre : "—"} › ${sub.nombre}`;
  }

  /**
   * Opciones de «subcategoría» agrupadas por categoría, para un select.
   */
  function opcionesSub({ tipo = null, excluirCategoria = null, excluirSub = null } = {}) {

    const opciones = [];

    estado.categorias.forEach((categoria) => {

      if (tipo && categoria.tipo !== tipo) return;
      if (excluirCategoria !== null && categoria.id === excluirCategoria) return;

      estado.subcategorias
        .filter((s) => s.categoria_id === categoria.id && s.id !== excluirSub)
        .forEach((sub) => {
          opciones.push({ valor: String(sub.id), texto: sub.nombre, grupo: categoria.nombre });
        });
    });

    return opciones;
  }

  // ------------------------------------------------------------------
  // Datos y repintado
  // ------------------------------------------------------------------

  const periodoDe = (fecha) => fecha.slice(0, 7);          // "2026-10"
  const claveMes = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

  function delMes(mes = estado.mes) {
    const clave = claveMes(mes);
    return estado.todos.filter((m) => periodoDe(m.fecha) === clave);
  }

  async function cargarDatos() {
    estado.todos = await DATOS.movimientos();
    estado.presupuestos = await DATOS.ajuste("presupuestos", {});
    estado.fijos = await DATOS.ajuste("fijos", []);
    estado.descartados = await DATOS.ajuste("fijos_descartados", []);
  }

  async function refrescar() {
    await cargarDatos();
    repintar();
  }

  function contexto() {
    return {
      todos: estado.todos,
      mes: estado.mes,
      categorias: estado.categoriasPorId,
      subcategorias: estado.subcategoriasPorId,
      presupuestos: estado.presupuestos,
      fijos: estado.fijos,
      ignorados: estado.descartados,
    };
  }

  function repintar() {
    const vista = vistas[estado.vista];
    if (vista && vista.pintar) vista.pintar();
  }

  async function cambiarMes(delta) {
    estado.mes = new Date(estado.mes.getFullYear(), estado.mes.getMonth() + delta, 1);
    estado.todoElAnio = false;
    estado.diaFiltro = null;
    repintar();
  }

  function elegirMes(fecha) {
    estado.mes = new Date(fecha.getFullYear(), fecha.getMonth(), 1);
    estado.diaFiltro = null;
    repintar();
  }

  // ------------------------------------------------------------------
  // Pestañas
  // ------------------------------------------------------------------

  const NOMBRES = ["inicio", "movimientos", "analisis", "planificar", "ajustes"];
  const CON_BOTON_NUEVO = new Set(["inicio", "movimientos"]);
  const vistas = {};

  function registrar(nombre, vista) {
    vistas[nombre] = vista;
  }

  function mostrar(nombre) {

    if (!NOMBRES.includes(nombre)) nombre = "inicio";

    const cambia = estado.vista !== nombre;
    estado.vista = nombre;

    NOMBRES.forEach((n) => {
      const nodo = $(`#vista-${n}`);
      if (nodo) nodo.hidden = n !== nombre;
    });

    $$(".tabbar__tab").forEach((boton, i) => {
      const activa = boton.dataset.vista === nombre;
      boton.classList.toggle("tabbar__tab--activa", activa);
      boton.setAttribute("aria-current", activa ? "page" : "false");
      if (activa) $(".tabbar").style.setProperty("--indice", i);
    });

    $("#nuevo").hidden = !CON_BOTON_NUEVO.has(nombre);

    const nodo = $(`#vista-${nombre}`);
    if (nodo && cambia) {
      nodo.classList.remove("vista--entra");
      void nodo.offsetWidth;
      nodo.classList.add("vista--entra");
      window.scrollTo(0, 0);
    }

    repintar();
  }

  function irA(nombre) {
    if (location.hash.slice(1) === nombre) {
      mostrar(nombre);
    } else {
      location.hash = nombre;   // crea historial: «Atrás» vuelve a la pestaña anterior
    }
  }

  function conectarRouter() {
    window.addEventListener("hashchange", () => mostrar(location.hash.slice(1)));
    document.addEventListener("click", (e) => {

      const tab = e.target.closest(".tabbar__tab");
      if (tab) {
        irA(tab.dataset.vista);
        return;
      }

      const ant = e.target.closest(".js-mes-ant");
      if (ant) { cambiarMes(-1); return; }

      const sig = e.target.closest(".js-mes-sig");
      if (sig) { cambiarMes(1); return; }

      const enlace = e.target.closest("[data-ir]");
      if (enlace) irA(enlace.dataset.ir);
    });
  }

  // ------------------------------------------------------------------
  // Arranque
  // ------------------------------------------------------------------

  async function iniciar() {

    FORMATO.aplicarSimbolo();
    await DATOS.preparar();
    await cargarCatalogos();
    await cargarDatos();

    conectarRouter();
    mostrar(location.hash.slice(1) || "inicio");
  }

  const api = {
    estado, $, $$, euros, mesLargo, diaLargo, normalizarMonto,
    iso, identificador, avisar, avisarConAccion, contar, reducirMovimiento,
    cargarCatalogos, cargarDatos, refrescar, repintar, contexto,
    rutaSub, opcionesSub, delMes, claveMes,
    cambiarMes, elegirMes, registrar, irA, mostrar, iniciar,
    alCambiarCatalogos: null,
  };

  return api;

})();
