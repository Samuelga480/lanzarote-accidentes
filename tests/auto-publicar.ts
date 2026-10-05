/**
 * La puerta de publicacion automatica.
 *
 *   npx tsx tests/auto-publicar.ts
 *
 * ---------------------------------------------------------------------------
 *  POR QUE ESTA PROBADA CON TANTO DENTRADO
 * ---------------------------------------------------------------------------
 *
 * `decidirAutoPublicacion` decide si una noticia aparece en un medio de sucesos
 * reales sin que nadie la lea. Un fallo aqui no se ve en un test funcional: se ve
 * semanas despues, en la noticia que se publico sola y no debia. Por eso lo que
 * se comprueba no es que "funcione", sino que RECHARSE cuando tiene que rechazarse.
 *
 * Cada criterio se prueba por separado (y solo se rompe uno), porque un unico
 * caso "todo bien" no diria que ninguno de los diez criterios funciona. Y se
 * comprueba tambien que el motivo que devuelve es utilizable: un "no" sin
 * explicación deja al editor sin saber que mirar.
 *
 * No necesita base de datos ni red: la funcion es pura.
 */

import {
  decidirAutoPublicacion,
  palabras,
  type CandidatoAutoPublicable,
} from "@/lib/auto-publicar";
// Se importa estatico, no con `await import` dentro del escenario: `tsx`
// compila esto como CommonJS (package.json no declara "type": "module") y ahi el
// await de nivel superior no existe. No pierde lectura tardia de las variables:
// `autoPublishConfig` las consulta cuando se llama, no al cargar el modulo.
import { autoPublishConfig } from "@/lib/env";

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

/** Un borrador que pasa todos los criterios. Cada test parte de este. */
function bueno(): CandidatoAutoPublicable {
  return {
    verificationStatus: "VERIFIED",
    confidenceScore: 0.91,
    sourceScore: 0.78,
    rewritten: true,
    palabrasCuerpo: 320,
    municipioConocido: true,
    esDuplicada: false,
    horasAntiguedad: 2,
    erroresGraves: 0,
    erroresAvisos: 0,
    findingsPrivacidad: 0,
  };
}

/* ========================================================================== */
console.log("Escenario 1: un borrador bueno se publica");

{
  const r = decidirAutoPublicacion(bueno());
  check("se publica", r.publicar, r.motivo);
  check("y el motivo dice por que", r.motivo.startsWith("Publicada automaticamente"), r.motivo);
  check(
    "el motivo incluye las cifras que lo demuestran",
    r.motivo.includes("0.91") && r.motivo.includes("0.78") && r.motivo.includes("320"),
    r.motivo,
  );
}

/* ========================================================================== */
console.log("\nEscenario 2: cada criterio por separado, rompiendo solo uno");

{
  const casos: Array<[string, Partial<CandidatoAutoPublicable>, string]> = [
    ["es duplicada de otra", { esDuplicada: true }, "duplicada"],
    ["la verificacion no llego a VERIFIED", { verificationStatus: "PENDING_REVIEW" }, "PENDING_REVIEW"],
    ["la verificacion loSuspenso", { verificationStatus: "SUSPICIOUS" }, "SUSPICIOUS"],
    ["confianza justa, no la pedida", { confidenceScore: 0.84 }, "confianza"],
    ["fuente floja", { sourceScore: 0.55 }, "fuente"],
    ["el texto es el original del medio", { rewritten: false }, "sin reescribir"],
    ["cuerpo de fragmento", { palabrasCuerpo: 45 }, "45 palabras"],
    ["municipio sin determinar", { municipioConocido: false }, "municipio"],
    ["un error editorial grave", { erroresGraves: 1 }, "grave"],
    ["un aviso editorial", { erroresAvisos: 1 }, "aviso"],
    ["el original traia una matricula", { findingsPrivacidad: 1 }, "personal"],
    ["suceso de hace tres dias", { horasAntiguedad: 72 }, "72 h"],
  ];

  for (const [nombre, cambio, esperado] of casos) {
    const r = decidirAutoPublicacion({ ...bueno(), ...cambio });
    check(`NO se publica si ${nombre}`, !r.publicar, r.motivo);
    check(`...y el motivo lo explica (${esperado})`, r.motivo.includes(esperado), r.motivo);
  }
}

