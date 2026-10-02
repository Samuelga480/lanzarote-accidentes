import { ADS_SNAPSHOT } from "@/data/ads-snapshot";

/**
 * ads.txt del sitio.
 *
 * Es el equivalente al ads_tm.php del sitio antiguo, en JavaScript y sin PHP:
 * Vercel no ejecuta PHP, asi que el fichero original no podia correr tal cual.
 *
 * Que es y que no es, porque se confunde mucho:
 *
 *   ads.txt NO es un anuncio. No pinta nada en la pagina y nadie lo ve.
 *   Es una lista que dice que redes pueden comprar este espacio. Sirve para que
 *   una red externa no se lleve tu trafico sin que lo sepas.
 *
 * Como funciona: se pide el fichero al panel de la red y se sirve tal cual. Si
 * la red no responde, se sirve la copia local. Se cachea una hora porque el
 * fichero cambia pocas veces y pedirlo en cada visita seria absurdo.
 */

const URL_PANEL = "https://ads.themoneytizer.com/ads_txt.php?site_id=143435&id=133147";

/** Cuanto se espera a la red antes de tirar de la copia local. */
const TIMEOUT_MS = 4000;

/** Una hora de cache en la CDN. */
const CACHE = 3600;

/**
 * Descarga el ads.txt del panel.
 *
 * Se valida antes de devolverlo: si la red devolviera una pagina de error o un
 * HTML, servir eso como ads.txt dejaria el fichero inservible sin avisar.
 */
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

    // Tiene que traer la declaracion del dominio. Si no, no es un ads.txt.
    if (!/^\s*OWNERDOMAIN\s*=/m.test(txt)) return null;
    // Y tiene que traer al menos una linea de red: OWNERDOMAIN solo no sirve.
    if (!/^\s*[a-z0-9.\-]+\.[a-z]{2,}\s*,/im.test(txt)) return null;

    // Se normaliza: sin espacios alrededor de las comas y sin lineas vacias.
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
  } catch {
    // Red caida, timeout o sin salida: no es un fallo del sitio.
    return null;
  } finally {
    clearTimeout(t);
  }
}

export async function GET() {
  const txt = (await desdeElPanel()) ?? ADS_SNAPSHOT;

  return new Response(txt, {
    status: 200,
    headers: {
      // text/plain y no text/html: es un fichero de datos. Algunos auditors de
      // seguridad lo comprueban.
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": `public, max-age=0, s-maxage=${CACHE}, stale-while-revalidate=86400`,
    },
  });
}