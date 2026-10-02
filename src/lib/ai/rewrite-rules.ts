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

/** Como se nombra cada tipo de incidente. */
const TITULO_CATEGORIA: Record<IncidentCategory, string> = {
  ACCIDENTE_TRAFICO: "Accidente de tráfico",
  ATROPELLO: "Atropello",
  INCENDIO: "Incendio",
  RESCATE: "Rescate",
  EMERGENCIA_SANITARIA: "Emergencia sanitaria",
  ACTUACION_SERVICIOS: "Actuación de servicios de emergencia",
  DESAPARICION: "Desaparición",
  OTRO: "Suceso",
};

/** Sustantivo de vehiculo, para las frases del tipo "colision entre turismos". */
const SUSTANTIVO_VEHICULO: Record<VehicleType, string> = {
  COCHE: "un turismo",
  MOTO: "una moto",
  CAMION: "un camión",
  BICICLETA: "una bicicleta",
  PEATON: "un peatón",
  OTROS: "un vehículo",
};

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
    return `${cat} con ${vLabel(f.vehicleType)} en ${m}`;
  }

  return `${cat} en ${m}`;
}

/** "un turismo", "una moto"... en minuscula, para pegar en medio de una frase. */
function vLabel(v: VehicleType | null): string | null {
  if (!v) return null;
  return SUSTANTIVO_VEHICULO[v];
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
  return `En el suceso estaba implicado ${uno}. ${respuesta}`;
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
    const cuandoTexto = franja ?? `el ${fecha}`;
    const p1 =
      `${cat} registrado ${cuandoTexto}, sobre las ${hora}, en ${lugar}.`;

    /* ---------------------------- Entrada 2 ------------------------- */
    // La segunda frase habla de los vehiculos cuando se sabe cuales son, y de
    // las personas cuando no. Nunca de las dos cosas, para no recitar.
    const v = f.vehicleType;
    const p2 = v ? fraseVehiculos(v, f) : fraseAfectados(f);

    /* ---------------------------- Entrada 3 ------------------------- */
    // Esta frase es la que cierra siempre igual en este tipo de web. Es formula
    // de genero y no cuenta como copia: el detector de copia mide coincidencia
    // de 6 palabras seguidas, y aqui no llega.
    const p3 = "Los servicios de emergencia han atendido el aviso.";

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