/**
 * Pruebas de los errores que se guardan al redactar una noticia.
 *
 *   npx tsx tests/errores.ts
 *
 * ---------------------------------------------------------------------------
 *  POR QUE EXISTEN
 * ---------------------------------------------------------------------------
 *
 * Cada comprobacion de este fichero corresponde a un fallo que llego a la base
 * de datos de verdad, no a un caso teorico:
 *
 *   - 68 noticias marcadas como accidente sin que el texto tuviera una palabra
 *     de accidente.
 *   - Un contador por municipio que decia 68 noticias en Arrecife cuando no se
 *     sabia de ninguna, porque la columna guarda un valor por defecto.
 *   - Un partido de balonmano con la etiqueta de atropello, por la palabra
 *     "ciclista".
 *
 * verify.ts no los habria visto: comprueba fecha, coherencia interna y longitud,
 * que aqui estan bien. Lo que falla es la relacion entre la noticia y el tipo que
 * se le ha puesto, y eso solo se ve mirando las dos cosas juntas.
 */

import {
  detectaErrores,
  erroresEnTexto,
  erroresParaElPrompt,
  resumenDeErrores,
  CODIGOS,
  type EditorialError,
  type EntradaError,
} from "@/lib/errores";
import { esSuceso } from "@/lib/categorias";

let passed = 0;
let failed = 0;

function check(nombre: string, ok: boolean, detalle = "") {
  if (ok) {
    passed++;
    console.log(`  ok    ${nombre}`);
  } else {
    failed++;
    console.log(`  FALLA ${nombre}${detalle ? ` -> ${detalle}` : ""}`);
  }
}

function section(titulo: string) {
  console.log(`\n${titulo}`);
}

/** Una entrada con lo tipico: noticia de accidente bien montada. */
function buena(extra: Partial<EntradaError> = {}): EntradaError {
  return {
    title: "Colision entre dos turismos en la LZ-2",
    summary: "Uno de los conductores quedo herido y fue trasladado.",
    body: "El accidente ocurrio esta madrugada en la carretera insular de Tias. La Guardia Civil atendio a los dos conductores y uno fue evacuado.",
    category: "ACCIDENTE_TRAFICO",
    categoryDetectada: "ACCIDENTE_TRAFICO",
    municipalitySlug: "tias",
    municipalityDelTexto: true,
    occurredAt: new Date(),
    sourceScore: 0.8,
    ...extra,
  };
}

function codigos(e: EditorialError[]) {
  return e.map((x) => x.codigo);
}

/* ========================================================================== */
section("Una noticia bien montada no da ningun error");

{
  const e = detectaErrores(buena());
  check("no hay errores graves", !e.some((x) => x.nivel === "grave"), codigos(e).join(", "));
  check("no hay ningun error", e.length === 0, codigos(e).join(", "));
  check('el resumen lo dice vacio', resumenDeErrores([]) === "sin errores");
}

/* ========================================================================== */
section("El fallo grande: accidente sin ninguna palabra de accidente");

{
  /*
    Este es el caso que produjo 68 noticias marcadas como accidente. El titulo y
    el cuerpo son los de un partido de balonmano, pero el tipo que se le asigno
    fue ACCIDENTE_TRAFICO porque el clasificador no reconocio nada.
  */
  const e = detectaErrores(
    buena({
      title: "El Balonmano Lanzarote Ciudad de Arrecife logra su tercer triunfo",
      summary: "El conjunto vencio por 28 a 22 y sigue en la cabeza de la liga.",
      body: "El Balonmano vencio en el Palacio de los Deportes y mantiene el liderato tras la victoria.",
      category: "ACCIDENTE_TRAFICO",
      categoryDetectada: null,
      municipalitySlug: null,
      municipalityDelTexto: false,
    }),
  );
  check("lo detecta", codigos(e).includes("ACCIDENTE_SIN_SENAL"), codigos(e).join(", "));
  check('lo marca como grave', e.find((x) => x.codigo === "ACCIDENTE_SIN_SENAL")?.nivel === "grave");
  check("ademas avisa del municipio", codigos(e).includes("MUNICIPIO_NO_DICHO"));
  check("el grave va en el prompt", erroresParaElPrompt(e).some((x) => x.includes("accidente")));
}

/* ========================================================================== */
section("Lo que no es de la isla");

