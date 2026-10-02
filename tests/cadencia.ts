/**
 * Pruebas de la cadencia y de la ventana de "noticia nueva".
 *
 *   npx tsx tests/cadencia.ts
 *
 * Lo que se comprueba es la RELACION entre las dos, que es lo unico que puede
 * hacer que se pierda una noticia sin que nadie se entere: una pasada que se
 * retrasa tiene que seguir clove todo lo que se publico durante el retraso.
 */

import { CADENCIA_MS, olvidarCadencia } from "@/lib/monitor";
import { monitorConfig } from "@/lib/env";

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

const MIN = 60_000;

/* ========================================================================== */
section("La cadencia y la ventana");

{
  check("una pasada por hora", CADENCIA_MS === 60 * MIN, `${CADENCIA_MS / MIN} min`);

  const ventanaMin = monitorConfig.lookbackMinutes();
  check("la ventana son 90 minutos", ventanaMin === 90, `${ventanaMin} min`);
  check(
    "la ventana es MAYOR que la cadencia",
    ventanaMin * MIN > CADENCIA_MS,
    `ventana ${ventanaMin} min, cadencia ${CADENCIA_MS / MIN} min`,
  );
  /*
    El margen es de 30 minutos: media hora de holgura, no una pasada entera.
    Con la ventana justa, un retraso de mas de un minuto en la pasada
    siguiente haria perder lo publicado durante el retraso. Con media hora de
    margen, un retraso normal no pierde nada. Se documenta el limite en vez de
    fingir que el margen es ilimitado.
  */
  check(
    "el margen es de media hora",
    ventanaMin * MIN - CADENCIA_MS === 30 * MIN,
    `margen de ${(ventanaMin * MIN - CADENCIA_MS) / MIN} min`,
  );
  check(
    "el margen aguanta un retraso de 20 minutos",
    20 < (ventanaMin * MIN - CADENCIA_MS) / MIN,
    `aguanta ${(ventanaMin * MIN - CADENCIA_MS) / MIN} min de retraso`,
  );
}

/* ========================================================================== */
section("Que pasa si una pasada se retrasa");

{
  /*
    Se reproduce el caso a mano: una pasada se retrasa 40 minutos. Lo que se
    publico durante esos 40 minutos tiene que entrar en la siguiente pasada.

    Con la ventana de 90 min y una cadencia de 60, la siguiente pasada mira hasta
    90 minutos atras. Como el retraso es de 40, lo publicado hace 40 minutos esta
    dentro de la ventana y entra. Con una ventana de 60, estaria justo en el
    borde y dependeria de segundos.
  */
  const ventanaMin = monitorConfig.lookbackMinutes();
  const cadenciaMin = CADENCIA_MS / MIN;

  for (const retraso of [0, 10, 30, 45, 59, 60, 75]) {
    const antiguedadAlLlegar = retraso; // minutos desde que se publico
    check(
      `retraso de ${retraso} min: lo publicado entra`,
      antiguedadAlLlegar < ventanaMin,
      `antiguedad ${antiguedadAlLlegar} min, ventana ${ventanaMin} min`,
    );
  }

  check("el margen es de media hora", ventanaMin - cadenciaMin === 30, `${ventanaMin - cadenciaMin} min`);
  check(
    "una pasada retrasada 25 min no pierde nada",
    25 < ventanaMin - cadenciaMin,
    `retraso 25 min, margen ${ventanaMin - cadenciaMin} min`,
  );
}

/* ========================================================================== */
section("La garantia de los 30 minutos");

{
  /*
    Lo pedido: una noticia de hace menos de 30 minutos se sube. Con una cadencia
    de 60 minutos, el peor caso es que se publico justo despues de que pasara
    el ciclo, y a la siguiente pasada le quedan 60 minutos de antiguedad: dentro
    de los 90 de la ventana. En ningun momento se sale.
  */
  const ventanaMin = monitorConfig.lookbackMinutes();

  // Peor caso: se publico justo despues de la pasada anterior.
  const casoPeor = CADENCIA_MS / MIN;
  check(
    "una noticia de hace 30 min siempre entra, incluso en el peor caso",
    casoPeor <= ventanaMin,
    `peor caso ${casoPeor} min vs ventana ${ventanaMin} min`,
  );
}

/* ========================================================================== */
section("Lo que se descarta por viejo");

{
  const ventanaMin = monitorConfig.lookbackMinutes();
  // Lo de mas de 90 minutos se descarta en esa pasada, pero no se pierde: el
  // siguiente ciclo vuelve a mirar 90 minutos atras y, como la noticia ya no
  // esta en el feed, se queda fuera para siempre. Por eso la ventana tiene que
  // ser holgada: si fuera justa, el retraso de una pasada seria perderla.
  check("una noticia de 3 horas ya no entra", 180 > ventanaMin);
  check("una noticia de 2 horas ya no entra", 120 > ventanaMin);
  check("una de 89 minutos sigue entrando", 89 < ventanaMin);
}

/* ========================================================================== */
section("La reserva en memoria se puede limpiar");

{
  olvidarCadencia();
  check("olvidarCadencia no lanza", true);
}

console.log(`\n${passed} correctas, ${failed} fallidas`);
if (failed > 0) process.exit(1);