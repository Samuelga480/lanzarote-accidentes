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
import { sitioSeguro } from "@/lib/tierra";

export type PuntoAproximado = { lat: number; lon: number } | null;

/**
 * Desplaza un punto entre 400 y 900 metros, para no dar el punto exacto.
 *
 * ---------------------------------------------------------------------------
 *  EL DESPLAZAMIENTO NO ES A CIEGAS
 * ---------------------------------------------------------------------------
 *
 * Antes tiraba un radio al azar y aceptaba lo que saliera. En un pueblo del
 * interior eso no pasa nada, pero en la costa un empuje de 900 metros cae en el
 * agua: Arrecife, Costa Teguise, Puerto del Carmen, Playa Blanca, El Golfo y
 * Playa Quemada estan todos pegados al mar. El mapa acababa poniendo el punto en
 * el oceano, que es peor que no ponerlo, porque el lector deduce una ubicacion
 * que nadie ha dicho.
 *
 * Ahora se prueban varios desplazamientos y se queda con el primero que cae en
 * tierra. Si a 400-900 metros no hay ninguno, se prueba con menos radio. El
 * desplazamiento sigue siendo aleatorio y de cientos de metros, asi que la
 * privacidad del accidente no se ve afectada.
 *
 * Si ni asi se encuentra, no se inventa: se devuelve null y no se coloca
 * marcador.
 */
export function desplazaPunto(punto: { lat: number; lon: number }): { lat: number; lon: number } | null {
  const probar = (min: number, max: number) => {
    const radioM = min + Math.random() * (max - min);
    const angulo = Math.random() * 2 * Math.PI;
    const dLat = (radioM * Math.cos(angulo)) / 111_320;
    const dLon = (radioM * Math.sin(angulo)) / (111_320 * Math.cos((punto.lat * Math.PI) / 180));
    return { lat: punto.lat + dLat, lon: punto.lon + dLon };
  };

  // Radio normal de privacidad: 400-900 metros.
  for (let i = 0; i < 60; i++) {
    const c = probar(400, 900);
    if (sitioSeguro(c.lat, c.lon)) return c;
  }

  // reductions: la referencia esta pegada a la costa y no cabe el empuje entero.
  for (let i = 0; i < 60; i++) {
    const c = probar(120, 400);
    if (sitioSeguro(c.lat, c.lon)) return c;
  }

  // Ultimo recurso: el punto sin desplazar, y solo si es tierra de verdad.
  if (sitioSeguro(punto.lat, punto.lon)) {
    return { lat: punto.lat, lon: punto.lon };
  }

  return null;
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
 *
 * Si el desplazamiento no encuentra ningun sitio en tierra, `desplazaPunto`
 * devuelve null y aqui no hay punto. Es la decision correcta: un accidente en
 * Arrecife sin pinpoint es mejor que un accidente en Arrecife dibujado en el
 * mar.
 */
export function puntoAproximado(
  municipalitySlug: string | null | undefined,
  zoneSlug: string | null | undefined,
): PuntoAproximado {
  const ref = puntoDeReferencia(municipalitySlug, zoneSlug);
  if (!ref) return null;
  return desplazaPunto(ref);
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