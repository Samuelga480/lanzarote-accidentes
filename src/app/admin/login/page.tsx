import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/auth";
import { LoginForm } from "@/components/admin/LoginForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Acceso al panel",
  robots: { index: false, follow: false },
};

export default async function AdminLoginPage() {
  if (await isAuthenticated()) redirect("/admin");

  return (
    <div className="container-page py-16 max-w-md">
      <div className="card p-6">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-alert mb-2">
          Zona restringida
        </p>
        <h1 className="font-serif text-2xl font-bold mb-1">Panel de administración</h1>
        <p className="text-xs text-ink-mute mb-6">
          Acceso para el equipo editorial. Las noticias se crean, revisan y aprueban desde aquí.
        </p>

        <LoginForm />

        <p className="text-[11px] text-ink-mute mt-6 pt-4 border-t border-rule leading-relaxed">
          La contraseña se define en la variable <code className="text-ink-soft">ADMIN_PASSWORD</code> del
          fichero <code className="text-ink-soft">.env</code>. Cámbiala antes de publicar el sitio.
        </p>
      </div>
    </div>
  );
}
