/* =====================================================================
   Análisis de los movimientos: gastos recurrentes y proyección del mes.

   Solo cálculos, sin tocar la pantalla. Lo usan el resumen y la lista.
   ===================================================================== */

const INTEL = (() => {

  const num = (v) => Number(v) || 0;

  // Meses distintos en los que debe repetirse para considerarse recurrente.
  const MIN_MESES = 2;

  function normalizar(texto) {
    return String(texto || "")
      .toLowerCase()
      .normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9 ]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function clave(m) {
    return `${m.tipo}|${m.subcategoria_id}|${normalizar(m.descripcion)}`;
  }

  const mediana = (lista) => {
    const o = [...lista].sort((a, b) => a - b);
    const mitad = Math.floor(o.length / 2);
    return o.length % 2 ? o[mitad] : (o[mitad - 1] + o[mitad]) / 2;
  };

  const indiceMes = (fecha) => {
    const [a, m] = fecha.split("-").map(Number);
    return a * 12 + (m - 1);
  };

  /**
   * Movimientos que se repiten cada mes con un importe parecido.
   *
   * Mira los seis meses anteriores al indicado: un movimiento es
   * recurrente si aparece (una sola vez al mes) en al menos tres de
   * ellos, con un importe estable, y sigue activo en los últimos dos.
   * Devuelve cada recurrente y si ya se registró en el mes indicado.
   */
  function recurrentes(todos, mes, ignorados = []) {

    const objetivo = mes.getFullYear() * 12 + mes.getMonth();
    const grupos = new Map();

    todos.forEach((m) => {
      const idx = indiceMes(m.fecha);
      if (idx >= objetivo || idx < objetivo - 6) return;
      const k = clave(m);
      if (!grupos.has(k)) grupos.set(k, new Map());
      const meses = grupos.get(k);
      if (!meses.has(idx)) meses.set(idx, []);
      meses.get(idx).push(m);
    });

    const hechosEsteMes = new Set(
      todos.filter((m) => indiceMes(m.fecha) === objetivo).map(clave)
    );

    const lista = [];

    grupos.forEach((meses, k) => {

      const unicos = [...meses.entries()].filter(([, v]) => v.length === 1);
      if (unicos.length < MIN_MESES) return;

      const montos = unicos.map(([, v]) => num(v[0].monto));
      const centro = mediana(montos);
      if (centro <= 0) return;

      const estables = montos.filter((x) => Math.abs(x - centro) <= centro * 0.25);
      if (estables.length < MIN_MESES) return;

      const ultimoIdx = Math.max(...unicos.map(([i]) => i));
      if (ultimoIdx < objetivo - 2) return;

      const ultimo = meses.get(ultimoIdx)[0];
      const dias = unicos.map(([, v]) => Number(v[0].fecha.slice(8, 10)));

      lista.push({
        key: k,
        tipo: ultimo.tipo,
        nombre: ultimo.descripcion || "",
        monto: num(ultimo.monto),
        dia: Math.round(mediana(dias)),
        subcategoria_id: ultimo.subcategoria_id,
        medio_pago_id: ultimo.medio_pago_id || null,
        descripcion: ultimo.descripcion || null,
        hecho: hechosEsteMes.has(k),
        ignorado: ignorados.includes(k),
      });
    });

    return lista.sort((a, b) => a.dia - b.dia);
  }

  /**
   * Cómo cerrará el mes en curso.
   *
   *   cierre = gastado + fijos pendientes + ritmo variable × días que faltan
   *
   * El ritmo variable excluye los recurrentes (una cuota grande no debe
   * multiplicarse por los días restantes).
   */
  function proyeccion(todos, mes, ignorados = [], hoy = new Date()) {

    if (hoy.getFullYear() !== mes.getFullYear() || hoy.getMonth() !== mes.getMonth()) {
      return null;
    }

    const diasMes = new Date(mes.getFullYear(), mes.getMonth() + 1, 0).getDate();
    const dia = hoy.getDate();

    const fijos = recurrentes(todos, mes, ignorados).filter((r) => !r.ignorado && r.tipo === "gasto");
    const clavesFijas = new Set(fijos.map((r) => r.key));

    const delMes = todos.filter((m) =>
      m.tipo === "gasto" && indiceMes(m.fecha) === mes.getFullYear() * 12 + mes.getMonth());

    // Un gasto muy grande y puntual (una cuota, una compra) cuenta en lo
    // gastado, pero no debe multiplicarse por los días que faltan.
    const montos = todos.filter((m) => m.tipo === "gasto").map((m) => num(m.monto)).sort((x, y) => x - y);
    const p90 = montos.length ? montos[Math.floor(montos.length * 0.9)] : 0;
    const umbral = Math.max(p90 * 3, 1);
    const esVariable = (m) => !clavesFijas.has(clave(m)) && num(m.monto) <= umbral;

    const gastado = delMes.reduce((t, m) => t + num(m.monto), 0);
    const variable = delMes.filter(esVariable).reduce((t, m) => t + num(m.monto), 0);

    const pendientes = fijos.filter((r) => !r.hecho);
    const fijosPendientes = pendientes.reduce((t, r) => t + r.monto, 0);

    // Ritmo diario: mezcla el de este mes con el de los tres meses
    // anteriores con datos; al principio pesa más el histórico.
    const idxObjetivo = mes.getFullYear() * 12 + mes.getMonth();
    const previos = new Map();
    todos.forEach((m) => {
      const idx = indiceMes(m.fecha);
      if (m.tipo !== "gasto" || idx >= idxObjetivo || idx < idxObjetivo - 6) return;
      previos.set(idx, (previos.get(idx) || 0) + (esVariable(m) ? num(m.monto) : 0));
    });
    const recientes = [...previos.entries()].sort((x, y) => y[0] - x[0]).slice(0, 3);
    const base = recientes.length
      ? recientes.reduce((t, [idx, suma]) => {
          const d = new Date(Math.floor(idx / 12), idx % 12 + 1, 0).getDate();
          return t + suma / d;
        }, 0) / recientes.length
      : null;

    const actual = variable / Math.max(dia, 1);
    const peso = dia / diasMes;
    const ritmo = base === null ? actual : peso * actual + (1 - peso) * base;
    const cierre = gastado + fijosPendientes + ritmo * (diasMes - dia);

    const anterior = new Date(mes.getFullYear(), mes.getMonth() - 1, 1);
    const gastoAnterior = todos
      .filter((m) => m.tipo === "gasto" && indiceMes(m.fecha) === anterior.getFullYear() * 12 + anterior.getMonth())
      .reduce((t, m) => t + num(m.monto), 0);

    return { gastado, cierre, ritmo, fijosPendientes, pendientes, dia, diasMes, gastoAnterior };
  }

  return { recurrentes, proyeccion, clave, normalizar };

})();
