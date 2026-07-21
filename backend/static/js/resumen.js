/* =====================================================================
   Panel de resumen.

   Este archivo lo comparten las dos versiones de la aplicación: la
   del móvil y la del ordenador. Solo hace cálculos y pinta; recibe
   los datos ya cargados, sin saber de dónde vienen.
   ===================================================================== */

const RESUMEN = (() => {

  const euros = new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
  });

  const mesLargo = new Intl.DateTimeFormat("es-ES", {
    month: "long",
    year: "numeric",
  });

  const diaLargo = new Intl.DateTimeFormat("es-ES", {
    day: "numeric",
    month: "long",
  });

  const mesCorto = new Intl.DateTimeFormat("es-ES", { month: "short" });

  const $ = (selector) => document.querySelector(selector);

  const suma = (lista) =>
    lista.reduce((total, m) => total + (Number(m.monto) || 0), 0);

  function delMes(movimientos, fecha) {
    return movimientos.filter((movimiento) => {
      const [anio, mes] = movimiento.fecha.split("-").map(Number);
      return anio === fecha.getFullYear() && mes === fecha.getMonth() + 1;
    });
  }

  /**
   * Categoría de un movimiento, a través de su subcategoría.
   */
  function categoriaDe(movimiento, contexto) {

    const sub = contexto.subcategorias.get(movimiento.subcategoria_id);

    if (!sub) return null;

    return contexto.categorias.get(sub.categoria_id) || null;
  }

  // ------------------------------------------------------------------
  // Bloques
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
    const mayor = ordenadas[0][1];

    ordenadas.forEach(([nombre, importe], indice) => {

      const porcentaje = total ? Math.round((importe / total) * 100) : 0;

      const barra = document.createElement("div");
      barra.className = "barra";

      barra.innerHTML = `
        <div class="barra__texto">
          <span class="barra__nombre"></span>
          <span class="barra__porcentaje">${porcentaje}%</span>
          <span class="barra__valor">${euros.format(importe)}</span>
        </div>
        <div class="barra__riel"><div class="barra__relleno"></div></div>`;

      barra.querySelector(".barra__nombre").textContent = nombre;

      const relleno = barra.querySelector(".barra__relleno");
      // Relativo a la mayor, para que las diferencias se vean.
      relleno.style.width = `${Math.max((importe / mayor) * 100, 2)}%`;
      relleno.style.animationDelay = `${indice * 45}ms`;

      contenedor.appendChild(barra);
    });
  }

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

    meses.forEach((mesDato, indice) => {

      const saldo = mesDato.ingresos - mesDato.gastos;

      const fila = document.createElement("div");
      fila.className = "mes-fila";

      fila.innerHTML = `
        <span class="mes-fila__nombre"></span>
        <span class="mes-fila__barras">
          <span class="mes-fila__barra mes-fila__barra--ingreso"></span>
          <span class="mes-fila__barra mes-fila__barra--gasto"></span>
        </span>
        <span class="mes-fila__saldo ${
          saldo < 0 ? "mes-fila__saldo--negativo" : "mes-fila__saldo--positivo"
        }">${euros.format(saldo)}</span>`;

      fila.querySelector(".mes-fila__nombre").textContent =
        mesCorto.format(mesDato.fecha).replace(".", "");

      const barras = fila.querySelectorAll(".mes-fila__barra");

      barras[0].style.width = `${(mesDato.ingresos / maximo) * 100}%`;
      barras[1].style.width = `${(mesDato.gastos / maximo) * 100}%`;
      barras[0].style.animationDelay = `${indice * 50}ms`;
      barras[1].style.animationDelay = `${indice * 50 + 25}ms`;

      contenedor.appendChild(fila);
    });
  }

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
          // El mediodía evita saltos de día por zona horaria.
          diaLargo.format(new Date(`${movimiento.fecha}T12:00:00`)),
        ].filter(Boolean).join(" · ");

        contenedor.appendChild(fila);
      });
  }

  return {

    /**
     * Pinta el panel completo.
     *
     * contexto = {
     *   todos:         array de movimientos (todos los meses),
     *   mes:           Date del mes que se muestra,
     *   categorias:    Map de id -> categoría,
     *   subcategorias: Map de id -> subcategoría,
     * }
     */
    pintar(contexto) {

      $("#res-mes").textContent = mesLargo.format(contexto.mes);

      const movimientos = delMes(contexto.todos, contexto.mes);
      const ingresos = movimientos.filter((m) => m.tipo === "ingreso");
      const gastos = movimientos.filter((m) => m.tipo === "gasto");

      const totalGastos = tarjetas(ingresos, gastos);

      porCategoria(gastos, totalGastos, contexto);
      evolucion(contexto.todos, contexto.mes);
      topGastos(gastos, contexto);
    },
  };

})();
