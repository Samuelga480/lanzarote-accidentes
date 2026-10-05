/**
 * Los errores que hay que guardar cuando se redacta una noticia.
 *
 * ===========================================================================
 *  QUE RESUELVE
 * ===========================================================================
 *
 * La verificacion que habia (verify.ts) miraba la fecha, el municipio, la
 * coherencia interna del texto y la longitud del cuerpo. Ninguna de esas
 * comprobaciones habria detectado ninguno de los fallos que aparecieron al
 * abrir el sitio con la taxonomia nueva:
 *
 *   - Una noticia marcada como accidente sin que el texto tenga ni una palabra
 *     de accidente. Fue como 68 de 89 noticias quedaron asi.
 *   - Una nota del Cabildo con la etiqueta de accidente y sin fecha ni lugar.
 *   - El municipio puesto por defecto cuando el texto no dice donde pasa. Salia
 *     un contador por municipio que decia "68 noticias en Arrecife" sin que
 *     ninguna lo fuera.
 *
 * Por eso esto se guarda y no se descarta: cada articulo conserva la lista de
 * lo que se detecto al entrar. Cuando se edita o se vuelve a redactar, la lista
 * viaja con el y el panel la ensena. Un error que solo existe en el momento de
 * detectarlo no sirve de nada.
 *
 * ===========================================================================
 *  POR QUE NO ESTA DENTRO DE verify.ts
 * ===========================================================================
 *
 * verify.ts puntua: de un 0 a un 1 por comprobacion y sale un numero. Aqui no
 * puntua nada. Cada problema es una frase concreta que alguien tiene que leer y
 * decidir. La puntuacion se queda donde sirve, que es para ordenar y para
 * rechazar; aqui lo que hace falta es la explicacion.
 *
 * ===========================================================================
 *  LOS TRES NIVELES
 * ===========================================================================
 *
 * grave - Impide que la redaccion se ejecute sin mirar. Un accidente al que no
 *         se le reconoce ninguna senal, o una noticia que parece de la isla y
 *         no lo es. Publicar eso sin dar cuenta es el peor resultado posible.
 * aviso - No para la redaccion pero se avisa: el municipio no sale en el texto,
 *         o la gravedad no encaja con la categoria.
 * nota  - Para dejar constancia. No hay que hacer nada.
 *
 * ===========================================================================
 *  CUAL ES EL ERROR MAS IMPORTANTE
 * ===========================================================================
 *
 * El primero de todos: que el articulo diga que es un accidente y no lo sea. Es
 * el que mas veces se ha repetido y el que mas lectores ha visto: un partido de
 * balonmano con la etiqueta "Accidente" en la portada.
 *
 * Ese no lo detecta ningun campo, porque la columna category era correcta y el
 * que mentia era el valor por defecto que se elegia cuando el clasificador no
 * sabia. Por eso hace falta mirar el texto, no los datos.
 */

import { evaluaAccidenteTrafico, evaluaIsla } from "@/lib/traffic-gate";
import { esSuceso } from "@/lib/categorias";
import { INCIDENT_CATEGORIES, extractFacts, norm, type IncidentCategory } from "@/lib/facts";
import { MUNICIPALITIES } from "@/lib/constants";

/* -------------------------------------------------------------------------- */
/*  Tipos                                                                     */
/* -------------------------------------------------------------------------- */

export type NivelError = "grave" | "aviso" | "nota";

export type CodigoError =
  /** Un accidente sin ninguna palabra de accidente en el texto. */
  | "ACCIDENTE_SIN_SENAL"
  /** Una noticia que parece de la isla y no lo es. */
  | "FUERA_DE_LA_ISLA"
  /** El tipo no encaja con lo que el texto cuenta. */
  | "TIPO_NO_ENCUADRA"
  /** El municipio asignado no aparece en el texto. */
  | "MUNICIPIO_NO_DICHO"
  /** La gravedad no tiene sentido para el tipo que tiene. */
  | "GRAVEDAD_SIN_SENTIDO"
  /** Sin fecha utilizable. */
  | "SIN_FECHA"
  /** Fuente de poca fiabilidad. */
  | "FUENTE_DEBAJO";

export type EditorialError = {
  /** Codigo estable, para poder contar y comparar. */
  codigo: CodigoError;
  /** Que hay que mirar. */
  titulo: string;
  /** Por que es un problema. Una frase, sin jerga. */
  detalle: string;
  nivel: NivelError;
};

/* -------------------------------------------------------------------------- */
/*  Deteccion                                                                 */
/* -------------------------------------------------------------------------- */

