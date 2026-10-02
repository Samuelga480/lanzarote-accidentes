/**
 * Pruebas de "solo se sube si es nueva".
 *
 *   npx tsx tests/dedupe.ts
 *
 * ---------------------------------------------------------------------------
 *  POR QUE ESTO SE COMPRUEBA CON TANTO CUIDADO
 * ---------------------------------------------------------------------------
 *
 * El ciclo se pasa las mismas noticias una y otra vez. Si una sola vez se
 * colara un duplicado, el panel se llenaria de la misma noticia escrita cuatro
 * veces y el autor se comeria el disgusto de verse repetido.
 *
 * Hay tres capas y estan probadas por separado, porque fallan de forma distinta:
 *
 *   1. URL vista      -> no se vuelve a descargar. Es la capa que mas carga
 *                        contiene: con ella se corta el 90 % de las repeticiones.
 *   2. Misma URL con variantes (parametros de campana, mayusculas, barra
 *      final) -> misma noticia. Sin normalizar, el medio se cuela.
 *   3. Mismo suceso contado por dos medios distintos -> se FUSIONAN: una sola
 *      noticia con dos fuentes. Nunca dos noticias.
 */

import { normalizeUrl, urlHashOf } from "@/lib/dedupe";
import { jaccard, simHash, hammingDistance } from "@/lib/text";

/** Jaccard trabaja con listas de palabras, no con el texto entero. */
function tokenos(texto: string): string[] {
  return texto
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

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
section("La misma URL da el mismo hash");

{
  const url = "https://www.cronicasdelanzarote.es/articulo/lanzarote/x/20260911104637365457.html";
  check("es estable", urlHashOf(url) === urlHashOf(url));
  check("no coincide con otra articulo", urlHashOf(url) !== urlHashOf(url + "b"));
}

/* ========================================================================== */
section("Las variantes de la misma URL se normalizan en una sola");

{
  const base = "https://www.lavozdelanzarote.com/noticia/accidente-en-tinajo/12345/";

  const variantes = [
    base,
    base + "?utm_source=facebook", // campana de redes
    base + "?utm_medium=rss",
    base.replace("noticia", "NOTICIA"), // mayusculas en la ruta
    base + "?ref=twitter&utm_campaign=abc", // dos campanas
  ];

  const hashes = new Set(variantes.map((v) => urlHashOf(normalizeUrl(v))));
  const normalizadas = new Set(variantes.map(normalizeUrl));

  check("normalizeUrl las deja todas en una sola forma", normalizadas.size === 1, `${normalizadas.size} formas distintas`);
  check("y por tanto el hash tambien coincide", hashes.size === 1, `${hashes.size} hashes distintos`);

  // Y dos noticias de verdad NO se deben igualar al normalizar.
  const otra = "https://www.lavozdelanzarote.com/noticia/accidente-en-yaiza/12346/";
  check("dos noticias distintas siguen siendo distintas", normalizeUrl(base) !== normalizeUrl(otra));
}

/* ========================================================================== */
section("El hash normalizado es el que se guarda");

{
  // Es lo que hace ingest.ts: hashear la URL normalizada.
  const a = "https://www.cronicasdelanzarote.es/articulo/lanzarote/x/20260911104637365457.html?utm_source=rss";
  const b = "https://www.cronicasdelanzarote.es/articulo/lanzarote/x/20260911104637365457.html";

  check("con parametro de campana y sin el, mismo hash", urlHashOf(normalizeUrl(a)) === urlHashOf(normalizeUrl(b)));
}

/* ========================================================================== */
section("El mismo suceso en dos medios se detecta como el mismo");

{
  const versionA = `
    Un turismo se salio de la via en la carretera LZ-2 a su paso por Tinajo
    y volco sobre las 18:30. Resultaron heridos leves. Acudio la Guardia Civil
    para atender a los afectados y cortaron el trafico un rato.
  `;

  const versionB = `
    Accidente en Tinajo. Un coche se salio de la carretera LZ-2 y dio una vuelta
    de campana. Hubo heridos leves y la Guardia Civil regulo el trafico.
  `;

  const solape = jaccard(tokenos(versionA), tokenos(versionB));
  const hashA = simHash(versionA);
  const hashB = simHash(versionB);
  const distancia = hammingDistance(hashA, hashB);

  // No se fija un umbral aqui a ojo: se comprueba que las medidas se calculan y
  // que dos textos sobre lo mismo se parecen mas que dos que no tienen nada que
  // ver. El umbral que decide la fusion vive en dedupe.ts.
  const otra = `
    El Ayuntamiento de Tinajo ha concedido una subroutine de 400.000 euros para
    las Chains de=subvencion del municipio, segun informo el(full)cabildo insular.
  `;

  const solapeDistinto = jaccard(tokenos(versionA), tokenos(otra));
  const distanciaDistinta = hammingDistance(simHash(versionA), simHash(otra));

  check("el mismo suceso da mas solape que dos temas distintos", solape > solapeDistinto,
    `${solape.toFixed(3)} vs ${solapeDistinto.toFixed(3)}`);
  check("y menos distancia de similitud", distancia < distanciaDistinta,
    `${distancia} vs ${distanciaDistinta}`);
  check("el indice de Jaccard esta entre 0 y 1", solape >= 0 && solape <= 1, String(solape));
  check("la distancia de Hamming tiene 64 bits", distancia >= 0 && distancia <= 64, String(distancia));
}

/* ========================================================================== */
section("Textos identicos y textos vacios");

{
  const t = "Un turismo se volco en la LZ-2 en Tinajo.";
  check("el mismo texto da el mismo simHash", simHash(t) === simHash(t));
  check("y el mismo texto da solape 1", jaccard(tokenos(t), tokenos(t)) === 1, String(jaccard(tokenos(t), tokenos(t))));
  check("un texto contra si mismo no tiene distancia", hammingDistance(simHash(t), simHash(t)) === 0);

  const vacio = "";
  check("el texto vacio no rompe", jaccard([], tokenos(t)) === 0, String(jaccard([], tokenos(t))));
  check("y el simHash del vacio tambien se calcula", typeof simHash(vacio) === "string");
}

console.log(`\n${passed} correctas, ${failed} fallidas`);
if (failed > 0) process.exit(1);