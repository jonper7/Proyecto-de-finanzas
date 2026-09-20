/* =====================================================================
   Importador de CSV.

   Convierte un CSV exportado desde PostgreSQL al formato de copia que
   entiende COPIA.importar, para poder cargar el histórico de gastos
   desde el móvil (el archivo puede venir de Drive).

   Reconoce los nombres de columna habituales y descarta las que no
   sirven (id, usuario_id, created_at, sync_*, etc.). Si el CSV trae
   los nombres de categoría y medio de pago, los usa; si solo trae
   los identificadores numéricos, el movimiento entra igual pero sin
   clasificar.
   ===================================================================== */

const IMPORTARCSV = (() => {

  /**
   * Parte una línea CSV respetando las comillas.
   */
  function partirLinea(linea) {

    const celdas = [];
    let actual = "";
    let entreComillas = false;

    for (let i = 0; i < linea.length; i += 1) {

      const c = linea[i];

      if (entreComillas) {
        if (c === '"') {
          if (linea[i + 1] === '"') { actual += '"'; i += 1; }
          else entreComillas = false;
        } else {
          actual += c;
        }
      } else if (c === '"') {
        entreComillas = true;
      } else if (c === ",") {
        celdas.push(actual); actual = "";
      } else {
        actual += c;
      }
    }

    celdas.push(actual);
    return celdas;
  }

  /**
   * Convierte todo el texto CSV en filas indexadas por cabecera.
   */
  function parsear(texto) {

    // Admite tanto \r\n como \n, y separa en líneas respetando
    // saltos de línea dentro de comillas.
    const lineas = [];
    let linea = "";
    let entreComillas = false;

    for (let i = 0; i < texto.length; i += 1) {
      const c = texto[i];
      if (c === '"') entreComillas = !entreComillas;
      if ((c === "\n" || c === "\r") && !entreComillas) {
        if (c === "\r" && texto[i + 1] === "\n") i += 1;
        lineas.push(linea); linea = "";
      } else {
        linea += c;
      }
    }
    if (linea) lineas.push(linea);

    const noVacias = lineas.filter((l) => l.trim() !== "");

    if (!noVacias.length) return { cabeceras: [], filas: [] };

    const cabeceras = partirLinea(noVacias[0]).map((h) =>
      h.trim().toLowerCase().replace(/^"|"$/g, "")
    );

    const filas = noVacias.slice(1).map((l) => {
      const celdas = partirLinea(l);
      const fila = {};
      cabeceras.forEach((cab, i) => { fila[cab] = (celdas[i] ?? "").trim(); });
      return fila;
    });

    return { cabeceras, filas };
  }

  /**
   * Corrige acentos mal codificados (mojibake) que aparecen cuando un
   * texto UTF-8 se interpreta como Latin-1: "AlimentaciÃ³n" -> "Alimentación".
   * Solo actúa si detecta las secuencias sospechosas, así que no daña
   * un texto que ya está bien.
   */
  function repararAcentos(texto) {

    if (texto == null) return texto;
    if (!/[ÃÂ]/.test(texto)) return texto;

    const mapa = {
      "Ã¡": "á", "Ã©": "é", "Ã­": "í", "Ã³": "ó", "Ãº": "ú", "Ã±": "ñ",
      "Ã ": "à", "Ã¼": "ü",
      "Ã\u0081": "Á", "Ã\u0089": "É", "Ã\u008d": "Í",
      "Ã\u0093": "Ó", "Ã\u009a": "Ú", "Ã\u0091": "Ñ",
      "Â¿": "¿", "Â¡": "¡", "Âº": "º", "Âª": "ª", "Â": "",
    };

    return texto.replace(
      /Ã.|Â./g,
      (par) => (par in mapa ? mapa[par] : par)
    );
  }

  /**
   * Primer valor no vacío entre varios nombres de columna posibles.
   */
  function campo(fila, nombres) {
    for (const nombre of nombres) {
      if (fila[nombre] !== undefined && fila[nombre] !== "") {
        return fila[nombre];
      }
    }
    return null;
  }

  /**
   * Convierte un importe de texto a número positivo y su signo.
   */
  function monto(bruto) {
    if (bruto === null) return { valor: null, negativo: false };
    let s = String(bruto).replace(/[^\d.,-]/g, "");
    const negativo = s.trim().startsWith("-");
    s = s.replace(/-/g, "").replace(",", ".");
    const n = parseFloat(s);
    if (Number.isNaN(n)) return { valor: null, negativo };
    return { valor: n.toFixed(2), negativo };
  }

  return {

    parsear,

    /**
     * Indica si un texto parece un CSV (y no el JSON de copia).
     */
    pareceCSV(texto, nombreArchivo = "") {
      if (nombreArchivo.toLowerCase().endsWith(".csv")) return true;
      const limpio = texto.trimStart();
      if (limpio.startsWith("{") || limpio.startsWith("[")) return false;
      const primera = limpio.split(/\r?\n/, 1)[0].toLowerCase();
      return primera.includes(",") && primera.includes("fecha");
    },

    /**
     * Convierte el CSV en el objeto que espera COPIA.importar.
     * Devuelve una cadena JSON lista para pasarle.
     */
    aCopiaJSON(texto) {

      const { filas } = parsear(texto);

      const movimientos = [];

      filas.forEach((fila) => {

        const fecha = campo(fila, ["fecha", "date"]);
        if (!fecha) return;

        const { valor, negativo } = monto(
          campo(fila, ["monto", "importe", "amount", "valor"])
        );
        if (valor === null || Number(valor) <= 0) return;

        // El tipo sale de su columna; si no hay, se deduce del signo.
        let tipo = campo(fila, ["tipo", "type"]);
        tipo = tipo ? tipo.toLowerCase() : (negativo ? "gasto" : "ingreso");
        if (tipo !== "gasto" && tipo !== "ingreso") {
          tipo = negativo ? "gasto" : "ingreso";
        }

        movimientos.push({
          uuid: campo(fila, ["uuid"]) || undefined,
          fecha: String(fecha).slice(0, 10),
          monto: valor,
          tipo,
          categoria: repararAcentos(campo(fila, ["categoria", "categoría", "cat"])),
          subcategoria: repararAcentos(campo(fila, ["subcategoria", "subcategoría", "subcat"])),
          medio_pago: repararAcentos(campo(fila, [
            "medio_pago", "medio", "medio de pago", "medio_de_pago", "mediopago",
          ])),
          descripcion: repararAcentos(campo(fila, ["descripcion", "descripción", "concepto"])),
          comentario: repararAcentos(campo(fila, ["comentario", "nota"])),
        });
      });

      return JSON.stringify({
        aplicacion: "finanzas",
        version: 1,
        importado_de: "csv",
        movimientos,
      });
    },
  };

})();
