/**
 * Puerta de entrada: ¿esto es un accidente de tráfico?
 *
 * ---------------------------------------------------------------------------
 *  POR QUE HACE FALTA, CUANDO YA HAY UN FILTRO DE RELEVANCIA
 * ---------------------------------------------------------------------------
 *
 * El filtro de relevancia puntua palabras sueltas y descartaba por debajo de
 * 0.25. Con eso se colaron tres cosas que no son accidentes de tráfico:
 *
 *   "No rotundo de CC al segundo decreto de vivienda"   (política)
 *   "Incendio en Costa Teguise... complejo residencial" (incendio de edificio)
 *   "ASISTENCIA TECNICA"                                (avería)
 *
 * "incendio", "rescate", "112", "carretera" y "guardia civil" están en la lista
 * de relevancia, así que un artículo que las mencione pasa el corte aunque no
 * hable de ningún vehículo. Un sitio de accidentes de coches no puede permitir
 * eso.
 *
 * ---------------------------------------------------------------------------
 *  LA REGLA
 * ---------------------------------------------------------------------------
 *
 * Un artículo entra solo si TIENE LAS DOS COSAS:
 *
 *   1. un suceso (choque, vuelco, atropello, caída de un vehículo...)
 *   2. un vehículo o una vía (coche, moto, patinete, carretera, rotonda...)
 *
 * Con las dos a la vez, la política se cae sola porque no habla de vehículos, y
 * el incendio de edificio también porque no hay coche ni carretera. Un incendio
 * de coche SÍ entra: por eso "incendio" solo cuenta como suceso cuando además
 * hay un vehículo.
 *
 * ---------------------------------------------------------------------------
 *  POR QUÉ HAY DOS LISTAS Y NO UNA
 * ---------------------------------------------------------------------------
 *
 * El español conjuga los verbos, y comparar palabra por palabra deja fuera la
 * mitad de las noticias: el titular dice "colisionar", no "colisión"; "salió",
 * no "salida". Por eso hay dos formas de emparejar:
 *
 *   - EXACTAS: palabras cortas o ambiguas que se comparan enteras ("vía", "moto").
 *     Si secompararan por principio, "viable" contaría como una vía.
 *   - RAÍCES: palabras largas y características que se emparejan si una palabra
 *     EMPIEZA por la raíz y solo se prolonga unas letras ("colisión" atrapa
 *     "colisionar", "colisionó" y "colisionaron").
 *
 * ---------------------------------------------------------------------------
 *  LO QUE NO HACE
 * ---------------------------------------------------------------------------
 *
 * No decide si es de Lanzarote (eso lo hace `outsideLanzarote`, que va aparte) ni
 * si es grave. Solo contesta a la pregunta binaria.
 */

import { norm } from "@/lib/facts";
import { MUNICIPALITIES, ZONES } from "@/lib/constants";

/* -------------------------------------------------------------------------- */
/*  Sucesos                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Raíces de suceso. Todas largas y características, así que el prefijo no da
 * falsos positivos.
 */
const RAICES_SUCESO = [
  "accidente",
  "accidentad",
  "siniestr",
  "colision",
  "choque",
  "choc",
  "vuelc",
  "volc",
  "atropell",
  "atropelo",
  "arroll",
  "embist",
  "carrocer",
  "topista",
  "golpeo",
  "rozamiento",
  "alcant",
  "invadi",
];

/** Formas exactas de suceso: cortas o con preposiciones que cambian la raíz. */
const EXACTOS_SUCESO = new Set([
  "salida de via",
  "salidas de via",
  "salio de la via",
  "se salio de la via",
  "sale de la via",
  "se sale de la via",
  "salirse de la via",
  "salida via",
  "caida",
  "cayo",
  "cayend",
  "cayose",
  "cayo el",
  "cayo una",
  "cayo un",
  "roce",
  "roces",
  "alcance",
  "carroceria",
  "carrocerias",
  "cambio de sentido",
  "salto el",
]);

/**
 * Sucesos que solo cuentan si además hay un vehículo. Sin esta condición, un
 * incendio en una cocina o en un edificio se tomaría por un accidente de
 * tráfico, que es justo lo que se coló en la base de datos.
 */
const RAICES_SUCESO_CONDICIONADO = ["incend", "arder", "ardiendo", "fuego", "llamas", "chamaco", "hollin", "humo"];

/* -------------------------------------------------------------------------- */
/*  Vehículos y vías                                                          */
/* -------------------------------------------------------------------------- */