{
  const e = detectaErrores(
    buena({
      title: "El alcalde de Madrid presenta un plan de obras",
      summary: "El ayuntamiento de Madrid presenta sus cuentas.",
      body: "El alcalde de Madrid ha presentado el balance del ano.",
    }),
  );
  check("lo marca como fuera de la isla", codigos(e).includes("FUERA_DE_LA_ISLA"), codigos(e).join(", "));
  check("y es grave", e.find((x) => x.codigo === "FUERA_DE_LA_ISLA")?.nivel === "grave");

  // Una noticia de la isla con la palabra "pleno" no se marca.
  const dentro = detectaErrores(
    buena({
      title: "El Cabildo de Lanzarote aprueba el presupuesto",
      summary: "El pleno aprobo las cuentas del ejercicio.",
      body: "El Cabildo de Lanzarote ha aprobado hoy el presupuesto en Arrecife.",
    }),
  );
  check("una noticia de la isla no se marca", !codigos(dentro).includes("FUERA_DE_LA_ISLA"));
}

/* ========================================================================== */
section("El municipio puesto por defecto");

{
  const e = detectaErrores(
    buena({
      title: "Una noticia sin lugar claro",
      summary: "Resumen sin municipio.",
      body: "Un texto que no dice donde ha pasado nada en la isla.",
      municipalitySlug: "arrecife",
      municipalityDelTexto: false,
    }),
  );
  check("avisa", codigos(e).includes("MUNICIPIO_NO_DICHO"));
  check(
    "y explica que el municipio es el del mapa",
    e.find((x) => x.codigo === "MUNICIPIO_NO_DICHO")?.detalle.includes("mapa") === true,
  );

  /*
    Y el caso mas sutil: el municipio viene marcado como "|del texto" pero el
    nombre no aparece ni en el titulo ni en el resumen ni en el cuerpo. Con la
    comparacion normalizada, que antes daba un aviso en todas las noticias.
  */
  const f = detectaErrores(
    buena({
      title: "Un suceso sin lugar",
      summary: "Resumen que tampoco dice nada.",
      body: "El cuerpo no menciona ningun municipio de la isla en ninguna parte.",
      municipalitySlug: "tias",
      municipalityDelTexto: true,
    }),
  );
  check("tambien avisa si el cuerpo no lo confirma", codigos(f).includes("MUNICIPIO_NO_DICHO"));
}

/* ========================================================================== */
section("La gravedad no significa nada en una noticia de informacion");

{
  /*
    Que una noticia de informacion no tenga gravedad es lo normal y no es un
    error. Lo que si lo es es que alguien la haya puesto a mano: gravedad grave
    afirma que hay heridos o fallecidos, y eso no se ve en el texto.
  */
  const normal = detectaErrores(
    buena({
      title: "El Cabildo de Lanzarote aprueba el presupuesto",
      summary: "El pleno aprobo las cuentas.",
      body: "El presupuesto de la isla para el ano que viene.",
      category: "POLITICA",
      categoryDetectada: "POLITICA",
    }),
  );
  check(
    "una nota politica no da error de gravedad",
    !codigos(normal).includes("GRAVEDAD_SIN_SENTIDO"),
  );

  const conGravedad = detectaErrores(
    buena({
      title: "El Cabildo de Lanzarote aprueba el presupuesto",
      summary: "El pleno aprobo las cuentas.",
      body: "El presupuesto de la isla para el ano que viene.",
      category: "POLITICA",
      categoryDetectada: "POLITICA",
      gravedad: "GRAVE",
    }),
  );
  check("con gravedad puesta si avisa", codigos(conGravedad).includes("GRAVEDAD_SIN_SENTIDO"));
  check(
    "y lo sube a aviso, no a nota",
    conGravedad.find((x) => x.codigo === "GRAVEDAD_SIN_SENTIDO")?.nivel === "aviso",
  );
  check(
    "un aviso si llega al prompt",
    erroresParaElPrompt(conGravedad).some((x) => x.includes("gravedad")),
  );

  const conCoche = detectaErrores(
    buena({
      title: "El Cabildo de Lanzarote aprueba el presupuesto",
      summary: "El pleno aprobo las cuentas.",
      body: "El presupuesto de la isla para el ano que viene.",
      category: "POLITICA",
      categoryDetectada: "POLITICA",
      vehicleType: "COCHE",
    }),
  );
  check("con vehiculo puesto avisa", codigos(conCoche).includes("GRAVEDAD_SIN_SENTIDO"));
  check(
    "pero como nota, que es menor",
    conCoche.find((x) => x.codigo === "GRAVEDAD_SIN_SENTIDO")?.nivel === "nota",
  );
  check(
    "y una nota no llega al prompt",
    !erroresParaElPrompt(conCoche).some((x) => x.includes("vehiculo")),
  );

  check(
    "un suceso no genera ese error",
    !codigos(detectaErrores(buena())).includes("GRAVEDAD_SIN_SENTIDO"),
  );
}

