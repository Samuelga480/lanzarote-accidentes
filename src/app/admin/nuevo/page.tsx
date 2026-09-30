import Link from "next/link";
import type { Metadata } from "next";
import { requireAdminPage } from "@/lib/admin-guard";
import { AccidentForm } from "@/components/admin/AccidentForm";
import { createAccidentAction } from "@/app/admin/actions";
import { toInputDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Nueva noticia",
  robots: { index: false, follow: false },
};

export default async function NewAccidentPage() {
  await requireAdminPage();

  const now = toInputDateTime(new Date());

  return (
    <div className="container-page py-6 max-w-4xl">
      <nav aria-label="Miga de pan" className="text-xs text-ink-mute mb-4">
        <Link href="/admin" className="hover:text-alert">Panel</Link>
        <span aria-hidden="true" className="mx-1.5">/</span>
        <span className="text-ink-soft">Nueva noticia</span>
      </nav>

      <h1 className="font-serif text-3xl font-bold mb-2">Nueva noticia</h1>
      <p className="text-sm text-ink-mute mb-6 max-w-2xl">
        Por defecto la noticia se crea <strong className="text-ink-soft">pendiente de revisión</strong>. Solo
        publícala cuando hayas comprobado los datos y las fuentes.
      </p>

      <AccidentForm
        action={createAccidentAction}
        sources={[{ outlet: "", url: "", excerpt: "" }]}
        defaults={{
          title: "",
          summary: "",
          body: "",
          municipalitySlug: "arrecife",
          vehicleType: "COCHE",
          severity: "MODERADO",
          occurredAt: now,
          fatalities: 0,
          injuries: 0,
          locationDescription: "",
          imageUrl: "",
          imageAlt: "",
          status: "PENDING_REVIEW",
          reviewNotes: "",
        }}
      />
    </div>
  );
}