const RAICES_VEHICULO = [
  "vehicul",
  "turismo",
  "automovil",
  "automot",
  "motociclet",
  "ciclomotor",
  "patinete",
  "scooter",
  "biciclet",
  "ciclista",
  "camion",
  "furgonet",
  "furgon",
  "autobus",
  "guagua",
  "cuadricicl",
  "caravan",
  "remolque",
  "carretera",
  "autopista",
  "autovia",
  "avenida",
  "rotonda",
  "rotatoria",
  "glorieta",
  "circunvalacion",
  "arcen",
  "tunel",
  "aparcamiento",
  "carreteras",
  "carretero",
  "interurbana",
  "conductor",
  "conductora",
  "condutores",
  "motorista",
  "ciclistas",
];

const EXACTOS_VEHICULO = new Set([
  // Vehículos cortos: se comparan enteros para que "viable" no cuente como vía.
  "coche",
  "coches",
  "moto",
  "motos",
  "bici",
  "bici-electrico",
  "vehiculo",
  "vehiculos",
  "taxi",
  "taxis",
  "tractor",
  "tractores",
  "grua",
  "gruas",
  "furgoneta",
  "caravana",
  "movilidad",
  // Vías
  "via",
  "vias",
  "vial",
  "calle",
  "calles",
  "carretera",
  "cruce",
  "cruces",
  "crucero",
  "carril",
  "carriles",
  "pista",
  "pistas",
  "puente",
  "puentes",
  "parking",
  "garaje",
  "curva",
  "curvas",
  "recta",
  "km",
]);

/* -------------------------------------------------------------------------- */
/*  La isla                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Palabras que dicen que la noticia es de Lanzarote.
 *
 * ---------------------------------------------------------------------------
 *  POR QUE HACE FALTA, CUANDO YA HAY `outsideLanzarote`
 * ---------------------------------------------------------------------------
 *
 * `outsideLanzarote` (en facts.ts) descarta menciones de OTRAS ISLAS: Fuerteventura,
 * Tenerife, La Palma. Ese filtro no sabe nada de la Peninsula, y se colaba de todo:
 *
 *   "Cortada la AP-9 en Pontevedra tras volcar un camion"   -> guardado como Arrecife
 *   "Dos guardias civiles tiroteados en Terrassa"           -> guardado como Arrecife
 *   "Temporal en Espana, en directo"                         -> guardado como Arrecife
 *
 * Tres noticias de peninsula archivadas como si fueran de Arrecife. Es peor que
 * no publicarlas: es publicar informacion falsa con la marca del sitio encima.
 *
 * ---------------------------------------------------------------------------
 *  LA REGLA ES AL REVES
 * ---------------------------------------------------------------------------
 *
 * No se pregunta "no es de otro sitio?", sino "es de Lanzarote?". Se exige una
 * mencion positiva. Es mas estricta y por eso no se cuela nada: si el articulo
 * no dice ni Lanzarote ni un municipio ni una zona nuestra, no es nuestro.
 *
 * El coste es que se pierde lo que sea de la isla pero no lo nombre, y eso es
 * aceptable: sin nombre no hay forma honesta de situarlo ni de comprobarlo.
 */
/**
 * Topónimos que demuestran que un articulo es de Lanzarote.
 *
 * ---------------------------------------------------------------------------
 *  POR QUE SE GENERA Y NO SE ESCRIBE
 * ---------------------------------------------------------------------------
 *
 * Antes era una lista escrita a mano con los nombres de las zonas, y por eso se
 * quedo obsoleta en cuanto cambiaron las zonas: el filtro de isla seguia
 * aceptando Papagayo y El Jable, que ya no estan en la tabla, y se le habian
 * escapado las 51 zonas nuevas. Dos listas con el mismo contenido que se
 * desincronizan solas. Ahora sale de constants.ts.
 *
 * ---------------------------------------------------------------------------
 *  LOS NOMBRES MUY CORTOS NO ENTRAN
 * ---------------------------------------------------------------------------
 *
 * Hay tres localidades de tres letras o menos: Tao, Soo y Yé. Con la
 * comparacion por palabra completa (" la frase ".includes(" tao ")) no tienen
 * ningun falso positivo tecnico, pero "tao" es tambien una interjeccion
 * tipica y "soo" aparece al final de palabras compuestas. Este filtro existe
 * para RECHAZAR articulos de peninsula, y un acierto aqui es un fallo grave: mete en
 * el sitio un accidente que no ocurrio en Lanzarote. El coste de dejar fuera tres
 * pueblos es mucho menor que el de colar uno equivocado, asi que se descartan.
 * El resto de la isla sigue citandose con su nombre de municipio.
 *
 * ---------------------------------------------------------------------------
 *  TOPONIMOS QUE NO SON ZONAS
 * ---------------------------------------------------------------------------
 *
 * Esta ultima parte son nombres que la prensa usa mucho y que el editor no
 * metio en la lista de zonas. Se dejan aqui a proposito: el filtro de isla
 * tiene que reconocer la isla entera, no solo las localidades que publicamos.
 */
