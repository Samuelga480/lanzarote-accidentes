/**
 * Punto aproximado de una noticia, para el marcador del mapa.
 *
 * ---------------------------------------------------------------------------
 *  POR QUE ESTE FICHERO EXISTE
 * ---------------------------------------------------------------------------
 *
 * El calculo estaba repetido en cuatro sitios (ingest, pipeline, API y panel) y
 * en cada uno habia un matiz distinto. El que mas dolia: si no se detectaba
 * municipio, se usaba un punto fijo de reserva, (29.0, -13.63), que esta en el
 * norte de la isla, mientras que en la base de datos se guardaba Arrecife, que
 * esta en el sur. El resultado era un marcador a 60 km del sitio que ponia al
 * lado. El visitante veia un punto en el mapa y el nombre de un municipio que no
 * cuadraba con el punto.
 *
 * Un solo sitio que decide, con la regla escrita una vez.
 *
 * ---------------------------------------------------------------------------
 *  LAS REGLAS
 * ---------------------------------------------------------------------------
 *
 *  1. Si se sabe la ZONA, se usa la zona. Costa Teguise tiene su propia
 *     coordenada, asi que una noticia de ahi se coloca en Costa Teguise y no en
 *     el pueblo de Teguise, que esta a cuatro kilometros. Antes se usaba
 *     siempre el municipio y por eso los marcadores acababan en la capital
 *     aunque el titulo dijera otra cosa.
 *
 *  2. Si solo se sabe el MUNICIPIO, se usa su casco urbano.
 *
 *  3. Si no se sabe ninguno de los dos, NO hay punto. Se devuelven null y el
 *     mapa no pinta nada. Colocar un accidents donde sea esta es peor que no
 *     colocarlo: el lector deduce una ubicacion que nadie ha dicho.
 *
 *  4. El punto se desplaza 400-900 metros para no dar el lugar exacto. Es
 *     deliberado y no se toca: un accidente puede tener heridos que identificar.
 *
 * Cuando hay zona pero no municipio no se puede dar punto: la zona siempre
 * pertenece a un municipio, y sin el no hay forma de comprobar que la noticia
 * sea de aqui.
 */

import { MUNICIPALITY_BY_SLUG, ZONE_BY_SLUG } from "@/lib/constants";

export type PuntoAproximado = { lat: number; lon: number } | null;

/** Desplazamiento aleatorio de 400 a 900 metros, para no dar el punto exacto. */
export function desplazaPunto(punto: { lat: number; lon: number }): { lat: number; lon: number } {
  const radioM = 400 + Math.random() * 500;
  const angulo = Math.random() * 2 * Math.PI;
  const dLat = (radioM * Math.cos(angulo)) / 111_320;
  const dLon = (radioM * Math.sin(angulo)) / (111_320 * Math.cos((punto.lat * Math.PI) / 180));
  return { lat: punto.lat + dLat, lon: punto.lon + dLon };
}

/**
 * Punto de referencia sin desplazar: el centro de la zona si la hay, y si no el
 * del municipio. Se exporta aparte para poder comprobarlo en las pruebas y para
 * lo que necesite la referencia exacta.
 */
export function puntoDeReferencia(
  municipalitySlug: string | null | undefined,
  zoneSlug: string | null | undefined,
): PuntoAproximado {
  if (municipalitySlug) {
    const zona = zoneSlug ? ZONE_BY_SLUG.get(zoneSlug) : undefined;

    /*
      La zona solo vale si pertenece al municipio. Si el editor cambio el
      municipio despues de crearse la noticia, podrian no cuadrar, y colocar el
      marcador en un municipio que no es el que dice el titular es justo el fallo
      que se quiere evitar.
    */
    if (zona && zona.municipalitySlug === municipalitySlug) {
      return { lat: zona.lat, lon: zona.lon };
    }

    const municipio = MUNICIPALITY_BY_SLUG.get(municipalitySlug);
    if (municipio) return { lat: municipio.lat, lon: municipio.lon };
  }

  // Sin municipio no hay punto. No se inventa uno de reserva.
  return null;
}

/**
 * Punto aproximado para guardar en la noticia. Es el de referencia con el
 * desplazamiento de privacidad.
 */
export function puntoAproximado(
  municipalitySlug: string | null | undefined,
  zoneSlug: string | null | undefined,
): PuntoAproximado {
  const ref = puntoDeReferencia(municipalitySlug, zoneSlug);
  return ref ? desplazaPunto(ref) : null;
}

/** Distancia en kilometros entre dos puntos. Para comprobar que un pin cuadra. */
export function distanciaKm(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/**
 * Un pin es valido si esta a menos de este radio del punto de referencia de lo
 * que dice ser. El desplazamiento de privacidad son 900 m, asi que 1,2 km deja
 * margen de sobra; a partir de ahi el marcador esta en otro sitio.
 */
export const RADIO_MAXIMO_KM = 1.2;

/** Si el pin guardado concuerda con el municipio y la zona que se muestran. */
export function pinCuadra(
  pin: { lat: number; lon: number },
  municipalitySlug: string | null | undefined,
  zoneSlug: string | null | undefined,
): boolean {
  const ref = puntoDeReferencia(municipalitySlug, zoneSlug);
  if (!ref) return false;
  return distanciaKm(pin, ref) <= RADIO_MAXIMO_KM;
}