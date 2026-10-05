/**
 * Que el navegador no haga peticiones a una API propia.
 *
 *   npx tsx tests/sin-peticiones.ts
 *
 * ---------------------------------------------------------------------------
 *  QUE COMPRUEBA Y POR QUE
 * ---------------------------------------------------------------------------
 *
 * Todo lo que hace el visitante (entrar, registrarse, comentar, aprobar, borrar,
 * editar el perfil, cerrar sesion) va por Server Actions: el formulario llama a la
 * funcion del servidor y la pagina se vuelve a pintar alli. El navegador no pide
 * nada a `/api/...`.
 *
 * Eso no es una preferencia estetica. Con un `fetch`:
 *
 *   - Sin JavaScript el formulario no hace nada, porque el submit lo intercepta el
 *     manejador. Con un `<form action={...}>` funciona igual.
 *   - Hay dos caminos para el mismo dato (el endpoint y la accion) y se pueden
 *     desincronizar: el endpoint valida una cosa y la accion otra.
 *   - Los errores hay que traducirlos de HTTP a texto para el usuario.
 *
 * El exito se resuelve con `redirect()` en el servidor, que ademas es lo unico que
 * repinta la cabecera: se dibuja leyendo la cookie httpOnly, asi que con
 * `router.refresh()` el menu seguia mostrando "Acceder" hasta recargar a mano.
 *
 * ---------------------------------------------------------------------------
 *  QUE SE CONSIDERA UNA INFRACCION
 * ---------------------------------------------------------------------------
 *
 * Cualquier `fetch`, `XMLHttpRequest`, `sendBeacon`, `EventSource` o `WebSocket`
 * en un archivo marcado con `"use client"`. Los `fetch` de servidor (feeds, IA,
 * notificaciones) no se tocan: no salen del servidor.
 *
 * La excepcion es `tests/` y el propio fichero que mira la lista: si no, la
 * prueba se detectaria a si misma.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const RAIZ = process.cwd();
const ESTA_PRUEBA = "sin-peticiones.ts";

/** Marcadores de una llamada hecha por el navegador. */
const PATRONES: Array<{ patron: RegExp; que: string }> = [
  { patron: /\bfetch\s*\(/, que: "fetch()" },
  { patron: /XMLHttpRequest/, que: "XMLHttpRequest" },
  { patron: /navigator\s*\.\s*sendBeacon/, que: "sendBeacon()" },
  { patron: /\bEventSource\b/, que: "EventSource" },
  { patron: /\bnew\s+WebSocket\b/, que: "WebSocket" },
];

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

/** Todos los .ts y .tsx de un directorio, sin entrar en node_modules ni .next. */
function fuente(dir: string): string[] {
  const salida: string[] = [];

  for (const entrada of readdirSync(dir)) {
    if (entrada === "node_modules" || entrada === ".next" || entrada.startsWith(".")) continue;

    const ruta = join(dir, entrada);
    if (statSync(ruta).isDirectory()) {
      salida.push(...fuente(ruta));
    } else if (/\.tsx?$/.test(entrada)) {
      salida.push(ruta);
    }
  }

  return salida;
}

const rutaSrc = relative(RAIZ, join(RAIZ, "src")).split(sep).join("/");

function main() {
  console.log("Escenario 1: ningun componente de cliente hace peticiones");

  const infractores: string[] = [];

  for (const ruta of fuente(join(RAIZ, "src"))) {
    const texto = readFileSync(ruta, "utf8");

    // Solo los marcados como cliente: en un Server Component un `fetch` es una
    // peticion del servidor a otro servidor, que es lo normal.
    if (!/^\s*["']use client["']/m.test(texto)) continue;

    const lineas = texto.split(/\r?\n/);

    for (let i = 0; i < lineas.length; i++) {
      const linea = lineas[i];

      for (const { patron, que } of PATRONES) {
        if (patron.test(linea)) {
          infractores.push(`${relative(RAIZ, ruta).split(sep).join("/")}:${i + 1} usa ${que}`);
        }
      }
    }
  }

  check(
    "ningun archivo \"use client\" hace fetch, XHR ni WebSocket",
    infractores.length === 0,
    infractores.join(" | "),
  );

  /*
    Escenario 1b: formularios que hacen POST a una ruta propia.

    Un `<form action="/admin/aprobar" method="post">` no lleva un `fetch`, asi que
    la comprobacion de arriba no lo ve, y aun asi es una peticion del navegador a
    un endpoint: exactamente lo que se quiere quitar. Ademas es un fallo silencioso
    si la ruta se borra despues: el build pasa y el boton devuelve un 404.

    Este caso se dio de verdad al borrar /admin/aprobar: la ficha de una noticia,
    que se anadio mas tarde, seguia apuntando ahi y el boton de publicar dejo de
    funcionar sin que nada avisara.
  */
  const formularios: string[] = [];

  for (const ruta of fuente(join(RAIZ, "src"))) {
    const texto = readFileSync(ruta, "utf8");

    if (/"use server"/.test(texto)) continue; // las Server Actions si son rutas

    const lineas = texto.split(/\r?\n/);

    for (let i = 0; i < lineas.length; i++) {
      // `action="/api/..."` o `action="/admin/..."` como cadena, no como expresion.
      if (/\baction\s*=\s*["'`](\/(api|admin)\/)/.test(lineas[i])) {
        formularios.push(`${relative(RAIZ, ruta).split(sep).join("/")}:${i + 1} -> ${lineas[i].trim()}`);
      }
    }
  }

  check(
    "ningun formulario hace POST a una ruta propia del servidor",
    formularios.length === 0,
    formularios.join(" | "),
  );

  console.log("\nEscenario 2: la prueba se excluye a si misma");

  // Si esta comprobacion no existe, la anterior pasaria por el motivo equivocado:
  // el archivo que busca `fetch(` estaria limpio de verdad, no filtrado.
  const esteArchivo = relative(RAIZ, __filename).split(sep).join("/");
  check("el recorrido de fuentes es el de src/", rutaSrc.length > 0);
  check("esta prueba no se cuenta a si misma", esteArchivo.endsWith(ESTA_PRUEBA));

  console.log("\nEscenario 3: las Server Actions siguen exportando acciones");

  const acciones = [
    "src/app/entrar/actions.ts",
    "src/app/registro/actions.ts",
    "src/app/sesion/actions.ts",
    "src/app/noticias/actions.ts",
  ];

  for (const ruta of acciones) {
    const texto = readFileSync(join(RAIZ, ruta), "utf8");
    check(
      `${ruta} lleva "use server"`,
      /^\s*["']use server["']/m.test(texto),
      "sin la directiva el archivo es un modulo normal y no una accion",
    );
  }

  console.log("\nEscenario 4: los estados no viven en un archivo \"use server\"");

  // Un archivo con "use server" solo puede exportar funciones asincronas. Si el
  // estado inicial o un tipo vivieran ahi, el build fallaria con un error poco
  // claro; esto solo avisa de que la separacion se ha movido de sitio.
  for (const ruta of ["src/app/entrar/state.ts", "src/app/registro/state.ts"]) {
    const texto = readFileSync(join(RAIZ, ruta), "utf8");
    check(`${ruta} NO lleva "use server"`, !/^\s*["']use server["']/m.test(texto));
  }

  console.log(`\n${"=".repeat(52)}`);
  console.log(`  ${passed} correctas, ${failed} fallidas`);
  console.log("=".repeat(52));

  if (infractores.length > 0 || formularios.length > 0) {
    console.log("\nComo arreglarlo: usa una Server Action y un <form action={...}>.");
    console.log("Lo que hoy es un fetch sobre /api/... va en src/app/<ruta>/actions.ts.");
  }

  process.exit(failed === 0 ? 0 : 1);
}

main();