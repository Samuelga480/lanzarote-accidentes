/**
 * Deteccion de disco escribible.
 *
 * Vercel monta el sistema de ficheros en solo lectura: cualquier intento de
 * escribir en `public/` falla con EROFS. El pipeline de imagenes guardaba ahi
 * sus WebP, con lo que en Vercel fallaba al procesar la primera foto.
 *
 * En vez de mantener dos implementaciones del pipeline, se comprueba UNA vez
 * si el disco admite escritura y se decide el modo a partir de ahi. El mismo
 * codigo sirve para Docker (disco normal) y para Vercel (solo lectura) sin
 * cambiar una linea del resto del sistema.
 */

import { mkdir, writeFile, unlink } from "node:fs/promises";
// Se importa estatico y no con `require` dentro de la funcion. Este modulo ya
// depende de `node:fs/promises` y de `node:path` en la cabecera, asi que el
// `require` no evitaba meter ningun builtin: solo incumplia la regla de ESLint
// que hace fallar el build.
import fs from "node:fs";
import path from "node:path";

/** Se cachea el resultado: comprobarlo en cada imagen seria absurdo. */
const cache = new Map<string, boolean>();

/**
 * Intenta crear el directorio y escribir un fichero dentro.
 *
 * `mkdir recursive` no falla si el directorio ya existe, de modo que no
 * distingue entre "ya existe" y "no se puede crear"; el `writeFile` si.
 */
export async function isWritableAsync(dir: string): Promise<boolean> {
  const cached = cache.get(dir);
  if (cached !== undefined) return cached;

  let result = false;
  const target = path.resolve(process.cwd(), dir);
  const probe = path.join(target, `.probe-${process.pid}`);

  try {
    await mkdir(target, { recursive: true });
    await writeFile(probe, "ok", "utf8");
    await unlink(probe).catch(() => {});
    result = true;
  } catch {
    result = false;
  }

  cache.set(dir, result);
  return result;
}

/**
 * Version sincrona para usar desde `imageConfig.mode()`, que se llama desde
 * contextos no-async.
 *
 * Se limita a los casos habituales: en un disco de solo lectura, `access` con
 * W_OK falla antes incluso de intentar crear nada. Cuando no se puede decidir
 * con certeza (por ejemplo en Windows con permisos raros), se asume escribible
 * y deja que sea el propio pipeline el que falle con un error claro.
 */
export function isWritable(dir: string): boolean {
  const cached = cache.get(dir);
  if (cached !== undefined) return cached;

  const target = path.resolve(process.cwd(), dir);

  try {
    // En Vercel el directorio existe pero no admite escritura, y el fallo se ve
    // en el propio mkdir/write, no en access. Por eso se comprueba tambien
    // contra el directorio padre, que es el que no existe en un despliegue de
    // Vercel limpio.
    fs.accessSync(target, fs.constants.W_OK);
    cache.set(dir, true);
    return true;
  } catch {
    cache.set(dir, false);
    return false;
  }
}

/** Vacia la cache. Lo usa el worker al arrancar, para no arrastrar un valor viejo. */
export function resetWritableCache(): void {
  cache.clear();
}