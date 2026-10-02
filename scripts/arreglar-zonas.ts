/**
 * Limpia las noticias que apuntan a zonas que ya no existen y recalcula el pin.
 *
 * ---------------------------------------------------------------------------
 *  POR QUE HACE FALTA
 * ---------------------------------------------------------------------------
 *
 * La lista de zonas se ha sustituido entera por la que dio el editor. Las
 * noticias que ya estaban guardadas se quedaron con slugs que ya no existen, y
 * hay tres formas de estar mal que hay que resolver por separado:
 *
 *   1. La zona no existe en la tabla nueva. Se borra (queda sin zona) en vez de
 *      inventar una equivalencia: "puerto-de-naos" y "las-canteras" no tienen
 *      sitio equivalente en la lista nueva, y darle un destino equivocado es
 *      peor que no tener zona.
 *
 *   2. La zona existe pero pertenece a OTRO municipio. Se borra tambien. Es el
 *      caso de "san-bartolome", que antes era una localidad de Haria y ahora es
 *      municipio. Si se dejara, el pin se calcularia con una zona de un sitio y
 *      el titular diria otro.
 *
 *   3. La zona es valida. Se deja.
 *
 * Despues recalcula el pin de todas las noticias con `puntoAproximado`, que es
 * el unico sitio que decide donde va. Antes los pines se habian calculado con
 * unas coordenadas que estaban 30-55 km al sur, dos de ellas en el mar.
 *
 * Por defecto solo informa. Hay que pasar `--aplicar` para escribir.
 */

import { PrismaClient } from "@prisma/client";
import { ZONE_BY_SLUG } from "../src/lib/constants";
import { puntoAproximado, distanciaKm } from "../src/lib/map-point";

const APLICAR = process.argv.includes("--aplicar");

async function main() {
  const prisma = new PrismaClient();

  console.log(`\n  Zonas y pines: ${APLICAR ? "ESCRIBIENDO" : "solo informe"}\n`);

  const lista = await prisma.accident.findMany({
    select: {
      id: true,
      title: true,
      zone: true,
      status: true,
      approxLat: true,
      approxLon: true,
      municipality: { select: { slug: true, name: true } },
    },
    orderBy: { occurredAt: "desc" },
  });

  let zonasArregladas = 0;
  let pinesRecalculados = 0;

  for (const a of lista) {
    const municipio = a.municipality;
    const zona = a.zone ? ZONE_BY_SLUG.get(a.zone) : undefined;
    let problemaZona: string | null = null;

    if (a.zone && !zona) {
      problemaZona = `la zona "${a.zone}" ya no existe`;
    } else if (zona && zona.municipalitySlug !== municipio.slug) {
      problemaZona = `la zona "${a.zone}" es de ${zona.municipalitySlug}, no de ${municipio.slug}`;
    }

    const pinViejo = a.approxLat !== null && a.approxLon !== null ? { lat: a.approxLat, lon: a.approxLon } : null;
    const nuevo = puntoAproximado(municipio.slug, problemaZona ? null : a.zone);

    let movido = 0;
    if (pinViejo && nuevo) movido = distanciaKm(pinViejo, nuevo);
    else if (pinViejo && !nuevo) movido = Infinity;

    console.log(`  ${a.title.slice(0, 56)}`);
    console.log(`      ${municipio.name} · zona: ${a.zone ?? "(ninguna)"} · ${a.status}`);
    if (problemaZona) console.log(`      ! ${problemaZona}: se deja sin zona`);

    const datos: Record<string, unknown> = {};
    if (problemaZona && a.zone) datos.zone = null;
    if (!nuevo) {
      if (a.approxLat !== null || a.approxLon !== null) {
        datos.approxLat = null;
        datos.approxLon = null;
      }
      if (pinViejo) console.log(`      ! el pin queda eliminado: no hay punto fiable`);
    } else if (!pinViejo || movido > 0.5) {
      datos.approxLat = nuevo.lat;
      datos.approxLon = nuevo.lon;
      console.log(
        `      pin: ${pinViejo ? pinViejo.lat.toFixed(4) + ", " + pinViejo.lon.toFixed(4) : "(ninguno)"}` +
          `  ->  ${nuevo.lat.toFixed(4)}, ${nuevo.lon.toFixed(4)}` +
          (pinViejo ? `   (se mueve ${movido.toFixed(1)} km)` : ""),
      );
    }

    if (problemaZona) zonasArregladas++;
    if (datos.approxLat !== undefined) pinesRecalculados++;

    if (APLICAR && Object.keys(datos).length > 0) {
      await prisma.accident.update({ where: { id: a.id }, data: datos });
      console.log(`      escrito: ${Object.keys(datos).join(", ")}`);
    }
    console.log("");
  }

  console.log(`  Noticias: ${lista.length}`);
  console.log(`  zonas a corregir: ${zonasArregladas}`);
  console.log(`  pines a recalcular: ${pinesRecalculados}\n`);

  if (!APLICAR) console.log("  Nada escrito. Repite con --aplicar.\n");
  else console.log("  Hecho.\n");

  await prisma.$disconnect();
}

main();
