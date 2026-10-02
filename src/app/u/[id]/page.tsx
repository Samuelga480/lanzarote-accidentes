import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/format";
import { getSessionUser } from "@/lib/user-auth";

export const dynamic = "force-dynamic";

/**
 * Ficha publica de un usuario.
 *
 * Muestra lo que el usuario ha decidido publicar: su nombre, su descripcion y
 * los comentarios que ha escrito. Se llega desde el nombre que aparece al pie
 * de cada comentario.
 *
 * QUE NO SE PUBLICA AQUI Y POR QUE
 *
 * El correo no sale, aunque sea la cuenta con la que entro. El aviso legal de
 * este sitio dice, en "Que datos personales no publicamos", que los correos no
 * se difunden; abrir una ficha publica por identificador y enseñar el correo
 * seria dar al paso por cada identificador el acceso a la lista de correos de
 * todos los usuarios. El correo sigue estando donde debe: en /perfil, que
 * exige sesion, y en /usuarios, que exige administrador.
 *
 * La pagina lleva `noindex` por lo mismo que /usuarios: son datos personales
 * de una persona identificable y no tienen que acabar en un buscador.
 */
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;

  const user = await prisma.user.findUnique({
    where: { id },
    select: { name: true },
  });

  const nombre = user?.name ?? "Usuario";

  return {
    title: `${nombre} · Usuarios`,
    // Es una pagina interna con datos personales: no se indexa.
    robots: { index: false, follow: false },
  };
}

export default async function UsuarioPublicoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [user, sessionUser] = await Promise.all([
    prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        bio: true,
        role: true,
        createdAt: true,
        comments: {
          orderBy: { createdAt: "desc" },
          take: 50,
          select: {
            id: true,
            body: true,
            createdAt: true,
            accident: { select: { slug: true, title: true, status: true } },
          },
        },
      },
    }),
    getSessionUser(),
  ]);

  if (!user) notFound();

  const nombre = user.name ?? "Invitado";
  const esYo = sessionUser?.id === user.id;

  /*
    Los comentarios se filtran por noticias publicadas. Una noticia puede pasar
    a estar rechazada o archivada despues dearse el comentario: sin este filtro,
    el perfil destaparia el titular de algo que el editor ya decidio no
    publicar. Los borrados en cascada ya no traen comentarios.
  */
  const comentarios = user.comments.filter((c) => c.accident.status === "PUBLISHED");

  return (
    <main className="resumen-main">
      <div className="resumen-container">
        {/* Cabecera */}
        <div
          className="text-center pb-8 mb-8"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          <div
            className="profile-avatar mx-auto mb-4"
            style={{ width: 96, height: 96, fontSize: "2.25rem" }}
            aria-hidden="true"
          >
            {nombre.charAt(0).toUpperCase()}
          </div>

          <div className="perfil-nombre">{nombre}</div>
          <div className="perfil-fecha">
            {user.role === "ADMIN" ? "Administrador" : "Invitado"} · Alta el {formatDate(user.createdAt)}
          </div>
        </div>

        {/* Descripcion. Se reutiliza la clase del perfil propio para que las dos
            paginas se vean igual. */}
        <div className="perfil-seccion">
          <div className="perfil-seccion-header">
            <h3>Sobre {esYo ? "mi" : "el usuario"}</h3>
          </div>
          <p className={`perfil-bio${user.bio ? "" : " perfil-bio-vacia"}`}>
            {user.bio || "Este usuario aun no ha anadido una descripcion."}
          </p>
        </div>

        {/* Comentarios */}
        <div className="perfil-seccion">
          <div className="perfil-seccion-header">
            <h3>Comentarios</h3>
          </div>

          {comentarios.length > 0 ? (
            comentarios.map((c) => (
              <article key={c.id} className="comentario-item">
                <p className="comentario-texto">{c.body}</p>
                <div className="comentario-fecha">{formatDate(c.createdAt)}</div>
                <div className="comentario-noticia">
                  En{" "}
                  <Link href={`/accidentes/${c.accident.slug}`}>{c.accident.title}</Link>
                </div>
              </article>
            ))
          ) : (
            <p className="perfil-bio perfil-bio-vacia">Este usuario aun no ha comentado ninguna noticia.</p>
          )}
        </div>

        <p className="mt-8">
          {esYo ? (
            <Link href="/perfil" className="section-more">
              Volver a mi perfil
            </Link>
          ) : (
            <Link href="/" className="section-more">
              Volver a la portada
            </Link>
          )}
        </p>
      </div>
    </main>
  );
}