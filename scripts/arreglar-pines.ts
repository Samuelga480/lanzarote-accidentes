/**
 * Revisa y corrige los marcadores ya guardados.
 *
 *   npx tsx scripts/arreglar-pines.ts
 *
 * ---------------------------------------------------------------------------
 *  QUE HACE
 * ---------------------------------------------------------------------------
 *
 * El marcador de una noticia se guarda desplazado 400-900 metros del punto de
 * referencia (la zona si se sabe, el municipio si no), y a proposito: un accidente
 * puede tener heridos que identificar y el punto exacto no se publica.
 *
 * Con eso corregido, hay noticias antigas con el marcador en un sitio que no
 * corresponde: se coloco un punto de reserva inventado (29.0, -13.63) cuando no
 * se detectaba municipio, asi que una noticia archivada como Arrecife -que esta
 * en el sur- tenia el pin en el norte, a 60 km.
 *
 * Aqui se revisa una por una:
 *
 *   - Si el pin no cuadra con su municipio o su zona, se recalcula desde cero.
 *   - Si no se sabe el municipio, se borra el pin. Sin municipio no hay sitio
 *     donde colocar nada, y el mapa ya sabe esconder las noticias sin pinpoint.
 *
 * Por defecto solo revisa y dice. Hay que pasar `--arreglar` para escribir.
 */

import { prisma } from "@/lib/prisma";
import {
  RADIO_MAXIMO_KM,
  distanciaKm,
  puntoDeReferencia,
  puntoAproximado,
} from "@/lib/map-point";
import { MUNICIPALITY_BY_SLUG, ZONE_BY_SLUG } from "@/lib/constants";

const ARREGLAR = process.argv.includes("--arreglar");

async function main() {
  const lista = await prisma.accident.findMany({
    orderBy: { occurredAt: "desc" },
    select: {
      id: true,
      slug: true,
      title: true,
      status: true,
      zone: true,
      approxLat: true,
      approxLon: true,
      municipality: { select: { slug: true, name: true, lat: true, lon: true } },
    },
  });

  console.log(`\n  Noticias: ${lista.length}${ARREGLAR ? " (escribiendo)" : " (solo informe)"}\n`);

  let bien = 0;
  let arreglados = 0;
  let quitados = 0;

  for (const a of lista) {
    const zona = a.zone ? ZONE_BY_SLUG.get(a.zone) : undefined;
    const ref = puntoDeReferencia(a.municipality.slug, a.zone);

    // Sin punto de referencia no se puede saber donde deberia estar.
    if (!ref) {
      if (a.approxLat !== null || a.approxLon !== null) {
        console.log(`  ? ${a.title.slice(0, 58)}`);
        console.log(`      sin municipio ni zona en los datos, pero tiene pin: ${a.approxLat}, ${a.approxLon}`);
        if (ARREGLAR) {
          await prisma.accident.update({ where: { id: a.id }, data: { approxLat: null, approxLon: null } });
          quitados++;
          console.log(`      -> pin quitado`);
        }
      } else {
        bien++;
      }
      continue;
    }

    const pin = a.approxLat !== null && a.approxLon !== null ? { lat: a.approxLat, lon: a.approxLon } : null;
    const refNombre = zona ? `${zona.name} (${a.municipality.name})` : a.municipality.name;

    if (!pin) {
      bien++;
      console.log(`  - ${a.title.slice(0, 58)}`);
      console.log(`      sin pin, y sin municipio o zona: no se coloca`);
      continue;
    }

    const d = distanciaKm(pin, ref);
    const estado = d <= RADIO_MAXIMO_KM ? "ok" : "MAL";

    console.log(`  ${estado === "ok" ? "·" : "x"} ${a.title.slice(0, 58)}`);
    console.log(`      ${refNombre}`);
    console.log(`      pin ${pin.lat.toFixed(4)}, ${pin.lon.toFixed(4)} -> a ${d.toFixed(2)} km`);

    if (estado === "ok") {
      bien++;
      continue;
    }

    const nuevo = puntoAproximado(a.municipality.slug, a.zone);
    if (ARREGLAR && nuevo) {
      await prisma.accident.update({ where: { id: a.id }, data: { approxLat: nuevo.lat, approxLon: nuevo.lon } });
      const d2 = distanciaKm(nuevo, ref);
      console.log(`      -> recolocado a ${d2.toFixed(2)} km de ${refNombre}`);
      arreglados++;
    } else {
      console.log(`      -> fuera de rango (max ${RADIO_MAXIMO_KM} km)`);
    }
  }

  console.log(`\n  correctos: ${bien} | recolocados: ${arreglados} | pins quitados: ${quitados}`);
  if (!ARREGLAR && (arreglados > 0 || quitados > 0)) {
    console.log("  Relanza con --arreglar para escribir los cambios.");
  }

  await prisma.$disconnect();
}

main()
  .catch((e) => {
    console.error("Error:", String(e).split("\n")[0]);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());