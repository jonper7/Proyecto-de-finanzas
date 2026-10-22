/* =====================================================================
   Diálogos propios (hojas inferiores).

   Sustituyen a prompt() y confirm() del navegador, que se ven ajenos a
   la aplicación y no permiten validar. Todos devuelven una promesa:

     DIALOGO.confirmar({ titulo, mensaje, aceptar, peligro })  -> true/false
     DIALOGO.formulario({ titulo, campos, aceptar })           -> valores | null

   Campos: { id, tipo, etiqueta, valor, opciones, requerido, ... }
     tipo "texto" | "monto" | "numero" | "select"
   ===================================================================== */

const DIALOGO = (() => {

  const $ = (s) => document.querySelector(s);

  let resolver = null;
  let valida = null;

  function ocultar() {
    $("#velo-dialogo").hidden = true;
    $("#dialogo").hidden = true;
    document.body.classList.remove("sin-scroll");
  }

  function cerrar(valor) {
    ocultar();
    const r = resolver;
    resolver = null;
    valida = null;
    if (r) r(valor);
  }

  function mostrarError(texto) {
    const nodo = $("#dialogo-error");
    nodo.textContent = texto || "";
    nodo.hidden = !texto;
  }

  function crearCampo(campo) {

    const etiqueta = document.createElement("label");
    etiqueta.className = "campo";

    const rotulo = document.createElement("span");
    rotulo.className = "campo__etiqueta";
    rotulo.textContent = campo.etiqueta || "";
    etiqueta.appendChild(rotulo);

    let control;

    if (campo.tipo === "select") {

      control = document.createElement("select");

      const grupos = new Map();

      (campo.opciones || []).forEach((op) => {
        const opcion = document.createElement("option");
        opcion.value = op.valor;
        opcion.textContent = op.texto;

        if (op.grupo) {
          if (!grupos.has(op.grupo)) {
            const g = document.createElement("optgroup");
            g.label = op.grupo;
            grupos.set(op.grupo, g);
            control.appendChild(g);
          }
          grupos.get(op.grupo).appendChild(opcion);
        } else {
          control.appendChild(opcion);
        }
      });

      if (campo.valor !== undefined && campo.valor !== null) {
        control.value = String(campo.valor);
      }

    } else {

      control = document.createElement("input");
      control.type = campo.tipo === "numero" ? "number" : "text";

      if (campo.tipo === "monto") control.inputMode = "decimal";
      if (campo.tipo === "numero") {
        control.inputMode = "numeric";
        if (campo.min !== undefined) control.min = campo.min;
        if (campo.max !== undefined) control.max = campo.max;
      }

      control.placeholder = campo.placeholder || "";
      control.maxLength = campo.maxlength || 80;
      control.value = campo.valor === undefined || campo.valor === null ? "" : campo.valor;
      control.autocomplete = "off";
    }

    control.id = `dlg-${campo.id}`;
    if (campo.deshabilitado) control.disabled = true;
    etiqueta.appendChild(control);

    if (campo.ayuda) {
      const ayuda = document.createElement("small");
      ayuda.className = "campo__ayuda";
      ayuda.textContent = campo.ayuda;
      etiqueta.appendChild(ayuda);
    }

    return etiqueta;
  }

  function abrir({
    titulo, mensaje = "", campos = [], aceptar = "Guardar",
    cancelar = "Cancelar", peligro = false, extra = null, validar = null,
  }) {

    // Si había uno abierto, se cierra sin respuesta.
    if (resolver) cerrar(null);

    $("#dialogo-titulo").textContent = titulo;

    const nota = $("#dialogo-mensaje");
    nota.textContent = mensaje;
    nota.hidden = !mensaje;
    nota.style.whiteSpace = "pre-line";

    const zona = $("#dialogo-campos");
    zona.innerHTML = "";
    campos.forEach((c) => zona.appendChild(crearCampo(c)));

    mostrarError("");

    const acciones = $("#dialogo-acciones");
    acciones.innerHTML = "";

    if (extra) {
      const boton = document.createElement("button");
      boton.type = "button";
      boton.className = "boton boton--peligro";
      boton.textContent = extra.texto;
      boton.addEventListener("click", () => cerrar({ __extra: extra.valor }));
      acciones.appendChild(boton);
    }

    const cancelarBtn = document.createElement("button");
    cancelarBtn.type = "button";
    cancelarBtn.className = "boton boton--secundario";
    cancelarBtn.textContent = cancelar;
    cancelarBtn.addEventListener("click", () => cerrar(null));
    acciones.appendChild(cancelarBtn);

    const ok = document.createElement("button");
    ok.type = "submit";
    ok.className = peligro ? "boton boton--peligro-lleno" : "boton boton--principal";
    ok.textContent = aceptar;
    acciones.appendChild(ok);

    valida = { campos, validar };

    $("#velo-dialogo").hidden = false;
    $("#dialogo").hidden = false;
    document.body.classList.add("sin-scroll");

    const primero = zona.querySelector("input:not([disabled]), select:not([disabled])");
    if (primero) {
      setTimeout(() => {
        primero.focus();
        if (primero.select && primero.type === "text") primero.select();
      }, 280);
    }

    return new Promise((res) => { resolver = res; });
  }

  function leer() {

    const valores = {};

    for (const campo of valida.campos) {

      const control = $(`#dlg-${campo.id}`);
      let valor = control.value.trim();

      if (campo.tipo === "monto") {
        valor = FORMATO.normalizarMonto(valor);
        const n = Number(valor);
        const vacioOk = !campo.requerido;
        if (!valor && vacioOk) {
          valores[campo.id] = "";
          continue;
        }
        if (!valor || Number.isNaN(n) || n < 0 || (n === 0 && !campo.permiteCero)) {
          return { error: `Escribe un importe válido en «${campo.etiqueta}».` };
        }
      } else if (campo.tipo === "numero") {
        const n = Number(valor);
        if (!valor || Number.isNaN(n)) return { error: `Escribe un número en «${campo.etiqueta}».` };
        if (campo.min !== undefined && n < campo.min) return { error: `«${campo.etiqueta}» debe ser al menos ${campo.min}.` };
        if (campo.max !== undefined && n > campo.max) return { error: `«${campo.etiqueta}» debe ser como máximo ${campo.max}.` };
        valor = n;
      } else if (campo.requerido && !valor) {
        return { error: `Completa «${campo.etiqueta}».` };
      }

      valores[campo.id] = valor;
    }

    if (valida.validar) {
      const problema = valida.validar(valores);
      if (problema) return { error: problema };
    }

    return { valores };
  }

  function conectar() {

    $("#dialogo-form").addEventListener("submit", (e) => {
      e.preventDefault();
      if (!valida) return;
      const resultado = leer();
      if (resultado.error) {
        mostrarError(resultado.error);
        return;
      }
      cerrar(resultado.valores);
    });

    $("#velo-dialogo").addEventListener("click", () => cerrar(null));
    $("#dialogo-cerrar").addEventListener("click", () => cerrar(null));

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !$("#dialogo").hidden) cerrar(null);
    });
  }

  return {
    conectar,
    estaAbierto: () => !$("#dialogo").hidden,
    formulario: abrir,
    async confirmar(opciones) {
      const r = await abrir({ aceptar: "Aceptar", ...opciones, campos: [] });
      return Boolean(r);
    },
  };

})();
