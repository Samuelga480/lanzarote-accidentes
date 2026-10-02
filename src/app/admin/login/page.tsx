import { redirect } from "next/navigation";

/**
 * El acceso al panel es la pagina /entrar, que es la del sitio original.
 * Esta ruta se mantiene para que los enlaces antiguos sigan funcionando.
 */
export default function AdminLoginRedirect() {
  redirect("/entrar");
}