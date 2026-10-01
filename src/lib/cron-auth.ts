/**
 * Comparacion en tiempo constante de secretos.
 *
 * Va en su propio modulo porque lo usan dos rutas (el endpoint del cron y el
 * de ingesta) y porque tiene que poder probarse sin levantar el servidor.
 */

/**
 * Compara dos cadenas sin filtrar informacion por el tiempo de respuesta.
 *
 * Que dos cadenas de distinta longitud no se puedan comparar byte a byte es
 * precisamente el problema: si la comparacion devuelve pronto cuando las
 * longitudes difieren, un atacante puede descubrir el secreto measuring el
 * tiempo de respuesta. Por eso, cuando las longitudes no coinciden, se recorre
 * igualmente la cadena para que el tiempo no dependa de donde encaja.
 */
export function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) {
    // Se recorre la cadena mas larga para no filtrar nada por el tiempo.
    const longer = a.length > b.length ? a : b;
    let diff = 1;
    for (let i = 0; i < longer.length; i++) diff |= longer.charCodeAt(i) ^ 0;
    return diff === 0 && false;
  }

  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Extrae el secreto presentado de una peticion: cabecera Bearer o parametro
 * `?secret=`, que es lo que suelen permitir los servicios de cron externos.
 * Devuelve todos los candidatos para poder compararlos todos, de modo que un
 * atacante no puede distinguir cual era el correcto por el tiempo.
 */
export function presentedSecrets(params: {
  authorization: string | null;
  searchSecret: string | null;
}): string[] {
  const header = params.authorization ?? "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const query = params.searchSecret ?? "";
  return [bearer, query].filter((v) => v.length > 0);
}

/**
 * Decide si una peticion esta autorizada.
 *
 * Se recorren TODOS los candidatos, no solo el primero: si se autorizase al
 * primer candidato que coincide, el tiempo de respuesta revelaria cual era.
 */
export function isAuthorized(params: {
  authorization: string | null;
  searchSecret: string | null;
  expected: string | undefined;
}): boolean {
  const expected = params.expected;
  if (!expected) return false;

  const candidates = presentedSecrets(params);
  if (candidates.length === 0) return false;

  let diff = 0;
  let matched = false;

  for (const candidate of candidates) {
    if (candidate.length === expected.length) {
      let d = 0;
      for (let i = 0; i < expected.length; i++) d |= candidate.charCodeAt(i) ^ expected.charCodeAt(i);
      diff |= d;
      matched = true;
    } else {
      // Longitud distinta: se recorre igualmente para no filtrar por el tiempo.
      for (let i = 0; i < candidate.length; i++) diff |= candidate.charCodeAt(i) ^ 0;
    }
  }

  return matched && diff === 0;
}