/* ========================================================================== */
section("Sin fecha");

{
  const e = detectaErrores(buena({ occurredAt: null }));
  check("avisa de que no se sabe cuando", codigos(e).includes("SIN_FECHA"));
  check(
    "explica que no entra en los resumenes",
    e.find((x) => x.codigo === "SIN_FECHA")?.detalle.includes("resumenes") === true,
  );
  check("con fecha no avisa", !codigos(detectaErrores(buena())).includes("SIN_FECHA"));
}

/* ========================================================================== */
section("Como se guardan y se leen");

{
  const e = detectaErrores(buena({ municipalityDelTexto: false, occurredAt: null }));
  const texto = erroresEnTexto(e);

  check(
    "cada error es una linea",
    texto.split("\n").length === e.length,
    `${texto.split("\n").length} lineas para ${e.length} errores`,
  );
  check("cada linea lleva su nivel", e.every((x) => texto.includes(`[${x.nivel}]`)));
  check("cada linea lleva su codigo", e.every((x) => texto.includes(x.codigo)));

  /*
    El panel vuelve a partir estas lineas para pintar cada error con su color. Si
    el formato cambia en un sitio y no en el otro, el panel deja de mostrarlos sin
    dar ningun error. Por eso se comprueba que el panel sabe leer lo que se escribe.
  */
  const leido = leerComoElPanel(texto);
  check("el panel lee los mismos errores", leido.length === e.length, `${leido.length} leidos`);
  check("con el mismo nivel", leido.every((x, i) => x.nivel === e[i].nivel));
  check(
    "y con el titulo y el detalle separados",
    leido.every((x, i) => x.titulo === e[i].titulo && x.detalle === e[i].detalle),
  );
}

/* ========================================================================== */
section("Lo que llega al redactor");

{
  const graves = detectaErrores(
    buena({
      title: "El Balonmano Lanzarote logra su tercer triunfo",
      summary: "Vencio por 28 a 22.",
      body: "El conjunto vencio y sigue en la cabeza de la liga.",
      municipalityDelTexto: false,
    }),
  );
  const alPrompt = erroresParaElPrompt(graves);
  check("lleva el grave y el aviso", alPrompt.length >= 2, `${alPrompt.length}`);
  check(
    "son frases con dos puntos, para que el prompt las distinga",
    alPrompt.every((x) => x.includes(":")),
  );

  const ninguno = erroresParaElPrompt(detectaErrores(buena()));
  check("una noticia limpia no manda nada", ninguno.length === 0, `${ninguno.length}`);
}

/* ========================================================================== */
section("Cada codigo declarado se puede devolver");

{
  /*
    Un codigo declarado que ninguna comprobacion devuelve es un aviso que el panel
    espera ver y nunca llega.
  */
  const todos = new Set<string>();
  const escenas: Array<Partial<EntradaError>> = [
    {
      category: "ACCIDENTE_TRAFICO",
      categoryDetectada: null,
      title: "Un partido de balonmano",
      summary: "Victoria del equipo",
      body: "Vencio y sigue lider.",
      municipalityDelTexto: false,
    },
    {
      title: "El alcalde de Madrid presenta un plan",
      summary: "Cuentas de Madrid",
      body: "El alcalde de Madrid presenta el balance.",
    },
    { municipalityDelTexto: false, occurredAt: null },
    {
      category: "POLITICA",
      categoryDetectada: "POLITICA",
      title: "El Cabildo aprueba el presupuesto",
      summary: "El pleno aprobo las cuentas.",
      body: "El presupuesto de la isla.",
      municipalityDelTexto: true,
    },
    { sourceScore: 0.1 },
    {
      /*
        TIPO_NO_ENCUADRA: el primer analisis dijo DEPORTES, pero al releer el texto
        completo no sale ninguna palabra de deporte. Pasa cuando el titular trae la
        pista y el cuerpo habla de otra cosa.
      */
      category: "DEPORTES",
      categoryDetectada: "DEPORTES",
      title: "Victoria en el polideportivo de la isla",
      summary: "Resumen sin vocabulario reconocible.",
      body: "La nota cuenta otra cosa distinta y no usa ninguna palabra del tema.",
      municipalityDelTexto: false,
    },
    {
      /*
        GRAVEDAD_SIN_SENTIDO: una nota de informacion con gravedad puesta a mano.
        Eso si afirma algo, y lo que afirma no se ve en el texto.
      */
      category: "CULTURA",
      categoryDetectada: "CULTURA",
      title: "El Cabildo de Lanzarote aprueba el presupuesto",
      summary: "El pleno aprobo las cuentas.",
      body: "El presupuesto de la isla para el ano que viene.",
      gravedad: "GRAVE",
      municipalityDelTexto: false,
    },
  ];

  for (const e of escenas) for (const c of codigos(detectaErrores(buena(e)))) todos.add(c);

  check(
    "cada codigo declarado se puede devolver",
    CODIGOS.every((c) => todos.has(c)),
    CODIGOS.filter((c) => !todos.has(c)).join(", "),
  );

  const noDeclarados = [...todos].filter((c) => !CODIGOS.includes(c as never));
  check("no sale ningun codigo sin declarar", noDeclarados.length === 0, noDeclarados.join(", "));

  // El ciclo completo: guardar y releer desde el texto plano.
  let vueltas = 0;
  for (const e of escenas) {
    const originales = detectaErrores(buena(e));
    const leidos = leerComoElPanel(erroresEnTexto(originales));
    if (leidos.length !== originales.length) {
      console.log(`    FALLA ida y vuelta en ${JSON.stringify(e).slice(0, 46)}`);
      failed++;
    } else {
      vueltas++;
    }
  }
  check(`ida y vuelta completa en las ${escenas.length} escenas`, vueltas === escenas.length);
}

