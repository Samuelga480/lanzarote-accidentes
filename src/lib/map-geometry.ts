/**
 * Geometria del mapa de Lanzarote (SVG).
 *
 * Modulo sin dependencias: lo usan componentes de cliente, por eso no puede
 * importar nada de Prisma ni de Node.
 *
 * El contorno de la isla es una simplificacion cartografica dibujada a mano
 * para la interfaz. Las coordenadas de los accidentes NUNCA son exactas: el
 * pipeline las desplaza de forma deliberada (ver lib/ai/pipeline.ts).
 */

export const MAP_VIEWBOX = { x: 0, y: 0, width: 420, height: 620 };

/** Recuadro geografico cubierto por el mapa. */
const BBOX = {
  latMin: 28.46,
  latMax: 29.16,
  lonMin: -13.88,
  lonMax: -13.42,
};

/**
 * Proyeccion equirectangular con correccion de latitud, suficiente para una
 * isla de este tamano. Devuelve coordenadas del viewBox SVG.
 */
export function project(lat: number, lon: number): { x: number; y: number } {
  const meanLatRad = ((BBOX.latMin + BBOX.latMax) / 2) * (Math.PI / 180);
  const lonScale = Math.cos(meanLatRad);

  const lonSpan = (BBOX.lonMax - BBOX.lonMin) * lonScale;
  const latSpan = BBOX.latMax - BBOX.latMin;

  const x = ((lon - BBOX.lonMin) * lonScale * MAP_VIEWBOX.height) / latSpan;
  const y = MAP_VIEWBOX.height - ((lat - BBOX.latMin) * MAP_VIEWBOX.height) / latSpan;

  const offsetX = (MAP_VIEWBOX.width - (lonSpan * MAP_VIEWBOX.height) / latSpan) / 2;
  return { x: x + offsetX, y };
}

/** Convierte un contorno [lat, lon][] en los puntos de un <polygon>. */
export function toPoints(outline: Array<[number, number]>): string {
  return outline.map(([lat, lon]) => {
    const { x, y } = project(lat, lon);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
}

/** Contorno simplificado de Lanzarote, en sentido horario desde el sureste. */
export const LANZAROTE_OUTLINE: Array<[number, number]> = [
  [28.565, -13.628], [28.61, -13.612], [28.68, -13.602], [28.75, -13.598],
  [28.81, -13.608], [28.86, -13.63], [28.89, -13.67], [28.895, -13.7],
  [28.87, -13.73], [28.82, -13.77], [28.78, -13.8], [28.83, -13.825],
  [28.88, -13.815], [28.92, -13.8], [28.935, -13.77], [28.945, -13.73],
  [28.99, -13.69], [29.035, -13.625], [29.065, -13.56], [29.095, -13.505],
  [29.125, -13.47], [29.09, -13.46], [29.045, -13.505], [28.995, -13.56],
  [28.965, -13.615], [28.94, -13.665], [28.91, -13.695], [28.875, -13.7],
  [28.83, -13.685], [28.76, -13.655], [28.68, -13.635], [28.62, -13.632],
];

/** La Graciosa, isla menor al norte, conectada por ferry con Orzola. */
export const LA_GRACIOSA_OUTLINE: Array<[number, number]> = [
  [29.2, -13.52], [29.245, -13.505], [29.26, -13.47], [29.245, -13.45],
  [29.2, -13.455], [29.185, -13.49],
];

/** Puntos de referencia para rotular el mapa. */
export const MAP_LABELS: Array<{ name: string; lat: number; lon: number }> = [
  { name: "Órzola", lat: 29.03, lon: -13.545 },
  { name: "El Golfo", lat: 28.9, lon: -13.75 },
  { name: "Famara", lat: 28.87, lon: -13.83 },
  { name: "Arrecife", lat: 28.47, lon: -13.79 },
  { name: "Costa Teguise", lat: 28.55, lon: -13.63 },
  { name: "Yaiza", lat: 28.83, lon: -13.66 },
  { name: "Haría", lat: 29.12, lon: -13.45 },
];
