/**
 * Pruebas de la logica pura del pipeline.
 *
 * No tocan la base de datos ni la red de salida: cubren las partes donde un
 * error seria silencioso y caro. Una atribucion de municipio equivocada, una
 * fecha imposible o un duplicado no detectado no lanzan ningun error: salen en
 * la web. Por eso se comprueban de forma explicita.
 *
 *   npx tsx tests/logic.ts
 */

import { extractFacts, relevanceScore } from "@/lib/facts";
import { parseSourceDate, validateDate, resolveOccurredAt } from "@/lib/dates";
import { contentHashOf, simHash, hammingDistance, jaccard } from "@/lib/text";
// measureOverlap y lostNumbers viven en ai/rewrite.ts, no en text.ts: son reglas
// de la reescritura, no utilidades de texto genericas.
import { measureOverlap, lostNumbers, MAX_OVERLAP } from "@/lib/ai/rewrite";
import { verifyArticle } from "@/lib/verify";
import { isBlockedIp, assertFetchable } from "@/lib/net";
import { normalizeUrl, urlHashOf } from "@/lib/dedupe";
import { sanitizeText } from "@/lib/privacy";

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

const HOUR = 3_600_000;
const now = new Date();

/* ========================================================================== */
section("Extraccion de hechos: la regla es NO inventar");

{
  const f = extractFacts(
    "Accidente en la carretera LZ-2 a su paso por Tias",
    "Un turismo se salio de la via y volco. Resultaron heridos leves. Acudio la Guardia Civil.",
  );
  check("detecta el municipio Tias", f.municipalitySlug === "tias", `obtenido: ${f.municipalitySlug}`);
  check("detecta la carretera LZ-2", f.road === "LZ-2", `obtenido: ${f.road}`);
  // "Resultaron heridos" sin cifra: se registra 1 como estimacion minima, no 2.
  // Es una decision consciente y esta documentada en facts.ts.
  check("heridos sin cifra concreta da 1 (estimacion minima)", f.injuries === 1, `obtenido: ${f.injuries}`);
  // El texto no menciona fatalities, asi que null es la respuesta correcta:
  // afirmar 0 seria inventar un dato que nadie ha dicho.
  check("sin mencion de fallecidos devuelve null, no 0", f.fatalities === null, `obtenido: ${f.fatalities}`);
  check(
    "el suceso manda sobre el organismo: ACCIDENTE_TRAFICO, no ACTUACION_SERVICIOS",
    f.category === "ACCIDENTE_TRAFICO",
    `obtenido: ${f.category}`,
  );
}

{
  // El caso que hacia el scraper original: sin toponimo devolvia "Arrecife".
  const f = extractFacts("Colision en una carretera", "Hubo un choque entre dos coches.");
  check(
    "sin toponimo devuelve null, NO Arrecife",
    f.municipalitySlug === null,
    `obtenido: ${f.municipalitySlug}`,
  );
}

{
  const f = extractFacts("Accidente en Playa Blanca", "Un coche choco en la LZ-20.");
  check(
    "alias de localidad: Playa Blanca resuelve a Yaiza",
    f.municipalitySlug === "yaiza",
    `obtenido: ${f.municipalitySlug}`,
  );
}

{
  // Sin esta comprobacion, una noticia de Fuerteventura entraria como local.
  const f = extractFacts("Accidente en Corralejo", "Choque grave en Fuerteventura.");
  check("detecta que el articulo es de otra isla", f.outsideLanzarote === true);
}

{
  const f = extractFacts(
    "Incendio en un restaurante de Arrecife",
    "Los bomberos extinguieron el fuego.",
  );
  check("clasifica como incendio", f.category === "INCENDIO", `obtenido: ${f.category}`);
}

{
  const score = relevanceScore("Noticia de cultura", "El festival se celebra el proximo mes.");
  check("un articulo que no trata de sucesos tiene relevancia 0", score === 0, `puntuacion: ${score}`);
}

{
  // "carretera" pesa 1, y en el titular se duplica: 2 de 8 = 0.25. Es
  // exactamente el umbral que ingest.ts usa para descartar, asi que una nota de
  // obras NO entra. Con la regla del scraper viejo ("el texto contiene
  // carretera") esta nota entraba como noticia de accidente.
  const score = relevanceScore(
    "Estado de la carretera",
    "La carretera LZ-1 esta cortada por obras de mejora.",
  );
  check("una nota de obras queda en el umbral de descarte", score === 0.25, `puntuacion: ${score}`);

  const scoreReal = relevanceScore(
    "Accidente en la LZ-2",
    "Un coche volco en la carretera LZ-2.",
  );
  check("un accidente real puntua claramente por encima del umbral", scoreReal > 0.5, `puntuacion: ${scoreReal}`);
}

