/* =====================================================================
   Panel de resumen.

   Lo comparten las dos versiones (móvil y ordenador). Solo hace
   cálculos y pinta; recibe los datos ya cargados.

   Gráficas incluidas:
     - Evolución mensual: barras verticales de ingresos y gastos,
       con una lectura que se actualiza al tocar cada mes.
     - Reparto por categoría: donut (SVG) con leyenda.
   ===================================================================== */

const RESUMEN = (() => {

  // La moneda y los formatos se definen en config.js
  const euros = FORMATO.dinero;
  const mesLargo = FORMATO.mesLargo;
  const diaLargo = FORMATO.diaCorto;
  const mesCorto = FORMATO.mesCorto;

  const $ = (selector) => document.querySelector(selector);

  // Paleta para el donut: se recorre en orden.
  const COLORES = [
    "#00ff88", "#00c8ff", "#b060ff", "#ffd700",
    "#ff4560", "#ff8c42", "#4dd0e1", "#a3e635",
    "#f472b6", "#818cf8",
  ];

  const suma = (lista) =>
    lista.reduce((total, m) => total + (Number(m.monto) || 0), 0);

  function delMes(movimientos, fecha) {
    return movimientos.filter((movimiento) => {
      const [anio, mes] = movimiento.fecha.split("-").map(Number);
      return anio === fecha.getFullYear() && mes === fecha.getMonth() + 1;
    });
  }

  function categoriaDe(movimiento, contexto) {
    const sub = contexto.subcategorias.get(movimiento.subcategoria_id);
    if (!sub) return null;
    return contexto.categorias.get(sub.categoria_id) || null;
  }

  // ------------------------------------------------------------------
  // Tarjetas
  // ------------------------------------------------------------------

  function tarjetas(ingresos, gastos) {

    const totalIngresos = suma(ingresos);
    const totalGastos = suma(gastos);
    const balance = totalIngresos - totalGastos;

    $("#kpi-ingresos").textContent = euros.format(totalIngresos);
    $("#kpi-gastos").textContent = euros.format(totalGastos);
    $("#kpi-balance").textContent = euros.format(balance);

    $("#kpi-ingresos-n").textContent =
      `${ingresos.length} ${ingresos.length === 1 ? "movimiento" : "movimientos"}`;
    $("#kpi-gastos-n").textContent =
      `${gastos.length} ${gastos.length === 1 ? "movimiento" : "movimientos"}`;

    const pie = $("#kpi-balance-pie");

    if (!ingresos.length && !gastos.length) {
      pie.textContent = "Sin datos este mes";
    } else if (balance >= 0) {
      const ahorro = totalIngresos
        ? Math.round((balance / totalIngresos) * 100)
        : 0;
      pie.textContent = `Ahorras el ${ahorro}%`;
    } else {
      pie.textContent = "Gastas más de lo que ingresas";
    }

    return totalGastos;
  }

  // ------------------------------------------------------------------
  // Reparto por categoría (donut)
  // ------------------------------------------------------------------

  function porCategoria(gastos, total, contexto) {

    const contenedor = $("#por-categoria");
    contenedor.innerHTML = "";

    if (!gastos.length) {
      contenedor.innerHTML =
        '<p class="bloque__nota">Sin gastos este mes.</p>';
      return;
    }

    const agrupado = new Map();

    gastos.forEach((movimiento) => {
      const categoria = categoriaDe(movimiento, contexto);
      const nombre = categoria ? categoria.nombre : "Sin categoría";
      agrupado.set(
        nombre,
        (agrupado.get(nombre) || 0) + (Number(movimiento.monto) || 0)
      );
    });

    const ordenadas = [...agrupado.entries()].sort((a, b) => b[1] - a[1]);

    // --- Donut en SVG ---------------------------------------------
    const radio = 54;
    const circунf = 2 * Math.PI * radio; // circunferencia
    const circunf2 = circунf;

    const NS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 130 130");
    svg.setAttribute("width", "130");
    svg.setAttribute("height", "130");
    svg.setAttribute("class", "donut__svg");

    // Aro de fondo.
    const fondo = document.createElementNS(NS, "circle");
    fondo.setAttribute("cx", "65");
    fondo.setAttribute("cy", "65");
    fondo.setAttribute("r", String(radio));
    fondo.setAttribute("fill", "none");
    fondo.setAttribute("stroke", "rgba(255,255,255,0.05)");
    fondo.setAttribute("stroke-width", "16");
    svg.appendChild(fondo);

    let acumulado = 0;

    ordenadas.forEach(([, importe], indice) => {

      const fraccion = importe / total;
      const color = COLORES[indice % COLORES.length];

      const arco = document.createElementNS(NS, "circle");
      arco.setAttribute("cx", "65");
      arco.setAttribute("cy", "65");
      arco.setAttribute("r", String(radio));
      arco.setAttribute("fill", "none");
      arco.setAttribute("stroke", color);
      arco.setAttribute("stroke-width", "16");
      arco.setAttribute("stroke-linecap", "butt");
      // El arco cubre su fracción; el resto queda invisible.
      arco.setAttribute(
        "stroke-dasharray",
        `${fraccion * circunf2} ${circunf2}`
      );
      // Se coloca girando a partir de lo ya acumulado.
      arco.setAttribute("stroke-dashoffset", String(-acumulado * circunf2));
      arco.setAttribute("transform", "rotate(-90 65 65)");
      arco.style.transition = "stroke-dasharray .5s ease";
      svg.appendChild(arco);

      acumulado += fraccion;
    });

    const donut = document.createElement("div");
    donut.className = "donut";

    const aro = document.createElement("div");
    aro.className = "donut__aro";
    aro.appendChild(svg);

    const centro = document.createElement("div");
    centro.className = "donut__centro";
    centro.innerHTML =
      `<span class="donut__total"></span><span class="donut__lbl">TOTAL</span>`;
    centro.querySelector(".donut__total").textContent = euros.format(total);
    aro.appendChild(centro);

    donut.appendChild(aro);

    // --- Leyenda ---------------------------------------------------
    const leyenda = document.createElement("div");
    leyenda.className = "donut__leyenda";

    ordenadas.forEach(([nombre, importe], indice) => {

      const porcentaje = Math.round((importe / total) * 100);

      const item = document.createElement("div");
      item.className = "leyenda-item";
      item.innerHTML = `
        <span class="leyenda-punto"></span>
        <span class="leyenda-nombre"></span>
        <span class="leyenda-pct">${porcentaje}%</span>`;

      item.querySelector(".leyenda-punto").style.background =
        COLORES[indice % COLORES.length];
      item.querySelector(".leyenda-nombre").textContent = nombre;

      leyenda.appendChild(item);
    });

    donut.appendChild(leyenda);
    contenedor.appendChild(donut);
  }

  // ------------------------------------------------------------------
  // Evolución mensual (barras verticales con lectura al tocar)
  // ------------------------------------------------------------------

  function evolucion(todos, mes) {

    const contenedor = $("#evolucion");
    contenedor.innerHTML = "";

    const meses = [];

    for (let atras = 5; atras >= 0; atras -= 1) {
      const fecha = new Date(mes.getFullYear(), mes.getMonth() - atras, 1);
      const movimientos = delMes(todos, fecha);
      meses.push({
        fecha,
        ingresos: suma(movimientos.filter((m) => m.tipo === "ingreso")),
        gastos: suma(movimientos.filter((m) => m.tipo === "gasto")),
      });
    }

    const maximo = Math.max(
      ...meses.map((m) => Math.max(m.ingresos, m.gastos)), 1
    );

    const grafico = document.createElement("div");
    grafico.className = "grafico";

    // Lectura del mes seleccionado (por defecto, el último).
    const lectura = document.createElement("div");
    lectura.className = "grafico__lectura";
    lectura.innerHTML = `
      <span class="grafico__mes"></span>
      <span class="grafico__cifras">
        <span class="grafico__ing"></span>
        <span class="grafico__gas"></span>
      </span>`;

    const barras = document.createElement("div");
    barras.className = "grafico__barras";

    function seleccionar(indice) {

      const dato = meses[indice];

      grafico.querySelectorAll(".barra-mes").forEach((nodo, i) => {
        nodo.classList.toggle("barra-mes--activa", i === indice);
      });

      lectura.querySelector(".grafico__mes").textContent =
        mesLargo.format(dato.fecha);
      lectura.querySelector(".grafico__ing").textContent =
        `+${euros.format(dato.ingresos)}`;
      lectura.querySelector(".grafico__gas").textContent =
        `−${euros.format(dato.gastos)}`;
    }

    meses.forEach((dato, indice) => {

      const grupo = document.createElement("button");
      grupo.type = "button";
      grupo.className = "barra-mes";

      const par = document.createElement("span");
      par.className = "barra-mes__par";

      const ing = document.createElement("span");
      ing.className = "barra-mes__col barra-mes__col--ing";
      ing.style.height = `${Math.max((dato.ingresos / maximo) * 100, 2)}%`;
      ing.style.animationDelay = `${indice * 50}ms`;

      const gas = document.createElement("span");
      gas.className = "barra-mes__col barra-mes__col--gas";
      gas.style.height = `${Math.max((dato.gastos / maximo) * 100, 2)}%`;
      gas.style.animationDelay = `${indice * 50 + 25}ms`;

      par.append(ing, gas);

      const nombre = document.createElement("span");
      nombre.className = "barra-mes__nombre";
      nombre.textContent = mesCorto.format(dato.fecha).replace(".", "");

      grupo.append(par, nombre);
      grupo.addEventListener("click", () => seleccionar(indice));

      barras.appendChild(grupo);
    });

    grafico.append(lectura, barras);
    contenedor.appendChild(grafico);

    seleccionar(meses.length - 1);
  }

  // ------------------------------------------------------------------
  // Top de gastos
  // ------------------------------------------------------------------

  function topGastos(gastos, contexto) {

    const contenedor = $("#top-gastos");
    contenedor.innerHTML = "";

    if (!gastos.length) {
      contenedor.innerHTML =
        '<p class="bloque__nota">Sin gastos este mes.</p>';
      return;
    }

    [...gastos]
      .sort((a, b) => Number(b.monto) - Number(a.monto))
      .slice(0, 5)
      .forEach((movimiento, indice) => {

        const sub = contexto.subcategorias.get(movimiento.subcategoria_id);

        const fila = document.createElement("div");
        fila.className = "top";

        fila.innerHTML = `
          <span class="top__puesto">${indice + 1}</span>
          <span class="top__texto">
            <span class="top__concepto"></span>
            <span class="top__meta"></span>
          </span>
          <span class="top__monto">${euros.format(Number(movimiento.monto))}</span>`;

        fila.querySelector(".top__concepto").textContent =
          movimiento.descripcion || (sub ? sub.nombre : "Movimiento");

        fila.querySelector(".top__meta").textContent = [
          sub ? sub.nombre : null,
          diaLargo.format(new Date(`${movimiento.fecha}T12:00:00`)),
        ].filter(Boolean).join(" · ");

        contenedor.appendChild(fila);
      });
  }

  // ------------------------------------------------------------------
  // Comparación anual (gasto total por año)
  // ------------------------------------------------------------------

  function comparacionAnual(todos) {

    const contenedor = $("#anual");
    contenedor.innerHTML = "";

    // Suma de gastos por año.
    const porAnio = new Map();

    todos.forEach((m) => {
      if (m.tipo !== "gasto") return;
      const anio = Number(m.fecha.slice(0, 4));
      porAnio.set(anio, (porAnio.get(anio) || 0) + (Number(m.monto) || 0));
    });

    if (!porAnio.size) {
      contenedor.innerHTML =
        '<p class="bloque__nota">Aún no hay gastos registrados.</p>';
      return;
    }

    const anios = [...porAnio.keys()].sort((a, b) => a - b); // ascendente
    const maximo = Math.max(...porAnio.values(), 1);

    // Se pintan del más reciente al más antiguo.
    [...anios].reverse().forEach((anio, indice) => {

      const gasto = porAnio.get(anio);
      const anterior = porAnio.get(anio - 1);

      const fila = document.createElement("div");
      fila.className = "anual-fila";

      fila.innerHTML = `
        <div class="anual__cabecera">
          <span class="anual__anio"></span>
          <span class="anual__delta"></span>
          <span class="anual__monto"></span>
        </div>
        <div class="anual__riel"><div class="anual__fill"></div></div>`;

      fila.querySelector(".anual__anio").textContent = anio;
      fila.querySelector(".anual__monto").textContent = euros.format(gasto);

      const fill = fila.querySelector(".anual__fill");
      fill.style.width = `${Math.max((gasto / maximo) * 100, 2)}%`;
      fill.style.animationDelay = `${indice * 60}ms`;

      // Variación respecto al año anterior (si existe).
      const delta = fila.querySelector(".anual__delta");

      if (anterior) {
        const variacion = Math.round(((gasto - anterior) / anterior) * 100);
        if (variacion > 0) {
          delta.textContent = `▲ ${variacion}%`;
          delta.classList.add("anual__delta--sube");
        } else if (variacion < 0) {
          delta.textContent = `▼ ${Math.abs(variacion)}%`;
          delta.classList.add("anual__delta--baja");
        } else {
          delta.textContent = "=";
        }
      }

      contenedor.appendChild(fila);
    });
  }

  return {

    pintar(contexto) {

      $("#res-mes").textContent = mesLargo.format(contexto.mes);

      const movimientos = delMes(contexto.todos, contexto.mes);
      const ingresos = movimientos.filter((m) => m.tipo === "ingreso");
      const gastos = movimientos.filter((m) => m.tipo === "gasto");

      const totalGastos = tarjetas(ingresos, gastos);

      porCategoria(gastos, totalGastos, contexto);
      evolucion(contexto.todos, contexto.mes);
      comparacionAnual(contexto.todos);
      topGastos(gastos, contexto);
    },
  };

})();