const TOPONIMOS_DE_LANZAROTE: string[] = (() => {
  const MINIMO = 4;

  const deMunicipios = MUNICIPALITIES.map((m) => norm(m.name));
  const deZonas = ZONES.flatMap((z) => [norm(z.name), ...(z.aliases ?? []).map(norm)]);

  return [...new Set(deMunicipios.concat(deZonas).filter((t) => t.length >= MINIMO))];
})();

const PALABRAS_DE_LANZAROTE: string[] = [
  // La isla y sus dos nombres
  "lanzarote",
  "la graciosa",
  "la graciosa village",
  // Municipios y zonas: se generan desde constants.ts
  ...TOPONIMOS_DE_LANZAROTE,
  // Localidades de sobra: se citan mucho en la prensa y son inequivocas
  "papagayo",
  "el jable",
  "jable",
  "la geria",
  "geria",
  "malpaso",
  "puerto de naos",
  "naos",
  "los marmoles",
  "marmoles",
  "la isleta",
  "las canteras",
  "temisas",
  "las manras",
  "famara",
  "san sebastian de la gomera",
  "el golfo",
  // El Patronato de Volcanes y el Cabildo, que aparecen en las notas oficiales
  "cabildo de lanzarote",
  "patronato de volcanes",
  "consejo insular",
  "ayuntamiento de teguise",
];

/** Carreteras de la isla: LZ-1 a LZ-67. */
const RE_CARRETERA_LZ = /\blz\s?-?\d{1,2}\b/;

/** Toponimos de la Peninsula y de Baleares, para avisar con un motivo claro. */
const FUERA_DE_LA_ISLA = [
  "madrid", "barcelona", "valencia", "sevilla", "granada", "bilbao", "vizcaya",
  "pontevedra", "vigo", "ourense", "a coruna", "santander", "asturias",
  "gijon", "oviedo", "burgos", "valladolid", "salamanca", "zamora", "leon",
  "palencia", "toledo", "ciudad real", "cuenca", "guadalajara", "albacete",
  "alicante", "murcia", "cartagena", "almeria", "huelva", "cadiz", "malaga",
  "cordoba", "jaen", "granada", "tarragona", "girona", "lerida", "terrassa",
  "sabadell", "badalona", "mataro", "reus", "girona", "mallorca", "ibiza",
  "palma", "menorca", "ciudad real", "merida", "salamanca", "burgos",
];

/**
 * Si el articulo es de Lanzarote.
 *
 * Devuelve tambien el motivo, porque "no parece de Lanzarote" no sirve de nada
 * en el panel: hay que poder distinguir "menciona Barcelona" de "no menciona
 * ningun sitio".
 */
export type IslaVeredicto = {
  deLanzarote: boolean;
  motivo: string;
};

export function evaluaIsla(titulo: string, cuerpo = ""): IslaVeredicto {
  const frases = `${norm(titulo)} ${norm(cuerpo)}`;

  for (const palabra of PALABRAS_DE_LANZAROTE) {
    if (` ${frases} `.includes(` ${palabra} `)) {
      return { deLanzarote: true, motivo: `menciona "${palabra}"` };
    }
  }

  if (RE_CARRETERA_LZ.test(frases)) {
    return { deLanzarote: true, motivo: "menciona una carretera de la isla" };
  }

  const fuera = FUERA_DE_LA_ISLA.find((p) => ` ${frases} `.includes(` ${p} `));
  if (fuera) {
    return { deLanzarote: false, motivo: `menciona "${fuera}", que no está en Lanzarote` };
  }

  return {
    deLanzarote: false,
    motivo: "no menciona Lanzarote ni ningún municipio, zona o carretera de la isla",
  };
}

