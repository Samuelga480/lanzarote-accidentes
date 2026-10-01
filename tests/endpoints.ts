/**
 * Comprobacion de que los endpoints protegidos fallan cerrados.
 *
 * Es una prueba de seguridad, no de funcionalidad: verifica que un despliegue
 * mal configurado NO deja el sistema abierto. Sin CRON_SECRET, el secreto tiene
 * que estar ausente y la autorizacion tiene que fallar; con secreto definido,
 * una peticion sin credencial no puede pasar.
 *
 * No necesita base de datos: la autorizacion se comprueba antes de tocar Prisma,
 * que es justo el orden que se quiere verificar.
 *
 *   npx tsx tests/endpoints.ts
 */

import { isAuthorized, timingSafeEqualStr, presentedSecrets } from "@/lib/cron-auth";

let passed = 0;
let failed = 0;

function check(name: string, condition: boolean, detail?: string) {
  if (condition) {
    passed++;
    console.log(`  ok    ${name}`);
  } else {
    failed++;
    console.log(`  FALLA ${name}${detail ? ` -> ${detail}` : ""}`);
  }
}

async function main() {
  console.log("Escenario 1: CRON_SECRET sin definir");

  delete process.env.CRON_SECRET;
  const { validateEnvironment, monitorConfig } = await import("@/lib/env");

  check(
    "sin secreto, la autorizacion nunca pasa",
    !isAuthorized({ authorization: "Bearer cualquiera", searchSecret: null, expected: monitorConfig.cronSecret() }),
  );
  check(
    "sin secreto, ni siquiera el parametro ?secret ayuda",
    !isAuthorized({ authorization: null, searchSecret: "lo-que-sea", expected: undefined }),
  );
  check(
    "no es un error fatal: la web debe seguir arrancando sin cron",
    !validateEnvironment().errors.some((e) => /CRON_SECRET/.test(e)),
    validateEnvironment().errors.join(" | "),
  );
  check(
    "pero se avisa de que la monitorizacion queda deshabilitada",
    validateEnvironment().warnings.some((w) => /CRON_SECRET/.test(w)),
  );

  console.log("\nEscenario 2: CRON_SECRET definido");

  const secret = "secreto-de-prueba-de-32-caracteres-minimo";
  process.env.CRON_SECRET = secret;

  const { monitorConfig: mc } = await import("@/lib/env");
  check("monitorConfig.cronSecret() devuelve el secreto", mc.cronSecret() === secret);
  check("ya no avisa de que falte el secreto", !validateEnvironment().warnings.some((w) => /CRON_SECRET/.test(w)));

  check(
    "cabecera Bearer correcta: autorizado",
    isAuthorized({ authorization: `Bearer ${secret}`, searchSecret: null, expected: secret }),
  );
  check(
    "parametro ?secret= correcto: autorizado",
    isAuthorized({ authorization: null, searchSecret: secret, expected: secret }),
  );
  check(
    "sin credencial alguna: rechazado",
    !isAuthorized({ authorization: null, searchSecret: null, expected: secret }),
  );
  check(
    "secreto equivocado en la cabecera: rechazado",
    !isAuthorized({ authorization: "Bearer otro-secreto-distinto", searchSecret: null, expected: secret }),
  );
  check(
    "secreto equivocado en la query: rechazado",
    !isAuthorized({ authorization: null, searchSecret: "otro", expected: secret }),
  );
  check(
    "prefijo del secreto: rechazado",
    !isAuthorized({ authorization: `Bearer ${secret.slice(0, 10)}`, searchSecret: null, expected: secret }),
  );
  check(
    "secreto correcto mas uno equivocado: rechazado",
    !isAuthorized({ authorization: `Bearer ${secret}`, searchSecret: "basura", expected: secret }),
  );
  check(
    "esquema de autenticacion distinto: rechazado",
    !isAuthorized({ authorization: secret, searchSecret: null, expected: secret }),
  );
  check("cabecera vacia: sin candidatos", presentedSecrets({ authorization: "", searchSecret: "" }).length === 0);

  console.log("\nEscenario 3: CRON_SECRET demasiado corto");

  process.env.CRON_SECRET = "corto";
  let shortRejected = false;
  let message = "";
  try {
    mc.cronSecret();
  } catch (err) {
    message = err instanceof Error ? err.message : String(err);
    shortRejected = /24/.test(message);
  }
  check("un secreto de menos de 24 caracteres se rechaza", shortRejected, message);

  console.log("\nEscenario 4: comparacion en tiempo constante");

  check("cadenas iguales coinciden", timingSafeEqualStr("abcdef", "abcdef"));
  check("cadenas distintas no coinciden", !timingSafeEqualStr("abcdef", "abcdeg"));
  check("longitudes distintas no coinciden", !timingSafeEqualStr("abc", "abcdef"));
  check("cadena vacia contra no vacia no coincide", !timingSafeEqualStr("", "a"));

  delete process.env.CRON_SECRET;

  console.log(`\n${"=".repeat(52)}`);
  console.log(`  ${passed} correctas, ${failed} fallidas`);
  console.log("=".repeat(52));
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("Error en las pruebas de endpoints:", err);
  process.exit(1);
});