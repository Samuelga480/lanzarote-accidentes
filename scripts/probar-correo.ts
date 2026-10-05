/**
 * Envia un correo de aviso de prueba, con el mismo formato que el real.
 *
 * ---------------------------------------------------------------------------
 *  PARA QUE
 * ---------------------------------------------------------------------------
 *
 * El aviso por correo no se puede probar esperando a que pase un accidente: si
 * falla el SMTP, el sistema lo dice por log y sigue, y te enteras cuando ya
 * deberia haber llegado el aviso de un choque de ayer.
 *
 * Este script monta el mismo `NotifyPayload` que se monta al detectar una noticia
 * y lo manda por el mismo canal. Lo que responde es exactamente lo que se
 * registrara en NotificationLog, asi que lo que se ve aqui es lo que se vera.
 *
 * ---------------------------------------------------------------------------
 *  USO
 * ---------------------------------------------------------------------------
 *
 *   npx tsx scripts/probar-correo.ts            aviso de prueba normal
 *   npx tsx scripts/probar-correo.ts <id>      aviso de una noticia real
 *
 * El enlace del correo lleva a la ficha de esa noticia, para comprobar de una
 * vez que el enlace funciona y no sale un 404.
 */

import { prisma } from "../src/lib/prisma";
import { notifyNewArticle } from "../src/lib/notify";
import { notifyConfig } from "../src/lib/env";

async function main() {
  const id = process.argv[2];

  // Sin id: se usa una noticia real, la mas reciente. Asi el enlace del correo
  // apunta a una ficha que existe de verdad.
  const articulo = id
    ? await prisma.accident.findUnique({
        where: { id },
        include: { municipality: true, sources: { orderBy: { id: "asc" } } },
      })
    : await prisma.accident.findFirst({
        orderBy: { occurredAt: "desc" },
        include: { municipality: true, sources: { orderBy: { id: "asc" } } },
      });

  if (!articulo) {
    console.log("\n  No hay ninguna noticia en la base de datos.\n");
    process.exit(1);
  }

  console.log(`\n  Aviso de: ${articulo.title}`);
  console.log(`  Estado:   ${articulo.status}`);
  console.log(`  Enlace:   /admin/${articulo.id}\n`);

  if (!notifyConfig.email.enabled) {
    console.log("  EL CORREO NO ESTA CONFIGURADO. Faltaria:");
    if (!process.env.SMTP_HOST) console.log("    SMTP_HOST   (en Gmail: smtp.gmail.com)");
    if (!process.env.ADMIN_EMAIL) console.log("    ADMIN_EMAIL (la direccion que recibe el aviso)");
    console.log("    SMTP_USER / SMTP_PASS / SMTP_PORT\n");
    process.exit(1);
  }

  const resultados = await notifyNewArticle({
    accidentId: articulo.id,
    title: articulo.title,
    summary: articulo.summary ?? "",
    excerpt: articulo.excerpt ?? null,
    municipality: articulo.municipality.name,
    road: articulo.road ?? null,
    occurredAtIso: articulo.occurredAt.toISOString(),
    confidenceScore: articulo.confidenceScore ?? 0.5,
    sourceScore: articulo.sourceScore ?? 0.5,
    verificationStatus: articulo.verificationStatus ?? "PENDING_REVIEW",
    sourceUrl: articulo.sources[0]?.url ?? "-",
    sourceOutlet: articulo.sources[0]?.outlet ?? "sin fuente",
    reviewUrl: `${process.env.SITE_URL ?? "https://accidenteslanzarote.com"}/admin/${articulo.id}`,
    imageUrl: articulo.imageUrl ?? null,
  });

  console.log("  Resultado por canal:");
  for (const r of resultados) {
    const marca = r.status === "SENT" ? "enviado" : r.status === "SKIPPED" ? "sin configurar" : "FALLIDO";
    console.log(`    ${r.channel.padEnd(9)} ${marca.padEnd(15)} ${r.error ?? ""}`);
  }

  const enviado = resultados.find((r) => r.channel === "EMAIL");
  console.log("");
  if (enviado?.status === "SENT") {
    console.log(`  Enviado a ${enviado.target}. Mira la bandeja, y tambien el spam.\n`);
  } else if (enviado?.status === "SKIPPED") {
    console.log("  El canal de correo estaba apagado. Se activa con SMTP_HOST y ADMIN_EMAIL.\n");
  } else {
    console.log(`  No se pudo enviar: ${enviado?.error ?? "motivo desconocido"}\n`);
    console.log("  Lo mas probable con Gmail es una de estas dos:\n");
    console.log("    - la cuenta no tiene activada la verificacion en dos pasos;");
    console.log("    - SMTP_PASS no es una contrasena de aplicacion sino la contrasena normal.\n");
    console.log("  Gmail no admite contrasenas normales: exige una contrasena de aplicacion.\n");
  }

  await prisma.$disconnect();
  process.exit(enviado?.status === "SENT" ? 0 : 1);
}

main();