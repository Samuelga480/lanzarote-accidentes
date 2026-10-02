/**
 * Lineas extra del ads.txt que el panel de la red reclama y su generador no
 * devuelve.
 *
 * ---------------------------------------------------------------------------
 *  POR QUE ESTA LISTA EXISTE
 * ---------------------------------------------------------------------------
 *
 * El generador de la red (`ads_txt.php?site_id=...&id=...`) devuelve un
 * fichero distinto segun el `id` que se le pida, y la cuenta del editor tiene
 * dos:
 *
 *   id=133147  -> 946 entradas, con OWNERDOMAIN=accidenteslanzarote.com
 *   id=133127  -> 943 entradas, sin cabecera OWNERDOMAIN
 *
 * El panel que esta viendo el editor pide las lineas del 133127 y avisa de que
 * faltan. Como son las dos de la misma red (Improvedigital es quien gestiona
 * TheMoneytizer) y autorizan al mismo dominio, se sirven las dos: quitar la
 * que ya funciona haria que el panel que ya estaba conforme volviera a fallar.
 *
 * ---------------------------------------------------------------------------
 *  DONDE SE APLICAN
 * ---------------------------------------------------------------------------
 *
 * La ruta elige el texto base (el del panel, o la copia local si el panel no
 * responde) y DESPUES pasa ese texto por aqui. Por eso no hace falta tocar la
 * copia local: las lineas se anaden igual este camino u otro, y queda una sola
 * lista que mantener en lugar de dos ficheros que se pueden desincronizar.
 *
 * Si se hubieran anadido solo a la copia local, no aparecerian casi nunca: la
 * peticion al panel tiene exito y su respuesta es la que se sirve.
 */

/**
 * Se serviran siempre, este solo se agrega si no estan ya. El formato es el de
 * la especificacion IAB: sin espacios alrededor de las comas.
 */
export const ADS_LINEAS_EXTRA: string[] = [
  "themoneytizer.com,133127,DIRECT",
  "improvedigital.com,1602_133127,DIRECT",
  "improvedigital.com,1033_133127,DIRECT",
];

/**
 * Anade las lineas extra que falten, sin repetir las que ya estan.
 *
 * Devuelve el texto con la cabecera primero. ads.txt no es un formato donde el
 * orden importe, pero OWNERDOMAIN y MANAGERDOMAIN se leen primero y las
 * comprobaciones automaticas los buscan ahi.
 */
export function conLineasExtra(txt: string, extras: string[] = ADS_LINEAS_EXTRA): string {
  const lineas = txt
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l !== "");

  const presentes = new Set(lineas.map((l) => l.toLowerCase()));

  const cabecera = lineas.filter((l) => /^(OWNERDOMAIN|MANAGERDOMAIN)=/i.test(l));
  const resto = lineas.filter((l) => !/^(OWNERDOMAIN|MANAGERDOMAIN)=/i.test(l));

  // Se insertan despues de la cabecera y antes de las resellers, que es donde las
  // mete la propia red: primero lo de la red que gestiona el sitio, despues los
  // intermediarios.
  const dirDirectas = new Set(extras.filter((e) => /,DIRECT$/i.test(e)));
  const anadidas: string[] = [];
  for (const e of extras) {
    if (presentes.has(e.toLowerCase())) continue;
    presentes.add(e.toLowerCase());
    anadidas.push(e);
  }

  const primeras = anadidas.filter((a) => dirDirectas.has(a));
  const otras = anadidas.filter((a) => !dirDirectas.has(a));

  return [...cabecera, ...primeras, ...resto, ...otras, ""].join("\n");
}