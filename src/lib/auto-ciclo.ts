/**
 * Disparador del ciclo desde el propio trafico del sitio.
 *
 * ---------------------------------------------------------------------------
 *  POR QUE ESTE FICHERO EXISTE
 * ---------------------------------------------------------------------------
 *
 * El plan Hobby de Vercel deja dos trabajos de cron, y uno cada dia. Con eso el
 * sitio pasaria los feeds dos veces al dia, y una noticia de hace veinte
 * minutos se enteraria alDia siguiente.
 *
 * La solucion gratuita es que las propias visitas muevan el ciclo: en cada
 * peticion se mira si ya han pasado una hora y, si los han pasado, se
 * lanza una pasada DESPUES de responder. El visitante no espera nada y el
 * `maxDuration` del servidor es el limite de lo que puede tardar.
 *
 * El cron de Vercel no sobra: sigue siendo el suelo para los dias sin visitas,
 * que es justo cuando mas importa no quedarse dormido.
 *
 * ---------------------------------------------------------------------------
 *  POR QUE NO SE ABRE UNA CONSULTA EN CADA VISITA
 * ---------------------------------------------------------------------------
 *
 * `runCycleIfDue` guarda la proxima pasada admisible en memoria del proceso, asi
 * que entre pasada y pasada la comprobacion es una resta y no una consulta a la
 * base de datos. En una instancia de serverless, eso significa una consulta por
 * arranque en frio en lugar de una por visita.
 *
 * El cerrojo de `acquireLock` sigue siendo la garantia de que no haya dos ciclos
 * solapados entre dos instancias distintas: aqui solo se evita el trabajo
 * duplicado dentro de la misma.
 */

import { after } from "next/server";
import { PHASE_PRODUCTION_BUILD } from "next/constants";
import { runCycleIfDue } from "@/lib/monitor";
import { log } from "@/lib/logger";

/**
 * Se llama desde el layout raiz. Es `fire and forget`: si falla, la pagina ya se
 * ha enviado y el siguiente visitante lo intentara de nuevo.
 */
export function disparaCiclo(): void {
  /*
    Durante `next build` no se toca la red. El layout se evalua al compilar, y
    sin esto el build se descargaba los cinco feeds, perdia veinte segundos y
    escribia en la base de datos desde el equipo de quien compila, con las
    credenciales del `.env` local en vez de las de produccion. Es ademas la
    razon por la que el build tardaba mas de lo normal.
  */
  if (process.env.NEXT_PHASE === PHASE_PRODUCTION_BUILD) return;

  after(async () => {
    const r = await runCycleIfDue("STARTUP");

    if (r.ejecutado) {
      log.info("Ciclo disparado desde el trafico del sitio", { motivo: r.motivo });
    }
  });
}