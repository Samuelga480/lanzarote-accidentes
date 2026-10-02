import Script from "next/script";

/**
 * Hueco de publicidad.
 *
 * El contenido sale de la variable de entorno ADS_SNIPPET. Mientras este vacia
 * no se pinta nada: es preferible un hueco en blanco a un contenedor vacio que
 * empuja el contenido y hace saltarla pagina al cargar.
 *
 * El fragmento lo pega la red de anuncios del editor al crear la cuenta y no
 * lo escribe nadie aqui a mano. Va entero en una variable de entorno para que
 * cambiar de red, o quitar los anuncios, sea cambiar un valor y volver a
 * desplegar, sin tocar el codigo.
 *
 * Por que se inyecta con dangerouslySetInnerHTML: los codigos de las redes de
 * anuncios son scripts que la propia red exige ejecutar tal cual, no hay forma
 * de expresarlos con JSX. Eso significa que hay que confiar en la red: por eso
 * conviene revisar periodicamente que no hayan cambiado el fragmento.
 *
 * Hay tres medidas que siguen siendo razonables aun con el fragmento confiado:
 *
 *  - No se toca la cabecera ni el menú, y el hueco va en el cuerpo, que es
 *    donde la red mide.
 *  - Las paginas privadas (perfil, panel) no muestran publicidad.
 *  - Con la cuenta abierta no se muestra: escribir un comentario con un banner
 *    encima es la forma mas rapida de perder a la gente.
 */
export function AdSlot({
  position,
  className = "",
}: {
  position: string;
  className?: string;
}) {
  const snippet = process.env.ADS_SNIPPET?.trim();

  if (!snippet) return null;

  return (
    <aside
      aria-label="Publicidad"
      // reserved para que el hueco exista antes de que cargue el anuncio: si no,
      // el contenido salta hacia abajo cuando el script responde.
      style={{ minHeight: 100, margin: "28px auto", maxWidth: 970, width: "100%" }}
      className={className}
    >
      <Script id={`ad-${position}`} strategy="afterInteractive">
        {snippet}
      </Script>
    </aside>
  );
}