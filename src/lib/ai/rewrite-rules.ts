import type { ExtractedFacts, IncidentCategory, VehicleType } from "@/lib/facts";
import type { RewriteRequest, RewriteResult } from "./rewrite";
import { measureOverlap } from "./rewrite";
import { formatDate, formatTime } from "@/lib/format";

/**
 * Reescritor por reglas: redacta la noticia SIN inteligencia artificial.
 *
 * ---------------------------------------------------------------------------
 *  POR QUE EXISTE
 * ---------------------------------------------------------------------------
 *
 * Las IAs de pago exigen ser mayor de edad y no dejan abrir cuenta a quien no lo
 * es. Este fichero quita esa dependencia: construye la noticia a partir de los
 * datos que ya se han extraido del original (fecha, municipio, carretera, tipo,
 * heridos, fallecidos), y escribe con palabras propias sin usar el texto de la
 * fuente.
 *
 * REGLA INNEGOCIABLE: si un dato no esta en ExtractedFacts, no aparece en la
 * noticia. No se rellena nada. Un null honesto deja la frase en su version
 * corta; un dato inventado es una noticia falsa.
 *
 * ---------------------------------------------------------------------------
 *  QUE NO HACE
 * ---------------------------------------------------------------------------
 *
 * No resume ni matiza. Una condicion del tiempo, un parte de un tercero o el
 * contexto de por que ocurrio se pierden. Es un recorte deliberado: la
 * alternativa es inventar, y aqui no se inventa.
 *
 * Cuando OPENROUTER_API_KEY este definida, la IA sigue siendo la via
 * principal porque escribe mejor. Esto es el camino de reserva.
 */

/* -------------------------------------------------------------------------- */
/*  Diccionarios                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Como se nombra cada tipo de incidente.
 *
 * Solo se usan los tipos de SUCESO. El reescritor solo redacta titulares de
 * accidentes: una noticia de política no pasa por aquí, se queda con el titular
 * que le da el medio. Que el Record sea `Partial` es a proposito: si alguien
 * anade un tipo de información y se le olvida esta tabla, el reescritor sigue
 * compilando en vez de romperse, porque no puede usar un tipo de información
 * aquí.
 *
 * Para las etiquetas que ve el lector están CATEGORY_LABEL (constants.ts).
 */
const TITULO_CATEGORIA: Partial<Record<IncidentCategory, string>> = {
  ACCIDENTE_TRAFICO: "Accidente de tráfico",
  ATROPELLO: "Atropello",
  INCENDIO: "Incendio",
  RESCATE: "Rescate",
  EMERGENCIA_SANITARIA: "Emergencia sanitaria",
  ACTUACION_SERVICIOS: "Actuación de servicios de emergencia",
  DESAPARICION: "Desaparición",
  OTRO: "Suceso",
};

/**
 * Sustantivo de vehiculo, para las frases del tipo "colision entre turismos".
 *
 * Cada uno trae su genero porque "estaba implicado una bicicleta" esta mal dicho,
 * y era lo que salia: el articulo de un atropello de ciclista se publicaba con un
 * fallo de concordancia en la segunda frase. El genero va con el sustantivo en
 * vez de en un sitio aparte para que no se puedan desincronizar.
 */
const SUSTANTIVO_VEHICULO: Record<VehicleType, { con: string; era: "implicado" | "implicada" }> = {
  COCHE: { con: "un turismo", era: "implicado" },
  MOTO: { con: "una moto", era: "implicada" },
  CAMION: { con: "un camión", era: "implicado" },
  BICICLETA: { con: "una bicicleta", era: "implicada" },
  PEATON: { con: "un peatón", era: "implicado" },
  OTROS: { con: "un vehículo", era: "implicado" },
};

