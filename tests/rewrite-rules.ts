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

function pedir(facts: Partial<ExtractedFacts>, original = "texto de ejemplo"): RewriteRequest {
  return {
    title: "Titular del medio original",
    body: original,
    summary: "Resumen del medio",
    facts: { ...BASE, ...facts },
    municipalityName: "Tías",
    occurredAtIso: "2026-10-02T09:30:00.000Z",
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

console.log(`\n${fallos === 0 ? "Todas las comprobaciones correctas." : `${fallos} fallo(s).`}\n`);
process.exitCode = fallos === 0 ? 0 : 1;