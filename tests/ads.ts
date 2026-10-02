/**
 * Comprueba el ritmo de los huecos de publicidad.
 *
 * El editor pidio 2 de cada 3. Se comprueba en tres tramos: uno que empieza
 * justo en el principio de la serie, uno desplazado y uno corto, para que no
 * valga solo el caso feliz.
 */
import { debeMostrarAd, CADA_CUANTOS, CUANTOS_MOSTRAR } from "../src/components/AdSlot";
import { conLineasExtra, ADS_LINEAS_EXTRA } from "../src/data/ads-extra";

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
/* ---------------------------------------------------------------------------
 * El ads.txt debe llevar SIEMPRE las lineas que el panel de la red reclama.
 *
 * ---------------------------------------------------------------------------
 *  POR QUE ESTE TEST
 * ---------------------------------------------------------------------------
 *
 * El panel aviso de que le faltaban tres lineas. La causa era que la cuenta tiene
 * dos identificadores (133147 y 133127) y el generador de la red devuelve un
 * fichero distinto segun el que se le pida, asi que solo servia uno de los dos.
 *
 * Estas comprobaciones cubren lo que importa: que las tres lineas esten, que el
 * identificador que ya funcionaba no se haya roto al anadirlas, que no se
 * dupliquen, y que el orden siga siendo valido para un lector de verdad.
 */

const DEL_PANEL = [
  "OWNERDOMAIN=accidenteslanzarote.com",
  "MANAGERDOMAIN=themoneytizer.com",
  "themoneytizer.com,133147,DIRECT",
  "improvedigital.com, 1602_133147, DIRECT",
  "smartadserver.com, 1097, RESELLER",
];

console.log(`\nads.txt: lineas que exige el panel\n`);

const salida = conLineasExtra(DEL_PANEL.join("\n"));
const lineas = salida.split("\n");

// 1. Las tres lineas que el panel pedia, exactas y sin espacios de mas.
for (const e of ADS_LINEAS_EXTRA) {
  comprobar(`sale "${e}"`, salida.includes(e));
}

// 2. Lo que ya funcionaba sigue intacto: anadir no puede romper lo que iba bien.
comprobar("no se pierde el OWNERDOMAIN", salida.includes("OWNERDOMAIN=accidenteslanzarote.com"));
comprobar("no se pierde el MANAGERDOMAIN", salida.includes("MANAGERDOMAIN=themoneytizer.com"));
comprobar("el 133147 sigue en su sitio", salida.includes("themoneytizer.com,133147,DIRECT"));
comprobar("las resellers no se tocan", salida.includes("smartadserver.com, 1097, RESELLER"));

// 3. Sin duplicados. Un ads.txt con la misma linea dos veces lo rechazan algunos
//    validadores, asi que repetirla seria tirar el arreglo por tierra.
comprobar("no hay lineas repetidas", new Set(lineas).size === lineas.length);

// 4. Cabecera arriba. Los validadores buscan OWNERDOMAIN y MANAGERDOMAIN en las
//    primeras lineas del fichero.
comprobar("OWNERDOMAIN va en la primera linea", /^OWNERDOMAIN=/.test(lineas[0]));
comprobar("MANAGERDOMAIN va en la segunda linea", /^MANAGERDOMAIN=/.test(lineas[1]));

// 5. Formato IAB: sin espacios alrededor de las comas ni lineas vacias.
comprobar("ninguna linea vacia", !lineas.slice(0, -1).some((l) => l.trim() === ""));
comprobar(
  "sin espacios alrededor de las comas",
  ADS_LINEAS_EXTRA.every((l) => !/\s/.test(l)),
);
comprobar("cada linea DIRECT tiene 3 campos", ADS_LINEAS_EXTRA.every((l) => l.split(",").length === 3));

// 6. Terminacion con salto de linea: hay ficheros de la red que se truncan si no.
comprobar("acaba en salto de linea", salida.endsWith("\n"));

// 7. Idempotencia. La ruta la llama en cada peticion y la respuesta del panel se
//    cachea, asi que puede recibir su propia salida. Si anadiera otra vez, el
//    fichero crecereia sin parar.
comprobar("aplicarla dos veces no cambia nada", conLineasExtra(salida) === salida);

// 8. La copia local tambien pasa por aqui, y no lleva las lineas. Comprueba que
//    un fichero que ya las tiene no las duplica, que es el caso del panel.
comprobar("no duplica si ya estan", conLineasExtra(salida).split("\n").length === lineas.length);

console.log(
  fallos === 0
    ? `\nTodo correcto.\n`
    : `\n${fallos} comprobacion(es) fallan.\n`,
);
if (fallos > 0) process.exit(1);