/**
 * Como se cierra la noticia.
 *
 * ---------------------------------------------------------------------------
 *  POR QUE HAY VARIANTES
 * ---------------------------------------------------------------------------
 *
 * Antes todas las noticias terminaban con la MISMA frase, la de "Los servicios
 * de emergencia han atendido el aviso". En una web de noticias, eso delata que
 * las maquina el texto: veinte articulos seguidos con la misma ultima linea se
 * leen como relleno y hacen que el visitante no se fíe del resto.
 *
 * Las variantes se eligen con una suma de letras del titular, no al azar: dos
 * noticias parecidas pueden salir distintas, pero la misma noticia siempre sale
 * igual. Un texto que cambia cada vez que se recarga un problema para el editor
 * y para el buscador.
 */
const CIERRES = [
  "Los servicios de emergencia han atendido el aviso.",
  "Intervinieron los servicios de emergencia de la isla.",
  "El aviso fue atendido sobre el terreno.",
  "El equipo de rescate se traslado al lugar del suceso.",
  "La emergencia fue canalizada a traves del 112.",
  "Los servicios de seguridad tambien acudian al lugar.",
  "Hubo aviso al 112 y se movilizo el operativo.",
] as const;

/**
 * Elige el cierre segun el titular, de forma estable.
 *
 * Se suman los codigos de los caracteres y se toma el resto al dividir entre el
 * numero de variantes. No es criptografia: es para que dos noticias con los
 * mismos hechos no acaben con la misma ultima frase, y para que la misma noticia
 * no cambie de una visita a otra.
 */
function eligeCierre(semilla: string): string {
  let suma = 0;
  for (let i = 0; i < semilla.length; i++) suma += semilla.charCodeAt(i);
  return CIERRES[suma % CIERRES.length];
}

/**
 * Como se cuenta a las personas en espanol.
 * Llega hasta 21 porque por encima de ahi lo habitual es poner la cifra.
 */
const NUMEROS = [
  "cero", "uno", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve", "diez",
  "once", "doce", "trece", "catorce", "quince", "dieciséis", "diecisiete", "dieciocho",
  "diecinueve", "veinte", "veintiuno",
];

function numero(n: number): string {
  return NUMEROS[n] ?? String(n);
}

/* -------------------------------------------------------------------------- */
/*  Ayudas                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Momento del suceso, en palabras.
 *
 * La hora se lee del texto YA formateado en hora de Canarias, no del UTC: si se
 * sacara del UTC, a las 23:30 UTC (00:30 en Canarias) la frase diria "esta
 * noche, sobre las 00:30", que no cuadra.
 *
 * Devuelve null si no hay hora fiable: se prefiere no decir nada antes que
 * inventar una franja horaria.
 */
function momento(horaLocal: string): string | null {
  const hh = Number.parseInt(horaLocal.slice(0, 2), 10);
  if (Number.isNaN(hh)) return null;

  if (hh >= 6 && hh < 12) return "esta mañana";
  if (hh >= 12 && hh < 15) return "a mediodía";
  if (hh >= 15 && hh < 21) return "esta tarde";
  if (hh >= 21 && hh < 24) return "esta noche";
  return "de madrugada";
}

/**
 * El nombre "Lanzarote" no es un municipio: es la isla. Quien llama lo pasa
 * cuando no se ha podido determinar el municipio, y por eso aqui no se puede
 * decir "el municipio de Lanzarote", que seria mentira. Se dice la isla.
 *
 * Los siete municipios de verdad son Arrecife, San Bartolome, Teguise, Tinajo,
 * Tias, Yaiza y Haria (ver MUNICIPALITIES).
 */
function sinMunicipio(municipioNombre: string): boolean {
  const n = municipioNombre.trim();
  return n === "" || n === "Lanzarote";
}

/**
 * Donde ha ocurrido.
 *
 * La combinacion con "a la altura de" es formula del genero: va a aparecer en
 * cualquier redaccion de este tipo y no cuenta como copia.
 */
