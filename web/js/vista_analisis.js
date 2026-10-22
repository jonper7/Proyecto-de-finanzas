/* =====================================================================
   Pestaña Análisis: comparativas y tendencias.
   ===================================================================== */

(() => {

  const { $, estado, mesLargo } = APP;

  function pintar() {
    $("#analisis-mes").textContent = mesLargo.format(estado.mes);
    RESUMEN.pintarAnalisis(APP.contexto());
  }

  APP.registrar("analisis", { pintar });

})();
