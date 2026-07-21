/* =====================================================================
   Configuración y formato de importes.

   Aquí se cambia la moneda de toda la aplicación: es el único sitio
   donde está definida.
   ===================================================================== */

const CONFIG = {

  // Código de tres letras de la moneda.
  //   USD = dólar, EUR = euro, MXN = peso mexicano,
  //   COP = peso colombiano, ARS = peso argentino, PEN = sol...
  moneda: "USD",

  // Cómo se escriben las cifras.
  //   "en-US" -> $1,234.50   (punto decimal, coma de millares)
  //   "es-EC" -> $1.234,50   (coma decimal, punto de millares)
  //   "es-ES" -> 1.234,50 €
  idiomaMoneda: "en-US",

  // Idioma de las fechas. Independiente del anterior: puedes tener
  // los importes en formato americano y las fechas en español.
  idiomaFechas: "es-ES",
};


const FORMATO = (() => {

  const dinero = new Intl.NumberFormat(CONFIG.idiomaMoneda, {
    style: "currency",
    currency: CONFIG.moneda,
  });

  const mesLargo = new Intl.DateTimeFormat(CONFIG.idiomaFechas, {
    month: "long",
    year: "numeric",
  });

  const diaLargo = new Intl.DateTimeFormat(CONFIG.idiomaFechas, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  const diaCorto = new Intl.DateTimeFormat(CONFIG.idiomaFechas, {
    day: "numeric",
    month: "long",
  });

  const mesCorto = new Intl.DateTimeFormat(CONFIG.idiomaFechas, {
    month: "short",
  });

  /**
   * Símbolo de la moneda, para los rótulos del formulario.
   */
  function simbolo() {

    const partes = dinero.formatToParts(0);
    const encontrado = partes.find((parte) => parte.type === "currency");

    return encontrado ? encontrado.value : "";
  }

  /**
   * Convierte lo que escribe el usuario en un número utilizable.
   *
   * Acepta las dos formas de escribir, porque nadie se acuerda de
   * cuál toca:
   *
   *   45,50      -> 45.50
   *   45.50      -> 45.50
   *   1.234,56   -> 1234.56
   *   1,234.56   -> 1234.56
   *   1.234      -> 1234     (tres decimales no existen en dinero)
   *   1,5        -> 1.5
   *
   * La regla: cuando aparecen los dos separadores, el que está más
   * a la derecha es el decimal. Cuando solo hay uno, es decimal si
   * le siguen una o dos cifras, y separador de millares si le siguen
   * exactamente tres.
   */
  function normalizarMonto(texto) {

    let limpio = String(texto).trim();

    // Fuera símbolos, espacios y letras.
    limpio = limpio.replace(/[^\d.,-]/g, "");

    if (!limpio) return "";

    const negativo = limpio.startsWith("-");

    limpio = limpio.replace(/-/g, "");

    const ultimaComa = limpio.lastIndexOf(",");
    const ultimoPunto = limpio.lastIndexOf(".");

    let resultado;

    if (ultimaComa !== -1 && ultimoPunto !== -1) {

      // Están los dos: manda el de más a la derecha.
      const decimal = ultimaComa > ultimoPunto ? "," : ".";
      const millares = decimal === "," ? "." : ",";

      resultado = limpio
        .split(millares).join("")
        .replace(decimal, ".");

    } else if (ultimaComa !== -1 || ultimoPunto !== -1) {

      const separador = ultimaComa !== -1 ? "," : ".";
      const posicion = ultimaComa !== -1 ? ultimaComa : ultimoPunto;
      const cifrasDetras = limpio.length - posicion - 1;
      const apariciones = limpio.split(separador).length - 1;

      if (apariciones > 1 || cifrasDetras === 3) {
        // 1.234.567 o 1,234 -> separador de millares
        resultado = limpio.split(separador).join("");
      } else {
        // 45,5 o 45.50 -> separador decimal
        resultado = limpio.replace(separador, ".");
      }

    } else {
      resultado = limpio;
    }

    return negativo ? `-${resultado}` : resultado;
  }

  return {
    dinero,
    mesLargo,
    diaLargo,
    diaCorto,
    mesCorto,
    simbolo,
    normalizarMonto,

    /**
     * Escribe el símbolo de la moneda en los rótulos de la página.
     */
    aplicarSimbolo() {
      document.querySelectorAll("[data-moneda]").forEach((nodo) => {
        nodo.textContent = simbolo();
      });
    },
  };

})();
