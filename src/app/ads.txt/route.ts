import { ADS_SNAPSHOT } from "@/data/ads-snapshot";
import { conLineasExtra } from "@/data/ads-extra";

/**
 * ads.txt del sitio.
 *
 * ---------------------------------------------------------------------------
 *  QUE ES Y QUE NO ES
 * ---------------------------------------------------------------------------
 *
 * No es un anuncio: no pinta nada en la pagina y nadie lo ve. Es la lista de
 * redes autorizadas a comprar este espacio. Sin ella, la red no puede
 * comprobar que es legitima y avisa de que el archivo no esta integrado.
 *
 * ---------------------------------------------------------------------------
 *  COMO FUNCIONA
 * ---------------------------------------------------------------------------
 *
 * Se pide el fichero al panel de la red y se sirve tal cual. Si la red no
 * responde, se sirve la copia local que trae el propio editor. Se cachea una
 * hora: el fichero cambia pocas veces y pedirlo en cada visita seria absurdo.
 */

const URL_PANEL = "https://ads.themoneytizer.com/ads_txt.php?site_id=143435&id=133147";

/** Cuanto se espera a la red antes de tirar de la copia local. */
const TIMEOUT_MS = 4000;

/** Una hora de cache en la CDN. */
const CACHE = 3600;

/**
 * Normaliza el texto al formato de la especificacion IAB.
 *
 * Sin espacios alrededor de las comas, una entrada por linea y sin lineas
 * vacias. Las redes suelen tolerar las dos formas, pero el formato canonico
 * evita que un comprador estricto descarte el fichero.
 */
function normalizar(txt: string): string {
  return (
    txt
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l !== "")
      .map((l) =>
        /^(OWNERDOMAIN|MANAGERDOMAIN)=/i.test(l)
          ? l
          : l
              .split(",")
              .map((c) => c.trim())
              .join(","),
      )
      .join("\n") + "\n"
  );
}

/** Valida que lo devuelto sea de verdad un ads.txt y no una pagina de error. */
function esAdsTxt(txt: string): boolean {
  // Tiene que declarar el dominio.
  if (!/^\s*OWNERDOMAIN\s*=/im.test(txt)) return false;
  // Y tiene que traer al menos una red: OWNERDOMAIN solo no sirve de nada.
  if (!/^\s*[a-z0-9.\-]+\.[a-z]{2,}\s*,/im.test(txt)) return false;
  // Y alguna linea debe ser de la red que gestiona el sitio.
  return /themoneytizer\.com\s*,\s*\d+\s*,\s*(DIRECT|RESELLER)/i.test(txt);
}

async function desdeElPanel(): Promise<string | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(URL_PANEL, {
      signal: ctrl.signal,
      cache: "no-store",
      headers: { Accept: "text/plain" },
    });
    if (!res.ok) return null;

    const txt = await res.text();
    if (!esAdsTxt(txt)) return null;

    return normalizar(txt);
  } catch {
    // Red caida, timeout o sin salida. No es un fallo del sitio.
    return null;
  } finally {
    clearTimeout(t);
  }
}

export async function GET() {
  /*
    Las lineas extra se anaden DESPUES de la respuesta del panel, no antes. Si se
    anadieran solo a la copia local, no aparecerian nunca: la peticion al panel
    funciona y lo que devuelve es lo que se sirve. Ver ads-extra.ts, que explica
    por que conviven los dos identificadores de la red.
  */
  const base = (await desdeElPanel()) ?? normalizar(ADS_SNAPSHOT);
  const txt = conLineasExtra(base);

  return new Response(txt, {
    status: 200,
    headers: {
      // text/plain y no text/html: es un fichero de datos, y hay auditorias de
      // seguridad que lo comprueban.
      "Content-Type": "text/plain; charset=utf-8",
      // Cache corta en el CDN pero sin inmutabilidad: el panel regenera el
      // fichero y tiene que poder llegar la version nueva.
      "Cache-Control": `public, max-age=0, s-maxage=${CACHE}, stale-while-revalidate=86400`,
      // Esta ruta no es secreta ni personal: se puede cachear en cualquier
      // intermediario.
      "Access-Control-Allow-Origin": "*",
    },
  });
}