/* -------------------------------------------------------------------------- */
/*  Emparejado                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Cuántas letras puede prolongar una raíz sin que deje de ser la misma palabra.
 * Cuatro basta para "colisión" -> "colisionaron" y corta antes de que una raíz
 * se coma otra cosa ("suceso" -> "sucesivo").
 */
const PROLONGACION_MAXIMA = 4;

/** Raíz corta y distinta de otra ya presente, para no contar la misma de dos veces. */
function emparejaRaiz(palabras: string[], raiz: string): boolean {
  const n = raiz.length;
  for (const p of palabras) {
    if (p.length < n) continue;
    if (!p.startsWith(raiz)) continue;
    if (p.length - n <= PROLONGACION_MAXIMA) return true;
  }
  return false;
}

export type TraficoVeredicto = {
  /** true solo si hay suceso Y hay vehículo o vía. */
  esAccidente: boolean;
  /** Por qué se ha descartado, para poder explicárselo al editor. */
  motivo: string;
  /** Lo que se ha encontrado, para revisar la decisión. */
  sucesos: string[];
  vehiculos: string[];
};

/** Los identificadores de carretera (LZ-2, LZ2, lz 40) no sobreviven a norm(). */
const RE_CARRETERA = /\blz\s?\d/;

export function evaluaAccidenteTrafico(titulo: string, cuerpo = ""): TraficoVeredicto {
  const t = norm(titulo);
  const c = norm(cuerpo);

  // El titular pesa el doble, igual que en extractFacts: es donde el medio
  // decide de qué va la noticia.
  const delTitular = t.split(" ").filter(Boolean);
  const delCuerpo = c.split(" ").filter(Boolean);
  const todos = [...delTitular, ...delCuerpo];

  /* --- vehículos y vías --- */
  const vehiculos: string[] = [];
  for (const raiz of RAICES_VEHICULO) {
    if (emparejaRaiz(delTitular, raiz) || emparejaRaiz(delCuerpo, raiz)) vehiculos.push(raiz);
  }
  for (const palabra of todos) {
    if (EXACTOS_VEHICULO.has(palabra)) vehiculos.push(palabra);
  }
  if (RE_CARRETERA.test(`${t} ${c}`)) vehiculos.push("carretera-lz");

  const tieneVehiculo = vehiculos.length > 0;

  /* --- sucesos --- */
  const sucesos: string[] = [];
  for (const raiz of RAICES_SUCESO) {
    if (emparejaRaiz(delTitular, raiz)) sucesos.push(raiz);
    else if (emparejaRaiz(delCuerpo, raiz)) sucesos.push(raiz);
  }
  const frases = `${t} ${c}`;
  for (const exacta of EXACTOS_SUCESO) {
    if (` ${frases} `.includes(` ${exacta} `)) sucesos.push(exacta);
  }

  const condicionados: string[] = [];
  for (const raiz of RAICES_SUCESO_CONDICIONADO) {
    if (emparejaRaiz(delTitular, raiz) || emparejaRaiz(delCuerpo, raiz)) condicionados.push(raiz);
  }

  const tieneSuceso = sucesos.length > 0;
  // "incendio" solo es suceso si hay vehículo: el incendio de un edificio no es
  // un accidente de tráfico, el de un coche sí.
  const tieneSucesoDeVehiculo = condicionados.length > 0 && tieneVehiculo;

  if (tieneSuceso && tieneVehiculo) {
    return { esAccidente: true, motivo: "suceso con vehículo o vía", sucesos, vehiculos };
  }

  if (tieneSucesoDeVehiculo) {
    return {
      esAccidente: true,
      motivo: "incendio de un vehículo",
      sucesos: [...sucesos, ...condicionados],
      vehiculos,
    };
  }

  if (!tieneSuceso && condicionados.length > 0) {
    return {
      esAccidente: false,
      motivo: "menciona un incendio o fuego pero ningún vehículo: no es un accidente de tráfico",
      sucesos: condicionados,
      vehiculos,
    };
  }

  if (!tieneSuceso) {
    return { esAccidente: false, motivo: "no menciona ningún suceso de tráfico", sucesos: [], vehiculos };
  }

  return {
    esAccidente: false,
    motivo: "menciona un suceso pero ningún vehículo ni vía",
    sucesos,
    vehiculos,
  };
}

/** Atajo booleano. */
export function esAccidenteDeTrafico(titulo: string, cuerpo = ""): boolean {
  return evaluaAccidenteTrafico(titulo, cuerpo).esAccidente;
}