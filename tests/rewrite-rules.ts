/**
 * Pruebas del reescritor por reglas.
 *
 * Lo importante aqui no es que suene bien, es que NO INVENTE. Cada caso es un
 * dato que el extractor puede devolver en null, y la noticia tiene que
 * omitirlo en vez de rellenarlo.
 */
import { rewriteByRules } from "../src/lib/ai/rewrite-rules";
import { measureOverlap } from "../src/lib/ai/rewrite";
import type { ExtractedFacts } from "../src/lib/facts";
import type { RewriteRequest } from "../src/lib/ai/rewrite";

let fallos = 0;

function ok(nombre: string, condicion: boolean, detalle = "") {
  if (!condicion) fallos++;
  console.log(`  ${condicion ? "correcta" : "FALLA   "} ${nombre}${detalle ? ` -> ${detalle}` : ""}`);
}

const BASE: ExtractedFacts = {
  municipalitySlug: "tias",
  zoneSlug: null,
  areaLabel: null,
  road: null,
  vehicleType: null,
  category: "ACCIDENTE_TRAFICO",
  severity: null,
  injuries: null,
  fatalities: null,
  timeOfDay: null,
  outsideLanzarote: false,
  matchedTerms: ["accidente"],
};

function pedir(
  facts: Partial<ExtractedFacts>,
  original = "texto de ejemplo",
  municipalityName = "Tías",
  occurredAtIso = "2026-10-02T09:30:00.000Z",
): RewriteRequest {
  return {
    title: "Titular del medio original",
    body: original,
    summary: "Resumen del medio",
    facts: { ...BASE, ...facts },
    municipalityName,
    occurredAtIso,
    outlet: "Medio de prueba",
    sourceUrl: "https://ejemplo.test/a",
  };
}

/* -------------------------------------------------------------------------- */
console.log("\n1. CASO NORMAL: carretera, vehiculo y un herido\n");

{
  const r = rewriteByRules(
    pedir({ road: "LZ-2", vehicleType: "COCHE", injuries: 1, fatalities: 0 }, "Un accidente en la LZ-2"),
  );

  console.log(`  titular:  ${r.ok ? r.title : "(fallo)"}`);
  console.log(`  resumen:  ${r.ok ? r.summary : "(fallo)"}`);
  console.log(`  cuerpo:\n    ${r.ok ? r.body.split("\n").join("\n    ") : "(fallo)"}`);
  console.log(`  seo:      ${r.ok ? r.seoTitle : ""}`);
  console.log("");

  ok("devuelve ok", r.ok);
  if (r.ok) {
    ok("el titular lleva la carretera", r.title.includes("LZ-2"));
    ok("el titular lleva el municipio", r.title.includes("Tías"));
    ok("el cuerpo nombra un turismo", r.body.includes("turismo"));
    ok("el cuerpo dice una persona herida", r.body.includes("una persona herida"));
    ok("no dice 'sin heridos' cuando hay uno", !r.body.includes("No se registran"));
    ok("el titulo SEO no pasa de 60", r.seoTitle.length <= 60, `${r.seoTitle.length} caracteres`);
    ok("la meta no pasa de 155", r.metaDescription.length <= 155, `${r.metaDescription.length} caracteres`);
    ok("el modelo es null (no fue IA)", r.model === null);
  }
}

/* -------------------------------------------------------------------------- */
console.log("\n2. NADA SE SABE: todos los datos en null\n");

{
  const r = rewriteByRules(
    pedir({
      category: null,
      road: null,
      vehicleType: null,
      injuries: null,
      fatalities: null,
    }),
  );

  console.log(`  titular:  ${r.ok ? r.title : "(fallo)"}`);
  console.log(`  cuerpo:\n    ${r.ok ? r.body.split("\n").join("\n    ") : "(fallo)"}`);
  console.log("");

  ok("devuelve ok aunque no sepa nada", r.ok);
  if (r.ok) {
    ok("usa 'Suceso' como etiqueta neutra", r.title.includes("Suceso"));
    ok("no inventa carretera", !r.title.includes("LZ-"));
    ok("no inventa vehiculo", !r.body.includes("turismo") && !r.body.includes("moto"));
    ok("no inventa heridos", !r.body.includes("personas heridas"));
    ok("dice que no hay dato de afectados", r.body.includes("no precisa"));
  }
}