/* ========================================================================== */
console.log("\nEscenario 3: los bordes, que son donde estan los errores");

{
  // Justo en el liston: tiene que pasar. Si el >= fuera un <=, una noticia
  // que cae justo en el umbral no se publicaria nunca y nadie sabria por que.
  check("confianza exactamente en el liston SI pasa", decidirAutoPublicacion({
    ...bueno(),
    confidenceScore: 0.85,
  }).publicar);

  check("fuente exactamente en el liston SI pasa", decidirAutoPublicacion({
    ...bueno(),
    sourceScore: 0.6,
  }).publicar);

  check("cuerpo exactamente en el liston SI pasa", decidirAutoPublicacion({
    ...bueno(),
    palabrasCuerpo: 120,
  }).publicar);

  check("suceso exactamente en el limite SI pasa", decidirAutoPublicacion({
    ...bueno(),
    horasAntiguedad: 24,
  }).publicar);

  // Y una centesima por debajo, no.
  check("una centesima por debajo NO", !decidirAutoPublicacion({
    ...bueno(),
    confidenceScore: 0.8499,
  }).publicar);

  // Un cuerpo larguisimo no compensa una fuente mala: los criterios son "y", no
  // una suma de puntos. Es lo que separa esta puerta de un promedio.
  check("no hay forma de compensar un fallo con otro", !decidirAutoPublicacion({
    ...bueno(),
    sourceScore: 0.1,
    palabrasCuerpo: 5000,
    confidenceScore: 0.99,
  }).publicar);
}

/* ========================================================================== */
console.log("\nEscenario 4: varios fallos a la vez se acumulan en el motivo");

{
  const r = decidirAutoPublicacion({
    ...bueno(),
    rewritten: false,
    municipioConocido: false,
    erroresGraves: 2,
  });

  check("no se publica", !r.publicar);
  check("el motivo nombra los tres fallos", ["sin reescribir", "municipio", "grave"].every((m) => r.motivo.includes(m)), r.motivo);
  check("y no se corta en el primero", (r.motivo.match(/;/g) ?? []).length >= 2, r.motivo);
}

/* ========================================================================== */
console.log("\nEscenario 5: contar palabras como las cuenta el verificador");

{
  check("texto vacio: 0", palabras("") === 0);
  check("solo espacios: 0", palabras("   \n  ") === 0);
  check("una palabra", palabras("accidente") === 1);
  check("no cuenta los espacios de mas", palabras(" uno   dos \n tres ") === 3);
  check("un cuerpo de verdad se cuenta bien", palabras("palabra ".repeat(50)) === 50);
}

/* ========================================================================== */
console.log("\nEscenario 6: la puerta esta apagada por defecto");

{
  // La decision es pura y no depende del interruptor. Lo que se comprueba aqui es
  // que el interruptor exista y valga "apagado" cuando nadie lo define: es lo que
  // evita que esto se encienda solo un dia por un descuido.
  const anterior = process.env.AUTO_PUBLISH;

  delete process.env.AUTO_PUBLISH;
  check("AUTO_PUBLISH sin definir: apagada", autoPublishConfig.enabled() === false);

  process.env.AUTO_PUBLISH = "1";
  check("AUTO_PUBLISH=1: encendida", autoPublishConfig.enabled() === true);

  process.env.AUTO_PUBLISH = "false";
  check("AUTO_PUBLISH=false: apagada", autoPublishConfig.enabled() === false);

  if (anterior === undefined) delete process.env.AUTO_PUBLISH;
  else process.env.AUTO_PUBLISH = anterior;
}

/* ========================================================================== */
console.log(`\n${"=".repeat(52)}`);
console.log(`  ${passed} correctas, ${failed} fallidas`);
console.log("=".repeat(52));

process.exit(failed === 0 ? 0 : 1);