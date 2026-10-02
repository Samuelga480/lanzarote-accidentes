import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/format";
import { getSessionUser } from "@/lib/user-auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Usuarios registrados",
  // Es una pagina interna con datos personales: no se indexa.
  robots: { index: false, follow: false },
};

/**
 * Ficha de usuarios.
 *
 * Es la usuarios.html del sitio original: buscador, filtro por rol, tres
 * tarjetas de cifras y la lista. Solo para administradores, porque expone
 * correos y actividad de todos los que se han dado de alta.
 */
export default async function UsuariosPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; rol?: string }>;
}) {
  const session = await getSessionUser();
  if (!session) redirect("/entrar");
  if (session.role !== "ADMIN") redirect("/perfil");

  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  // El rol llega de la URL, asi que se valida contra la lista en vez de
  // colarse tal cual: un valor cualquiera acabaria en la consulta como texto.
  const rol = sp.rol === "ADMIN" ? "ADMIN" : sp.rol === "INVITADO" ? "INVITADO" : null;

  const where: Prisma.UserWhereInput = {
    ...(rol ? { role: rol } : {}),
    // El correo se guarda normalizado a minusculas, asi que la busqueda sobre
    // ese campo va en minusculas. El nombre es texto libre y no se toca.
    ...(q ? { OR: [{ email: { contains: q.toLowerCase() } }, { name: { contains: q } }] } : {}),
  };

  const [users, total, admins, invitados] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
        _count: { select: { comments: true } },
      },
    }),
    prisma.user.count(),
    prisma.user.count({ where: { role: "ADMIN" } }),
    prisma.user.count({ where: { role: "INVITADO" } }),
  ]);

  return (
    <main className="usuarios-main">
      <div className="resumen-header">
        <h1>Usuarios Registrados</h1>
        <p>Cuentas dadas de alta en Accidentes Lanzarote</p>
      </div>

      {/* Buscador y filtro */}
      <form method="get" className="usuarios-filters">
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Buscar por nombre o correo..."
          aria-label="Buscar usuarios"
        />
        <select name="rol" defaultValue={rol ?? ""} aria-label="Filtrar por rol">
          <option value="">Todos los roles</option>
          <option value="ADMIN">Administrador</option>
          <option value="INVITADO">Invitado</option>
        </select>
        <button type="submit" className="btn btn-secondary">
          Filtrar
        </button>
      </form>

      {/* Cifras */}
      <section className="resumen-stats" style={{ marginBottom: 32 }} aria-label="Totales de usuarios">
        {[
          { label: "Total usuarios", value: total },
          { label: "Administradores", value: admins },
          { label: "Invitados", value: invitados },
        ].map((s) => (
          <div key={s.label} className="resumen-stat-card">
            <div className="resumen-stat-number">{s.value}</div>
            <div className="resumen-stat-label">{s.label}</div>
          </div>
        ))}
      </section>

      {/* Lista */}
      {users.length > 0 ? (
        <div className="usuarios-list">
          {users.map((u) => {
            const label = u.name ?? u.email;
            return (
              /*
                El nombre y el avatar llevan a la ficha publica del usuario, que es
                la que ven los lectores desde los comentarios. Aqui el correo se
                sigue mostrando porque esta pagina es del panel y exige sesion de
                administrador.
              */
              <article key={u.id} className="usuario-card">
                <Link
                  href={`/u/${u.id}`}
                  className="usuario-avatar"
                  aria-label={`Ver el perfil de ${label}`}
                >
                  {label.charAt(0).toUpperCase()}
                </Link>

                <div className="usuario-info">
                  <Link href={`/u/${u.id}`} className="usuario-name">
                    {label}
                  </Link>
                  <div className="usuario-email">{u.email}</div>
                </div>

                <div className="usuario-fecha">
                  {formatDate(u.createdAt)} · {u._count.comments} comentario
                  {u._count.comments === 1 ? "" : "s"}
                </div>

                <span className={`usuario-rol ${u.role === "ADMIN" ? "admin" : "invitado"}`}>
                  {u.role === "ADMIN" ? "Administrador" : "Invitado"}
                </span>
              </article>
            );
          })}
        </div>
      ) : (
        <p className="resumen-vacio">
          {q || rol ? "Ningun usuario coincide con la busqueda." : "Todavia no se ha dado de alta ningun usuario."}
        </p>
      )}

      <p className="mt-8">
        <Link href="/perfil" className="section-more">
          Volver a mi perfil
        </Link>
      </p>
    </main>
  );
}