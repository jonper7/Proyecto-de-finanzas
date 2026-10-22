/* =====================================================================
   Pestaña Movimientos: calendario de gastos, filtros por año y mes y
   la lista (deslizar a la derecha edita, a la izquierda elimina).
   ===================================================================== */

(() => {

  const { $, $$, estado, euros, diaLargo, avisar, avisarConAccion } = APP;

  const abrirHoja = (...args) => MOV.abrir(...args);
  const refrescar = () => APP.refrescar();

  const MESES = Array.from({ length: 12 }, (_, i) =>
    FORMATO.mesCorto.format(new Date(2024, i, 1)).replace(".", ""));

  // ------------------------------------------------------------------
  // Fila de la lista, con gesto de deslizar
  // ------------------------------------------------------------------

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
  // Filtros: año, mes y tipo
  // ------------------------------------------------------------------

  function aniosDisponibles() {
    const anios = new Set([new Date().getFullYear(), estado.mes.getFullYear()]);
    estado.todos.forEach((m) => anios.add(Number(m.fecha.slice(0, 4))));
    return [...anios].sort((a, b) => b - a);
  }

  function pintarFiltros() {

    const anio = estado.mes.getFullYear();

    const zonaAnios = $("#filtro-anios");
    zonaAnios.innerHTML = "";

    aniosDisponibles().forEach((a) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "ficha" + (a === anio ? " ficha--activa" : "");
      chip.textContent = a;
      chip.addEventListener("click", () => {
        estado.mes = new Date(a, estado.mes.getMonth(), 1);
        estado.diaFiltro = null;
        pintar();
      });
      zonaAnios.appendChild(chip);
    });

    const delAnio = new Set(
      estado.todos
        .filter((m) => m.fecha.startsWith(`${anio}-`))
        .map((m) => Number(m.fecha.slice(5, 7)) - 1)
    );

    const zonaMeses = $("#filtro-meses");
    zonaMeses.innerHTML = "";

    const todo = document.createElement("button");
    todo.type = "button";
    todo.className = "ficha ficha--anio" + (estado.todoElAnio ? " ficha--activa" : "");
    todo.textContent = `Todo ${anio}`;
    todo.addEventListener("click", () => {
      estado.todoElAnio = true;
      estado.diaFiltro = null;
      pintar();
    });
    zonaMeses.appendChild(todo);

    MESES.forEach((nombre, i) => {
      const activo = !estado.todoElAnio && i === estado.mes.getMonth();
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "ficha"
        + (activo ? " ficha--activa" : "")
        + (delAnio.has(i) ? "" : " ficha--vacia");
      chip.textContent = nombre;
      chip.addEventListener("click", () => {
        estado.todoElAnio = false;
        estado.diaFiltro = null;
        estado.mes = new Date(anio, i, 1);
        pintar();
      });
      zonaMeses.appendChild(chip);
    });

    $$(".filtro", $("#vista-movimientos")).forEach((boton) => {
      boton.classList.toggle("filtro--activo", boton.dataset.tipo === estado.tipo);
    });

    const activa = zonaMeses.querySelector(".ficha--activa");
    if (activa && typeof zonaMeses.scrollTo === "function") {
      zonaMeses.scrollTo({
        left: activa.offsetLeft - zonaMeses.clientWidth / 2 + activa.clientWidth / 2,
        behavior: "auto",
      });
    }
  }

  // ------------------------------------------------------------------
  // Datos visibles
  // ------------------------------------------------------------------

  function visibles() {

    const anio = String(estado.mes.getFullYear());
    const clave = APP.claveMes(estado.mes);

    return estado.todos.filter((m) => {

      if (estado.todoElAnio) {
        if (!m.fecha.startsWith(anio)) return false;
      } else {
        if (!m.fecha.startsWith(clave)) return false;
        if (estado.diaFiltro && Number(m.fecha.slice(8, 10)) !== estado.diaFiltro) return false;
      }

      return !estado.tipo || m.tipo === estado.tipo;
    });
  }

  function pintarResumenLista(lista) {

    let ingresos = 0;
    let gastos = 0;

    lista.forEach((m) => {
      const monto = Number(m.monto) || 0;
      if (m.tipo === "ingreso") ingresos += monto;
      else gastos += monto;
    });

    const nodo = $("#resumen-lista");
    nodo.innerHTML = `
      <span class="resumen-lista__n"></span>
      <span class="resumen-lista__cifras">
        <b class="pos"></b><b class="neg"></b>
      </span>`;

    nodo.querySelector(".resumen-lista__n").textContent =
      `${lista.length} movimiento${lista.length === 1 ? "" : "s"}`;
    const cifras = nodo.querySelectorAll("b");
    cifras[0].textContent = `+${euros.format(ingresos)}`;
    cifras[1].textContent = `−${euros.format(gastos)}`;

    const quitar = $("#filtro-dia");
    quitar.hidden = !estado.diaFiltro;
    if (estado.diaFiltro) {
      quitar.textContent = `Día ${estado.diaFiltro} · quitar filtro ×`;
    }
  }

  function pintarLista() {

    const lista = $("#lista");
    const filas = visibles();

    pintarResumenLista(filas);

    lista.innerHTML = "";

    if (!filas.length) {
      lista.innerHTML = `
        <div class="vacio">
          <span class="vacio__signo">—</span>
          Sin movimientos en este periodo
        </div>`;
      return;
    }

    const porDia = new Map();

    filas.forEach((mov) => {
      if (!porDia.has(mov.fecha)) porDia.set(mov.fecha, []);
      porDia.get(mov.fecha).push(mov);
    });

    [...porDia.keys()].sort().reverse().forEach((fecha) => {

      const bloque = document.createElement("div");
      bloque.className = "dia";

      const titulo = document.createElement("p");
      titulo.className = "dia__fecha";
      // El mediodía evita saltos de día por zona horaria.
      titulo.textContent = FORMATO.diaLargo.format(new Date(`${fecha}T12:00:00`));
      bloque.appendChild(titulo);

      porDia.get(fecha).forEach((mov, indice) => {
        bloque.appendChild(filaMovimiento(mov, indice));
      });

      lista.appendChild(bloque);
    });
  }

  function pintarCalendario() {

    const bloque = $("#bloque-calendario");
    bloque.hidden = estado.todoElAnio;
    if (estado.todoElAnio) return;

    $("#calendario").hidden = !estado.calAbierto;
    $("#cal-toggle").setAttribute("aria-expanded", String(estado.calAbierto));
    $("#cal-toggle").classList.toggle("plegable--cerrado", !estado.calAbierto);

    if (!estado.calAbierto) return;

    RESUMEN.pintarCalendario(APP.contexto(), {
      dia: estado.diaFiltro,
      alElegir: (dia) => {
        estado.diaFiltro = estado.diaFiltro === dia ? null : dia;
        pintarFiltros();
        pintarLista();
      },
    });
  }

  function pintar() {
    pintarFiltros();
    pintarCalendario();
    pintarLista();
  }

  // ------------------------------------------------------------------
  // Eventos fijos de la pestaña
  // ------------------------------------------------------------------

  estado.calAbierto = true;

  $$(".filtro", $("#vista-movimientos")).forEach((boton) => {
    boton.addEventListener("click", () => {
      estado.tipo = boton.dataset.tipo;
      pintar();
    });
  });

  $("#cal-toggle").addEventListener("click", () => {
    estado.calAbierto = !estado.calAbierto;
    pintarCalendario();
  });

  $("#filtro-dia").addEventListener("click", () => {
    estado.diaFiltro = null;
    pintar();
  });

  APP.registrar("movimientos", { pintar });

})();
