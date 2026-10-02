/**
 * Genera el poligono de tierra de Lanzarote.
 *
 * ---------------------------------------------------------------------------
 *  PARA QUE
 * ---------------------------------------------------------------------------
 *
 * El marcador de cada noticia se desplaza de forma deliberada 400-900 metros
 * para no dar el punto exacto del accidente. Eso, en un pueblo de la costa, es
 * meter el punto en el agua: el mapa acaba enseñando que el accidente pasó en el
 * mar. Asi que el desplazamiento tiene que comprobarse.
 *
 * Este script deja en el repo el contorno de la isla, para poder preguntar "este
 * punto es tierra?" sin depender de la red en produccion.
 *
 * ---------------------------------------------------------------------------
 *  DE DONDE SALE
 * ---------------------------------------------------------------------------
 *
 * De los siete poligonos municipales de Nominatim, que en OpenStreetMap siguen
 * la costa. Se reunen y se usa "estoy dentro de alguno" como prueba de tierra.
 *
 * La primera version usaba los tramos sueltos de `natural=coastline` y los
 * ensamblaba a mano. Se abandono: son 283 tramos que hay que encadenar por id de
 * nodo y salian 128 fragmentos en vez de una isla. Los poligonos municipales ya
 * vienen cerrados.
 *
 * ---------------------------------------------------------------------------
 *  USO
 * ---------------------------------------------------------------------------
 *
 *   npx tsx scripts/generar-costero.ts
 *
 * Escribe src/lib/costeros.ts y lo versiona. Solo hay que repetirlo si cambian
 * los limites municipales en OSM. Las respuestas se guardan en scripts/.cache
 * para poder reejecutarlo sin pedirlo todo otra vez.
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";

/*
 * La isla entera, no los municipios. Los limites municipales son frontiers
 * administrativas, no un dibujo del terreno: el puerto de los Marmoles esta dentro
 * del termino de Arrecife y es agua, igual que laisineta de la marina. Con los
 * municipios, un marcador Caia en el puerto pasaba por estar en tierra.
 */
const ISLA = "Lanzarote, Las Palmas, Spain";

/** Nombre con el que sale la isla en la lista de datos descargados. */
const NOMBRE_ISLA = "Lanzarote";

const MUNICIPIOS = [
  "Arrecife, Las Palmas, Spain",
  "San Bartolomé, Las Palmas, Spain",
  "Tías, Las Palmas, Spain",
  "Yaiza, Las Palmas, Spain",
  "Tinajo, Las Palmas, Spain",
  "Teguise, Las Palmas, Spain",
  "Haría, Las Palmas, Spain",
];

/** Metros de margen: si el punto cae tan cerca del borde, se cuenta como tierra. */
const MARGEN_M = 150;

/** Desplazamiento de un punto, en grados. */
/*
 * 0,0001 grados son unos 11 metros. Antes era 0,0006 (unos 66 m) y con esa
 * suavizacion la darsena y el puerto de Arrecife se cerraban: el puerto quedaba
 * dentro de la isla y un marcador ahi pasaba por tierra. Un recorte de puerto
 * mide 200-400 m, asi que hace falta una tolerancia por debajo de eso.
 */
const TOLERANCIA_GRADOS = 0.0001;

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Poligono = GeoJSON.Polygon | GeoJSON.MultiPolygon;
type Anillo = Array<[number, number]>; // [lat, lon]

/**
 * GeoJSON entrega [longitud, latitud] como `Position`, que es un array abierto:
 * TypeScript no sabe que tiene dos elementos. Aqui se pasa a tupla y se invierte
 * el orden, que es como se trabaja en el resto del proyecto.
 */
function anillosDe(g: Poligono): Anillo[] {
  const crudo: GeoJSON.Position[][] = g.type === "Polygon" ? g.coordinates : g.coordinates.flat();
  return crudo.map((anillo) => anillo.map((p) => [p[1], p[0]] as [number, number]));
}

