/**
 * Las dos familias de noticias: sucesos e informacion.
 *
 * ---------------------------------------------------------------------------
 *  QUE RESUELVE
 * ---------------------------------------------------------------------------
 *
 * El sitio recoge dos cosas muy distintas con la misma columna `category`: los
 * accidentes de la isla y la actualidad de la isla. Encajarlas en una sola lista
 * plana obliga a elegir una de las dos y por eso casi todo caia en
 * ACCIDENTE_TRAFICO: un partido de balonmano, un horoscopo o una nota de prensa
 * de Madrid acababan publicados como "Accidente".
 *
 * Aqui se separan en dos familias y se declara cual es cual. El sitio usa eso
 * para montar apartados, menús y filtros sin tener que decidir en cada pagina
 * que lista de categorias le toca.
 *
 * ---------------------------------------------------------------------------
 *  DONDE VIVE EL REPARTO Y POR QUE NO EN LA BASE DE DATOS
 * ---------------------------------------------------------------------------
 *
 * En este fichero, no en el enum de Postgres. El enum solo puede crecer, nunca
 * encogerse: quitar un valor del que se sirve ya obliga a convertir la columna a
 * texto plano. Guardando aqui que categoria es suceso y cual es informacion,
 * mover un tipo de una familia a otra es cambiar una linea, sin migracion.
 *
 * El enum si esta completo (ver prisma/migrations/20260105000000_...sql). Lo
 * que no esta aqui es el reparto, que es una decision editorial y cambia.
 *
 * ---------------------------------------------------------------------------
 *  LAS DOS FAMILIAS
 * ---------------------------------------------------------------------------
 *
 * SUCESOS: lo que le importa a quien va a enterarse de que ha pasado algo en la
 * carretera. Se muestran en el mapa, se resumen por semana y por ano, y el
 * titular lleva el tipo de vehiculo.
 *
 * INFORMACION: la actualidad de la isla. Va en su propio apartado, con sus
 * filtros por tema, y no alimenta el mapa ni los resumenes de accidentes. Un
 * partido de football no es un suceso y no tiene por que estar junto a un
 * atropello.
 *
 * ---------------------------------------------------------------------------
 *  COMO SE USA
 * ---------------------------------------------------------------------------
 *
 *   esSuceso("ATROPELLO")                  -> true
 *   familiaDe("DEPORTES")                   -> "informacion"
 *   CATEGORIAS_INFORMACION.length           -> los temas que tienen apartado
 *
 */

import { CATEGORY_LABEL, CATEGORY_PILL } from "@/lib/constants";

/** Los tipos que son sucesos de tráfico. */
export const CATEGORIAS_SUCESO = [
  "ACCIDENTE_TRAFICO",
  "ATROPELLO",
  "INCENDIO",
  "RESCATE",
  "EMERGENCIA_SANITARIA",
  "ACTUACION_SERVICIOS",
  "DESAPARICION",
] as const;

/**
 * Los temas de informacion, en el orden en que salen en el menu del apartado.
 *
 * El orden es el que ve el lector, no el alfabetico: primero lo que mas se lee
 * de un periodico local (politica, servicios, economia) y al final lo mas
 * especifico. Los tres ultimos estan fuera del menu por defecto y solo se
 * ofrecen como filtro: son relleno de la prensa que casi nunca va de Lanzarote.
 */
export const CATEGORIAS_INFORMACION = [
  "POLITICA",
  "INSTITUCIONES",
  "ECONOMIA",
  "EMPLEO",
  "EMPRESAS",
  "SERVICIOS",
  "TRANSPORTE",
  "URBANISMO",
  "AGUA",
  "ENERGIA",
  "RESIDUOS",
  "SANIDAD",
  "EDUCACION",
  "VIVIENDA",
  "SOCIEDAD",
  "BIENESTAR_SOCIAL",
  "MEDIO_AMBIENTE",
  "AGRICULTURA_GANADERIA",
  "PESCA_MAR",
  "TURISMO",
  "CULTURA",
  "FIESTAS_Y_TRADICIONES",
  "GASTRONOMIA",
  "DEPORTES",
  "TELEVISION_Y_ESPECTACULOS",
  "CIENCIA_TECNOLOGIA",
  "METEOROLOGIA",
  "MAR",
  "SEGURIDAD_CIUDADANA",
  "JURIDICO",
  "TRAMITES_Y_SERVICIOS_CIUDADANO",
  "RELIGION",
  "ACTOS_PROTOCOLARIOS",
  "SUERTES_Y_OCIO",
] as const;

export type CategoriaSuceso = (typeof CATEGORIAS_SUCESO)[number];
export type CategoriaInformacion = (typeof CATEGORIAS_INFORMACION)[number];
export type Familia = "suceso" | "informacion";

const SUCESO_SET = new Set<string>(CATEGORIAS_SUCESO);

const INFORMACION_SET = new Set<string>(CATEGORIAS_INFORMACION);

/** De que familia es una categoria. "OTRO" se trata como informacion. */
export function familiaDe(categoria: string | null | undefined): Familia {
  if (!categoria) return "informacion";
  return SUCESO_SET.has(categoria) ? "suceso" : "informacion";
}

export function esSuceso(categoria: string | null | undefined): boolean {
  return familiaDe(categoria) === "suceso";
}

/** Todos los valores de `category` que existen en el enum de Postgres. */
export const TODAS_LAS_CATEGORIAS: string[] = [
  ...CATEGORIAS_SUCESO,
  ...CATEGORIAS_INFORMACION,
  "OTRO",
];

/**
 * Los mismos temas, pero solo los que merecen un boton en el menu.
 *
 * Se ofrecen como filtro el resto. Motivo: un menu de cuarenta entradas no lo
 * usa nadie, pero perder de vista "suertes y ocio" (que no existe en un periodico
 * local de verdad) no pasa nada, mientras que perder "agricultura" si.
 *
 * Lo que se ha dejado fuera son SUERTES_Y_OCIO, RELIGION y
 * ACTOS_PROTOCOLARIOS, que casi nunca son noticias de la isla por si mismas.
 */
export const CATEGORIAS_INFORMACION_MENU: string[] = CATEGORIAS_INFORMACION.filter(
  (c) => !["SUERTES_Y_OCIO", "RELIGION", "ACTOS_PROTOCOLARIOS"].includes(c),
);

/** Como consultar las noticias de una familia con Prisma. */
export function consultasDe(where: Record<string, unknown>): Record<string, unknown>[] {
  return [
    { AND: [where, { category: { in: [...CATEGORIAS_SUCESO] } }] },
    { AND: [where, { category: { notIn: [...CATEGORIAS_SUCESO] } }] },
  ];
}

/** Las etiquetas de un tipo de noticia, para menus y filtros. */
export function etiquetaDe(categoria: string): string {
  return CATEGORY_LABEL[categoria] ?? categoria;
}

/** El nombre corto de una familia, para titulos y breadcrumbs. */
export const NOMBRE_FAMILIA: Record<Familia, string> = {
  suceso: "Sucesos",
  informacion: "Información",
};

/** El tipo de pastilla de cada categoria, para el color de la tarjeta. */
export function pillDe(categoria: string): string {
  return CATEGORY_PILL[categoria] ?? "neutral";
}