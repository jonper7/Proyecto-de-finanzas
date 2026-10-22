/* =====================================================================
   Panel de resumen.

   Lo comparten las dos versiones (móvil y ordenador). Solo hace
   cálculos y pinta; recibe los datos ya cargados.

   Gráficas incluidas (todas en SVG propio, sin librerías):
     - Donut por categoría con desglose por subcategoría al tocar.
     - Comparativa de cada categoría con el mes anterior.
     - Calendario de gastos (mapa de calor) con detalle por día.
     - Tendencia de doce meses con líneas suavizadas y crosshair.
     - Año contra año: líneas mes a mes y totales por año.
     - Un tooltip compartido que sigue al dedo o al cursor.
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
  // Tooltip compartido: sigue al dedo o al cursor (patrón de crosshair)
  // ------------------------------------------------------------------

  let tip = null;

  function ocultarTip() {
    if (tip) tip.style.display = "none";
  }

  function mostrarTip(evento, texto) {
    if (!tip) {
      tip = document.createElement("div");
      tip.className = "tooltip";
      document.body.appendChild(tip);
      document.addEventListener("pointerdown", (e) => {
        if (!e.target.closest("[data-tip]")) ocultarTip();
      });
      window.addEventListener("scroll", ocultarTip, { passive: true });
    }
    tip.textContent = texto;
    tip.style.display = "block";
    const ancho = tip.offsetWidth;
    const x = Math.min(
      Math.max(evento.clientX - ancho / 2, 8),
      window.innerWidth - ancho - 8
    );
    tip.style.left = `${x}px`;
    tip.style.top = `${Math.max(evento.clientY - tip.offsetHeight - 14, 8)}px`;
  }

  // Asocia un texto a un elemento: se ve al tocar o pasar el cursor.
  function conTip(nodo, texto) {
    nodo.setAttribute("data-tip", "1");
    nodo.addEventListener("pointerdown", (e) => mostrarTip(e, texto));
    nodo.addEventListener("pointermove", (e) => {
      if (e.pointerType === "mouse" || e.buttons) mostrarTip(e, texto);
    });
    nodo.addEventListener("pointerleave", (e) => {
      if (e.pointerType === "mouse") ocultarTip();
    });
  }

  // ------------------------------------------------------------------
  // Comparativa con el mes anterior (por categoría)
  // ------------------------------------------------------------------

  function porCategorias(gastos, contexto) {
    const mapa = new Map();
    gastos.forEach((m) => {
      const c = categoriaDe(m, contexto);
      const nombre = c ? c.nombre : "Sin categoría";
      mapa.set(nombre, (mapa.get(nombre) || 0) + (Number(m.monto) || 0));
    });
    return mapa;
  }

  function comparativa(todos, mes, gastosActual, contexto) {

    const contenedor = $("#comparativa");
    contenedor.innerHTML = "";

    const anteriorFecha = new Date(mes.getFullYear(), mes.getMonth() - 1, 1);
    const gastosPrevio = delMes(todos, anteriorFecha).filter((m) => m.tipo === "gasto");

    const actual = porCategorias(gastosActual, contexto);
    const previo = porCategorias(gastosPrevio, contexto);

    const totalA = suma(gastosActual);
    const totalP = suma(gastosPrevio);

    if (!totalA && !totalP) {
      contenedor.innerHTML =
        '<p class="bloque__nota">Sin gastos en este mes ni en el anterior.</p>';
      return;
    }

    const resumen = document.createElement("p");
    resumen.className = "comp__resumen";
    const nombreAnt = mesLargo.format(anteriorFecha);

    if (!totalP) {
      resumen.textContent = `No hay gastos en ${nombreAnt} para comparar.`;
    } else {
      const pct = Math.round(((totalA - totalP) / totalP) * 100);
      if (pct === 0) {
        resumen.textContent = `Gastas lo mismo que en ${nombreAnt}.`;
      } else {
        const cls = pct > 0 ? "comp__num--sube" : "comp__num--baja";
        resumen.innerHTML =
          `Este mes gastas un <b class="${cls}">${Math.abs(pct)}% ${pct > 0 ? "más" : "menos"}</b> que en ${nombreAnt}.`;
      }
    }
    contenedor.appendChild(resumen);

    const nombres = new Set([...actual.keys(), ...previo.keys()]);
    const filas = [...nombres].map((nombre) => ({
      nombre,
      a: actual.get(nombre) || 0,
      p: previo.get(nombre) || 0,
    })).sort((x, y) => Math.abs(y.a - y.p) - Math.abs(x.a - x.p));

    const maximo = Math.max(...filas.map((f) => Math.max(f.a, f.p)), 1);

    filas.forEach((f) => {

      const fila = document.createElement("div");
      fila.className = "comp-fila";
      fila.innerHTML = `
        <div class="comp__cab">
          <span class="comp__nombre"></span>
          <span class="anual__delta comp__delta"></span>
        </div>
        <div class="comp__barra"><div class="comp__fill comp__fill--act"></div></div>
        <div class="comp__barra"><div class="comp__fill comp__fill--ant"></div></div>
        <div class="comp__cifras"><span></span><span></span></div>`;

      fila.querySelector(".comp__nombre").textContent = f.nombre;
      fila.querySelector(".comp__fill--act").style.width =
        `${f.a ? Math.max((f.a / maximo) * 100, 2) : 0}%`;
      fila.querySelector(".comp__fill--ant").style.width =
        `${f.p ? Math.max((f.p / maximo) * 100, 2) : 0}%`;

      const cifras = fila.querySelectorAll(".comp__cifras span");
      cifras[0].textContent = `Este mes ${euros.format(f.a)}`;
      cifras[1].textContent = `Antes ${euros.format(f.p)}`;

      const delta = fila.querySelector(".comp__delta");
      if (!f.p && f.a) {
        delta.textContent = "nuevo";
        delta.classList.add("anual__delta--sube");
      } else if (f.p) {
        const v = Math.round(((f.a - f.p) / f.p) * 100);
        if (v > 0) {
          delta.textContent = `▲ ${v}%`;
          delta.classList.add("anual__delta--sube");
        } else if (v < 0) {
          delta.textContent = `▼ ${Math.abs(v)}%`;
          delta.classList.add("anual__delta--baja");
        } else {
          delta.textContent = "=";
        }
      }

      const dif = f.a - f.p;
      conTip(fila, `${f.nombre}: ${euros.format(f.a)} vs ${euros.format(f.p)} (${dif >= 0 ? "+" : "−"}${euros.format(Math.abs(dif))})`);

      contenedor.appendChild(fila);
    });
  }

  // ------------------------------------------------------------------
  // Tarjetas
  // ------------------------------------------------------------------

  const mostrarCifra = (nodo, valor) => {
    if (!nodo) return;
    if (typeof APP !== "undefined" && APP.contar) APP.contar(nodo, valor);
    else nodo.textContent = euros.format(valor);
  };

  function tarjetas(ingresos, gastos) {

    const totalIngresos = suma(ingresos);
    const totalGastos = suma(gastos);
    const balance = totalIngresos - totalGastos;

    mostrarCifra($("#kpi-ingresos"), totalIngresos);
    mostrarCifra($("#kpi-gastos"), totalGastos);
    mostrarCifra($("#kpi-balance"), balance);
    $("#kpi-balance").classList.toggle("hero__cifra--negativa", balance < 0);

    $("#kpi-ingresos-n").textContent =
      `${ingresos.length} ${ingresos.length === 1 ? "movimiento" : "movimientos"}`;
    $("#kpi-gastos-n").textContent =
      `${gastos.length} ${gastos.length === 1 ? "movimiento" : "movimientos"}`;

    const pie = $("#kpi-balance-pie");
    pie.classList.remove("hero__pie--mal");

    if (!ingresos.length && !gastos.length) {
      pie.textContent = "Sin datos este mes";
    } else if (balance >= 0) {
      const ahorro = totalIngresos
        ? Math.round((balance / totalIngresos) * 100)
        : 0;
      pie.textContent = `Ahorras el ${ahorro}%`;
    } else {
      pie.textContent = "Gastas más de lo que ingresas";
      pie.classList.add("hero__pie--mal");
    }

    return totalGastos;
  }

  // ------------------------------------------------------------------
  // Ritmo del mes: gasto acumulado día a día frente al mes anterior
  // ------------------------------------------------------------------

  function heroSpark(contexto) {

    const destino = $("#hero-spark");
    if (!destino) return;
    destino.innerHTML = "";

    const anio = contexto.mes.getFullYear();
    const mes = contexto.mes.getMonth();
    const diasMes = new Date(anio, mes + 1, 0).getDate();
    const hoy = new Date();
    const esActual = hoy.getFullYear() === anio && hoy.getMonth() === mes;
    const hasta = esActual ? hoy.getDate() : diasMes;

    const acumulado = (fecha, limite) => {
      const dias = Array(32).fill(0);
      delMes(contexto.todos, fecha)
        .filter((m) => m.tipo === "gasto")
        .forEach((m) => { dias[Number(m.fecha.slice(8, 10))] += Number(m.monto) || 0; });
      const salida = [];
      let total = 0;
      for (let d = 1; d <= limite; d += 1) { total += dias[d]; salida.push(total); }
      return salida;
    };

    const actual = acumulado(contexto.mes, hasta);
    const previo = acumulado(new Date(anio, mes - 1, 1), diasMes);

    const maximo = Math.max(...actual, ...previo, 1);
    if (maximo <= 1 && !actual.some((v) => v > 0)) return;

    const W = 320, H = 64, y0 = 6, y1 = H - 4;
    const x = (i, n) => (n <= 1 ? 0 : (i * W) / (diasMes - 1));
    const y = (v) => y1 - (v / maximo) * (y1 - y0);

    const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, class: "hero__svg", preserveAspectRatio: "none", "aria-hidden": "true" });
    const defs = svgEl("defs");
    const gradiente = svgEl("linearGradient", { id: "hero-g", x1: 0, y1: 0, x2: 0, y2: 1 });
    gradiente.appendChild(svgEl("stop", { offset: "0%", "stop-color": "#ffffff", "stop-opacity": 0.35 }));
    gradiente.appendChild(svgEl("stop", { offset: "100%", "stop-color": "#ffffff", "stop-opacity": 0 }));
    defs.appendChild(gradiente);
    svg.appendChild(defs);

    const puntos = (lista) => lista.map((v, i) => [x(i, diasMes), y(v)]);

    if (previo.some((v) => v > 0)) {
      svg.appendChild(svgEl("path", {
        d: trazoSuave(puntos(previo), y0, y1), fill: "none",
        stroke: "rgba(255,255,255,.35)", "stroke-width": 1.6, "stroke-dasharray": "3 4",
        "vector-effect": "non-scaling-stroke",
      }));
    }

    const pa = puntos(actual);
    const linea = trazoSuave(pa, y0, y1);
    svg.appendChild(svgEl("path", {
      d: `${linea} L${pa[pa.length - 1][0]},${y1} L${pa[0][0]},${y1} Z`, fill: "url(#hero-g)",
    }));
    svg.appendChild(svgEl("path", {
      d: linea, fill: "none", stroke: "#fff", "stroke-width": 2.2,
      "stroke-linecap": "round", "vector-effect": "non-scaling-stroke",
    }));

    destino.appendChild(svg);

    const pie = document.createElement("div");
    pie.className = "hero__spark-pie";
    pie.innerHTML = "<span>Gasto acumulado</span><span>Línea punteada: mes anterior</span>";
    destino.appendChild(pie);
  }

  // ------------------------------------------------------------------
  // Reparto por categoría (donut) con desglose por subcategoría
  // ------------------------------------------------------------------

  const NS = "http://www.w3.org/2000/svg";

  function svgEl(nombre, atributos) {
    const nodo = document.createElementNS(NS, nombre);
    Object.entries(atributos || {}).forEach(([k, v]) => nodo.setAttribute(k, String(v)));
    return nodo;
  }

  function porCategoria(gastos, total, contexto) {

    const contenedor = $("#por-categoria");
    contenedor.innerHTML = "";

    if (!gastos.length) {
      contenedor.innerHTML =
        '<p class="bloque__nota">Sin gastos este mes.</p>';
      return;
    }

    // categoría → { total, subcategorías }
    const agrupado = new Map();

    gastos.forEach((movimiento) => {
      const categoria = categoriaDe(movimiento, contexto);
      const nombre = categoria ? categoria.nombre : "Sin categoría";
      const sub = contexto.subcategorias.get(movimiento.subcategoria_id);
      const importe = Number(movimiento.monto) || 0;

      if (!agrupado.has(nombre)) agrupado.set(nombre, { total: 0, subs: new Map() });
      const grupo = agrupado.get(nombre);
      grupo.total += importe;
      const nombreSub = sub ? sub.nombre : "Otros";
      grupo.subs.set(nombreSub, (grupo.subs.get(nombreSub) || 0) + importe);
    });

    const ordenadas = [...agrupado.entries()].sort((a, b) => b[1].total - a[1].total);

    const radio = 54;
    const circunf = 2 * Math.PI * radio;

    const svg = svgEl("svg", { viewBox: "0 0 130 130", width: 130, height: 130, class: "donut__svg" });
    svg.appendChild(svgEl("circle", {
      cx: 65, cy: 65, r: radio, fill: "none",
      stroke: "rgba(255,255,255,0.06)", "stroke-width": 16,
    }));

    const arcos = [];
    let acumulado = 0;

    ordenadas.forEach(([nombre, grupo], indice) => {

      const fraccion = grupo.total / total;
      const color = COLORES[indice % COLORES.length];

      const arco = svgEl("circle", {
        cx: 65, cy: 65, r: radio, fill: "none", stroke: color,
        "stroke-width": 16, "stroke-linecap": "butt",
        "stroke-dasharray": `${Math.max(fraccion * circunf - 1.5, 0.5)} ${circunf}`,
        "stroke-dashoffset": -acumulado * circunf,
        transform: "rotate(-90 65 65)",
        class: "donut__arco",
      });
      svg.appendChild(arco);
      arcos.push(arco);
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

    // --- Leyenda (cada ítem se puede tocar) ---------------------------
    const leyenda = document.createElement("div");
    leyenda.className = "donut__leyenda";
    const items = [];

    const detalle = document.createElement("div");
    detalle.className = "desglose";

    function seleccionar(indice) {

      arcos.forEach((arco, i) => arco.classList.toggle("donut__arco--activo", i === indice));
      items.forEach((item, i) => item.classList.toggle("leyenda-item--activo", i === indice));

      const [nombre, grupo] = ordenadas[indice];
      const color = COLORES[indice % COLORES.length];
      const subs = [...grupo.subs.entries()].sort((a, b) => b[1] - a[1]);
      const mayor = subs[0] ? subs[0][1] : 1;

      detalle.innerHTML = `
        <div class="desglose__cab">
          <span class="desglose__nombre"></span>
          <span class="desglose__total"></span>
        </div>`;
      detalle.style.setProperty("--color", color);
      detalle.querySelector(".desglose__nombre").textContent = nombre;
      detalle.querySelector(".desglose__total").textContent = euros.format(grupo.total);

      subs.forEach(([sub, importe]) => {
        const fila = document.createElement("div");
        fila.className = "desglose__fila";
        fila.innerHTML = `
          <span class="desglose__sub"></span>
          <span class="desglose__riel"><span class="desglose__fill"></span></span>
          <span class="desglose__monto"></span>`;
        fila.querySelector(".desglose__sub").textContent = sub;
        fila.querySelector(".desglose__monto").textContent = euros.format(importe);
        fila.querySelector(".desglose__fill").style.width = `${Math.max((importe / mayor) * 100, 4)}%`;
        detalle.appendChild(fila);
      });
    }

    ordenadas.forEach(([nombre, grupo], indice) => {

      const porcentaje = Math.round((grupo.total / total) * 100);

      const item = document.createElement("button");
      item.type = "button";
      item.className = "leyenda-item";
      item.innerHTML = `
        <span class="leyenda-punto"></span>
        <span class="leyenda-nombre"></span>
        <span class="leyenda-pct">${porcentaje}%</span>`;

      item.querySelector(".leyenda-punto").style.background = COLORES[indice % COLORES.length];
      item.querySelector(".leyenda-nombre").textContent = nombre;
      item.addEventListener("click", () => seleccionar(indice));

      items.push(item);
      leyenda.appendChild(item);

      const texto = `${nombre}: ${euros.format(grupo.total)} (${porcentaje}%)`;
      arcos[indice].addEventListener("click", () => seleccionar(indice));
      conTip(arcos[indice], texto);
    });

    donut.appendChild(leyenda);
    contenedor.appendChild(donut);
    contenedor.appendChild(detalle);

    seleccionar(0);
  }

  // ------------------------------------------------------------------
  // Gráfica de líneas suavizadas con "crosshair" (arrastrar para leer)
  // ------------------------------------------------------------------

  let contadorGraficas = 0;

  // Curva suave que pasa por los puntos (Catmull-Rom → Bézier).
  function trazoSuave(puntos, yMin, yMax) {
    if (puntos.length === 1) return `M${puntos[0][0]},${puntos[0][1]}`;
    const limita = (y) => Math.min(Math.max(y, yMin), yMax);
    let d = `M${puntos[0][0]},${puntos[0][1]}`;
    for (let i = 0; i < puntos.length - 1; i += 1) {
      const p0 = puntos[i - 1] || puntos[i];
      const p1 = puntos[i];
      const p2 = puntos[i + 1];
      const p3 = puntos[i + 2] || p2;
      const c1x = p1[0] + (p2[0] - p0[0]) / 6;
      const c1y = limita(p1[1] + (p2[1] - p0[1]) / 6);
      const c2x = p2[0] - (p3[0] - p1[0]) / 6;
      const c2y = limita(p2[1] - (p3[1] - p1[1]) / 6);
      d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
    }
    return d;
  }

  /*
    opciones = {
      etiquetas: ["ene", ...],
      titulos:   ["enero 2026", ...]     (para el tooltip),
      series:    [{ nombre, color, valores: [n|null], area: bool }],
    }
  */
  function graficaLineas(contenedor, opciones) {

    const { etiquetas, titulos, series } = opciones;
    const id = `g${contadorGraficas += 1}`;

    const W = 340, H = 176, izq = 6, der = 6, arriba = 14, abajo = 24;
    const n = etiquetas.length;
    const maximo = Math.max(
      ...series.flatMap((s) => s.valores.filter((v) => v !== null)), 1
    );

    const x = (i) => izq + (n === 1 ? (W - izq - der) / 2 : (i * (W - izq - der)) / (n - 1));
    const y = (v) => arriba + (1 - v / maximo) * (H - arriba - abajo);

    const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, class: "lineas__svg", role: "img" });
    const defs = svgEl("defs");
    svg.appendChild(defs);

    // Rejilla horizontal.
    [0, 0.5, 1].forEach((fraccion) => {
      const yy = arriba + fraccion * (H - arriba - abajo);
      svg.appendChild(svgEl("line", {
        x1: izq, x2: W - der, y1: yy, y2: yy, class: "lineas__rejilla",
      }));
    });

    // Etiquetas del eje X.
    const paso = n > 8 ? 2 : 1;
    etiquetas.forEach((texto, i) => {
      if (i % paso !== 0 && i !== n - 1) return;
      const t = svgEl("text", { x: x(i), y: H - 6, class: "lineas__eje", "text-anchor": "middle" });
      t.textContent = texto;
      svg.appendChild(t);
    });

    // Series.
    series.forEach((serie, k) => {

      // Tramos consecutivos sin huecos.
      const tramos = [];
      let actual = [];
      serie.valores.forEach((v, i) => {
        if (v === null) {
          if (actual.length) tramos.push(actual);
          actual = [];
        } else {
          actual.push([x(i), y(v)]);
        }
      });
      if (actual.length) tramos.push(actual);

      if (serie.area) {
        const gradiente = svgEl("linearGradient", { id: `${id}-a${k}`, x1: 0, y1: 0, x2: 0, y2: 1 });
        gradiente.appendChild(svgEl("stop", { offset: "0%", "stop-color": serie.color, "stop-opacity": 0.38 }));
        gradiente.appendChild(svgEl("stop", { offset: "100%", "stop-color": serie.color, "stop-opacity": 0 }));
        defs.appendChild(gradiente);
      }

      tramos.forEach((puntos) => {
        const linea = trazoSuave(puntos, arriba, H - abajo);
        if (serie.area && puntos.length > 1) {
          svg.appendChild(svgEl("path", {
            d: `${linea} L${puntos[puntos.length - 1][0]},${H - abajo} L${puntos[0][0]},${H - abajo} Z`,
            fill: `url(#${id}-a${k})`, class: "lineas__area",
          }));
        }
        const trazo = svgEl("path", {
          d: linea, fill: "none", stroke: serie.color,
          "stroke-width": serie.grosor || 2.4, "stroke-linecap": "round", "stroke-linejoin": "round",
          class: "lineas__trazo",
        });
        if (serie.punteada) trazo.setAttribute("stroke-dasharray", "4 5");
        trazo.style.filter = `drop-shadow(0 0 5px ${serie.color}88)`;
        svg.appendChild(trazo);
        if (puntos.length === 1) {
          svg.appendChild(svgEl("circle", { cx: puntos[0][0], cy: puntos[0][1], r: 2.6, fill: serie.color }));
        }
      });
    });

    // Guía vertical + puntos (el "crosshair").
    const guia = svgEl("line", { y1: arriba - 4, y2: H - abajo, class: "lineas__guia" });
    guia.style.display = "none";
    svg.appendChild(guia);

    const puntosGuia = series.map((serie) => {
      const c = svgEl("circle", { r: 4.6, fill: "#05060d", stroke: serie.color, "stroke-width": 2.2 });
      c.style.display = "none";
      svg.appendChild(c);
      return c;
    });

    function indiceDe(evento) {
      const caja = svg.getBoundingClientRect();
      const px = ((evento.clientX - caja.left) / caja.width) * W;
      const i = Math.round(((px - izq) / (W - izq - der)) * (n - 1));
      return Math.min(Math.max(i, 0), n - 1);
    }

    function leer(evento) {

      const i = indiceDe(evento);
      const caja = svg.getBoundingClientRect();
      const escala = caja.width / W;

      guia.setAttribute("x1", x(i));
      guia.setAttribute("x2", x(i));
      guia.style.display = "";

      const lineas = [titulos[i]];
      let masAlto = H;

      series.forEach((serie, k) => {
        const v = serie.valores[i];
        if (v === null || v === undefined) {
          puntosGuia[k].style.display = "none";
          return;
        }
        puntosGuia[k].setAttribute("cx", x(i));
        puntosGuia[k].setAttribute("cy", y(v));
        puntosGuia[k].style.display = "";
        masAlto = Math.min(masAlto, y(v));
        lineas.push(`${serie.nombre}  ${euros.format(v)}`);
      });

      mostrarTip({
        clientX: caja.left + x(i) * escala,
        clientY: caja.top + masAlto * escala,
      }, lineas.join("\n"));
    }

    function limpiar() {
      guia.style.display = "none";
      puntosGuia.forEach((c) => { c.style.display = "none"; });
      ocultarTip();
    }

    svg.setAttribute("data-tip", "1");
    svg.addEventListener("pointerdown", (e) => {
      svg.setPointerCapture(e.pointerId);
      leer(e);
    });
    svg.addEventListener("pointermove", (e) => {
      if (e.pointerType === "mouse" || e.buttons) leer(e);
    });
    svg.addEventListener("pointerleave", (e) => {
      if (e.pointerType === "mouse") limpiar();
    });

    contenedor.appendChild(svg);

    // Leyenda.
    const leyenda = document.createElement("div");
    leyenda.className = "lineas__leyenda";
    series.forEach((serie) => {
      const item = document.createElement("span");
      item.innerHTML = '<i class="leyenda-punto"></i><span></span>';
      item.querySelector("i").style.background = serie.color;
      item.querySelector("span").textContent = serie.nombre;
      leyenda.appendChild(item);
    });
    contenedor.appendChild(leyenda);
  }

  // ------------------------------------------------------------------
  // Tendencia de doce meses
  // ------------------------------------------------------------------

  const mesAnio = (f) =>
    `${mesCorto.format(f).replace(".", "")} ${String(f.getFullYear()).slice(2)}`;

  function evolucion(todos, mes) {

    const contenedor = $("#evolucion");
    contenedor.innerHTML = "";

    const meses = [];

    for (let atras = 11; atras >= 0; atras -= 1) {
      const fecha = new Date(mes.getFullYear(), mes.getMonth() - atras, 1);
      const movimientos = delMes(todos, fecha);
      meses.push({
        fecha,
        ingresos: suma(movimientos.filter((m) => m.tipo === "ingreso")),
        gastos: suma(movimientos.filter((m) => m.tipo === "gasto")),
      });
    }

    graficaLineas(contenedor, {
      etiquetas: meses.map((m) => mesCorto.format(m.fecha).replace(".", "")),
      titulos: meses.map((m) => mesLargo.format(m.fecha)),
      series: [
        { nombre: "Gastos", color: "#ff4560", valores: meses.map((m) => m.gastos), area: true },
        { nombre: "Ingresos", color: "#00ff88", valores: meses.map((m) => m.ingresos), area: true },
      ],
    });

    // Cifras clave de los doce meses.
    const conGasto = meses.filter((m) => m.gastos > 0);
    const promedio = conGasto.length ? suma(conGasto.map((m) => ({ monto: m.gastos }))) / conGasto.length : 0;
    const caro = conGasto.reduce((a, m) => (!a || m.gastos > a.gastos ? m : a), null);
    const barato = conGasto.reduce((a, m) => (!a || m.gastos < a.gastos ? m : a), null);

    const datos = document.createElement("div");
    datos.className = "datos";
    [
      ["Promedio mensual", euros.format(promedio)],
      ["Mes más alto", caro ? `${mesAnio(caro.fecha)} · ${euros.format(caro.gastos)}` : "—"],
      ["Mes más bajo", barato ? `${mesAnio(barato.fecha)} · ${euros.format(barato.gastos)}` : "—"],
    ].forEach(([etiqueta, valor]) => {
      const caja = document.createElement("div");
      caja.className = "dato";
      caja.innerHTML = '<span class="dato__etiqueta"></span><span class="dato__valor"></span>';
      caja.querySelector(".dato__etiqueta").textContent = etiqueta;
      caja.querySelector(".dato__valor").textContent = valor;
      datos.appendChild(caja);
    });
    contenedor.appendChild(datos);
  }

  // ------------------------------------------------------------------
  // Calendario de gastos (mapa de calor)
  // ------------------------------------------------------------------

  function calendario(todos, mes, opciones = {}) {

    const contenedor = $("#calendario");
    contenedor.innerHTML = "";

    const anio = mes.getFullYear();
    const mesNum = mes.getMonth();
    const diasMes = new Date(anio, mesNum + 1, 0).getDate();
    const desfase = (new Date(anio, mesNum, 1).getDay() + 6) % 7; // lunes primero

    const porDia = new Map();
    delMes(todos, mes).forEach((m) => {
      const dia = Number(m.fecha.slice(8, 10));
      if (!porDia.has(dia)) porDia.set(dia, { gasto: 0, ingreso: 0, lista: [] });
      const registro = porDia.get(dia);
      registro[m.tipo === "gasto" ? "gasto" : "ingreso"] += Number(m.monto) || 0;
      registro.lista.push(m);
    });

    const gastosDia = [...porDia.values()].map((r) => r.gasto);
    const maximo = Math.max(...gastosDia, 0);

    if (maximo <= 0) {
      contenedor.innerHTML = '<p class="bloque__nota">Sin gastos este mes.</p>';
      return;
    }

    // Resumen del mes.
    const diasConGasto = gastosDia.filter((v) => v > 0).length;
    let diaCaro = 0;
    porDia.forEach((r, dia) => { if (r.gasto > (porDia.get(diaCaro)?.gasto || 0)) diaCaro = dia; });

    const hoy = new Date();
    const esMesActual = hoy.getFullYear() === anio && hoy.getMonth() === mesNum;
    const transcurridos = esMesActual ? hoy.getDate() : diasMes;
    const total = gastosDia.reduce((a, v) => a + v, 0);

    const datos = document.createElement("div");
    datos.className = "datos";
    [
      ["Día más caro", `${diaCaro} · ${euros.format(porDia.get(diaCaro).gasto)}`],
      ["Días sin gasto", String(Math.max(transcurridos - diasConGasto, 0))],
      ["Promedio por día", euros.format(total / Math.max(transcurridos, 1))],
    ].forEach(([etiqueta, valor]) => {
      const caja = document.createElement("div");
      caja.className = "dato";
      caja.innerHTML = '<span class="dato__etiqueta"></span><span class="dato__valor"></span>';
      caja.querySelector(".dato__etiqueta").textContent = etiqueta;
      caja.querySelector(".dato__valor").textContent = valor;
      datos.appendChild(caja);
    });
    contenedor.appendChild(datos);

    // Cuadrícula.
    const cuadricula = document.createElement("div");
    cuadricula.className = "calendario";

    ["L", "M", "X", "J", "V", "S", "D"].forEach((letra) => {
      const c = document.createElement("span");
      c.className = "calendario__semana";
      c.textContent = letra;
      cuadricula.appendChild(c);
    });

    for (let i = 0; i < desfase; i += 1) {
      cuadricula.appendChild(document.createElement("span"));
    }

    const detalle = document.createElement("div");
    detalle.className = "dia-detalle";
    const celdas = [];

    function elegir(dia) {

      celdas.forEach((c, i) => c.classList.toggle("celda--activa", i + 1 === dia));

      const registro = porDia.get(dia);
      const fecha = new Date(anio, mesNum, dia, 12);
      detalle.innerHTML = '<div class="dia-detalle__cab"><span></span><b></b></div>';
      detalle.querySelector("span").textContent = diaLargo.format(fecha);
      detalle.querySelector("b").textContent = registro ? euros.format(registro.gasto) : euros.format(0);

      if (!registro) {
        const vacio = document.createElement("p");
        vacio.className = "bloque__nota";
        vacio.textContent = "Sin movimientos este día.";
        detalle.appendChild(vacio);
        return;
      }

      registro.lista
        .sort((a, b) => Number(b.monto) - Number(a.monto))
        .slice(0, 6)
        .forEach((m) => {
          const fila = document.createElement("div");
          fila.className = "dia-detalle__fila";
          fila.innerHTML = '<span></span><b></b>';
          fila.querySelector("span").textContent = m.descripcion || "Movimiento";
          fila.querySelector("b").textContent =
            `${m.tipo === "ingreso" ? "+" : "−"}${euros.format(Number(m.monto))}`;
          fila.querySelector("b").className = m.tipo === "ingreso" ? "pos" : "neg";
          detalle.appendChild(fila);
        });
    }

    for (let dia = 1; dia <= diasMes; dia += 1) {

      const registro = porDia.get(dia);
      const celda = document.createElement("button");
      celda.type = "button";
      celda.className = "celda";
      celda.textContent = dia;

      if (registro && registro.gasto > 0) {
        // Raíz cuadrada: los días baratos siguen viéndose.
        const nivel = Math.sqrt(registro.gasto / maximo);
        celda.style.setProperty("--nivel", nivel.toFixed(3));
        celda.classList.add("celda--gasto");
      }
      if (esMesActual && dia === hoy.getDate()) celda.classList.add("celda--hoy");

      celda.addEventListener("click", () => {
        elegir(dia);
        if (opciones.alElegir) opciones.alElegir(dia);
      });
      celdas.push(celda);
      cuadricula.appendChild(celda);

      const texto = registro
        ? `${diaLargo.format(new Date(anio, mesNum, dia, 12))}\nGasto  ${euros.format(registro.gasto)}`
        : null;
      if (texto) conTip(celda, texto);
    }

    contenedor.appendChild(cuadricula);

    const escala = document.createElement("div");
    escala.className = "calendario__escala";
    escala.innerHTML = '<span>Menos</span><i></i><span>Más</span>';
    contenedor.appendChild(escala);

    contenedor.appendChild(detalle);
    elegir(opciones.dia || diaCaro);
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

  // ------------------------------------------------------------------
  // Año contra año: líneas mes a mes + tabla de totales
  // ------------------------------------------------------------------

  function anioContraAnio(todos) {

    const lineas = $("#anual-lineas");
    const tabla = $("#anual-tabla");
    lineas.innerHTML = "";
    tabla.innerHTML = "";

    const porAnio = new Map();

    todos.forEach((m) => {
      const anio = Number(m.fecha.slice(0, 4));
      const mesIdx = Number(m.fecha.slice(5, 7)) - 1;
      if (!porAnio.has(anio)) {
        porAnio.set(anio, { gastos: Array(12).fill(0), ingresos: 0, gasto: 0 });
      }
      const registro = porAnio.get(anio);
      const importe = Number(m.monto) || 0;
      if (m.tipo === "gasto") {
        registro.gastos[mesIdx] += importe;
        registro.gasto += importe;
      } else {
        registro.ingresos += importe;
      }
    });

    if (!porAnio.size) {
      lineas.innerHTML = '<p class="bloque__nota">Aún no hay datos.</p>';
      return;
    }

    const anios = [...porAnio.keys()].sort((a, b) => b - a).slice(0, 3); // recientes
    const hoy = new Date();
    const colores = ["#00c8ff", "#ffd700", "#b060ff"];

    const nombresMes = Array.from({ length: 12 }, (_, i) =>
      mesCorto.format(new Date(2024, i, 1)).replace(".", ""));
    const titulosMes = Array.from({ length: 12 }, (_, i) =>
      new Date(2024, i, 1).toLocaleDateString(CONFIG.idiomaFechas, { month: "long" }));

    graficaLineas(lineas, {
      etiquetas: nombresMes,
      titulos: titulosMes,
      series: anios.map((anio, k) => ({
        nombre: String(anio),
        color: colores[k],
        area: k === 0,
        grosor: k === 0 ? 2.6 : 1.8,
        punteada: k > 1,
        valores: porAnio.get(anio).gastos.map((v, i) =>
          // Los meses futuros del año en curso no se dibujan.
          (anio === hoy.getFullYear() && i > hoy.getMonth()) ? null : v),
      })),
    });

    // Tabla: ingresos, gastos y ahorro por año.
    anios.forEach((anio, k) => {
      const r = porAnio.get(anio);
      const ahorro = r.ingresos - r.gasto;
      const tasa = r.ingresos ? Math.round((ahorro / r.ingresos) * 100) : null;

      const fila = document.createElement("div");
      fila.className = "tabla-anio";
      fila.innerHTML = `
        <span class="tabla-anio__anio"><i></i><b></b></span>
        <span class="tabla-anio__celda"><small>Ingresos</small><em class="pos"></em></span>
        <span class="tabla-anio__celda"><small>Gastos</small><em class="neg"></em></span>
        <span class="tabla-anio__celda"><small>Ahorro</small><em></em></span>`;
      fila.querySelector("i").style.background = colores[k];
      fila.querySelector("b").textContent = anio;
      const valores = fila.querySelectorAll("em");
      valores[0].textContent = euros.format(r.ingresos);
      valores[1].textContent = euros.format(r.gasto);
      valores[2].textContent = `${euros.format(ahorro)}${tasa === null ? "" : ` · ${tasa}%`}`;
      valores[2].className = ahorro >= 0 ? "pos" : "neg";
      tabla.appendChild(fila);
    });
  }

  // ------------------------------------------------------------------
  // Proyección del mes en curso
  // ------------------------------------------------------------------

  function proyeccionBloque(contexto) {

    const destino = $("#proyeccion");
    if (!destino) return;

    const caja = destino.closest(".bloque");
    const p = typeof INTEL !== "undefined"
      ? INTEL.proyeccion(contexto.todos, contexto.mes, {
          ignorados: contexto.ignorados || [],
          fijos: contexto.fijos || [],
        })
      : null;

    caja.hidden = !p;
    destino.innerHTML = "";
    if (!p) return;

    const cuerpo = document.createElement("div");
    cuerpo.innerHTML = `
      <p class="proy__etiqueta">Cerrarás el mes en torno a</p>
      <p class="proy__cifra"></p>
      <p class="proy__delta"></p>
      <div class="proy__riel">
        <div class="proy__fill"></div>
        <div class="proy__marca"></div>
      </div>
      <div class="proy__pie"><span></span><span></span></div>
      <div class="datos"></div>`;

    cuerpo.querySelector(".proy__cifra").textContent = euros.format(p.cierre);

    const delta = cuerpo.querySelector(".proy__delta");
    if (p.gastoAnterior > 0) {
      const pct = Math.round(((p.cierre - p.gastoAnterior) / p.gastoAnterior) * 100);
      delta.innerHTML = pct === 0
        ? "Igual que el mes pasado."
        : `<b class="${pct > 0 ? "comp__num--sube" : "comp__num--baja"}">${Math.abs(pct)}% ${pct > 0 ? "más" : "menos"}</b> que el mes pasado (${euros.format(p.gastoAnterior)}).`;
    } else {
      delta.textContent = "Aún no hay un mes anterior con el que comparar.";
    }

    const tope = Math.max(p.cierre, p.gastado, 1);
    cuerpo.querySelector(".proy__fill").style.width = `${(p.gastado / tope) * 100}%`;
    cuerpo.querySelector(".proy__marca").style.left = `${(p.dia / p.diasMes) * (p.cierre / tope) * 100}%`;

    const pie = cuerpo.querySelectorAll(".proy__pie span");
    pie[0].textContent = `Llevas ${euros.format(p.gastado)}`;
    pie[1].textContent = `Día ${p.dia} de ${p.diasMes}`;

    const datos = cuerpo.querySelector(".datos");
    [
      ["Ritmo diario", euros.format(p.ritmo)],
      ["Fijos por llegar", euros.format(p.fijosPendientes)],
      ["Fijos pendientes", `${p.pendientes.length}`],
    ].forEach(([etiqueta, valor]) => {
      const dato = document.createElement("div");
      dato.className = "dato";
      dato.innerHTML = '<span class="dato__etiqueta"></span><span class="dato__valor"></span>';
      dato.querySelector(".dato__etiqueta").textContent = etiqueta;
      dato.querySelector(".dato__valor").textContent = valor;
      datos.appendChild(dato);
    });

    destino.appendChild(cuerpo);
  }

  // ------------------------------------------------------------------
  // Presupuestos en vigilancia (las categorías que se acercan al tope)
  // ------------------------------------------------------------------

  function presupuestosAlertas(contexto, gastos) {

    const destino = $("#pres-alertas");
    if (!destino) return;

    destino.innerHTML = "";

    const topes = contexto.presupuestos || {};
    const gastado = new Map();

    gastos.forEach((m) => {
      const c = categoriaDe(m, contexto);
      if (!c) return;
      gastado.set(c.id, (gastado.get(c.id) || 0) + (Number(m.monto) || 0));
    });

    const filas = Object.entries(topes)
      .map(([id, tope]) => ({
        categoria: contexto.categorias.get(Number(id)),
        tope: Number(tope),
        gastado: gastado.get(Number(id)) || 0,
      }))
      .filter((f) => f.categoria && f.tope > 0);

    if (!filas.length) {
      destino.innerHTML =
        '<p class="bloque__nota">Fija un tope por categoría en <a href="#planificar" class="enlace">Planificar</a> y aquí verás cuáles se acercan al límite.</p>';
      return;
    }

    const enAlerta = filas
      .filter((f) => f.gastado / f.tope >= 0.75)
      .sort((a, b) => b.gastado / b.tope - a.gastado / a.tope)
      .slice(0, 4);

    if (!enAlerta.length) {
      destino.innerHTML =
        '<p class="comp__resumen">Todo en orden: ninguna categoría supera el 75% de su tope.</p>';
      return;
    }

    enAlerta.forEach((f) => {

      const fraccion = f.gastado / f.tope;
      const nivel = fraccion > 1 ? "alto" : "medio";

      const fila = document.createElement("div");
      fila.className = "pres-fila";
      fila.innerHTML = `
        <div class="pres__cab">
          <span class="pres__nombre"></span>
          <span class="pres__monto"></span>
        </div>
        <div class="pres__riel"><div class="pres__fill"></div></div>
        <div class="pres__resto"></div>`;

      fila.querySelector(".pres__nombre").textContent = f.categoria.nombre;
      fila.querySelector(".pres__monto").textContent =
        `${euros.format(f.gastado)} / ${euros.format(f.tope)}`;

      const fill = fila.querySelector(".pres__fill");
      fill.style.width = `${Math.min(fraccion, 1) * 100}%`;
      fill.classList.add(`pres__fill--${nivel}`);

      const nota = fila.querySelector(".pres__resto");
      if (fraccion > 1) {
        nota.textContent = `Te pasaste ${euros.format(f.gastado - f.tope)} (${Math.round(fraccion * 100)}%)`;
        nota.classList.add("pres__resto--alto");
      } else {
        nota.textContent = `Te quedan ${euros.format(f.tope - f.gastado)} · ${Math.round(fraccion * 100)}% usado`;
      }

      destino.appendChild(fila);
    });
  }

  function resumenDelMes(contexto) {
    const movimientos = delMes(contexto.todos, contexto.mes);
    return {
      ingresos: movimientos.filter((m) => m.tipo === "ingreso"),
      gastos: movimientos.filter((m) => m.tipo === "gasto"),
    };
  }

  return {

    /** Pestaña Inicio. */
    pintarInicio(contexto) {
      const { ingresos, gastos } = resumenDelMes(contexto);
      const totalGastos = tarjetas(ingresos, gastos);
      heroSpark(contexto);
      porCategoria(gastos, totalGastos, contexto);
      proyeccionBloque(contexto);
      presupuestosAlertas(contexto, gastos);
    },

    /** Calendario de la pestaña Movimientos. */
    pintarCalendario(contexto, opciones) {
      calendario(contexto.todos, contexto.mes, opciones);
    },

    /** Pestaña Análisis. */
    pintarAnalisis(contexto) {
      const { gastos } = resumenDelMes(contexto);
      comparativa(contexto.todos, contexto.mes, gastos, contexto);
      evolucion(contexto.todos, contexto.mes);
      comparacionAnual(contexto.todos);
      anioContraAnio(contexto.todos);
      topGastos(gastos, contexto);
    },
  };

})();