function donde(facts: ExtractedFacts, municipioNombre: string): string {
  const zona = facts.areaLabel?.trim();

  if (facts.road && zona) return `la carretera ${facts.road}, a la altura de ${zona}`;
  if (facts.road) return `la carretera ${facts.road}, en ${municipioNombre}`;
  if (zona) return `la zona de ${zona}, en ${municipioNombre}`;
  if (sinMunicipio(municipioNombre)) return `la isla de Lanzarote`;
  return `el municipio de ${municipioNombre}`;
}

/**
 * Frase de las personas afectadas.
 *
 * Es la parte mas delicada: cada rama dice solo lo que se sabe. Si no hay
 * cifras, no se menciona a nadie. Si los heridos son cero y no hay fallecidos,
 * se dice que no hay heridos, que es informacion y no suposicion.
 */
function fraseAfectados(f: ExtractedFacts): string {
  const heridos = f.injuries;
  const fallecidos = f.fatalities;

  // Sin ninguna cifra no se menciona a nadie.
  if (heridos === null && fallecidos === null) {
    return "La información disponible no precisa el número de personas afectadas.";
  }

  // Con las dos cifras a cero, eso es lo que dice y ya es información.
  if (heridos === 0 && fallecidos === 0) {
    return "No constan personas heridas ni fallecidas.";
  }

  const partes: string[] = [];

  if (fallecidos !== null && fallecidos > 0) {
    partes.push(
      fallecidos === 1 ? "una persona fallecida" : `${numero(fallecidos)} personas fallecidas`,
    );
  }
  if (heridos !== null && heridos > 0) {
    partes.push(heridos === 1 ? "una persona herida" : `${numero(heridos)} personas heridas`);
  }

  if (partes.length === 0) {
    // Solo queda el caso de que uno sea 0 y el otro null.
    if (heridos === 0) return "No se registran personas heridas.";
    return "No se comunican fallecidos.";
  }

  const lista = partes.length === 2 ? `${partes[0]} y ${partes[1]}` : partes[0];

  return `La información recibida apunta a ${lista}.`;
}

/* -------------------------------------------------------------------------- */
/*  Titular                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Titular. Se compone con los datos, nunca con palabras del original.
 *
 * El nombre del municipio va siempre: es lo que se busca ("accidentes Yaiza") y
 * lo que hace que dos noticias de carretera distinta no se confundan.
 */
function titular(f: ExtractedFacts, req: RewriteRequest): string {
  const cat = f.category ? TITULO_CATEGORIA[f.category] : "Suceso";
  const m = req.municipalityName;

  if (f.road) {
    const v = f.vehicleType;
    const detalle =
      v === "MOTO" ? " con una moto" : v === "CAMION" ? " con un camión" : v === "PEATON" ? " con un peatón" : "";
    return `${cat}${detalle} en la ${f.road} a la altura de ${m}`;
  }

  if (vLabel(f.vehicleType)) {
    // Con el genero del sustantivo, por el mismo motivo que en fraseVehiculos.
    return `${cat} con ${SUSTANTIVO_VEHICULO[f.vehicleType!].con} en ${m}`;
  }

  return `${cat} en ${m}`;
}

/** "un turismo", "una moto"... en minuscula, para pegar en medio de una frase. */
function vLabel(v: VehicleType | null): string | null {
  if (!v) return null;
  return SUSTANTIVO_VEHICULO[v].con;
}

/**
 * Frase de los vehiculos implicados.
 *
 * Solo dice el tipo cuando se conoce. El numero de vehiculos no se inventa: si
 * no viene en los datos, se habla en singular.
 */
function fraseVehiculos(v: VehicleType, f: ExtractedFacts): string {
  const uno = SUSTANTIVO_VEHICULO[v];
  const respuesta = fraseAfectados(f);
  // El genero viene con el sustantivo. Antes ponia siempre "implicado", y con
  // una moto o una bicicleta quedaba "estaba implicado una moto".
  return `En el suceso estaba ${uno.era} ${uno.con}. ${respuesta}`;
}

