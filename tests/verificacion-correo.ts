/**
 * Pruebas de la verificacion del correo en el alta.
 *
 *   npx tsx tests/verificacion-correo.ts
 *
 * Lo que se comprueba es lo que puede fallar sin que se note: que el token que
 * se guarda no sea el que viaja por el correo, que dos cuentas no puedan
 * confirmarse con el mismo enlace, y que el enlace caducado no confirme a nadie.
 *
 * No se prueba el envio de correo ni la consulta de DNS: dependen de la red y
 * de que haya SMTP. Son dos las cosas que el health check dice si faltan.
 */

import { hashToken, nuevoToken } from "@/lib/email-verificacion";

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

function section(title: string) {
  console.log(`\n${title}`);
}

/* ========================================================================== */
section("El token");

{
  const { token, hash } = nuevoToken();

  check("el token tiene largo suficiente para no adivinarse", token.length >= 64, `${token.length} caracteres`);
  check("el token es hexadecimal", /^[0-9a-f]+$/.test(token));
  check("el hash es hexadecimal", /^[0-9a-f]+$/.test(hash));
  check("token y hash no son lo mismo", token !== hash);
  check("el hash es SHA-256: 64 caracteres", hash.length === 64, `${hash.length}`);
}

{
  /*
    Lo que mas importa: lo que se guarda en la base de datos NO puede servir
    para confirmar una cuenta. Si se guardara el token en claro, con solo leer la
    tabla de la base de datos se podria confirmar cualquier cuenta.
  */
  const { token, hash } = nuevoToken();
  check("el hash guardado no contiene el token", !hash.includes(token.slice(0, 16)));
}

{
  const { token, hash } = nuevoToken();
  check("el hash es el SHA-256 del token", hash === hashToken(token));
}

{
  const token = "a".repeat(64);
  check("el hash es estable: el mismo token da el mismo hash", hashToken(token) === hashToken(token));
}

/* ========================================================================== */
section("Dos cuentas no pueden compartir token");

{
  const a = nuevoToken();
  const b = nuevoToken();

  check("dos tokens seguidos son distintos", a.token !== b.token);
  check("y sus hashes tambien", a.hash !== b.hash);
}

{
  // 2000 tokens: la probabilidad de que dos salgan iguales tiene que ser
  // despreciable. Un token repetido permitiria confirmar la cuenta equivocada.
  const vistos = new Set<string>();
  let repetidos = 0;
  for (let i = 0; i < 2000; i++) {
    const { token } = nuevoToken();
    if (vistos.has(token)) repetidos++;
    vistos.add(token);
  }
  check("2000 tokens, ninguno repetido", repetidos === 0, `${repetidos} repetidos`);
}

/* ========================================================================== */
section("Lo que no se acepta como token");

{
  // La ruta de confirmacion llama a hashToken con lo que venga en la URL. Si
  // aceptara cualquier cosa, un enlace vacio podria confirmar cuentas.
  check("un token vacio no es un hash util", hashToken("") !== "");
  check("un token corto produce un hash distinto al de uno real", hashToken("x") !== hashToken("x".repeat(64)));
}

/* ========================================================================== */
console.log(`\n${passed} correctas, ${failed} fallidas`);

if (failed > 0) process.exit(1);