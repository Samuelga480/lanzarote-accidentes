/**
 * Que tipo de noticia es, cuando el extractor no ha sabido.
 *
 * ---------------------------------------------------------------------------
 *  EL FALLO QUE ESTE FICHERO ARREGLA
 * ---------------------------------------------------------------------------
 *
 * El extractor de hechos (extractFacts) devuelve `category: null` cuando no
 * reconoce el texto, y eso es lo correcto: es mejor no saber que mentir. El
 * problema era quien consumia ese null.
 *
 * La ingestion hacia `facts.category ?? "ACCIDENTE_TRAFICO"`. Traducia "no he
 * podido clasificarlo" por "es un accidente", y como la taxononia solo tenia
 * tipos de accidente, casi todo caia ahi: un partido de balonmano, un
 * horoscopo, una serie de television o una nota de prensa de Madrid salian
 * publicados con la etiqueta "Accidente".
 *
 * Con 85 noticias en la base de datos, 68 tenian esa etiqueta y solo unas
 * pocas eran realmente accidentes. El numero no lo elegia el extractor: lo
 * producia el valor por defecto.
 *
 * ---------------------------------------------------------------------------
 *  LA REGLA
 * ---------------------------------------------------------------------------
 *
 * Cuando no hay categoria reconocida:
 *
 *   1. Se busca un tema de informacion con una segunda pasada de reglas, mas
 *      amplias que las de la ingestion. Si aparece, esa es la categoria: la
 *      noticia es real y de la isla, solo que no es un suceso.
 *   2. Si tampoco, NO se inventa una categoria de accidente. Se devuelve OTRO.
 *      OTRO es de la familia de informacion, asi que por defecto ninguna
 *      noticia desconocida entra en el apartado de sucesos ni alimenta el mapa
 *      ni los resumenes de accidentes. Se publica como "Noticia" y el editor la
 *      corrige desde el panel.
 *
 * El punto importante es el 2: un valor por defecto de "ACCIDENTE_TRAFICO" era
 * una afirmacion falsa sobre 68 noticias. Un valor por defecto de OTRO es una
 * admision de ignorancia, y el editor la ve.
 */

import { extractFacts, type IncidentCategory } from "@/lib/facts";
import { esAccidenteDeTrafico } from "@/lib/traffic-gate";

/**
 * Decide la categoria definitiva.
 *
 * @param detectada Lo que devolvio extractFacts, o null si no lo supo.
 * @param titulo    Para la segunda pasada de reglas.
 * @param cuerpo    Idem.
 */
export function resolveCategory(
  detectada: IncidentCategory | null,
  titulo: string,
  resumen = "",
  cuerpo = "",
): IncidentCategory {
  // 1. Si el extractor ya supo, se respeta su decision.
  if (detectada) return detectada;

  const texto = `${titulo} ${resumen} ${cuerpo}`.trim();
  if (!texto) return "OTRO";

  // 2. extractFacts con titulo y cuerpo. Va antes que la puerta de trafico a
  //    proposito: "Incendio en un turismo tras un accidente" menciona
  //    accidente, asi que la puerta devolveria ACCIDENTE_TRAFICO, pero el tipo
  //    cierto es INCENDIO y extractFacts lo sabe distinguir.
  const segunda = extractFacts(titulo, texto);
  if (segunda.category) return segunda.category;

  // 3. La puerta de trafico, para los accidentes con un titular tan corto o tan
  //    raro que las reglas de categoria no lo pillan.
  if (esAccidenteDeTrafico(titulo, texto)) return "ACCIDENTE_TRAFICO";

  // 4. No se sabe. No se inventa un accidente.
  return "OTRO";
}