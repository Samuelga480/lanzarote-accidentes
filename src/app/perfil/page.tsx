import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/format";
import { getSessionUser } from "@/lib/user-auth";
import { ProfileEditor } from "@/components/ProfileEditor";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Mi perfil",
  robots: { index: false, follow: false },
};

/**
 * Perfil del usuario.
 *
 * Es la perfil.html del sitio original con sus dos secciones: "Sobre mi", con el
 * boton de editar a la derecha del titulo, y los comentarios que ha escrito, con
 * enlace a la noticia donde los puso.
 */
export default async function PerfilPage() {
  const session = await getSessionUser();
  if (!session) redirect("/entrar");

  const [user, comments] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.id },
      select: { email: true, name: true, bio: true, createdAt: true, role: true },
    }),
    // Los comentarios de esta cuenta, del mas nuevo al mas viejo. Se releen
    // en cada visita, asi que lo que se escriba en una noticia aparece aqui
    // nada mas guardarlo.
    prisma.comment.findMany({
      where: { userId: session.id },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        body: true,
        createdAt: true,
        accident: { select: { slug: true, title: true } },
      },
    }),
  ]);

  if (!user) redirect("/entrar");

  const nombre = user.name ?? user.email;

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
          <div className="perfil-email">{user.email}</div>
          <div className="perfil-fecha">
            {user.role === "ADMIN" ? "Administrador" : "Invitado"} · Alta el {formatDate(user.createdAt)}
          </div>
        </div>

        {/* Sobre mi, editable */}
        <ProfileEditor name={nombre} bio={user.bio} />

        {/* Comentarios */}
        <div className="perfil-seccion">
          <div className="perfil-seccion-header">
            <h3>Comentarios</h3>
          </div>

          {comments.length > 0 ? (
            comments.map((c) => (
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
            <p className="perfil-bio perfil-bio-vacia">
              Este usuario aun no ha realizado comentarios.
            </p>
          )}
        </div>

        <p className="mt-8">
          <Link href="/" className="section-more">
            Volver a la portada
          </Link>
        </p>
      </div>
    </main>
  );
}