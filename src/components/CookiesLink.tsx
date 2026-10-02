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
 * openPreferences() viene documentado por iubenda. La comprobacion evita un
 * error en consola si alguien llega aqui con el script bloqueado o si iubenda
 * cambia el nombre: sin CMP no hay Preferences que abrir, y no merece la pena
 * romper la pagina por eso.
 */
export function CookiesLink() {
  return (
    <button
      type="button"
      className="cookies-link"
      onClick={() => {
        const g = window as unknown as {
          __iubenda?: { openPreferences?: () => void };
        };
        g.__iubenda?.openPreferences?.();
      }}
    >
      Cookies
    </button>
  );
}