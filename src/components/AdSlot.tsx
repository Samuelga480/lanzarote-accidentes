import Script from "next/script";

/**
 * Hueco de publicidad.
 *
 * Hay tres modos, y se elige con la variable ADS_SNIPPET y ADS_PREVIEW:
 *
 *   1. Con fragmento   -> se inyecta el codigo de la red y se ve el anuncio.
 *   2. Con ADS_PREVIEW -> se reserva el hueco con su medida y una etiqueta, sin
 *                         nada dentro. Sirve para ver la maquetacion antes de
 *                         tener el codigo.
 *   3. Sin nada        -> no se pinta. Es preferible a un hueco vacio que
 *                         empuja el contenido y hace saltar la pagina.
 *
 * Por que se inyecta con dangerouslySetInnerHTML: los codigos de las redes de
 * anuncios son scripts que la propia red exige ejecutar tal cual, no hay forma
 * de expresarlos con JSX. Eso significa que hay que confiar en la red: por eso
 * conviene revisar periodicamente que no hayan cambiado el fragmento.
 *
 * ---------------------------------------------------------------------------
 *  RITMO DE APARICION
 * ---------------------------------------------------------------------------
 *
 * El editor pidio "2 de cada 3 noticias" y "uno en la portada". El ritmo se
 * aplica con debeMostrarAd, en este mismo fichero.
 *
 * Sin ritmo, un anuncio entre cada tarjeta satura: quien llega de un buscador ve
 * la noticia entre tres banners. Con 2 de cada 3 el anuncio aparece a menudo sin
 * llegar a tapar la lectura.
 */

/** Ritmo pedido: 2 de cada 3. */
export const CADA_CUANTOS = 3;
export const CUANTOS_MOSTRAR = 2;

/**
 * Decide si el hueco se pinta para el elemento que va en la posicion `indice`.
 *
 * Con CADA_CUANTOS=3 y CUANTOS_MOSTRAR=2 la secuencia es:
 *   indice 0 -> si,  1 -> si,  2 -> no,  3 -> si,  4 -> si,  5 -> no, ...
 *
 * Se usa el residuo y no un aleatorio: con azar el ritmo cambia en cada recarga
 * y no se puede comprobar a ojo que se cumple.
 */
export function debeMostrarAd(indice: number): boolean {
  return indice % CADA_CUANTOS < CUANTOS_MOSTRAR;
}

/** Medidas de referencia para maquetar. */
const FORMATOS = {
  // Cabecera horizontal, el estandar de la portada.
  leaderboard: { alto: 250, ancho: 970, texto: "Leaderboard 970 x 250" },
  // Tarjeta cuadrada, la que va entre noticias.
  rectangular: { alto: 250, ancho: 300, texto: "Rectangular 300 x 250" },
} as const;

export type FormatoAd = keyof typeof FORMATOS;

export function AdSlot({
  indice,
  position,
  formato = "leaderboard",
}: {
  /** Posicion del elemento entre los de su lista. Sin indice no hay ritmo. */
  indice?: number;
  position: string;
  formato?: FormatoAd;
}) {
  const snippet = process.env.ADS_SNIPPET?.trim();

  // Sin indice no hay a que aplicar el ritmo: se muestra siempre.
  if (indice !== undefined && !debeMostrarAd(indice)) return null;

  if (!snippet) {
    // Sin codigo no se reserva hueco: uno vacio con borde empuja el contenido y
    // hace que la pagina salte cuando por fin cargue el anuncio.
    if (process.env.ADS_PREVIEW !== "1") return null;

    const f = FORMATOS[formato];
    return (
      <aside
        aria-label="Huevo de publicidad reservado"
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          minHeight: f.alto,
          width: "100%",
          maxWidth: f.ancho,
          margin: "20px auto",
          padding: 16,
          border: "2px dashed var(--border-strong, #ced4da)",
          borderRadius: "var(--radius, 6px)",
          background: "var(--bg-secondary, #f8f9fa)",
          color: "var(--text-muted, #6c757d)",
          textAlign: "center",
        }}
      >
        <strong style={{ fontSize: 14 }}>PUBLICIDAD</strong>
        <span style={{ fontSize: 12 }}>{f.texto}</span>
        <span style={{ fontSize: 11, opacity: 0.8 }}>
          hueco reservado · se rellena con el codigo de la red
        </span>
      </aside>
    );
  }

  return (
    <aside
      aria-label="Publicidad"
      // reserved: el hueco existe antes de que cargue el anuncio. Sin esto el
      // contenido salta hacia abajo cuando el script responde.
      style={{ minHeight: FORMATOS[formato].alto, margin: "20px auto", maxWidth: 970, width: "100%" }}
    >
      {/*
        Script con id propio por posicion: si dos huecos de la misma pagina
        montan el mismo script con el mismo id, React reutiliza el nodo y el
        segundo anuncio no llega a inicializarse.
      */}
      <Script id={`ad-slot-${position}`} strategy="afterInteractive">
        {snippet}
      </Script>
    </aside>
  );
}