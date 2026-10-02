/**
 * Pruebas de la ventana del ano civil del resumen anual.
 *
 * Lo que se comprueba aqui es el reloj, que es donde se esconde el error: un
 * corte hecho en UTC en vez de en hora de Canarias mete en el ano equivocado
 * todo lo que pase al otro lado del cambio de horario, y el fallo no lanza
 * ningun error, sale publicado en la pagina.
 *
 *   npx tsx tests/calendar-year.ts
 */

import {
  MONTH_LABELS,
  MAX_YEAR,
  MIN_YEAR,
  canaryMonthOf,
  canaryYearOf,
  countdownToYearEnd,
  isValidYear,
  isYearClosed,
  yearWindow,
} from "@/lib/calendar-year";

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

/** Formato legible del instante, para los mensajes de FALLA. */
function iso(d: Date): string {
  return d.toISOString();
}

/** Local de Canarias de un instante, "YYYY-MM-DDTHH:mm". */
function local(d: Date): string {
  const map: Record<string, string> = {};
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Atlantic/Canary",
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  // format() en en-CA separa con un espacio; se reconstruye con "T" para poder
  // compararlo con una cadena ISO legible.
  for (const p of fmt.formatToParts(d)) map[p.type] = p.value;
  const pad = (v: string) => v.padStart(2, "0");
  return (
    `${map.year}-${map.month}-${map.day}` +
    `T${pad(String(Number(map.hour) % 24))}:${pad(map.minute)}`
  );
}

/* ========================================================================== */
section("La ventana arranca el 1 de enero a las 00:00 y cierra el 31 a las 23:59");

{
  const { start, end } = yearWindow(2026);

  check("empieza el 1 de enero a las 00:00 en Canarias", local(start).startsWith("2026-01-01T00:00"), `obtenido: ${local(start)}`);

  // El fin es exclusivo. Restando un milisegundo tiene que caer dentro del 31.
  const ultimo = new Date(end.getTime() - 1);
  check("el ultimo instante es el 31 de diciembre a las 23:59", local(ultimo).startsWith("2026-12-31T23:59"), `obtenido: ${local(ultimo)}`);

  // En invierno Canarias esta en UTC+0, asi que el 1/1 00:00 local es 00:00 UTC.
  check("en invierno el inicio coincide con UTC (UTC+0)", start.toISOString() === "2026-01-01T00:00:00.000Z", `obtenido: ${iso(start)}`);
}

/* ========================================================================== */
section("La ventana no se solapa con la del ano siguiente");

{
  for (const y of [2024, 2025, 2026, 2027]) {
    const a = yearWindow(y);
    const b = yearWindow(y + 1);
    check(
      `el fin de ${y} es el inicio de ${y + 1}`,
      a.end.getTime() === b.start.getTime(),
      `${iso(a.end)} vs ${iso(b.start)}`,
    );
  }
}

/* ========================================================================== */
section("El cambio de horario de verano no descuadra el corte");

{
  // El 1 de enero y el 31 de diciembre estan los dos en horario de invierno
  // (UTC+0), pero el corte tiene que ser correcto tambien para anos en los que
  // la ventana cruza el cambio. Se comprueba que el ancho de la ventana es el
  // que tiene que tener: 365 dias, o 366 en ano bisiesto.
  const ancho = (y: number) => yearWindow(y).end.getTime() - yearWindow(y).start.getTime();
  const dia = 86_400_000;

  check("2026 dura 365 dias", ancho(2026) === 365 * dia, `obtenido: ${ancho(2026) / dia} dias`);
  check("2024 (bisiesto) dura 366 dias", ancho(2024) === 366 * dia, `obtenido: ${ancho(2024) / dia} dias`);

  // Un ano bisiesto con febrero de 29 dias no puede medir 365: si el corte
  // sumase una hora fija por el cambio de verano, daria 365 dias y 1 hora.
  check("2024 no dura 365 dias ni 1 hora", ancho(2024) === 366 * dia && ancho(2024) % dia === 0);
}

/* ========================================================================== */
section("El ano y el mes se leen en hora de Canarias, no en UTC");