/* ========================================================================== */
section("Nada de explodes con entradas raras");

{
  const raros: Array<Partial<EntradaError>> = [
    { title: "", summary: "", body: "" },
    { title: "Solo titulo" },
    {
      category: null,
      categoryDetectada: null,
      municipalitySlug: null,
      municipalityDelTexto: false,
      occurredAt: null,
      sourceScore: 0,
    },
    { category: "NO_EXISTE", categoryDetectada: "TAMBIEN_NO" as never, sourceScore: 1 },
  ];

  let vivo = true;
  for (const r of raros) {
    try {
      detectaErrores(buena(r));
    } catch (e) {
      vivo = false;
      console.log(`    explota con ${JSON.stringify(r).slice(0, 46)}: ${e}`);
    }
  }
  check("una entrada rara no tumba la deteccion", vivo);

  const vacio = detectaErrores({
    title: "",
    summary: "",
    body: "",
    category: null,
    categoryDetectada: null,
    municipalitySlug: null,
    municipalityDelTexto: false,
    occurredAt: null,
    sourceScore: 0,
  });
  check("un texto vacio no da errores", vacio.length === 0);
  check("y no es un accidente", !codigos(vacio).includes("ACCIDENTE_SIN_SENAL"));
}

/* ========================================================================== */
section("Ninguna noticia de informacion se toma por un accidente");

{
  /*
    La comprobacion central. Un tipo de informacion con un titular de
    informacion no puede generar el aviso de accidente, aunque el texto no tenga
    nada de trafico: es informacion, no un accidente mal clasificado.
  */
  const informativa = detectaErrores(
    buena({
      title: "El Cabildo de Lanzarote aprueba el presupuesto",
      summary: "El pleno aprobo las cuentas del ejercicio.",
      body: "El presupuesto de la isla para el ano que viene.",
      category: "POLITICA",
      categoryDetectada: "POLITICA",
    }),
  );
  check(
    "una nota politica no da el aviso de accidente",
    !codigos(informativa).includes("ACCIDENTE_SIN_SENAL"),
  );
  check('y su tipo es de informacion', esSuceso("POLITICA") === false);
}

/* ========================================================================== */
console.log(
  failed === 0 ? `\n${passed} correctas, 0 fallidas\n` : `\n${passed} correctas, ${failed} FALLIDAS\n`,
);
process.exit(failed > 0 ? 1 : 0);

/**
 * Copia exacta del lector que hay en el panel.
 *
 * Va aqui a proposito. Si el formato de erroresEnTexto cambia y el panel no se
 * actualiza, el panel deja de pintar los errores sin que nada falle. Estas
 * pruebas pillan ese caso en cuanto se ejecuta la suite.
 */
function leerComoElPanel(reviewNotes: string) {
  const salida: Array<{ nivel: string; codigo: string; titulo: string; detalle: string }> = [];
  for (const linea of reviewNotes.split("\n")) {
    const m = /^\[(grave|aviso|nota)\]\s+([A-Z_]+):\s*(.+)$/.exec(linea.trim());
    if (!m) continue;

    const resto = m[3];
    const corte = resto.indexOf(". ");
    salida.push({
      nivel: m[1],
      codigo: m[2],
      titulo: corte > 0 ? resto.slice(0, corte) : resto,
      detalle: corte > 0 ? resto.slice(corte + 2) : "",
    });
  }
  return salida;
}