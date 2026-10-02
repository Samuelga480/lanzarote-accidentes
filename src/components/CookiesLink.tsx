"use client";

/**
 * Enlace para volver a abrir el aviso de cookies.
 *
 * Va en su propio componente porque necesita onClick, y el pie del sitio es un
 * componente de servidor. Anyadirlo al pie entero lo convertiria entero en
 * cliente y se descargaria el JavaScript del pie en todas las paginas.
 *
 * Por que hace falta: el RGPD no basta con pedir el consentimiento la primera
 * vez. La persona tiene que poder cambiarlo despues, y sin este enlace no hay
 * forma de retirarlo.
 *
 * ---------------------------------------------------------------------------
 *  POR QUE PRUEBA VARIAS PUERTAS
 * ---------------------------------------------------------------------------
 *
 * Cada CMP publica su ventana de preferencias con un nombre distinto, y las
 * documentan por separado: InMobi Choice y iubenda no comparten metodo. En vez
 * de atarse a una sola y romperse al cambiarla, se prueban las que existen. La
 * comprobacion evita un error en consola si la CMP no ha cargado, que es lo que
 * pasa si alguien bloquea el script: sin CMP no hay preferencias que abrir, y no
 * merece la pena romper la pagina por eso.
 */
export function CookiesLink() {
  return (
    <button
      type="button"
      className="cookies-link"
      onClick={() => {
        const w = window as unknown as Record<string, unknown>;
        for (const nombre of ["__iubenda", "InMobiPrivacy", "__inmobicmp", "cmplz", "klaro"]) {
          const api = w[nombre] as { openPreferences?: () => void } | undefined;
          if (typeof api?.openPreferences === "function") {
            api.openPreferences();
            return;
          }
        }
      }}
    >
      Cookies
    </button>
  );
}