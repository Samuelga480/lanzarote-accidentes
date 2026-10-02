import Link from "next/link";
import { getSessionUser } from "@/lib/user-auth";
import { UserMenuDropdown } from "@/components/auth/UserMenuDropdown";

/**
 * Control de la cabecera para el acceso de usuarios.
 *
 * Es el comportamiento que tenia el sitio original:
 *
 *   sin sesion  ->  un enlace "Acceder" en bloque oscuro
 *   con sesion  ->  el nombre del usuario con un desplegable que lleva
 *                  "Ver perfil completo", "Peticiones de noticias",
 *                  "Usuarios registrados" y "Cerrar sesion"
 *
 * POR QUE ESTE ARCHIVO ES DE SERVIDOR Y NO DE CLIENTE
 *
 * La sesion vive en una cookie httpOnly, que solo se lee en el servidor. Si
 * este componente fuera "use client", el `user` llegaria como prop desde el
 * servidor y el menu se dibujaria con los datos que hubiera en ese momento: al
 * iniciar sesion, la cabecera seguia mostrando "Acceder" porque el arbol de
 * clientes conservaba la version antigua. Leyendo la sesion aqui, con
 * getSessionUser(), cada renderizado del servidor dibuja la cabecera correcta y
 * la cookie manda. Lo unico que necesita JavaScript es el desplegable, y eso ya
 * vive aparte en UserMenuDropdown.tsx.
 *
 * Los enlaces de redaccion ("Peticiones de noticias" y "Usuarios
 * registrados") solo se muestran si la cuenta es ADMIN, porque son
 * herramientas de la redaccion.
 */
export async function UserMenu() {
  const user = await getSessionUser();

  if (!user) {
    return (
      <Link href="/entrar" className="nav-link nav-admin">
        Acceder
      </Link>
    );
  }

  return <UserMenuDropdown user={user} />;
}