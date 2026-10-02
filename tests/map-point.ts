/**
 * Pruebas del punto del mapa.
 *
 *   npx tsx tests/map-point.ts
 *
 * ---------------------------------------------------------------------------
 *  POR QUE ESTO SE COMPRUEBA
 * ---------------------------------------------------------------------------
 *
 * Un marcador en el sitio equivocado no sale un error: sale en la pagina. El
 * visitante ve un punto y al lado el nombre del municipio, y si no cuadran no
 * hay forma de saber cual de los dos miente. Ya ha pasado: un articulo marcado
 * como Arrecife aparecia a 60 km, en el norte de la isla, porque sin municipio se
 * usaba un punto de reserva inventado.
 *
 * Asi que se comprueban las tres cosas que pueden fallar: que el punto este
 * donde toca, que no se invente cuando no se sabe, y que el desplazamiento de
 * privacidad siga谛en lo que era.
 */

import {
  RADIO_MAXIMO_KM,
  distanciaKm,
  desplazaPunto,
  pinCuadra,
  puntoAproximado,
  puntoDeReferencia,
} from "@/lib/map-point";
import { MUNICIPALITY_BY_SLUG, ZONE_BY_SLUG } from "@/lib/constants";

let passed = 0;
let failed = 0;

function check(name: string, condition: boolean, detail?: string) {
  if (condition) {
    passed++;
    console.log(`  ok    ${name}`);
  } else {
    failed++;
    console.log(`  FALLA ${name}${detail ? ` -> ${detail}` : ""}`);
  }
}

function section(title: string) {
  console.log(`\n${title}`);
}

/* ========================================================================== */
section("Sin municipio no hay punto: no se inventa");

{
  check("sin municipio no hay punto", puntoAproximado(null, null) === null);
  check("ni con municipio vacio", puntoAproximado("", null) === null);
  check("ni con municipio inexistente", puntoAproximado("no-existe", null) === null);

  // El caso que Provoco el fallo: zona sin municipio tampoco, porque la zona siempre
  // pertenece a uno y sin el no se puede comprobar que la noticia sea de aqui.
  check("zona sin municipio tampoco da punto", puntoAproximado(null, "costa-teguise") === null);

  // Y el antiguo punto de reserva (29.0, -13.63) no puede aparecer por ningun lado.
  const p = puntoAproximado(null, null);
  check("no sale el punto de reserva inventado", p === null, JSON.stringify(p));
}

/* ========================================================================== */
section("El punto cae donde tiene que caer");

{
  // Todos los municipios: el pin esta cerca del casco urbano.
  for (const m of MUNICIPALITY_BY_SLUG.values()) {
    const ref = puntoDeReferencia(m.slug, null);
    if (!ref) { check(`${m.name} tiene punto`, false); continue; }

    let peor = 0;
    for (let i = 0; i < 60; i++) {
      const pin = puntoAproximado(m.slug, null);
      if (!pin) { check(`${m.name} devuelve punto`, false); break; }
      peor = Math.max(peor, distanciaKm(pin, ref));
    }
    check(
      `${m.name}: el pin nunca se aleja mas de ${RADIO_MAXIMO_KM} km`,
      peor <= RADIO_MAXIMO_KM,
      `peor caso ${peor.toFixed(3)} km`,
    );
  }
}

{
  // Con zona, el pin va a la zona y no al municipio. Es el fallo que decia que
  // Costa Teguise se colocaba en el pueblo de Teguise, a cuatro kilometros.
  const zona = ZONE_BY_SLUG.get("costa-teguise");
  const municipio = MUNICIPALITY_BY_SLUG.get("teguise");
  if (!zona || !municipio) throw new Error("faltan los datos de Teguise");

  const refZona = puntoDeReferencia("teguise", "costa-teguise");
  check("con zona, la referencia es la zona", refZona !== null);
  check(
    "y no el municipio",
    refZona !== null && Math.abs(refZona.lat - zona.lat) < 0.0001 && Math.abs(refZona.lon - zona.lon) < 0.0001,
    `ref=${JSON.stringify(refZona)} zona=${zona.lat},${zona.lon} municipio=${municipio.lat},${municipio.lon}`,
  );

  let peor = 0;
  for (let i = 0; i < 60; i++) {
    const pin = puntoAproximado("teguise", "costa-teguise");
    if (pin && refZona) peor = Math.max(peor, distanciaKm(pin, refZona));
  }
  check("el pin con zona cae en la zona", peor <= RADIO_MAXIMO_KM, `peor caso ${peor.toFixed(3)} km`);

  // Y separado del municipio: si coincidieran, la zona no estaria sirviendo.
  check(
    "y el pin de la zona NO cae en el pueblo del municipio",
    refZona ? distanciaKm(refZona, { lat: municipio.lat, lon: municipio.lon }) > 1 : false,
  );
}

{
  // Una zona que no pertenece al municipio se descarta y cae al municipio. Puede
  // pasar si el editor cambia el municipio despues de elegir la zona.
  const pin = puntoDeReferencia("yaiza", "costa-teguise");
  const yaiza = MUNICIPALITY_BY_SLUG.get("yaiza");
  check(
    "zona de otro municipio: se usa el municipio pedido",
    pin !== null && yaiza !== null && Math.abs(pin.lat - yaiza.lat) < 0.0001,
    JSON.stringify(pin),
  );
}

/* ========================================================================== */
section("El desplazamiento de privacidad se mantiene");

{
  /*
    El desplazamiento va de 400 a 900 metros a proposito: un accidente puede tener
    heridos que identificar y el marcador no puede ser el punto exacto. Si esto
    se toca sin querer, se esta publicando la ubicacion de un accidente.
  */
  const base = { lat: 28.7, lon: -13.6 };
  const distancias: number[] = [];

  for (let i = 0; i < 300; i++) {
    distancias.push(distanciaKm(desplazaPunto(base), base) * 1000);
  }

  const min = Math.min(...distancias);
  const max = Math.max(...distancias);

  check("nunca menos de 400 m", min >= 395, `minimo ${min.toFixed(0)} m`);
  check("nunca mas de 900 m", max <= 905, `maximo ${max.toFixed(0)} m`);
  check("se mueve de verdad", max - min > 300, `rango ${(min).toFixed(0)}-${max.toFixed(0)} m`);
  check("la media esta en el centro del rango", (min + max) / 2 > 600 && (min + max) / 2 < 700, `media ${((min + max) / 2).toFixed(0)} m`);
}

/* ========================================================================== */
section("pinCuadra detecta los marcadores que mienten");

{
  // El caso real: Arrecife en el sur, pin al norte de la isla.
  const pinMalo = { lat: 29.0064, lon: -13.6258 };
  const arrecifeRef = MUNICIPALITY_BY_SLUG.get("arrecife")!;

  check(
    "el pin que estaba en el norte no cuadra con Arrecife",
    !pinCuadra(pinMalo, "arrecife", null),
    `distancia ${distanciaKm(pinMalo, { lat: arrecifeRef.lat, lon: arrecifeRef.lon }).toFixed(1)} km`,
  );

  // Y uno bien puesto si cuadra.
  const bueno = puntoAproximado("arrecife", null);
  check("un pin recien calculado si cuadra", bueno !== null && pinCuadra(bueno, "arrecife", null));

  // Un pin sin municipio al que compararse tampoco "cuadra": no se puede
  // afirmar que este bien, asi que no se da por bueno.
  check("sin municipio, pinCuadra dice que no", bueno !== null && !pinCuadra(bueno, null, null));
}

console.log(`\n${passed} correctas, ${failed} fallidas`);
if (failed > 0) process.exit(1);