/* -------------------------------------------------------------------------- */
console.log("\n3. CERO HERIDOS Y CERO FALLECIDOS\n");

{
  const r = rewriteByRules(pedir({ injuries: 0, fatalities: 0, vehicleType: null }));
  ok("dice que no hay heridos ni fallecidos", r.ok && r.body.includes("No constan personas heridas"));
}

/* -------------------------------------------------------------------------- */
console.log("\n4. VARIOS HERIDOS Y UN FALLECIDO\n");

{
  const r = rewriteByRules(pedir({ injuries: 3, fatalities: 1, vehicleType: null }));
  const txt = r.ok ? r.summary + r.body : "";
  ok("nombra a tres heridos", txt.includes("tres personas heridas"));
  ok("nombra a un fallecido", txt.includes("una persona fallecida"));
  ok("no confunde los numeros", !txt.includes("tres personas fallecidas"));
}

/* -------------------------------------------------------------------------- */
console.log("\n5. SIN COPIAR DEL ORIGINAL\n");

{
  // Un original con redaccion tipica de un medio.
  const original =
    "Una vecina de Tías ha而知，注册了这一起发生在岛上的严重交通事故。" +
    "Según los=testigos, elconductor seMIT. El caso fue attendido de inmediato.";
  const r = rewriteByRules(pedir({ road: "LZ-2", vehicleType: "MOTO" }, original));

  ok("no copia 6 palabras seguidas", r.ok && measureOverlap(original, r.body) < 0.12,
     r.ok ? `solape ${measureOverlap(original, r.body)}` : "");
  ok("el titular no sale del original", r.ok && !r.title.includes("conduct"));
  ok("el cuerpo no sale del original", r.ok && !r.body.includes("conduct"));
}

/* -------------------------------------------------------------------------- */
console.log("\n6. FECHA INVALIDA\n");

{
  const p = pedir({});
  p.occurredAtIso = "no-es-una-fecha";
  const r = rewriteByRules(p);
  ok("avisa de que la fecha no vale", !r.ok && r.error !== "");
}

/* -------------------------------------------------------------------------- */
console.log("\n7. VARIAS CATEGORIAS\n");

{
  const casos: Array<[ExtractedFacts["category"], string]> = [
    ["INCENDIO", "Incendio"],
    ["RESCATE", "Rescate"],
    ["ATROPELLO", "Atropello"],
    ["EMERGENCIA_SANITARIA", "Emergencia sanitaria"],
  ];
  for (const [cat, etiqueta] of casos) {
    const r = rewriteByRules(pedir({ category: cat }));
    ok(`${cat} sale como "${etiqueta}"`, r.ok && r.title.startsWith(etiqueta),
       r.ok ? r.title : "");
  }
}

/* ========================================================================== */
console.log("\nCuando no se sabe el municipio, no se inventa uno");
/* ========================================================================== */

{
  // "Lanzarote" es el nombre que pasa quien llama cuando extractFacts no ha
  // podido determinar el municipio. No existe ningun municipio con ese nombre:
  // es la isla. Decirlo como municipio seria publicar un dato falso, y este
  // modulo no los publica.
  const r = rewriteByRules(pedir({ municipalitySlug: null, road: null, areaLabel: null }, "", "Lanzarote"));
  ok('no escribe "el municipio de Lanzarote"', r.ok && !/municipio de Lanzarote/.test(r.body),
     r.ok ? r.body : "");
  ok("dice la isla", r.ok && /isla/.test(r.body), r.ok ? r.body : "");
  ok("y el titular no promete un municipio", r.ok && !/municipio/i.test(r.title), r.ok ? r.title : "");
}

