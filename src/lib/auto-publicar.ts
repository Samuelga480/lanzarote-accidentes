/**
 * Publicacion automatica: la puerta.
 *
 * ---------------------------------------------------------------------------
 *  QUE ES Y QUE NO ES
 * ---------------------------------------------------------------------------
 *
 * Decide si un borrador puede publicarse sin que nadie pulse nada. Es una
 * funcion PURA: recibe los datos del borrador y devuelve un si o un no con el
 * motivo. No toca la base de datos ni la red, que es lo que permite probarla
 * entera en `tests/auto-publicar.ts` sin montar nada.
 *
 * Publicar de verdad lo hace `changeStatus()` de `lib/admin.ts`, que es la unica
 * via de publicacion del sistema y que ademas bloquea las duplicadas. Esta puerta
 * no lo sustituye: solo decide si se le pide.
 *
 * ---------------------------------------------------------------------------
 *  POR QUE ESTA APAGADA
 * ---------------------------------------------------------------------------
 *
 * `AUTO_PUBLISH` viene en `false` y no se activa solo. El resto del sistema esta
 * escrito asumiendo que las noticias las aprueba una persona (ver
 * `verify.ts` y `pipeline.ts`), asi que encender esto es una decision editorial
 * explicita, no un valor de configuracion cualquiera.
 *
 * ---------------------------------------------------------------------------
 *  EL LISTON
 * ---------------------------------------------------------------------------
 *
 * Todo lo siguiente tiene que cumplirse a la vez. Cada punto descarta algo que
 * la verificacion automatica NO considera motivo suficiente para descartar, pero
 * que en un medio si lo es:
 *
 *   1. Que no sea una duplicada. Es la unica condicion que pone `changeStatus`, y
 *      aun asi se comprueba aqui para no desperdiciar la llamada.
 *   2. `verificationStatus === "VERIFIED"`. El verificador es generoso: a partir
 *      de 0.8 de confianza y 0.5 de fuente ya dice VERIFIED. Esta puerta exige mas.
 *   3. Confianza por encima de su propio liston (0.85 por defecto), que es mas
 *      alto que el de VERIFIED a proposito: el liston de aqui no tiene a un
 *      humano mirandolo despues.
 *   4. Fuente fiable (0.6). Un medio que falla a menudo no llega.
 *   5. Que el texto se haya reescrito de verdad. Si no hay IA y el articulo no es
 *      un suceso, `ingest` conserva el texto ORIGINAL del medio: publicar eso sin
 *      nadie que lo lea es justamente lo que no se quiere.
 *   6. Cuerpo minimo de 120 palabras. Un fragmento de feed no es una noticia.
 *   7. Municipio identificado. Sin el, `ingest` conecta Arrecife solo para que el
 *      mapa tenga un punto, y el propio codigo avisa de que hay que corregirlo
 *      antes de publicar.
 *   8. Cero errores editoriales graves y cero avisos. Un "grave" es, por
 *      definicion del modulo `errores`, algo que deberia impedir la publicacion.
 *   9. Cero datos personales detectados. El texto sale saneado, pero que el
 *      original trajera una matricula o un telefono significa que hay algo que
 *      alguien deberia mirar antes de que sea publico.
 *  10. Que sea reciente (24 h por defecto). Publicar hoy un articulo de hace una
 *      semana como si fuera de hoy es el fallo clasico de la ingestion automatica.
 */

import { autoPublishConfig } from "@/lib/env";

/** Lo que necesita saber la puerta. Todo viene del propio borrador. */
export type CandidatoAutoPublicable = {
  verificationStatus: string;
  confidenceScore: number;
  sourceScore: number;
  /** El texto ha pasado por la IA o por el redactor de reglas. */
  rewritten: boolean;
  /** Palabras del cuerpo ya publicado, no del original. */
  palabrasCuerpo: number;
  /** `false` cuando `ingest` conecto Arrecife como punto cartografico provisional. */
  municipioConocido: boolean;
  /** La noticia esta enlazada a otra canonica. */
  esDuplicada: boolean;
  /** Horas desde que ocurrio el suceso. */
  horasAntiguedad: number;
  /** Errores de nivel "grave". */
  erroresGraves: number;
  /** Errores de nivel "aviso". */
  erroresAvisos: number;
  /** Datos personales que el saneado quito del texto. */
  findingsPrivacidad: number;
};

export type DecisionAutoPublicable = {
  publicar: boolean;
  /** Por que si o por que no. Se guarda en las notas de la noticia y en el log. */
  motivo: string;
};

/** Cuenta palabras como lo hace el verificador: split por espacios, sin vacios. */
export function palabras(txt: string): number {
  return txt.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * La puerta.
 *
 * Devuelve SIEMPRE el motivo, tambien cuando publica. Sin el, un dia que se
 * publicaran diez noticias no habria forma de saber por que pasaron esas diez y
 * no otras.
 */
export function decidirAutoPublicacion(c: CandidatoAutoPublicable): DecisionAutoPublicable {
  const cfg = autoPublishConfig;

  const fallos: string[] = [];

  if (c.esDuplicada) fallos.push("es una duplicada de otra noticia");
  if (c.verificationStatus !== "VERIFIED") {
    fallos.push(`la verificacion lo dejo en ${c.verificationStatus}, no en VERIFIED`);
  }
  if (c.confidenceScore < cfg.minConfidence()) {
    fallos.push(`confianza ${c.confidenceScore.toFixed(2)} por debajo de ${cfg.minConfidence()}`);
  }
  if (c.sourceScore < cfg.minSourceScore()) {
    fallos.push(`fuente ${c.sourceScore.toFixed(2)} por debajo de ${cfg.minSourceScore()}`);
  }
  if (!c.rewritten) fallos.push("el texto es el original del medio, sin reescribir");
  if (c.palabrasCuerpo < cfg.minWords()) {
    fallos.push(`el cuerpo tiene ${c.palabrasCuerpo} palabras, menos de ${cfg.minWords()}`);
  }
  if (!c.municipioConocido) fallos.push("no se ha podido determinar el municipio");
  if (c.erroresGraves > 0) fallos.push(`${c.erroresGraves} error(es) editorial(es) grave(s)`);
  if (c.erroresAvisos > cfg.maxWarnings()) {
    fallos.push(`${c.erroresAvisos} aviso(s) editorial(es), el maximo es ${cfg.maxWarnings()}`);
  }
  if (cfg.requirePrivacyClean() && c.findingsPrivacidad > 0) {
    fallos.push(`el original traia ${c.findingsPrivacidad} dato(s) personal(es)`);
  }
  if (c.horasAntiguedad > cfg.maxAgeHours()) {
    fallos.push(`el suceso es de hace ${Math.round(c.horasAntiguedad)} h, el maximo es ${cfg.maxAgeHours()}`);
  }

  if (fallos.length > 0) {
    return { publicar: false, motivo: `No se publica automaticamente: ${fallos.join("; ")}.` };
  }

  return {
    publicar: true,
    motivo:
      `Publicada automaticamente: ${c.verificationStatus}, confianza ${c.confidenceScore.toFixed(2)}, ` +
      `fuente ${c.sourceScore.toFixed(2)}, ${c.palabrasCuerpo} palabras, sin errores editoriales.`,
  };
}

/** Atajo: la puerta puesta y cerrada. Es lo que se consulta en el bucle. */
export function puedeIntentarAutoPublicar(): boolean {
  return autoPublishConfig.enabled();
}