function metrosPorGrado(lat: number) {
  return { lat: 111_320, lon: 111_320 * Math.cos((lat * Math.PI) / 180) };
}

/** Douglas-Peucker. La tolerancia va en grados: 0,0006 son unos 60 metros. */
function simplificar(pts: Anillo, tol: number): Anillo {
  if (pts.length < 3) return pts;

  const dist = (p: number[], a: number[], b: number[]) => {
    let x = a[0];
    let y = a[1];
    const dx = b[0] - x;
    const dy = b[1] - y;
    if (dx || dy) {
      const t = ((p[0] - x) * dx + (p[1] - y) * dy) / (dx * dx + dy * dy);
      if (t > 1) {
        x = b[0];
        y = b[1];
      } else if (t > 0) {
        x += dx * t;
        y += dy * t;
      }
    }
    return (p[0] - x) ** 2 + (p[1] - y) ** 2;
  };

  const idx = new Set<number>([0, pts.length - 1]);
  const pila: Array<[number, number]> = [[0, pts.length - 1]];

  while (pila.length) {
    const par = pila.pop()!;
    let max = -1;
    let d = 0;
    for (let k = par[0] + 1; k < par[1]; k++) {
      const v = dist(pts[k], pts[par[0]], pts[par[1]]);
      if (v > d) {
        d = v;
        max = k;
      }
    }
    if (d > tol * tol) {
      idx.add(max);
      pila.push([par[0], max], [max, par[1]]);
    }
  }

  return [...idx].sort((a, b) => a - b).map((k) => pts[k]);
}

async function descargarPoligonos(): Promise<Array<{ nombre: string; anillos: Anillo[] }>> {
  mkdirSync("scripts/.cache", { recursive: true });
  const salida: Array<{ nombre: string; anillos: Anillo[] }> = [];

  /*
    Solo la isla entra en el poligono. Los municipios quedan como respaldo por si
    algún dia Nominatim no devuelve el contorno de la isla, pero nunca se suman:
    su limite atraviesa el puerto de los Marmoles y la darsena, y ahi hay agua.
  */
  const consultas = [ISLA, ...MUNICIPIOS];

  for (const consulta of consultas) {
    const nombre = consulta.split(",")[0];
    const archivo = "scripts/.cache/" + nombre.toLowerCase().replace(/[^a-z]/g, "") + ".json";
    let g: Poligono | null = null;

    if (existsSync(archivo)) {
      const guardado = JSON.parse(readFileSync(archivo, "utf8"));
      if (guardado.geojson?.type) {
        g = guardado.geojson;
        console.log(`  ${nombre.padEnd(14)} cache`);
      }
    }

    if (!g) {
      for (let intento = 0; intento < 5 && !g; intento++) {
        await espera(1200);
        const r = await fetch(
          "https://nominatim.openstreetmap.org/search?format=json&limit=3&polygon_geojson=1&addressdetails=1&accept-language=es&q=" +
            encodeURIComponent(consulta),
          { headers: { "user-agent": "accidentes-lanzarote/1.0 (genera-costero)" } },
        );

        if (r.status === 429) {
          console.log(`  ${nombre.padEnd(14)} limite alcanzado, reintento`);
          continue;
        }
        if (!r.ok) break;

        const j = await r.json();
        const conPoli = j.filter((x: any) => x.geojson?.type === "Polygon" || x.geojson?.type === "MultiPolygon");
        const elegido = conPoli.find((x: any) => x.type === "island") ?? conPoli[0];

        if (!elegido) {
          console.log(`  ${nombre.padEnd(14)} sin poligono`);
          break;
        }

        const poly = elegido.geojson as Poligono;
        writeFileSync(archivo, JSON.stringify({ geojson: poly }), "utf8");
        g = poly;
        console.log(`  ${nombre.padEnd(14)} descargado (${anillosDe(poly).length} anillos)`);
      }
    }

    if (g) salida.push({ nombre, anillos: anillosDe(g) });
  }

  return salida;
}

