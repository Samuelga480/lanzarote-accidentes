/**
 * Comprueba que NINGUN marcador guardado en la base de datos cae en el mar.
 *
 * ---------------------------------------------------------------------------
 *  PARA QUE
 * ---------------------------------------------------------------------------
 *
 * Las pruebas de map-point.ts comprueban que el desplazamiento funciona bien. Esta
 * comprueba lo que ya esta escrito: los pines que hay guardados ahora mismo.
 *
 * Son dos cosas distintas y hacen falta las dos. Que la funcion este bien no
 * dice nada de los datos que se guardaron con una version anterior que hacia el
 * desplazamiento a ciegas, y eso es justo lo que paso.
 *
 * Sale con codigo 1 si hay algun marcador en el agua, para poder usarlo en un
 * chequeo automatico.
 */

import { PrismaClient } from "@prisma/client";
import { esTierra, metrosAlBorde, dentroDeLaIsla } from "@/lib/tierra";

async function main() {
  const prisma = new PrismaClient();

  const lista = await prisma.accident.findMany({
    select: {
      id: true,
      title: true,
      status: true,
      approxLat: true,
      approxLon: true,
      municipality: { select: { name: true } },
    },
    orderBy: { occurredAt: "desc" },
  });

  let enElMar = 0;
  let sinPin = 0;
  let pegados = 0;

  console.log(`\n  Marcadores guardados: ${lista.length}\n`);

  for (const a of lista) {
    const etiqueta = `${a.title.slice(0, 44).padEnd(46)} ${a.status.padEnd(9)} ${a.municipality.name}`;

    if (a.approxLat === null || a.approxLon === null) {
      sinPin++;
      console.log(`  sin pin  ${etiqueta}`);
      continue;
    }

    const dentro = dentroDeLaIsla(a.approxLat, a.approxLon);
    const borde = metrosAlBorde(a.approxLat, a.approxLon);

    if (!esTierra(a.approxLat, a.approxLon)) {
      enElMar++;
      console.log(`  EN EL MAR ${etiqueta} ${a.approxLat.toFixed(4)}, ${a.approxLon.toFixed(4)}`);
    } else if (borde < 50) {
      pegados++;
      console.log(`  al borde ${etiqueta} a ${Math.round(borde)} m de la costa`);
    } else {
      console.log(`  ok       ${etiqueta} a ${Math.round(borde)} m de la costa${dentro ? "" : " (dentro del margen)"}`);
    }
  }

  console.log(`\n  En el mar: ${enElMar}   Sin pin: ${sinPin}   Al borde: ${pegados}\n`);

  await prisma.$disconnect();

  if (enElMar > 0) {
    console.log("  Hay marcadores en el agua.\n");
    process.exit(1);
  }
  console.log("  Ningun marcador esta en el agua.\n");
}

main();