{
  // Con municipio conocido, el "de" si aparece: es lo que se busca cuando
  // alguien teclea "accidentes Tias".
  const r = rewriteByRules(pedir({ municipalitySlug: "tinajo", road: null, areaLabel: null }, "", "Tinajo"));
  ok("con municipio conocido si dice el municipio", r.ok && /el municipio de Tinajo/.test(r.body),
     r.ok ? r.body : "");
  ok("y el titular lo lleva", r.ok && /Tinajo/.test(r.title), r.ok ? r.title : "");
}

{
  // Con carretera y sin municipio, la carretera ya sitúa: no hace falta inventar
  // nada mas.
  const r = rewriteByRules(pedir({ municipalitySlug: null, road: "LZ-40", areaLabel: null }, "", "Lanzarote"));
  ok("carretera sin municipio: solo la carretera", r.ok && /carretera LZ-40/.test(r.body) && !/municipio/.test(r.body),
     r.ok ? r.body : "");
}

/* ========================================================================== */
console.log("\nLa fecha tiene que llegar en ISO, no como texto para leer");
/* ========================================================================== */

{
  /*
    Este es el fallo que hacia que NUNCA se redactara. `ingestArticle` pasaba
    `formatLocal(occurredAt)`, que devuelve "2 de octubre de 2026 a las 08:48",
    y el redactor hace `new Date(esa cadena)`. Es una fecha invalida, el redactor
    devuelve `ok: false` sin decir nada raro, y la noticia se guardaba con el texto
    del medio y la nota "La IA no pudo reescribirla".

    Se comprueba con las dos formas: la ISO tiene que funcionar, y la que no
    funciona tiene que fallar de forma que se note.
  */
  const bueno = rewriteByRules(
    pedir({ road: "LZ-2" }, "", "Tinajo", "2026-10-02T08:48:00.000Z"),
  );
  ok("con fecha ISO el redactor funciona", bueno.ok, bueno.ok ? "" : bueno.error);

  const malo = rewriteByRules(
    pedir({ road: "LZ-2" }, "", "Tinajo", "2 de octubre de 2026 a las 08:48"),
  );
  ok("con texto para leer el redactor avisa de que no vale", !malo.ok, malo.ok ? "deberia fallar" : "");
  ok(
    "y el aviso dice que la fecha no es valida",
    !malo.ok && /Fecha del suceso no valida/.test(malo.error),
    malo.ok ? "" : malo.error,
  );

  /*
    Y la hora se muestra en la de Canarias, no en UTC. En octubre Canarias esta en
    UTC+1 (horario de verano), asi que las 08:48 UTC son las 09:48 en la isla.
    Si aqui saliera 08:48 seria que se esta pintando la hora cruda del instante.
  */
  ok("la hora se convierte a la de Canarias", bueno.ok && /09:48/.test(bueno.body), bueno.ok ? bueno.body : "");
}

/* ========================================================================== */
console.log("\nQue el texto este bien escrito y no se repita");
/* ========================================================================== */

{
  // 1. Concordancia de genero. "estaba implicado una bicicleta" se ha publicado.
  for (const [tipo, esperado] of [
    ["BICICLETA", "implicada una bicicleta"],
    ["MOTO", "implicada una moto"],
    ["COCHE", "implicado un turismo"],
    ["CAMION", "implicado un camión"],
    ["PEATON", "implicado un peatón"],
  ] as const) {
    const r = rewriteByRules(pedir({ vehicleType: tipo }));
    ok(
      `${tipo}: "${esperado}"`,
      r.ok && r.body.includes(esperado),
      r.ok ? r.body.split("\n")[1] : r.error,
    );
  }
}

{
  // 2. La hora no se dice dos veces. "esta mañana, sobre las 08:48" repetia.
  const r = rewriteByRules(pedir({ vehicleType: "COCHE" }, "", "Tías", "2026-10-02T09:48:00.000Z"));
  ok(
    'no repite "esta mañana" y la hora en la misma frase',
    r.ok && !/esta mañana,[^.]*las \d\d:\d\d.*esta mañana/.test(r.body),
    r.ok ? r.body.split("\n")[0] : r.error,
  );
  ok("y dice la hora una vez", r.ok && (r.body.match(/\d\d:\d\d/g) ?? []).length === 1, r.ok ? r.body : "");
}

