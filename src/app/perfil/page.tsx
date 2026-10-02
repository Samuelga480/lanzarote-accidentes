import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/format";
import { getSessionUser } from "@/lib/user-auth";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Mi perfil",
  robots: { index: false, follow: false },
};

/**
 * Perfil del usuario.
 *
 * Es la perfil.html del sitio original: tarjeta con la inicial en un circulo
 * rojo, el correo, la fecha de alta, la biografia y debajo los comentarios que
 * ha escrito.
 */
export default async function PerfilPage() {
  const session = await getSessionUser();
  if (!session) redirect("/entrar");

  const [user, comments] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.id },
      select: { email: true, name: true, bio: true, createdAt: true, role: true },
    }),
    prisma.comment.findMany({
      where: { userId: session.id },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        body: true,
        createdAt: true,
        accident: { select: { slug: true, title: true } },
      },
    }),
  ]);

  if (!user) redirect("/entrar");

  const label = user.name ?? user.email;

  return (
    <main className="resumen-main">
      <div className="resumen-container">
        {/* Cabecera del perfil */}
        <div className="text-center pb-8 mb-8" style={{ borderBottom: "1px solid var(--border)" }}>
          <div className="profile-avatar mx-auto mb-4" style={{ width: 96, height: 96, fontSize: "2.25rem" }}>
            {label.charAt(0).toUpperCase()}
          </div>

          <div className="perfil-nombre">{label}</div>
          <div className="perfil-email">{user.email}</div>
          <div className="perfil-fecha">
            {user.role === "ADMIN" ? "Administrador" : "Invitado"} · Alta el {formatDate(user.createdAt)}
          </div>
        </div>

        {/* Biografia */}
        <section className="perfil-seccion">
          <div className="perfil-seccion-header">
            <h3>Sobre mi</h3>
          </div>
          {user.bio ? (
            <p className="perfil-bio">{user.bio}</p>
          ) : (
            <p className="perfil-bio perfil-bio-vacia">Aun no has escrito nada sobre ti.</p>
          )}
        </section>

        {/* Comentarios */}
        <section className="perfil-seccion">
          <div className="perfil-seccion-header">
            <h3>Mis comentarios</h3>
          </div>

          {comments.length > 0 ? (
            comments.map((c) => (
              <div key={c.id} className="comentario-item">
                <p className="comentario-texto">{c.body}</p>
                <div className="comentario-fecha">{formatDate(c.createdAt)}</div>
                <div className="comentario-noticia">
                  En{" "}
                  <Link href={`/accidentes/${c.accident.slug}`}>{c.accident.title}</Link>
                </div>
              </div>
            ))
          ) : (
            <p className="perfil-bio perfil-bio-vacia">Todavia no has comentado nada.</p>
          )}
        </section>

        <p className="mt-8">
          <Link href="/" className="section-more">
            Volver a la portada
          </Link>
        </p>
      </div>
    </main>
  );
}