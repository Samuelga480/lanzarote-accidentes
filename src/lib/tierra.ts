/**
 * ¿Este punto cae en tierra de Lanzarote o en el mar?
 *
 * ---------------------------------------------------------------------------
 *  POR QUE EXISTE
 * ---------------------------------------------------------------------------
 *
 * El marcador de cada noticia se desplaza de forma deliberada 400-900 metros
 * para no dar el punto exacto del accidente, que puede tener heridos que
 * identificar. Eso es obligatorio y no se toca.
 *
 * El problema es que el desplazamiento era a ciegas. En un pueblo de la costa,
 * como Arrecife, Costa Teguise, Puerto del Carmen o Playa Blanca, un empuje de
 * 900 metros en la direccion equivocada cae en el agua. Entonces el mapa coloca
 * un punto en mitad del oceano y le dice al lector que el accidente ocurrio
 * alli. Eso es peor que no poner marcador: el lector deduce una ubicacion que
 * nadie ha dicho.
 *
 * Con esto, el desplazamiento se prueba contra la costa real y se busca otro que
 * caiga en tierra. El desplazamiento sigue siendo aleatorio y sigue siendo de
 * cientos de metros, asi que la privacidad no se ve afectada.
 *
 * ---------------------------------------------------------------------------
 *  POR QUE HAY UN MARGEN DE 150 METROS
 * ---------------------------------------------------------------------------
 *
 * El poligono viene de los limites municipales de OpenStreetMap, simplificados
 * a unos 60 metros. Un punto puede quedar a cien metros del borde y estar o no
 * en tierra segun como de exacta sea la fuente. El margen hace que la pregunta
 * sea "esta claramente en el agua?" en vez de "esta a tres metros del agua?",
 * que es una pregunta que el poligono no sabe responder con seguridad.
 *
 * Un marcador a 100 metros de la playa sigue sin revelar donde pas{o} nada.
 */

import { TIERRA_LANZAROTE, MARGEN_TIERRA_M } from "@/lib/costeros";

/** Si el punto cae dentro de alguno de los anillos. */
export function dentroDeLaIsla(lat: number, lon: number): boolean {
  for (const anillo of TIERRA_LANZAROTE) {
    let dentro = false;
    for (let i = 0, j = anillo.length - 1; i < anillo.length; j = i++) {
      const yi = anillo[i][0];
      const xi = anillo[i][1];
      const yj = anillo[j][0];
      const xj = anillo[j][1];
      if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
        dentro = !dentro;
      }
    }
    if (dentro) return true;
  }
  return false;
}

/** Distancia en metros al borde de tierra mas cercano. */
export function metrosAlBorde(lat: number, lon: number): number {
  const mLat = 111_320;
  const mLon = 111_320 * Math.cos((lat * Math.PI) / 180);
  let mejor = Infinity;

  for (const anillo of TIERRA_LANZAROTE) {
    for (let i = 0; i < anillo.length; i++) {
      const a = anillo[i];
      const b = anillo[(i + 1) % anillo.length];

      const ax = (a[1] - lon) * mLon;
      const ay = (a[0] - lat) * mLat;
      const bx = (b[1] - lon) * mLon;
      const by = (b[0] - lat) * mLat;

      const dx = bx - ax;
      const dy = by - ay;
      const largo = dx * dx + dy * dy;
      let t = largo === 0 ? 0 : -(ax * dx + ay * dy) / largo;
      t = Math.max(0, Math.min(1, t));

      const px = ax + dx * t;
      const py = ay + dy * t;
      const d = Math.sqrt(px * px + py * py);
      if (d < mejor) mejor = d;
    }
  }
  return mejor;
}

/**
 * El punto esta en tierra (o tan cerca de la costa que se cuenta como tierra).
 *
 * Lo que se busca es no poner un marcador en mitad del oceano. Un punto que
 * cae en un descampado a cien metros de la playa sigue siendo valido: no dice
 * mas de donde dice el titular.
 */
export function esTierra(lat: number, lon: number): boolean {
  if (dentroDeLaIsla(lat, lon)) return true;
  return metrosAlBorde(lat, lon) <= MARGEN_TIERRA_M;
}
/**
 * Minima distancia al borde que tiene que tener un punto para poder aceptarse
 * como marcador, unos 200 metros.
 *
 * ---------------------------------------------------------------------------
 *  POR QUE HACE FALTA
 * ---------------------------------------------------------------------------
 *
 * El contorno de la isla sale de OpenStreetMap y es un dibujo aproximado: el
 * del puerto de los Marmoles, en Arrecife, pasa por tierra firme en vez de
 * rodear la darsena. Ese hueco mide unos 300 metros, de modo que un marcador
 * caido dentro se dibujaba en el agua y la comprobacion lo daba por bueno,
 * porque el poligono dice que es isla.
 *
 * No se ha parcheado el puerto a mano. Lo que se hace es una regla general: un
 * marcador tiene que estar CLARAMENTE dentro de tierra, no en un rasante de la
 * costa ni dentro de una darsena. Con 200 metros de margen los entrantes
 * costeros se descartan solos, sin conocerlos uno a uno.
 *
 * El coste: en un pueblo muy abierto, como Puerto del Carmen o Playa Quemada,
 * buscar tierra puede obligar a reducir el desplazamiento, y acaba siendo de
 * 120-400 metros en vez de 400-900. Sigue siendo un desplazamiento y no el punto
 * exacto, que es lo que importa para la privacidad.
 */
export const MIN_INTERIOR_M = 200;

/**
 * El punto vale para colocar un marcador: esta dentro de la isla y a al menos
 * `MIN_INTERIOR_M` de cualquier borde.
 *
 * Esta es la que se usa al elegir la posicion. `esTierra` es mas laxa y sirve
 * para diagnostico.
 */
export function sitioSeguro(lat: number, lon: number): boolean {
  return dentroDeLaIsla(lat, lon) && metrosAlBorde(lat, lon) >= MIN_INTERIOR_M;
}