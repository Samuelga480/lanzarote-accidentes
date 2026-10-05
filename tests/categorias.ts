/**
 * Pruebas de la separacion entre sucesos e informacion.
 *
 *   npx tsx tests/categorias.ts
 *
 * ---------------------------------------------------------------------------
 *  POR QUE ESTO SE COMPRUEBA
 * ---------------------------------------------------------------------------
 *
 * El fallo que estas pruebas cubren fue silencioso y estaba en una sola linea: la
 * ingestion traducía "no he podido clasificar esta noticia" por "es un
 * accidente". Con 85 noticias en la base de datos, 68 acabaron marcadas como
 * ACCIDENTE_TRAFICO, y solo unas pocas eran de verdad accidentes: un partido de
 * balonmano, un horoscopo, una serie de television, una nota de prensa de Madrid.
 *
 * Nada de eso daba error. El sitio publicaba, el panel aprobaba, el mapa
 * colocaba el punto. Solo el resultado estaba mal, y por eso nadie se dio cuenta.
 *
 * Un test que comprueba "devuelve algo" no lo habria detectado. Estos miran lo
 * que importa: que lo que no es un suceso no acabe en la familia de sucesos.
 */

import { resolveCategory } from "@/lib/resolve-category";
import {
  CATEGORIAS_SUCESO,
  CATEGORIAS_INFORMACION,
  CATEGORIAS_INFORMACION_MENU,
  TODAS_LAS_CATEGORIAS,
  esSuceso,
} from "@/lib/categorias";
import { CATEGORY_LABEL } from "@/lib/constants";
import { INCIDENT_CATEGORIES } from "@/lib/facts";
import { evaluaIsla } from "@/lib/traffic-gate";

let passed = 0;
let failed = 0;

function check(name: string, ok: boolean, detail = "") {
  if (ok) {
    passed++;
    console.log(`  ok    ${name}`);
  } else {
    failed++;
    console.log(`  FALLA ${name}${detail ? ` -> ${detail}` : ""}`);
  }
}

function section(titulo: string) {
  console.log(`\n${titulo}`);
}

/* ========================================================================== */
section("Las dos familias no se pisan");

{
  const info = new Set<string>(CATEGORIAS_INFORMACION);

  check("hay siete tipos de suceso", CATEGORIAS_SUCESO.length === 7, `${CATEGORIAS_SUCESO.length}`);
  check(
    "hay temas de informacion",
    CATEGORIAS_INFORMACION.length >= 30,
    `${CATEGORIAS_INFORMACION.length}`,
  );

  const solapes = CATEGORIAS_SUCESO.filter((c) => info.has(c));
  check("ningun tipo esta en las dos familias", solapes.length === 0, solapes.join(", "));
}

/* ========================================================================== */
section("Las familias se identifican bien");

{
  for (const c of CATEGORIAS_SUCESO) {
    check(`${c} es suceso`, esSuceso(c) === true);
  }
  for (const c of CATEGORIAS_INFORMACION) {
    check(`${c} NO es suceso`, esSuceso(c) === false);
  }

  // OTRO y lo vacio van a informacion. Es la decision que evita que lo
  // desconocido acabe en el mapa.
  check("OTRO no es suceso", esSuceso("OTRO") === false);
  check("sin categoria no es suceso", esSuceso(null) === false);
  check("categoria indefinida no es suceso", esSuceso(undefined) === false);
}

/* ========================================================================== */
section("Ningun tipo se queda sin etiqueta");

{
  const sinEtiqueta = TODAS_LAS_CATEGORIAS.filter((c) => !CATEGORY_LABEL[c]);
  check("todos los tipos tienen etiqueta", sinEtiqueta.length === 0, sinEtiqueta.join(", "));

  // Lo inverso: que no haya etiquetas de tipos que ya no existen.
  const huerfanas = Object.keys(CATEGORY_LABEL).filter((k) => !TODAS_LAS_CATEGORIAS.includes(k));
  check("no hay etiquetas sin tipo", huerfanas.length === 0, huerfanas.join(", "));
}

