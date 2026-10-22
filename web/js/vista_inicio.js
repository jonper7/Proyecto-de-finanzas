/* =====================================================================
   Pestaña Inicio: balance del mes, tarjetas, en qué se va el dinero,
   proyección y avisos.
   ===================================================================== */

(() => {

  const { $, estado, euros, mesLargo } = APP;

  // ------------------------------------------------------------------
  // Avisos: copia de seguridad y gastos fijos por registrar
  // ------------------------------------------------------------------

  function tira(titulo) {
    const nodo = document.createElement("div");
    nodo.className = "tira";
    const t = document.createElement("p");
    t.className = "tira__titulo";
    t.textContent = titulo;
    nodo.appendChild(t);
    return nodo;
  }

  async function avisoCopia(zona) {

    const ultima = await DATOS.ajuste("ultima_copia");
    const callarHasta = await DATOS.ajuste("copia_aviso_hasta", 0);
    const dias = ultima
      ? Math.floor((Date.now() - new Date(ultima).getTime()) / 86400000)
      : null;

    if (estado.todos.length < 10 || Date.now() <= callarHasta) return;
    if (dias !== null && dias < 7) return;

    const nodo = tira(dias === null
      ? "Aún no has hecho ninguna copia. Tus datos solo viven en este teléfono."
      : `Hace ${dias} días que no haces copia de seguridad.`);

    const acciones = document.createElement("div");
    acciones.className = "tira__acciones";
    acciones.innerHTML = `
      <button type="button" class="tira__boton tira__boton--si">Guardar en Drive</button>
      <button type="button" class="tira__boton tira__boton--no">Más tarde</button>`;

    acciones.querySelector(".tira__boton--si").addEventListener("click", async () => {
      await AJUSTES.exportar();
      pintar();
    });
    acciones.querySelector(".tira__boton--no").addEventListener("click", async () => {
      await DATOS.guardarAjuste("copia_aviso_hasta", Date.now() + 86400000);
      pintar();
    });

    nodo.appendChild(acciones);
    zona.appendChild(nodo);
  }

  function avisoFijos(zona) {

    const hoy = new Date();
    const esMesActual =
      estado.mes.getFullYear() === hoy.getFullYear() &&
      estado.mes.getMonth() === hoy.getMonth();

    const activos = estado.fijos.filter((f) => f.activo !== false);

    // Aún sin fijos: se invita a crearlos si hay candidatos en el historial.
    if (!estado.fijos.length) {
      const candidatos = INTEL.sugerencias(estado.todos, estado.mes, [], estado.descartados);
      if (candidatos.length) {
        const nodo = tira(`Detectamos ${candidatos.length} gasto${candidatos.length === 1 ? "" : "s"} que se repite${candidatos.length === 1 ? "" : "n"} cada mes.`);
        const acciones = document.createElement("div");
        acciones.className = "tira__acciones";
        acciones.innerHTML = '<button type="button" class="tira__boton tira__boton--si" data-ir="planificar">Revisar en Planificar</button>';
        nodo.appendChild(acciones);
        zona.appendChild(nodo);
      }
      return;
    }

    if (!esMesActual) return;

    const pendientes = INTEL.estadoFijos(estado.todos, estado.mes, activos)
      .filter((e) => !e.pagado);

    if (!pendientes.length) return;

    const nodo = tira("Fijos por registrar este mes");
    const chips = document.createElement("div");
    chips.className = "chips";

    pendientes.forEach(({ fijo }) => {

      const chip = document.createElement("span");
      chip.className = "chip";
      chip.innerHTML = '<button type="button" class="chip__texto"></button>';

      const texto = chip.querySelector(".chip__texto");
      texto.textContent = fijo.nombre;
      const monto = document.createElement("b");
      monto.textContent = euros.format(Number(fijo.monto));
      texto.appendChild(monto);

      texto.addEventListener("click", () => FIJOS.registrar(fijo));

      chips.appendChild(chip);
    });

    nodo.appendChild(chips);
    zona.appendChild(nodo);
  }

  async function pintarAvisos() {

    const zona = $("#avisos-inicio");
    zona.innerHTML = "";

    avisoFijos(zona);
    await avisoCopia(zona);
  }

  function pintar() {
    $("#inicio-mes").textContent = mesLargo.format(estado.mes);
    RESUMEN.pintarInicio(APP.contexto());
    pintarAvisos();
  }

  APP.registrar("inicio", { pintar });

})();