{
  const f = extractFacts(
    "Herido grave tras ser atropellado en Arrecife",
    "Un peaton fue atropellado y resulto herido grave. Ingreso en el hospital.",
  );
  check("clasifica como atropello", f.category === "ATROPELLO", `obtenido: ${f.category}`);
  check("un herido grave da gravedad GRAVE", f.severity === "GRAVE", `obtenido: ${f.severity}`);
}

/* ========================================================================== */
section("Fechas y zona horaria");

{
  // +0100 ( CEST, horario de verano canario) -> 13:30 UTC.
  const d = parseSourceDate("Tue, 01 Oct 2026 14:30:00 +0100");
  check(
    "parsea RFC-822 con offset +0100 como 13:30 UTC",
    d !== null && d.date.toISOString() === "2026-10-01T13:30:00.000Z",
    d ? d.date.toISOString() : "null",
  );

  const w = parseSourceDate("Tue, 01 Dec 2026 14:30:00 +0000");
  check(
    "parsea RFC-822 con offset +0000 (invierno canario)",
    w !== null && w.date.toISOString() === "2026-12-01T14:30:00.000Z",
    w ? w.date.toISOString() : "null",
  );
}

{
  const d = parseSourceDate("2026-10-01T14:30:00Z");
  check("parsea W3CDTF con Z como fecha cierta", d !== null && d.confidence === "certain");
}

{
  const d = parseSourceDate("2026-10-01T14:30:00");
  check("ISO sin zona no se marca como cierta", d !== null && d.confidence === "likely");
}

{
  const d = parseSourceDate("25/12/2026");
  check(
    "25/12/2026 se resuelve sin ambiguedad",
    d !== null && d.date.getUTCMonth() === 11 && d.date.getUTCDate() === 25,
  );
}

{
  const d = parseSourceDate("01/10/2026");
  // Ambos valores son <= 12: el orden dia/mes es irresoluble.
  check("01/10/2026 se devuelve null en vez de adivinar", d === null);
}

{
  const v = validateDate(new Date(now.getTime() + 48 * HOUR), { maxAgeDays: 30 });
  check("rechaza una fecha 48 horas en el futuro", !v.ok && v.problem === "futura");
}

{
  const v = validateDate(new Date(now.getTime() + 10 * 60_000), { maxAgeDays: 30 });
  check("tolera 10 minutos de desfase del reloj", v.ok && v.corrected !== null);
}

{
  const v = validateDate(new Date(now.getTime() - 400 * 86_400_000), { maxAgeDays: 30 });
  check("rechaza una noticia de hace 400 dias", !v.ok && v.problem === "muy-antigua");
}

{
  // Canarias en invierno es UTC+0 y en verano UTC+1: sumar una hora fija
  // fallaria durante siete meses al ano.
  const invierno = resolveOccurredAt(
    new Date("2026-01-15T13:00:00Z"), null, "14:00", new Date(),
  );
  check(
    "invierno: 14:00 local son 14:00 UTC (UTC+0)",
    invierno.toISOString().includes("T14:00"),
    invierno.toISOString(),
  );

  const verano = resolveOccurredAt(
    new Date("2026-07-15T12:00:00Z"), null, "14:00", new Date(),
  );
  check(
    "verano: 14:00 local son 13:00 UTC (UTC+1)",
    verano.toISOString().includes("T13:00"),
    verano.toISOString(),
  );
}

/* ========================================================================== */
section("Anti-duplicados");

{
  const a = contentHashOf("Accidente en la LZ-2 en Tias", "Un turismo volco en la LZ-2 a su paso por Tias.");
  const b = contentHashOf("Accidente en la LZ-2 en Tias", "Un turismo volco en la LZ-2 a su paso por Tias.");
  const c = contentHashOf("Colision en Arrecife", "Dos coches chocaron en la calle.");
  check("el mismo texto produce el mismo hash", a === b);
  check("textos distintos producen hashes distintos", a !== c);
}

