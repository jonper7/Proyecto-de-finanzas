/* =====================================================================
   Formulario de movimiento (hoja inferior): crear, editar y eliminar.
   ===================================================================== */

const MOV = (() => {

  const { $, $$, estado, iso, identificador, avisar, normalizarMonto } = APP;

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

  function tipoSeleccionado() {
    return $(".tipo__opcion--activa").dataset.tipo;
  }

  function seleccionarTipo(tipo) {
    $$(".tipo__opcion").forEach((boton) => {
      boton.classList.toggle("tipo__opcion--activa", boton.dataset.tipo === tipo);
    });
  }

  /**
   * Abre la hoja. Con `movimiento` edita; con `borrador` crea uno nuevo
   * ya relleno (por ejemplo, desde un gasto fijo).
   */
  function abrir(movimiento = null, borrador = null) {

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
      $("#form-movimiento").reset();
      estado.borrador = borrador;
      seleccionarTipo(borrador.tipo);
      $("#monto").value = String(borrador.monto).replace(".", ",");
      $("#descripcion").value = borrador.descripcion || "";
      $("#subcategoria").value = borrador.subcategoria_id;
      $("#medio-pago").value = borrador.medio_pago_id || "";
      $("#fecha").value = borrador.fecha;
    } else {
      estado.borrador = null;
      seleccionarTipo("gasto");
      $("#form-movimiento").reset();
      $("#fecha").value = iso(new Date());
    }

    $("#velo").hidden = false;
    $("#hoja").hidden = false;
    document.body.classList.add("sin-scroll");

    if (!movimiento && !borrador) {
      setTimeout(() => $("#monto").focus(), 320);
    }
  }

  function cerrar() {
    $("#velo").hidden = true;
    $("#hoja").hidden = true;
    document.body.classList.remove("sin-scroll");
    estado.editando = null;
    estado.borrador = null;
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

    // Al editar se conserva todo lo que el formulario no toca (por
    // ejemplo, el vínculo con un gasto fijo).
    const base = editaba
      ? { ...estado.editando }
      : { uuid: identificador(), ...(estado.borrador && estado.borrador.fijo_id ? { fijo_id: estado.borrador.fijo_id } : {}) };

    await DATOS.guardar({
      ...base,
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

    cerrar();
    avisar(editaba ? "Actualizado" : "Guardado");
    await APP.refrescar();
  }

  async function eliminar() {

    if (!estado.editando) return;

    const ok = await DIALOGO.confirmar({
      titulo: "Eliminar movimiento",
      mensaje: "Se borrará de forma definitiva.",
      aceptar: "Eliminar",
      peligro: true,
    });

    if (!ok) return;

    await DATOS.eliminar(estado.editando.uuid);

    cerrar();
    avisar("Eliminado");
    await APP.refrescar();
  }

  function conectar() {

    $("#nuevo").addEventListener("click", () => abrir());
    $("#cerrar-hoja").addEventListener("click", cerrar);
    $("#velo").addEventListener("click", cerrar);
    $("#eliminar").addEventListener("click", eliminar);
    $("#form-movimiento").addEventListener("submit", guardar);

    $$(".tipo__opcion").forEach((boton) => {
      boton.addEventListener("click", () => seleccionarTipo(boton.dataset.tipo));
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !$("#hoja").hidden && !DIALOGO.estaAbierto()) cerrar();
    });

    APP.alCambiarCatalogos = rellenarSelectores;
    rellenarSelectores();
  }

  return { conectar, abrir, cerrar, rellenarSelectores };

})();