/* ========================================================================== */
section("El enum, las constantes y el codigo dicen lo mismo");

{
  // Si estas tres listas se desincronizan, Prisma deja de escribir filas o el
  // menu enseña temas que no existen en la base de datos.
  const soloEnCodigo = INCIDENT_CATEGORIES.filter((c) => !TODAS_LAS_CATEGORIAS.includes(c));
  check(
    "INCIDENT_CATEGORIES no tiene tipos de mas",
    soloEnCodigo.length === 0,
    soloEnCodigo.join(", "),
  );

  const enCodigo = new Set<string>(INCIDENT_CATEGORIES);
  const soloEnFamilias = TODAS_LAS_CATEGORIAS.filter((c) => !enCodigo.has(c));
  check("las familias no tienen tipos de mas", soloEnFamilias.length === 0, soloEnFamilias.join(", "));
}

/* ========================================================================== */
section("El menu esta recortado");

{
  check(
    "el menu tiene menos entradas que el total",
    CATEGORIAS_INFORMACION_MENU.length < CATEGORIAS_INFORMACION.length,
    `menu ${CATEGORIAS_INFORMACION_MENU.length} de ${CATEGORIAS_INFORMACION.length}`,
  );

  const fuera = CATEGORIAS_INFORMACION.filter((c) => !CATEGORIAS_INFORMACION_MENU.includes(c));
  const previstos = ["SUERTES_Y_OCIO", "RELIGION", "ACTOS_PROTOCOLARIOS"];
  check(
    "lo que se queda fuera son los tres previstos",
    fuera.length === 3 && fuera.every((c) => previstos.includes(c)),
    fuera.join(", "),
  );

  // Lo que se recorta del menu no puede perderse: sigue como filtro.
  check(
    "lo recortado sigue disponible como filtro",
    fuera.every((c) => CATEGORIAS_INFORMACION.includes(c)),
  );
}

/* ========================================================================== */
section("Lo que se clasifica bien: el fallo original");

{
  // Los casos reales que estaban mal. Todo esto salia como ACCIDENTE_TRAFICO.
  const reales: Array<[string, string, string]> = [
    [
      "DEPORTES",
      "El Balonmano Lanzarote Ciudad de Arrecife logra su tercer triunfo",
      "El conjunto vencio por 28 a 22 y sigue en la cabeza de la liga.",
    ],
    [
      "DEPORTES",
      "El CICAR Lanzarote suma su primera victoria en casa",
      "Vencio al rival y salio con contusiones.",
    ],
    [
      "SUERTES_Y_OCIO",
      "Tu horoscopo diario: lunes 5 de octubre de 2026",
      "Aries trae buenas noticias en el trabajo y Tauro debe tener paciencia.",
    ],
    [
      "TELEVISION_Y_ESPECTACULOS",
      "Confirmado por HBO: la temporada 2 del spin-off llega",
      "El episodio llegara en 2027.",
    ],
    [
      "SOCIEDAD",
      "El error de alimentar a los loros solo con semillas",
      "Un veterinario explica por que es peligroso y que deben comer.",
    ],
    [
      "CULTURA",
      "Conoce a los ganadores del concurso de microrrelatos de Radio Lanzarote",
      "Los ganadores son dos vecinos de Arrecife.",
    ],
    [
      "GASTRONOMIA",
      "El restaurante de Yaiza que se hace con el producto local",
      "La carta cambia cada temporada.",
    ],
  ];

  for (const [esperado, titulo, cuerpo] of reales) {
    const cat = resolveCategory(null, titulo, "", cuerpo);
    check(`"${titulo.slice(0, 44)}" -> ${esperado}`, cat === esperado, `obtenido: ${cat}`);
  }
}

/* ========================================================================== */
section("Lo que no se clasifica cae en OTRO, no en un accidente");