{
  const s1 = simHash(
    "Un turismo se salio de la via y volco en la carretera LZ-2 a la altura de Tias. Resultaron heridos leves.",
  );
  const s2 = simHash(
    "Un turismo volco al salirse de la via en la LZ-2, en Tias. Hubo heridos leves.",
  );
  const d = hammingDistance(s1, s2);
  // El umbral de produccion es DEDUPE_SIMHASH_DISTANCE = 12, combinado con
  // una similitud de titular minima. Dos parrafos reordenados dan shingles
  // distintos, asi que la distancia por si sola no basta para decidir.
  check("dos redacciones del mismo suceso no estan lejos (<20)", d < 20, `distancia: ${d}`);
  check("pero la distancia por si sola no basta para fusionar (>12)", d > 12, `distancia: ${d}`);

  const s3 = simHash(
    "La.sequence fibonacci recorre todos los numeros primos impares del siglo con detalle exhaustivo",
  );
  const d2 = hammingDistance(s1, s3);
  check("textos sin relacion quedan lejos (>24)", d2 > 24, `distancia: ${d2}`);
}

{
  const t1 = ["accidente", "carretera", "volco", "herido", "tias"];
  const t2 = ["accidente", "carretera", "volco", "herido", "arrecife"];
  const t3 = ["cultura", "festival", "concierto", "teatro", "arte"];
  check("titulares del mismo suceso: Jaccard alto", jaccard(t1, t2) > 0.6, `${jaccard(t1, t2)}`);
  check("titulares distintos: Jaccard bajo", jaccard(t1, t3) < 0.2, `${jaccard(t1, t3)}`);
}

{
  const u1 = normalizeUrl("https://www.ejemplo.com/noticia/?utm_source=twitter&id=5");
  const u2 = normalizeUrl("https://ejemplo.com/noticia?id=5");
  check("normaliza URL: quita utm y www", u1 === u2, `${u1} vs ${u2}`);

  // http y https NO se unifican: no todos los sitios sirven las dos, y dar por
  // hecho que si podria fusionar dos paginas distintas.
  const s1 = normalizeUrl("http://ejemplo.com/noticia");
  const s2 = normalizeUrl("https://ejemplo.com/noticia");
  check("no unifica http con https a ciegas", s1 !== s2, `${s1} vs ${s2}`);

  const a1 = normalizeUrl("https://ejemplo.com/noticia#seccion");
  const a2 = normalizeUrl("https://ejemplo.com/noticia");
  check("quita el fragmento", a1 === a2);
}

{
  check("el hash de URL es estable", urlHashOf("https://a.com/x") === urlHashOf("https://a.com/x"));
  check("el hash de URL distingue articulos", urlHashOf("https://a.com/x") !== urlHashOf("https://a.com/y"));
}

/* ========================================================================== */
section("Reescritura: control de copia");

{
  const original =
    "Un turismo se salio de la via y volco en la carretera LZ-2 a la altura de Tias. Los servicios de emergencia ocurrieron al lugar.";
  const overlap = measureOverlap(original, original);
  check("un texto calcado supera el umbral", overlap > MAX_OVERLAP, `overlap: ${overlap}`);
  check("y por tanto se rechazaria", overlap > MAX_OVERLAP);
}

{
  const original =
    "Un turismo se salio de la via y volco en la carretera LZ-2 a la altura de Tias. Los servicios de emergencia ocurndia al lugar.";
  const reescrito =
    "En Tias, un coche perdio el control y termino volcando sobre la LZ-2. Los equipos de emergencia se hicieron cargo del asunto.";
  const overlap = measureOverlap(original, reescrito);
  check("una reescritura legitima pasa el umbral", overlap <= MAX_OVERLAP, `overlap: ${overlap}`);
}

{
  const original = "El accidente dejo 23 heridos y 4 fallecidos en la LZ-2.";
  const lost = lostNumbers(original, "El accidente dejo 23 heridos en la LZ-2.");
  check("detecta que se ha perdido una cifra", lost.includes(4), `perdidos: ${lost}`);

  const kept = lostNumbers(original, "El accidente dejo 23 heridos y 4 fallecidos en la LZ-2.");
  check("no pierde cifras si se repiten todas", kept.length === 0, `perdidos: ${kept}`);
}

/* ========================================================================== */
section("Seguridad: SSRF");

{
  check("bloquea loopback IPv4", isBlockedIp("127.0.0.1"));
  check("bloquea metadatos de nube", isBlockedIp("169.254.169.254"));
  check("bloquea red privada 10/8", isBlockedIp("10.0.0.5"));
  check("bloquea red privada 172.16/12", isBlockedIp("172.16.0.1"));
  check("bloquea red privada 192.168/16", isBlockedIp("192.168.1.1"));
  check("bloquea CGNAT", isBlockedIp("100.64.0.1"));
  check("bloquea loopback IPv6", isBlockedIp("::1"));
  check("bloquea IPv4 mapeada dentro de IPv6", isBlockedIp("::ffff:127.0.0.1"));
  check("bloquea enlace local IPv6", isBlockedIp("fe80::1"));
  check("permite una IP publica IPv4", !isBlockedIp("93.184.216.34"));
}