export type EntradaError = {
  title: string;
  body: string;
  summary: string;
  /** Tipo ya resuelto. null si todavia no se sabe. */
  category: IncidentCategory | string | null;
  /** Tipo que decide el extractor. null si no lo reconoce. */
  categoryDetectada: IncidentCategory | null;
  /** Municipio asignado, como slug. Puede ser el valor por defecto. */
  municipalitySlug: string | null;
  /** true si el municipio viene del texto y no del valor por defecto. */
  municipalityDelTexto: boolean;
  /** Fecha ya resuelta. null si no se sabe. */
  occurredAt: Date | null;
  /** Fiabilidad de la fuente, 0..1. */
  sourceScore: number;
};

/**
 * Analiza una noticia y devuelve lo que hay que mirar antes de publicar.
 *
 * Nunca lanza. Si una comprobacion se rompe, devuelve el resto: es preferible
 * una lista corta a una peticion fallida que deja la noticia sin guardar.
 */
export function detectaErrores(entrada: EntradaError): EditorialError[] {
  const errores: EditorialError[] = [];
  const texto = `${entrada.title} ${entrada.summary} ${entrada.body}`.trim();
  /*
   * El texto normalizado, para comparar nombres de municipios y zonas.
   *
   * Sin esto hay un fallo silencioso: los nombres de la lista editorial van
   * con tilde ("Tias" con acento) y el texto de los medios sin ella. Comparados
   * en crudo nunca casan, y el detector avisa en todas las noticias. Un aviso
   * que sale siempre es un aviso que nadie lee.
   */
  const textoNormalizado = norm(texto);

  if (!texto) return errores;

  /* --- 1. Es un accidente y el texto no lo dice ---------------------------- */

  const tipoSuceso = esSuceso(entrada.category);
  const senal = evaluaAccidenteTrafico(entrada.title, texto);

  if (tipoSuceso && !senal.esAccidente && senal.motivo) {
    errores.push({
      codigo: "ACCIDENTE_SIN_SENAL",
      nivel: "grave",
      titulo: "Es un accidente pero el texto no lo dice",
      detalle:
        "El tipo asignado es un suceso de trafico, pero en el texto no hay ningun suceso " +
        `con vehiculo: ${senal.motivo}. Si de verdad es un accidente, el texto ha llegado ` +
        "vacio o incompleto. Si no lo es, hay que cambiar el tipo.",
    });
  }

  /* --- 2. La noticia parece de la isla y no lo es --------------------------- */

  const isla = evaluaIsla(entrada.title, texto);
  if (!isla.deLanzarote) {
    errores.push({
      codigo: "FUERA_DE_LA_ISLA",
      nivel: "grave",
      titulo: "No es de Lanzarote",
      detalle:
        `${isla.motivo}. Si el texto es de fuera, no entra en el sitio. Si la mencion ` +
        "es casual y la noticia si es de aqui, hay que decirlo en el titulo.",
    });
  }

  /* --- 3. El tipo no encaja ---------------------------------------------- */

  /*
    Solo cuando el extractor si reconocio un tipo pero el texto completo no lo
    sostiene. Si no reconoce ninguno, el tipo acaba siendo OTRO y eso ya esta
    contemplado en otro sitio.
  */
  /*
    Se relee SOLO el cuerpo, no el texto entero. Si se pasara el texto entero, el
    titulo entraria dos veces y la pregunta "¿sostiene el cuerpo el tipo?" se
    convertiria en "¿lo sostiene el titulo?", que es lo mismo que pregunto el
    primer analisis y por tanto siempre dice que si.
  */
  const cuerpoONulo = (entrada.body || entrada.summary).trim();
  const releido = extractFacts(entrada.title, cuerpoONulo);

  if (
    entrada.categoryDetectada &&
    !releido.category &&
    entrada.categoryDetectada !== "OTRO"
  ) {
    errores.push({
      codigo: "TIPO_NO_ENCUADRA",
      nivel: "aviso",
      titulo: `El tipo "${entrada.categoryDetectada}" no sale al releer el texto`,
      detalle:
        "El primer analisis encontro ese tipo, pero al releer el texto completo no aparece. " +
        "Puede que la palabra que lo activo este en una parte que no es de la noticia.",
    });
  }

  /* --- 4. El municipio no sale en el texto -------------------------------- */

  const nombreMun = entrada.municipalitySlug
    ? MUNICIPALITIES.find((m) => m.slug === entrada.municipalitySlug)?.name
    : undefined;

  if (!entrada.municipalityDelTexto) {
    errores.push({
      codigo: "MUNICIPIO_NO_DICHO",
      nivel: "aviso",
      titulo: "No se sabe en que municipio ha pasado",
      detalle: nombreMun
        ? `Esta asignada a ${nombreMun}, pero el texto no lo dice. Se ha puesto ese ` +
          "municipio porque el mapa necesita un punto, no porque sea de alli. Si el editor " +
          "sabe cual es, que lo corrija."
        : "La noticia no menciona ningun municipio de la isla. El mapa la pondra en un punto " +
          "de referencia, que no es donde ha pasado.",
    });
  } else if (nombreMun && !textoNormalizado.includes(norm(nombreMun))) {
    errores.push({
      codigo: "MUNICIPIO_NO_DICHO",
      nivel: "aviso",
      titulo: `El texto no menciona ${nombreMun}`,
      detalle:
        "El municipio se ha asignado por el titulo o el resumen, pero el cuerpo no lo " +
        "confirma. Comprueba que no se este contando en el sitio equivocado.",
    });
  }

  /* --- 5. La gravedad no significa nada para el tipo ---------------------- */

  if (!tipoSuceso) {
    errores.push({
      codigo: "GRAVEDAD_SIN_SENTIDO",
      nivel: "nota",
      titulo: "El tipo no tiene gravedad",
      detalle:
        "Es una noticia de informacion, no un suceso, asi que la gravedad y el vehiculo no " +
        "se muestran. Si en realidad es un accidente, el tipo esta equivocado.",
    });
  }

  /* --- 6. Sin fecha -------------------------------------------------------- */

  if (!entrada.occurredAt) {
    errores.push({
      codigo: "SIN_FECHA",
      nivel: "aviso",
      titulo: "No se sabe cuando ha pasado",
      detalle:
        "Sin fecha la noticia no entra en los resumenes semanal ni anual, que ordenan por " +
        "fecha. Ponla a mano antes de publicar.",
    });
  }

  /* --- 7. Fuente floja ------------------------------------------------------ */

  if (entrada.sourceScore > 0 && entrada.sourceScore < 0.4) {
    errores.push({
      codigo: "FUENTE_DEBAJO",
      nivel: "nota",
      titulo: "Fuente de poca confianza",
      detalle:
        `La fuente tiene una fiabilidad de ${Math.round(entrada.sourceScore * 100)} %. ` +
        "Contrasta el texto con otro medio antes de publicarlo.",
    });
  }

  return errores;
}