{
  /*
    Esta es la comprobacion central. Lo que no se reconoce tiene que caer en OTRO,
    que es de la familia de informacion. Si volviera a caer en ACCIDENTE_TRAFICO,
    el fallo original estaria otra vez.
  */
  const sinPista = [
    "Un texto del que no se saca ninguna conclusion",
    "Los editores se reunen",
    "Texto sin ninguna palabra con sentido",
  ];

  for (const titulo of sinPista) {
    const cat = resolveCategory(null, titulo);
    check(
      `"${titulo.slice(0, 40)}" no se marca como accidente`,
      cat !== "ACCIDENTE_TRAFICO",
      `obtenido: ${cat}`,
    );
    check("  y no entra en la familia de sucesos", esSuceso(cat) === false);
  }

  check("texto vacio no es accidente", resolveCategory(null, "") !== "ACCIDENTE_TRAFICO");
  check("texto vacio cae en OTRO", resolveCategory(null, "") === "OTRO");
}

/* ========================================================================== */
section("Un accidente de verdad sigue siendo accidente");

{
  /*
    El riesgo de arreglar el fallo anterior es pasarse: si todo lo desconocido cae
    en OTRO, los accidentes de verdad dejarian de clasificarse. Estas noticias
    tienen que seguir saliendo con su tipo.
  */
  const accidentes: Array<[string, string, string]> = [
    ["ACCIDENTE_TRAFICO", "Colision entre dos turismos en la LZ-2", "Uno de los conductores quedo herido."],
    ["ATROPELLO", "Atropello a un peaton en Arrecife", "La persona fue trasladada en ambulancia."],
    ["INCENDIO", "Incendio en un turismo tras un accidente", "Los bomberos apagaron el fuego."],
  ];

  for (const [esperado, titulo, cuerpo] of accidentes) {
    const cat = resolveCategory(null, titulo, "", cuerpo);
    check(`"${titulo.slice(0, 40)}" sigue siendo ${esperado}`, cat === esperado, `obtenido: ${cat}`);
    check("  y es de la familia de sucesos", esSuceso(cat) === true);
  }
}

/* ========================================================================== */
section("Lo que ya viene detectado no se toca");

{
  // Si extractFacts ya sabe la categoria, resolveCategory no puede cambiarla.
  const yaSabida = resolveCategory("DEPORTES", "Lo que sea", "", "");
  check("respeta la categoria detectada", yaSabida === "DEPORTES", `obtenido: ${yaSabida}`);
}

/* ========================================================================== */
section("La puerta de la isla sigue siendo estricta");

{
  /*
    Anadir informacion no debe abrir el grifo de la actualidad nacional. Madrid o
    Barcelona no son de Lanzarote aunque no sean accidentes, y deben seguir
    descartadas.
  */
  const fuera = [
    ["Madrid", "El alcalde de Madrid presenta un plan de obras"],
    ["Barcelona", "El ayuntamiento de Barcelona amplia el tranvia"],
  ];
  for (const [sitio, titulo] of fuera) {
    const v = evaluaIsla(titulo, "");
    check(`${sitio} sigue descartado`, v.deLanzarote === false, `motivo: ${v.motivo}`);
  }

  const dentro = evaluaIsla("El Cabildo de Lanzarote aprueba el presupuesto", "");
  check("el Cabildo si entra", dentro.deLanzarote === true, `motivo: ${dentro.motivo}`);

  const politica = resolveCategory(null, "El Cabildo de Lanzarote aprueba el presupuesto", "El pleno.", "");
  check(
    "una noticia politica de la isla se clasifica",
    politica === "POLITICA" || politica === "INSTITUCIONES",
    `obtenido: ${politica}`,
  );
}

/* ========================================================================== */
console.log(
  failed === 0 ? `\n${passed} correctas, 0 fallidas\n` : `\n${passed} correctas, ${failed} FALLIDAS\n`,
);
process.exit(failed > 0 ? 1 : 0);