/* ========================================================================== */
section("Verificacion");

{
  const title = "Un carro se salio de la via en la LZ-2 en Tias y volco";
  const body = "Resultaron 3 heridos leves. Acudieron la Guardia Civil y los bomberos.";
  const facts = extractFacts(title, body);
  const v = verifyArticle({
    title,
    body,
    summary: "",
    date: { date: new Date(now.getTime() - 2 * HOUR), confidence: "certain" },
    facts,
    baseScore: 0.85,
    consecutiveFailures: 0,
    successRate: 1,
    maxAgeDays: 30,
  });
  check("una noticia coherente da confianza alta", v.confidenceScore > 0.7, `confianza: ${v.confidenceScore}`);
  check("no se descarta automaticamente", v.autoReject === false);
}

{
  const facts = extractFacts("Accidente grave en Corralejo", "Accidente grave en Corralejo con 3 fallecidos.");
  const v = verifyArticle({
    title: "Accidente grave en Corralejo",
    body: "Accidente grave en Corralejo con 3 fallecidos en Fuerteventura.",
    summary: "",
    date: { date: new Date(now.getTime() - HOUR), confidence: "certain" },
    facts,
    baseScore: 0.9,
    consecutiveFailures: 0,
    successRate: 1,
    maxAgeDays: 30,
  });
  check("un articulo de otra isla se descarta solo", v.autoReject === true);
  check("un articulo de otra isla queda REJECTED", v.verificationStatus === "REJECTED");
}

{
  // La incoherencia mas grave: el titular dice algo que el cuerpo no dice.
  // El cuerpo debe tener Extension suficiente (40+ palabras), porque un texto
  // corto activa antes el aviso de "fragmento" y la nota de incoherencia se
  // diluye entre las demas.
  const title = "Dos muertos en accidente en la LZ-2 en Tias";
  const body =
    "Un coche volcado en la carretera LZ-2 a la altura de Tias ocupa ahora mismo uno de los " +
    "carriles de circulacion en sentido ascendente. El accidente se produjo sobre las nueve de " +
    "la noche, cuando el vehiculo perdio el control tras una curva pronunciada del tramo. " +
    "Hay varios heridos en el lugar, segun los primeros informes, y los servicios de " +
    "emergencia trabajan en la atencion de los afectados.";
  const facts = extractFacts(title, body);
  const v = verifyArticle({
    title,
    body,
    summary: "",
    date: { date: new Date(now.getTime() - HOUR), confidence: "certain" },
    facts,
    baseScore: 0.8,
    consecutiveFailures: 0,
    successRate: 1,
    maxAgeDays: 30,
  });
  const detected = v.notes.some((n) => /titular menciona un fallecimiento/i.test(n));
  check("detecta que el titular y el cuerpo no cuadran", detected, `notas: ${v.notes.join(" | ")}`);
}

/* ========================================================================== */
section("Privacidad");

{
  const { data, findings } = sanitizeText(
    "El conductor, con matricula 1234 ABC y telefono 612 345 678, fue atendido.",
  );
  check("elimina la matricula", !data.includes("1234 ABC"), data);
  check("elimina el telefono", !data.includes("612 345 678"), data);
  check("registra los hallazgos", findings.length >= 2, `hallazgos: ${findings.length}`);
}

/* ========================================================================== */
async function ssrfAsync() {
  section("Seguridad: SSRF sobre URLs concretas");

  const cases: Array<[string, boolean]> = [
    ["http://localhost:5432/", false],
    ["http://169.254.169.254/latest/meta-data/", false],
    ["http://127.0.0.1:3000/api/health", false],
    ["file:///etc/passwd", false],
    ["ftp://ejemplo.com/x", false],
    ["http://usuario:clave@ejemplo.com/", false],
    ["https://www.lavozdelanzarote.com/rss", true],
  ];

  for (const [url, shouldPass] of cases) {
    const result = await assertFetchable(url);
    check(
      `${shouldPass ? "permite" : "bloquea"} ${url}`,
      result.ok === shouldPass,
      result.ok ? "permitido" : `bloqueado: ${result.reason}`,
    );
  }
}

/* ========================================================================== */
(async () => {
  await ssrfAsync();

  console.log(`\n${"=".repeat(52)}`);
  console.log(`  ${passed} correctas, ${failed} fallidas`);
  console.log("=".repeat(52));
  process.exit(failed === 0 ? 0 : 1);
})();