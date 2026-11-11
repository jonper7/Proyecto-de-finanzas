/* =====================================================================
   Préstamos: dinero que prestas y te tienen que devolver.

   Cada préstamo guarda quién, cuánto, cuándo, fecha límite opcional y
   una lista de abonos. El saldo pendiente sale de restar los abonos.

     · «Devuelto» registra de un toque el abono por todo lo que falta.
     · «Abono» registra una devolución parcial.
     · Un préstamo perdonado deja de contar como pendiente, pero el
       dinero sigue fuera de tu balance.

   No son ingresos ni gastos: no tocan el balance del mes. Solo
   cambian el BALANCE TOTAL (ingresos − gastos − dinero prestado que
   aún no volvió).
   ===================================================================== */

const PRESTAMOS = (() => {

  const { $, $$, estado, euros, iso, identificador, avisar, avisarConAccion } = APP;

  // ------------------------------------------------------------------
  // Cálculos (funciones puras)
  // ------------------------------------------------------------------

  const num = (x) => Number(x) || 0;
  const redondear = (x) => Math.round(x * 100) / 100;

  const devuelto = (p) => redondear((p.abonos || []).reduce((t, a) => t + num(a.monto), 0));
  const saldo = (p) => Math.max(0, redondear(num(p.monto) - devuelto(p)));

  const diasEntre = (desde, hasta) =>
    Math.round((new Date(hasta + "T00:00:00") - new Date(desde + "T00:00:00")) / 86400000);

  /** "devuelto" | "perdonado" | "vencido" | "pendiente" */
  function situacion(p, hoy = iso(new Date())) {
    if (saldo(p) <= 0.004) return "devuelto";
    if (p.perdonado) return "perdonado";
    if (p.limite && p.limite < hoy) return "vencido";
    return "pendiente";
  }

  function resumen(lista, hoy = iso(new Date())) {

    const mes = hoy.slice(0, 7);
    const r = {
      deben: 0, personas: 0, vencidos: 0, vencidoMonto: 0,
      prestado: 0, devuelto: 0, devueltoMes: 0, perdonado: 0, fuera: 0,
    };
    const quien = new Set();

    lista.forEach((p) => {
      const s = situacion(p, hoy);
      const pendiente = saldo(p);

      r.fuera += pendiente;
      (p.abonos || []).forEach((a) => {
        if ((a.fecha || "").slice(0, 7) === mes) r.devueltoMes += num(a.monto);
      });

      if (p.perdonado && pendiente > 0) { r.perdonado += pendiente; return; }

      r.prestado += num(p.monto);
      r.devuelto += devuelto(p);

      if (pendiente > 0) {
        r.deben += pendiente;
        quien.add(String(p.persona || "").trim().toLowerCase());
        if (s === "vencido") { r.vencidos += 1; r.vencidoMonto += pendiente; }
      }
    });

    r.personas = quien.size;
    r.fuera = redondear(r.fuera);
    r.deben = redondear(r.deben);
    return r;
  }

  /** Ingresos − gastos de toda la historia − dinero prestado que no volvió. */
  function balanceTotal(movimientos, lista) {
    const neto = movimientos.reduce(
      (t, m) => t + (m.tipo === "ingreso" ? 1 : -1) * num(m.monto), 0);
    return redondear(neto - resumen(lista).fuera);
  }

  /** Vencidos o que vencen en los próximos `dias` días, del más urgente al menos. */
  function porCobrar(lista, dias = 3, hoy = iso(new Date())) {
    return lista
      .filter((p) => {
        const s = situacion(p, hoy);
        if (s === "vencido") return true;
        return s === "pendiente" && p.limite && diasEntre(hoy, p.limite) <= dias;
      })
      .sort((a, b) => (a.limite || "").localeCompare(b.limite || ""));
  }

  // ------------------------------------------------------------------
  // Almacenamiento
  // ------------------------------------------------------------------

  const guardarLista = async (lista) => {
    estado.prestamos = lista;
    await DATOS.guardarAjuste("prestamos", lista);
  };

  const cambiar = (id, f) =>
    estado.prestamos.map((p) => (p.id === id ? f(p) : p));

  const corta = new Intl.DateTimeFormat("es", { day: "numeric", month: "short" });
  const fechaCorta = (s) => corta.format(new Date(s + "T00:00:00")).replace(".", "");
  const dinero = (n) => euros.format(n);
  const paraCampo = (n) => String(n).replace(".", ",");

  // ------------------------------------------------------------------
  // Acciones
  // ------------------------------------------------------------------

  async function devolverTodo(p) {

    const abono = { id: identificador(), fecha: iso(new Date()), monto: saldo(p).toFixed(2) };
    await guardarLista(cambiar(p.id, (x) => ({ ...x, abonos: [...(x.abonos || []), abono] })));
    pintar();
    APP.repintar();

    avisarConAccion(`${p.persona} devolvió ${dinero(num(abono.monto))}`, "Deshacer", async () => {
      await guardarLista(cambiar(p.id, (x) => ({ ...x, abonos: (x.abonos || []).filter((a) => a.id !== abono.id) })));
      pintar();
      APP.repintar();
    });
  }

  async function abonar(p) {

    const pendiente = saldo(p);

    const r = await DIALOGO.formulario({
      titulo: `Abono de ${p.persona}`,
      mensaje: `Falta por devolver ${dinero(pendiente)}.`,
      aceptar: "Registrar abono",
      campos: [
        { id: "monto", tipo: "monto", etiqueta: "Importe devuelto", requerido: true, placeholder: "0,00" },
        { id: "fecha", tipo: "fecha", etiqueta: "Fecha", valor: iso(new Date()), requerido: true },
      ],
      validar: (v) => (num(v.monto) > pendiente + 0.004
        ? `No puede ser más de lo que falta (${dinero(pendiente)}).` : null),
    });

    if (!r) return;

    const abono = { id: identificador(), fecha: r.fecha, monto: num(r.monto).toFixed(2) };
    await guardarLista(cambiar(p.id, (x) => ({ ...x, abonos: [...(x.abonos || []), abono] })));
    pintar();
    APP.repintar();

    avisarConAccion("Abono registrado", "Deshacer", async () => {
      await guardarLista(cambiar(p.id, (x) => ({ ...x, abonos: (x.abonos || []).filter((a) => a.id !== abono.id) })));
      pintar();
      APP.repintar();
    });
  }

  /** Reabre un préstamo devuelto (quita el último abono) o perdonado. */
  async function reabrir(p) {

    const antes = p;
    const abonos = [...(p.abonos || [])].sort((a, b) => (a.fecha || "").localeCompare(b.fecha || ""));

    await guardarLista(cambiar(p.id, (x) => ({
      ...x,
      perdonado: false,
      abonos: saldo(x) <= 0.004 ? abonos.slice(0, -1) : abonos,
    })));
    pintar();
    APP.repintar();

    avisarConAccion(`${p.persona}: préstamo reabierto`, "Deshacer", async () => {
      await guardarLista(cambiar(p.id, () => antes));
      pintar();
      APP.repintar();
    });
  }

  async function eliminar(p) {

    const ok = await DIALOGO.confirmar({
      titulo: "Eliminar préstamo",
      mensaje: `Se borra el préstamo a ${p.persona} con sus abonos. Esto no cambia tus ingresos ni gastos.`,
      aceptar: "Eliminar",
      peligro: true,
    });

    if (!ok) return;

    await guardarLista(estado.prestamos.filter((x) => x.id !== p.id));
    avisar("Préstamo eliminado");
    pintar();
    APP.repintar();
  }

  async function formulario(p = null) {

    const medios = [{ valor: "", texto: "Sin medio de pago" }].concat(
      estado.medios.map((m) => ({ valor: String(m.id), texto: m.nombre })));

    const historial = p && (p.abonos || []).length
      ? "Abonos:\n" + [...p.abonos]
          .sort((a, b) => a.fecha.localeCompare(b.fecha))
          .map((a) => `· ${fechaCorta(a.fecha)} — ${dinero(num(a.monto))}`)
          .join("\n")
      : "";

    const r = await DIALOGO.formulario({
      titulo: p ? "Editar préstamo" : "Nuevo préstamo",
      mensaje: historial,
      aceptar: p ? "Guardar cambios" : "Registrar préstamo",
      extra: p ? { texto: "Eliminar", valor: "eliminar" } : null,
      campos: [
        { id: "persona", tipo: "texto", etiqueta: "A quién le prestas", valor: p ? p.persona : "", requerido: true, placeholder: "Nombre", maxlength: 60 },
        { id: "monto", tipo: "monto", etiqueta: "Importe prestado", valor: p ? paraCampo(p.monto) : "", requerido: true, placeholder: "0,00" },
        { id: "fecha", tipo: "fecha", etiqueta: "Fecha del préstamo", valor: p ? p.fecha : iso(new Date()), requerido: true },
        { id: "limite", tipo: "fecha", etiqueta: "Fecha límite (opcional)", valor: p ? (p.limite || "") : "" },
        { id: "medio", tipo: "select", etiqueta: "Salió de", valor: p ? (p.medio_pago_id || "") : "", opciones: medios },
        { id: "nota", tipo: "texto", etiqueta: "Nota (opcional)", valor: p ? (p.nota || "") : "", maxlength: 120 },
        ...(p ? [{
          id: "estado", tipo: "select", etiqueta: "Estado", valor: p.perdonado ? "perdonado" : "activo",
          opciones: [
            { valor: "activo", texto: "Activo: espero que me lo devuelva" },
            { valor: "perdonado", texto: "Perdonado: ya no lo cuento como pendiente" },
          ],
        }] : []),
      ],
      validar: (v) => {
        if (p && num(v.monto) < devuelto(p) - 0.004) {
          return `Ya devolvió ${dinero(devuelto(p))}; el importe no puede ser menor.`;
        }
        if (v.limite && v.limite < v.fecha) return "La fecha límite no puede ser anterior al préstamo.";
        return null;
      },
    });

    if (!r) return;

    if (r.__extra === "eliminar") {
      await eliminar(p);
      return;
    }

    const nuevo = {
      id: p ? p.id : identificador(),
      persona: r.persona,
      monto: String(r.monto),
      fecha: r.fecha,
      limite: r.limite || null,
      medio_pago_id: r.medio ? Number(r.medio) : null,
      nota: r.nota || null,
      perdonado: p ? r.estado === "perdonado" : false,
      abonos: p ? (p.abonos || []) : [],
    };

    await guardarLista(p
      ? estado.prestamos.map((x) => (x.id === p.id ? nuevo : x))
      : [...estado.prestamos, nuevo]);

    avisar(p ? "Préstamo actualizado" : "Préstamo registrado");
    pintar();
    APP.repintar();
  }

  // ------------------------------------------------------------------
  // Pintado
  // ------------------------------------------------------------------

  function metaDe(p, s, hoy) {
    const partes = [`Prestado ${fechaCorta(p.fecha)}`];
    if (s === "vencido") {
      const d = diasEntre(p.limite, hoy);
      partes.push(`venció hace ${d} ${d === 1 ? "día" : "días"}`);
    } else if (p.limite && (s === "pendiente")) {
      const d = diasEntre(hoy, p.limite);
      partes.push(d === 0 ? "vence hoy" : d === 1 ? "vence mañana" : `vence ${fechaCorta(p.limite)}`);
    }
    if (devuelto(p) > 0 && s !== "devuelto") partes.push(`abonó ${dinero(devuelto(p))}`);
    if (s === "devuelto") {
      const ultima = [...(p.abonos || [])].sort((a, b) => b.fecha.localeCompare(a.fecha))[0];
      if (ultima) partes.push(`devuelto ${fechaCorta(ultima.fecha)}`);
    }
    if (s === "perdonado") partes.push("perdonado");
    return partes.join(" · ");
  }

  function fila(p, hoy) {

    const s = situacion(p, hoy);
    const total = num(p.monto);
    const fraccion = total ? Math.min(1, devuelto(p) / total) : 0;

    const nodo = document.createElement("div");
    nodo.className = `fijo prestamo prestamo--${s}`;
    nodo.innerHTML = `
      <button type="button" class="fijo__cuerpo" aria-label="Editar">
        <span class="fijo__dia prestamo__inicial"></span>
        <span class="fijo__texto">
          <span class="fijo__nombre"></span>
          <span class="fijo__meta"></span>
          <span class="prestamo__riel"><i></i></span>
        </span>
      </button>
      <span class="fijo__lado">
        <span class="fijo__monto"></span>
        <span class="fijo__accion"></span>
      </span>`;

    nodo.querySelector(".prestamo__inicial").textContent =
      (p.persona || "?").trim().charAt(0).toUpperCase();
    nodo.querySelector(".fijo__nombre").textContent = p.persona;
    nodo.querySelector(".fijo__meta").textContent = metaDe(p, s, hoy);
    nodo.querySelector(".prestamo__riel i").style.width = `${fraccion * 100}%`;
    nodo.querySelector(".prestamo__riel").hidden = !(fraccion > 0 && s !== "devuelto");
    nodo.querySelector(".fijo__monto").textContent =
      s === "devuelto" ? dinero(total) : dinero(saldo(p));

    const accion = nodo.querySelector(".fijo__accion");
    const boton = (clase, texto, f) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = `mini ${clase}`;
      b.textContent = texto;
      b.addEventListener("click", f);
      accion.appendChild(b);
    };

    if (s === "devuelto" || s === "perdonado") {
      boton("mini--suave", "Reabrir", () => reabrir(p));
    } else {
      boton("mini--suave", "Abono", () => abonar(p));
      boton("mini--principal", "Devuelto", () => devolverTodo(p));
    }

    nodo.querySelector(".fijo__cuerpo").addEventListener("click", () => formulario(p));
    return nodo;
  }

  function pintar() {

    if (!$("#prest-lista")) return;

    const hoy = iso(new Date());
    const lista = estado.prestamos || [];
    const r = resumen(lista, hoy);

    $("#prest-resumen").hidden = !lista.length;

    if (lista.length) {
      APP.contar($("#prest-total"), r.deben);

      const partes = [];
      partes.push(r.personas
        ? `${r.personas} ${r.personas === 1 ? "persona" : "personas"}`
        : "Nadie te debe");
      if (r.vencidos) partes.push(`${r.vencidos} ${r.vencidos === 1 ? "vencido" : "vencidos"} (${dinero(r.vencidoMonto)})`);
      if (r.prestado) partes.push(`devuelto ${Math.round((r.devuelto / r.prestado) * 100)}%`);
      $("#prest-detalle").textContent = partes.join(" · ");

      const fr = r.prestado ? r.devuelto / r.prestado : 0;
      $("#prest-progreso").style.width = `${Math.min(1, fr) * 100}%`;

      const total = balanceTotal(estado.todos, lista);
      $("#prest-balance").textContent = dinero(total);
      $("#prest-balance").classList.toggle("neg", total < 0);
      $("#prest-fuera").textContent = `${dinero(r.fuera)} prestados`;
      $("#prest-mes").textContent = dinero(r.devueltoMes);
    }

    const zona = $("#prest-lista");
    zona.innerHTML = "";

    if (!lista.length) {
      zona.innerHTML = `
        <div class="vacio">
          <span class="vacio__signo">⇄</span>
          Aún no has prestado dinero.<br>Registra el primero con «Nuevo préstamo».
        </div>`;
      return;
    }

    const activos = lista
      .filter((p) => ["pendiente", "vencido"].includes(situacion(p, hoy)))
      .sort((a, b) =>
        (situacion(b, hoy) === "vencido") - (situacion(a, hoy) === "vencido") ||
        (a.limite || "9999").localeCompare(b.limite || "9999") ||
        a.fecha.localeCompare(b.fecha));

    const cerrados = lista
      .filter((p) => !activos.includes(p))
      .sort((a, b) => b.fecha.localeCompare(a.fecha));

    activos.forEach((p) => zona.appendChild(fila(p, hoy)));

    if (cerrados.length) {
      const titulo = document.createElement("h3");
      titulo.className = "prestamo__seccion";
      titulo.textContent = `Cerrados · ${cerrados.length}`;
      zona.appendChild(titulo);
      cerrados.forEach((p) => zona.appendChild(fila(p, hoy)));
    }
  }

  function conectar() {
    const boton = $("#nuevo-prestamo");
    if (boton) boton.addEventListener("click", () => formulario());
  }

  conectar();

  return {
    num, devuelto, saldo, situacion, resumen, balanceTotal, porCobrar,
    pintar, formulario, devolverTodo, abonar, reabrir, eliminar,
  };

})();