/* -------------------------------------------------------------------------- */
/*  Entrada principal                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Redacta la noticia a partir de los datos extraidos.
 *
 * Devuelve siempre ok:true o un fallo con motivo. No hay excepcion a medio
 * redactar: si algo va mal, mejor un error claro que media noticia.
 */
export function rewriteByRules(request: RewriteRequest): RewriteResult {
  try {
    const f = request.facts;
    const cuando = new Date(request.occurredAtIso);

    if (Number.isNaN(cuando.getTime())) {
      return { ok: false, error: "Fecha del suceso no valida.", overlap: null };
    }

    const fecha = formatDate(cuando);
    const hora = formatTime(cuando);
    const franja = momento(hora);
    const lugar = donde(f, request.municipalityName);
    const cat = f.category ? TITULO_CATEGORIA[f.category] : "Suceso";

    /* ---------------------------- Titular --------------------------- */
    const title = titular(f, request);

    /* ---------------------------- Entrada --------------------------- */
    /*
      La hora se dice de una manera o de otra, nunca de las dos. Antes salia
      "registrado esta mañana, sobre las 08:48", que repite lo mismo con otras
      palabras. Ahora se elige la parte del día o la hora exacta, y si ninguna
      sirve se cae a la fecha.
    */
    const cuandoTexto = franja ? `${franja}, a las ${hora}` : `el ${fecha}`;
    const p1 = `${cat} registrado ${cuandoTexto}, en ${lugar}.`;

    /* ---------------------------- Entrada 2 ------------------------- */
    // La segunda frase habla de los vehiculos cuando se sabe cuales son, y de
    // las personas cuando no. Nunca de las dos cosas, para no recitar.
    const v = f.vehicleType;
    const p2 = v ? fraseVehiculos(v, f) : fraseAfectados(f);

    /* ---------------------------- Entrada 3 ------------------------- */
    // Antes era siempre la misma frase. Veintena articulos seguidos con la misma
    // ultima linea se leen como relleno y hacen que el visitante no se fíe del
    // resto. Elijo entre varias segun el titular, de forma estable.
    const p3 = eligeCierre(request.title);

    const body = [p1, p2, p3].join("\n\n");

    /* ---------------------------- Resumen --------------------------- */
    const resumen = `${title}. ${fraseAfectados(f)}`;

    /* ---------------------------- Excerpt --------------------------- */
    const excerpt = `${resumen.slice(0, 150).trim()}${resumen.length > 150 ? "…" : ""}`;

    /* ---------------------------- SEO ------------------------------- */
    // El titulo SEO lleva el municipio al principio, que es lo que la gente
    // busca, y se recorta a 60 caracteres sin partir palabra.
    const seoTitle = recortar(`${cat} en ${request.municipalityName}`, 60);

    const metaDescription = recortar(
      `${title}. ${fraseAfectados(f)} ${fecha}.`,
      155,
    );

    /* ---------------------------- Medir copia ----------------------- */
    // Se mide igualmente aunque no se haya usado el texto original. Asi el
    // pipeline ve el mismo formato en las dos vias y puede comparar.
    const overlap = measureOverlap(request.body || request.summary, body);

    return {
      ok: true,
      title,
      summary: resumen,
      body,
      excerpt,
      seoTitle,
      metaDescription,
      // null = no fue una IA. El panel lo muestra para distinguir una cosa de
      // la otra al revisar.
      model: null,
      overlap,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Fallo la redaccion por reglas.",
      overlap: null,
    };
  }
}

/**
 * Recorta a `n` caracteres sin partir por la mitad una palabra.
 * Un titulo SEO cortado a media palabra queda mal en Google.
 */
function recortar(texto: string, n: number): string {
  if (texto.length <= n) return texto;
  const cortado = texto.slice(0, n);
  const ultimoEspacio = cortado.lastIndexOf(" ");
  return (ultimoEspacio > n * 0.6 ? cortado.slice(0, ultimoEspacio) : cortado).trim();
}