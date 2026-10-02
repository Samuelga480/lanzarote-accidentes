/**
 * Comprueba el ritmo de los huecos de publicidad.
 *
 * El editor pidio 2 de cada 3. Se comprueba en tres tramos: uno que empieza
 * justo en el principio de la serie, uno desplazado y uno corto, para que no
 * valga solo el caso feliz.
 */
import { debeMostrarAd, CADA_CUANTOS, CUANTOS_MOSTRAR } from "../src/components/AdSlot";

let fallos = 0;

function comprobar(nombre: string, ok: boolean) {
  if (!ok) fallos++;
  console.log(`  ${ok ? "correcta" : "FALLA  "} ${nombre}`);
}

console.log(`\nRitmo configurado: ${CUANTOS_MOSTRAR} de cada ${CADA_CUANTOS}\n`);

// Serie completa de 9 elementos.
const serie: string[] = [];
for (let i = 0; i < 9; i++) serie.push(debeMostrarAd(i) ? "AD" : " - ");
console.log(`  ${serie.join(" ")}\n`);

comprobar("primera posicion lleva hueco", debeMostrarAd(0) === true);
comprobar("segunda posicion lleva hueco", debeMostrarAd(1) === true);
comprobar("tercera posicion NO lleva hueco", debeMostrarAd(2) === false);
comprobar("cuarta posicion lleva hueco (repite serie)", debeMostrarAd(3) === true);
comprobar("quinta posicion lleva hueco", debeMostrarAd(4) === true);
comprobar("sexta posicion NO lleva hueco", debeMostrarAd(5) === false);

// Cuenta exacta: en 30 elementos deben salir 20 huecos.
let cuenta = 0;
for (let i = 0; i < 30; i++) if (debeMostrarAd(i)) cuenta++;
comprobar(`en 30 elementos salen ${CUANTOS_MOSTRAR * 10} huecos (sale ${cuenta})`, cuenta === CUANTOS_MOSTRAR * 10);

// El ritmo no depende del residuo mal formado.
comprobar("sin publicacion no se rompe", typeof debeMostrarAd(999) === "boolean");
comprobar("indice negativo no lanza", typeof debeMostrarAd(-1) === "boolean");

console.log(`\n${fallos === 0 ? "Todas las comprobaciones correctas." : `${fallos} fallo(s).`}\n`);
process.exitCode = fallos === 0 ? 0 : 1;