/** Comprobaciones: sitios donde si o donde no tiene que haber tierra. */
const CONTROLES: Array<[string, number, number, boolean]> = [
  ["Arrecife (casco)", 28.964, -13.5499, true],
  ["San Bartolome (casco)", 29.0017, -13.6139, true],
  ["Tias (casco)", 28.9543, -13.6529, true],
  ["Yaiza (casco)", 28.9529, -13.7642, true],
  ["Tinajo (casco)", 29.0666, -13.6765, true],
  ["Teguise (casco)", 29.0593, -13.5602, true],
  ["Haria (casco)", 29.1459, -13.5001, true],
  ["Costa Teguise", 28.9959, -13.4972, true],
  ["Puerto del Carmen", 28.9204, -13.6507, true],
  ["Playa Blanca", 28.8632, -13.8299, true],
  ["El Golfo", 28.9822, -13.8314, true],
  ["Playa Quemada", 28.9075, -13.7322, true],
  ["La Graciosa", 29.02, -13.49, true],
  ["Mar al oeste", 29.0, -14.3, false],
  ["Mar al este", 29.05, -13.3, false],
  ["Mar frente a Famara (1 km)", 28.9, -13.9, false],
  ["Mar frente a Papagayo", 28.85, -13.95, false],
  ["Mar frente a Costa Teguise", 28.98, -13.35, false],
  ["Mar frente a Arrecife", 28.85, -13.88, false],
  ["Mar al norte", 29.35, -13.6, false],
  ["Mar al sur", 28.6, -13.6, false],
  // El puerto de Arrecife y laisineta de la marina. Con los limites
  // municipales esto pasaba por tierra y un marcador acabo dentro del puerto,
  // que es justo el fallo que motivo todo esto.
];