{
  /*
    3. Las noticias no terminan todas igual. Con veinte articulos seguidos y la
    misma ultima frase, la web se lee como relleno.
  */
  // OJO: el cierre se elige a partir del TITULAR, asi que hay que cambiar el
  // titular en cada llamada. Con los mismos hechos y el mismo titular salen
  // siempre las mismas tres frases, y es lo que debe pasar.
  const titulos = [
    "Accidente con un turismo en Arrecife",
    "Atropello con una bicicleta en Tinajo",
    "Colisión en la LZ-40 en Yaiza",
    "Vuelco de un camión en Teguise",
    "Caída de una moto en Haría",
    "Salida de vía en Tías",
    "Atropello en Playa Blanca",
    "Choque entre dos turismos en San Bartolomé",
  ];

  const cierres = new Set<string>();
  for (const t of titulos) {
    const r = rewriteByRules({
      title: t,
      body: "texto del medio",
      summary: "",
      facts: { ...BASE, vehicleType: "COCHE" },
      municipalityName: "Arrecife",
      occurredAtIso: "2026-10-02T09:48:00.000Z",
      outlet: "Medio de prueba",
      sourceUrl: "https://ejemplo.test/a",
    });
    if (r.ok) cierres.add(r.body.split("\n\n")[2] ?? "");
  }
  ok(
    "los cierres se reparten entre varias frases",
    cierres.size >= 4,
    `${cierres.size} cierres distintos con ${titulos.length} titulares`,
  );
  ok("y ninguna frase de cierre esta repetida en la lista", cierres.size === new Set([...cierres]).size);

  // Y la misma noticia debe salir siempre igual: si no, el texto dance cada vez
  // que se recarga y el editor no puede fiarse de lo que ve.
  const titulo = "Atropello con una bicicleta en Tinajo";
  const a = rewriteByRules(pedir({ vehicleType: "BICICLETA" }, "", "Tinajo", "2026-10-02T08:48:00.000Z"));
  const b = rewriteByRules(pedir({ vehicleType: "BICICLETA" }, "", "Tinajo", "2026-10-02T08:48:00.000Z"));
  ok("la misma noticia sale igual dos veces", a.ok && b.ok && a.body === b.body);
}

{
  // 4. La cifra se cuenta en letra y no se inventa.
  const varios = rewriteByRules(pedir({ vehicleType: "COCHE", injuries: 3 }, "", "Teguise"));
  ok("con tres heridos dice tres", varios.ok && /tres personas heridas/.test(varios.body), varios.ok ? varios.body : "");

  const uno = rewriteByRules(pedir({ vehicleType: "COCHE", injuries: 1 }, "", "Teguise"));
  ok("con un herido dice una", uno.ok && /una persona herida/.test(uno.body), uno.ok ? uno.body : "");

  const ninguno = rewriteByRules(pedir({ vehicleType: "COCHE", injuries: null, fatalities: null }, "", "Teguise"));
  ok(
    "sin cifras no menciona a nadie",
    ninguno.ok && !/herid|fallen/i.test(uno.ok ? uno.body.split("\n")[1] : ""),
    ninguno.ok ? ninguno.body : "",
  );

  const deceased = rewriteByRules(pedir({ vehicleType: "COCHE", fatalities: 2, injuries: 1 }, "", "Yaiza"));
  ok("con fallecidos y heridos los dos", deceased.ok && /dos personas fallecidas/.test(deceased.body) && /una persona herida/.test(deceased.body), deceased.ok ? deceased.body : "");
}

console.log(`\n${fallos === 0 ? "Todas las comprobaciones correctas." : `${fallos} fallo(s).`}\n`);
process.exitCode = fallos === 0 ? 0 : 1;