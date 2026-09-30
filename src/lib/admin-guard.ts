import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/auth";

/**
 * Guardia de las paginas del panel. Se llama al inicio de cada pagina en lugar
 * de en el layout, para que /admin/login siga siendo accesible sin sesion.
 */
export async function requireAdminPage(): Promise<void> {
  if (!(await isAuthenticated())) {
    redirect("/admin/login");
  }
}