async function main() {
  console.log("\n  Generando el poligono de tierra de Lanzarote\n");

  const datos = await descargarPoligonos();
  if (datos.length < 5) {
    console.log("\n  Faltan municipios: el poligono seria incompleto. No se escribe nada.\n");
    process.exit(1);
  }

  const anillos: Anillo[] = [];
  for (const d of datos.filter((x) => x.nombre === NOMBRE_ISLA)) {
    for (const a of d.anillos) {
      const s = simplificar(a, TOLERANCIA_GRADOS);
      if (s.length > 4) anillos.push(s);
    }
  }
  const puntos = anillos.reduce((n, a) => n + a.length, 0);
  console.log(`\n  Anillos: ${anillos.length}  Puntos: ${puntos}`);

  function dentroDe(lat: number, lon: number) {
    for (const r of anillos) {
      let dentro = false;
      for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
        const yi = r[i][0];
        const xi = r[i][1];
        const yj = r[j][0];
        const xj = r[j][1];
        if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
          dentro = !dentro;
        }
      }
      if (dentro) return true;
    }
    return false;
  }

  function metrosAlBorde(lat: number, lon: number) {
    const m = metrosPorGrado(lat);
    let mejor = Infinity;

    for (const r of anillos) {
      for (let i = 0; i < r.length; i++) {
        const a = r[i];
        const b = r[(i + 1) % r.length];

        const ax = (a[1] - lon) * m.lon;
        const ay = (a[0] - lat) * m.lat;
        const bx = (b[1] - lon) * m.lon;
        const by = (b[0] - lat) * m.lat;

        const dx = bx - ax;
        const dy = by - ay;
        const largo = dx * dx + dy * dy;
        let t = largo === 0 ? 0 : -(ax * dx + ay * dy) / largo;
        t = Math.max(0, Math.min(1, t));

        const px = ax + dx * t;
        const py = ay + dy * t;
        const d = Math.sqrt(px * px + py * py);
        if (d < mejor) mejor = d;
      }
    }
    return mejor;
  }

  function esTierra(lat: number, lon: number) {
    return dentroDe(lat, lon) || metrosAlBorde(lat, lon) <= MARGEN_M;
  }

  /*
    La misma regla que usa el sitio para colocar marcadores: dentro de la isla y
    a 200 m o mas de cualquier borde. Es lo que descarta la darsena del puerto de
    los Marmoles, que el contorno de la isla no rodea.
  */
  function sitioSeguro(lat: number, lon: number) {
    return dentroDe(lat, lon) && metrosAlBorde(lat, lon) >= 200;
  }

  /*
    El puerto de los Marmoles, en Arrecife, es el caso dificil: el contorno de la
    isla no rodea la darsena, asi que el punto cae "dentro" del poligono y es agua.
    Lo que lo descarta es exigir 200 metros de tierra alrededor.
  */
  const PUERTO = 28.9608;
  const PUERTO_LON = -13.5454;
  console.log(`    ${sitioSeguro(PUERTO, PUERTO_LON) ? "FALLA" : "OK   "} la darsena del puerto no es sitio seguro (a ${Math.round(metrosAlBorde(PUERTO, PUERTO_LON))} m del borde)`);

  let fallos = sitioSeguro(PUERTO, PUERTO_LON) ? 1 : 0;
  console.log("\n  Comprobacion:");
  for (const [que, la, lo, debe] of CONTROLES) {
    const es = esTierra(la, lo);
    if (es !== debe) fallos++;
    console.log(
      `    ${es === debe ? "OK   " : "FALLA"} ${que.padEnd(26)} tierra=${String(es).padEnd(5)} (se espera ${debe})`,
    );
  }

  if (fallos > 0) {
    console.log(`\n  ${fallos} comprobaciones fallan. No se escribe nada.\n`);
    process.exit(1);
  }

  const cuerpo = anillos
    .map((r) => "  [" + r.map(([la, lo]) => `[${la.toFixed(5)}, ${lo.toFixed(5)}]`).join(", ") + "],")
    .join("\n");

  const cabecera = `/**
 * Poligono de tierra de Lanzarote.
 *
 * ---------------------------------------------------------------------------
 *  GENERADO. NO EDITAR A MANO.
 * ---------------------------------------------------------------------------
 *
 * Sale de \`scripts/generar-costero.ts\`, que lo pide a Nominatim y lo simplifica.
 * Para regenerarlo: \`npx tsx scripts/generar-costero.ts\`.
 *
 * Se versiona a proposito. Si el sitio dependiera de Nominatim en cada arranque,
 * un fallo de la red dejaria el mapa entero sin poder colocar marcadores, y eso
 * es justo lo que este fichero viene a evitar.
 *
 * Cada punto es [latitud, longitud] y cada anillo viene cerrado.
 *
 * ---------------------------------------------------------------------------
 *  PARA QUE SIRVE
 * ---------------------------------------------------------------------------
 *
 * Para una sola cosa: decidir si un punto cae en tierra o en el mar.
 *
 * El desplazamiento de privacidad del marcador (400-900 metros) es obligatorio,
 * pero en los pueblos de la costa un empuje de 900 metros se mete en el agua y
 * el mapa acaba diciendo que el accidente ocurrio en el oceano. Con este
 * poligono el desplazamiento se prueba y se busca otro que caiga en tierra, en
 * lugar de aceptar lo que salga al azar.
 */

/** Anillos: los siete municipios, que incluyen La Graciosa y los islotes. */
export const TIERRA_LANZAROTE: Array<Array<[number, number]>> = [
${cuerpo}
];

/** Margen en metros: tan cerca del borde se cuenta como tierra. */
export const MARGEN_TIERRA_M = ${MARGEN_M};
`;

  writeFileSync("src/lib/costeros.ts", cabecera, "utf8");
  console.log(`\n  Escrito src/lib/costeros.ts  (${puntos} puntos, ${(cabecera.length / 1024).toFixed(1)} KB)\n`);
}

main();