/* =====================================================================
   Imágenes adjuntas (comprobantes de préstamos y abonos).

   La foto se reduce antes de guardarla (lado máximo 1280 px, JPEG al
   80%): una foto de 4 MB queda en unos 150 KB, así la copia de
   seguridad no se vuelve enorme. Se guarda en IndexedDB como texto
   data:image/jpeg;base64,... en el almacén «comprobantes».

   Valores que maneja el campo de imagen de los diálogos:
     ""            sin imagen
     "id:<uuid>"   imagen ya guardada, sin cambios
     "data:..."    imagen nueva, aún sin guardar
   ===================================================================== */

const IMAGEN = (() => {

  const MAX = 1280;
  const CALIDAD = 0.8;
  const LIMITE_SIN_REDUCIR = 1.5 * 1024 * 1024;

  const leerComoTexto = (archivo) => new Promise((resolver, rechazar) => {
    const lector = new FileReader();
    lector.onload = () => resolver(lector.result);
    lector.onerror = () => rechazar(lector.error);
    lector.readAsDataURL(archivo);
  });

  const cargar = (url) => new Promise((resolver, rechazar) => {
    const img = new Image();
    const reloj = setTimeout(() => rechazar(new Error("La imagen tardó demasiado.")), 10000);
    img.onload = () => { clearTimeout(reloj); resolver(img); };
    img.onerror = () => { clearTimeout(reloj); rechazar(new Error("No se pudo leer la imagen.")); };
    img.src = url;
  });

  /** Reduce una imagen y devuelve data:image/jpeg;base64,... */
  async function reducir(archivo) {

    if (!archivo || !String(archivo.type).startsWith("image/")) {
      throw new Error("Elige un archivo de imagen.");
    }

    const original = await leerComoTexto(archivo);

    try {
      const img = await cargar(original);
      const escala = Math.min(1, MAX / Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height));
      const ancho = Math.max(1, Math.round((img.naturalWidth || img.width) * escala));
      const alto = Math.max(1, Math.round((img.naturalHeight || img.height) * escala));

      const lienzo = document.createElement("canvas");
      lienzo.width = ancho;
      lienzo.height = alto;

      const ctx = lienzo.getContext("2d");
      if (!ctx) throw new Error("sin lienzo");

      ctx.fillStyle = "#fff";           // los PNG transparentes quedan sobre blanco
      ctx.fillRect(0, 0, ancho, alto);
      ctx.drawImage(img, 0, 0, ancho, alto);

      const salida = lienzo.toDataURL("image/jpeg", CALIDAD);
      if (salida.startsWith("data:image/")) return salida;
      throw new Error("sin conversión");

    } catch (error) {
      // Si no se puede reducir, se admite solo cuando ya es pequeña.
      if (archivo.size <= LIMITE_SIN_REDUCIR) return original;
      throw new Error("No se pudo reducir la imagen. Prueba con otra foto.");
    }
  }

  /**
   * Convierte el valor del campo en un identificador guardado.
   * Borra la imagen anterior si se quitó o se cambió.
   */
  async function aplicar(valor, anterior = null) {

    if (!valor) {
      if (anterior) await DATOS.eliminarComprobante(anterior);
      return null;
    }

    if (valor.startsWith("id:")) return valor.slice(3);

    const id = APP.identificador();
    await DATOS.guardarComprobante(id, valor);
    if (anterior) await DATOS.eliminarComprobante(anterior);
    return id;
  }

  // ------------------------------------------------------------------
  // Visor a pantalla completa
  // ------------------------------------------------------------------

  /** items: [{ id, titulo }] — muestra todas, una debajo de otra. */
  async function ver(items) {

    const visor = document.querySelector("#visor");
    const lista = document.querySelector("#visor-lista");
    if (!visor || !lista) return;

    lista.innerHTML = "";

    let hay = 0;
    for (const item of items) {
      const datos = await DATOS.comprobante(item.id);
      if (!datos) continue;
      hay += 1;

      const figura = document.createElement("figure");
      figura.className = "visor__figura";
      const img = document.createElement("img");
      img.src = datos;
      img.alt = item.titulo || "Comprobante";
      const pie = document.createElement("figcaption");
      pie.textContent = item.titulo || "";
      figura.append(img, pie);
      lista.appendChild(figura);
    }

    if (!hay) {
      APP.avisar("No se encontró la imagen", true);
      return;
    }

    visor.hidden = false;
    document.body.classList.add("sin-scroll");
  }

  function cerrarVisor() {
    const visor = document.querySelector("#visor");
    if (!visor || visor.hidden) return;
    visor.hidden = true;
    document.body.classList.remove("sin-scroll");
  }

  function conectar() {
    const visor = document.querySelector("#visor");
    if (!visor) return;
    visor.addEventListener("click", (e) => {
      if (e.target.tagName !== "IMG") cerrarVisor();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") cerrarVisor();
    });
  }

  return { reducir, aplicar, ver, cerrarVisor, conectar, estaAbierto: () => !document.querySelector("#visor").hidden };

})();