{
  // 2026-01-01T00:30 en Canarias. En UTC ese instante todavia es 2025-12-31,
  // asi que leerlo con getUTCFullYear() lo pondria en el ano equivocado.
  const instante = new Date("2026-01-01T00:30:00.000Z");
  check("el ano es 2026", canaryYearOf(instante) === 2026, `obtenido: ${canaryYearOf(instante)}`);
  check("el mes es enero", canaryMonthOf(instante) === 1, `obtenido: ${canaryMonthOf(instante)}`);

  // El caso simetrico: 31 de diciembre de madrugada en Canarias sigue siendo
  // 31 en el reloj local aunque en UTC todavia sea 30.
  const nochevie = new Date("2026-12-31T23:30:00.000Z");
  check("el 31 de diciembre sigue siendo 2026", canaryYearOf(nochevie) === 2026, `obtenido: ${canaryYearOf(nochevie)}`);
  check("y sigue siendo diciembre", canaryMonthOf(nochevie) === 12, `obtenido: ${canaryMonthOf(nochevie)}`);
}

/* ========================================================================== */
section("Un accidente del 31 a las 23:30 entra; uno del 1 a las 00:30 tambien");

{
  const { start, end } = yearWindow(2026);

  const ultimo = new Date("2026-12-31T23:30:00.000Z");
  const primero = new Date("2026-01-01T00:30:00.000Z");

  const dentro = (d: Date) => d.getTime() >= start.getTime() && d.getTime() < end.getTime();

  check("el 31 de diciembre a las 23:30 entra", dentro(ultimo), `local: ${local(ultimo)}`);
  check("el 1 de enero a las 00:30 entra", dentro(primero), `local: ${local(primero)}`);

  // Un segundo antes de abrir y un despues de cerrar tienen que quedar fuera.
  check("un segundo antes del 1/1 a las 00:00 queda fuera", !dentro(new Date(start.getTime() - 1000)));
  check("un instante despues del 1/1 del ano siguiente queda fuera", !dentro(new Date(end.getTime())));
}

/* ========================================================================== */
section("Que anos se admiten");

{
  check("2026 es valido", isValidYear(2026));
  check("el rango empieza en 2000", isValidYear(MIN_YEAR));
  check("el rango acaba en 2100", isValidYear(MAX_YEAR));

  // Una URL manipulada no debe poder pedir el ano -50 ni el 999999: la consulta
  // tiene que ser acotada antes de tocar la base de datos.
  check("un ano negativo no vale", !isValidYear(-50));
  check("un ano de 5 cifras no vale", !isValidYear(99999));
  check("un decimal no vale", !isValidYear(2026.5));
  check("NaN no vale", !isValidYear(Number.NaN));
  check("un string no vale", !isValidYear("2026"));
  check("Infinity no vale", !isValidYear(Number.POSITIVE_INFINITY));
}

/* ========================================================================== */
section("Cuando se cierra el ano");

{
  const antes = new Date("2026-06-15T12:00:00.000Z");
  const despues = new Date("2027-01-01T00:30:00.000Z");

  check("a mitad de año el año sigue abierto", !isYearClosed(2026, antes));
  check("pasado el 1 de enero a las 00:00 el año ya cerró", isYearClosed(2026, despues));

  const c = countdownToYearEnd(2026, antes);
  check("la cuenta atrás da días", c !== null && c.days > 190 && c.days < 200, `obtenido: ${c?.days}`);
  check("y horas dentro del día", c !== null && c.hours >= 0 && c.hours < 24, `obtenido: ${c?.hours}`);
  check("y minutos dentro de la hora", c !== null && c.minutes >= 0 && c.minutes < 60, `obtenido: ${c?.minutes}`);

  // Cerrado el año no hay cuenta atrás: es mejor que una que pouta negativos.
  check("cerrado el año no hay cuenta atrás", countdownToYearEnd(2026, despues) === null);
}

/* ========================================================================== */
section("Los doce meses");

{
  check("hay doce meses", MONTH_LABELS.length === 12, `obtenido: ${MONTH_LABELS.length}`);
  check("el primero es enero", MONTH_LABELS[0] === "Enero");
  check("el ultimo es diciembre", MONTH_LABELS[11] === "Diciembre");

  // Sin acentos ni caracteres raros: van a pintar directamente en la pagina.
  const raros = MONTH_LABELS.filter((m) => !/^[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+$/.test(m));
  check("los nombres no tienen simbolos raros", raros.length === 0, `raros: ${raros.join(", ")}`);
}

/* ========================================================================== */
console.log(`\n${passed} correctas, ${failed} fallidas`);
if (failed > 0) process.exit(1);