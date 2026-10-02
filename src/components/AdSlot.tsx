import Script from "next/script";

/**
 * Hueco de publicidad.
 *
 * El contenido sale de la variable de entorno ADS_SNIPPET. Mientras este vacia
 * no se pinta nada: es preferible un hueco en blanco a un contenedor vacio que
 * empuja el contenido y hace saltarla pagina al cargar.
 *
 * El fragmento lo pega la red de anuncios al crear la cuenta y no lo escribe
 * nadie aqui a mano. Va entero en una variable de entorno para que cambiar de
 * red, o quitar los anuncios, sea cambiar un valor y volver a desplegar, sin
 * tocar el codigo.
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
 * aplica con la funcion `debeMostrarAd` de este mismo fichero.
 *
 * Sin ritmo, un anuncio entre cada tarjeta satura: quien llega de un buscador
 * ve la noticia entre tres banners. Con 2 de cada 3 el anuncio aparece a menudo
 * sin llegar a tapar la lectura.
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
 * Se usa el residuo y no un aleatorio: con azar el ritmo cambia en cada
 * recarga y no se puede comprobar a ojo que se cumple.
 */
export function debeMostrarAd(indice: number): boolean {
  return indice % CADA_CUANTOS < CUANTOS_MOSTRAR;
}

export function AdSlot({
  indice,
  position,
}: {
  /** Posicion del elemento entre los de su lista. Solo se usa si es distinto de undefined. */
  indice?: number;
  position: string;
}) {
  const snippet = process.env.ADS_SNIPPET?.trim();

  if (!snippet) return null;

  // Sin indice no hay a que aplicar el ritmo: se muestra siempre.
  if (indice !== undefined && !debeMostrarAd(indice)) return null;

  return (
    <aside
      aria-label="Publicidad"
      // reserved: el hueco existe antes de que cargue el anuncio. Sin esto el
      // contenido salta hacia abajo cuando el script responde.
      style={{ minHeight: 100, margin: "20px auto", maxWidth: 970, width: "100%" }}
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