/* -------------------------------------------------------------------------- */
/*  Como se guardan                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Los errores en una frase por linea, para el campo reviewNotes.
 *
 * Cada linea lleva su nivel y su codigo. Asi el panel puede localizarlos despues
 * y el editor ve que esta mirando, sin tener que acordarse.
 */
export function erroresEnTexto(errores: EditorialError[]): string {
  return errores.map((e) => `[${e.nivel}] ${e.codigo}: ${e.titulo}. ${e.detalle}`).join("\n");
}

/**
 * Los errores como instrucciones para el redactor.
 *
 * Solo los graves y los avisos. Las notas no llegan al prompt: no hay nada que
 * el redactor pueda hacer con ellas y ocupan contexto sin aportar.
 */
export function erroresParaElPrompt(errores: EditorialError[]): string[] {
  return errores.filter((e) => e.nivel !== "nota").map((e) => `${e.titulo}: ${e.detalle}`);
}

/** Cuantos hay de cada nivel, para un resumen de una linea. */
export function resumenDeErrores(errores: EditorialError[]): string {
  if (errores.length === 0) return "sin errores";
  const graves = errores.filter((e) => e.nivel === "grave").length;
  const avisos = errores.filter((e) => e.nivel === "aviso").length;
  const partes: string[] = [];
  if (graves) partes.push(`${graves} grave${graves > 1 ? "s" : ""}`);
  if (avisos) partes.push(`${avisos} aviso${avisos > 1 ? "s" : ""}`);
  const notas = errores.length - graves - avisos;
  if (notas) partes.push(`${notas} nota${notas > 1 ? "s" : ""}`);
  return partes.join(", ");
}

/** Los codigos que este fichero puede devolver. Para las pruebas. */
export const CODIGOS: CodigoError[] = [
  "ACCIDENTE_SIN_SENAL",
  "FUERA_DE_LA_ISLA",
  "TIPO_NO_ENCUADRA",
  "MUNICIPIO_NO_DICHO",
  "GRAVEDAD_SIN_SENTIDO",
  "SIN_FECHA",
  "FUENTE_DEBAJO",
];

/** Los tipos del enum que este fichero acepta, para detectar desincronias. */
export const TIPOS_CONOCIDOS = INCIDENT_CATEGORIES;
