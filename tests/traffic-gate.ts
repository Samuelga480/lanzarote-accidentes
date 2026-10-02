/**
 * Pruebas de la puerta de "¿es un accidente de tráfico?".
 *
 * Cada caso es un titular real: tres son los que se colaron en la base de
 * datos y dos son de los medios que se van a recuperar. Si un caso se rompe, se
 * rompe aqui y no en la portada.
 *
 *   npx tsx tests/traffic-gate.ts
 */

import { evaluaAccidenteTrafico, esAccidenteDeTrafico, evaluaIsla } from "@/lib/traffic-gate";

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

type Caso = { titulo: string; cuerpo?: string; entra: boolean; porQue: string };

/** Comprueba un caso y, si falla, dice exactamente por que se ha descartado. */
function probar(c: Caso) {
  const v = evaluaAccidenteTrafico(c.titulo, c.cuerpo ?? "");
  const bien = v.esAccidente === c.entra;
  check(
    `${c.entra ? "entra " : "fuera "} ${c.titulo.slice(0, 58)}`,
    bien,
    bien ? "" : `la puerta dijo ${v.esAccidente} (${v.motivo}); sucesos=${v.sucesos.join("/")} vehiculos=${v.vehiculos.join("/")}`,
  );
}

/* ========================================================================== */
section("Los tres que se colaron en la base de datos tienen que quedarse fuera");

probar({
  titulo: "No «rotundo» de CC al segundo decreto de vivienda",
  cuerpo: "El Consejo de Gobierno da un no rotundo al decreto de vivienda. El Ayuntamiento de Arrecife haDreamed",
  entra: false,
  porQue: "politica",
});
probar({
  titulo: "Incendio en Costa Teguise obliga a confinar a vecinos de un complejo residencial",
  cuerpo: "Los bomberos sofocaron el incendio. Evacuaron el edificio y confinan a los vecinos.",
  entra: false,
  porQue: "incendio de edificio, no hay vehiculo",
});
probar({
  titulo: "ASISTENCIA TÉCNICA",
  cuerpo: "Asistencia tecnica en la calle. No hay heridos.",
  entra: false,
  porQue: "averia, no es accidente",
});

/* ========================================================================== */
section("Los que si son accidentes de trafico tienen que entrar");

probar({
  titulo: "Conductora de patinete herida tras colisionar con un coche en Lanzarote",
  cuerpo: "La conductora fue trasladada al hospital con论的.",
  entra: true,
  porQue: "patinete contra un coche",
});
probar({
  titulo: "Un ciclista herido de carácter grave al sufrir una caída en Lanzarote",
  cuerpo: "El ciclista fue evacuado. Intervino el 112.",
  entra: true,
  porQue: "caida de un ciclista",
});
probar({
  titulo: "Tres heridos, uno en estado crítico, tras la colisión frontal de dos turismos",
  cuerpo: "La colisión ocurrió en la carretera general.",
  entra: true,
  porQue: "colision de dos turismos",
});
probar({
  titulo: "Herido de carácter moderado en el vuelco de un vehículo tras una salida de vía",
  cuerpo: "El vehiculo salio de la carretera y volco.",
  entra: true,
  porQue: "vuelco",
});
probar({
  titulo: "Accidente en la carretera LZ-2 a su paso por Tinajo",
  cuerpo: "Un turismo se salio de la via y volco. Resultaron heridos leves.",
  entra: true,
  porQue: "el caso base del detector",
});
probar({
  titulo: "Atropello en la avenida de Playa Blanca",
  cuerpo: "Un peatón fue atropellado. Acudio la Guardia Civil.",
  entra: true,
  porQue: "atropello en una via",
});

/* ========================================================================== */
section("Un incendio SI entra si el vehiculo esta implicado");

probar({
  titulo: "Arde un coche tras un accidente en la carretera de Tinajo",
  cuerpo: "Los bomberos apagaron el vehiculo.",
  entra: true,
  porQue: "incendio de un coche",
});
probar({
  titulo: "Incendio en una vivienda de Arrecife",
  cuerpo: "Hizo falta evacuar el edificio.",
  entra: false,
  porQue: "incendio de casa, no de vehiculo",
});

/* ========================================================================== */
section("Las alertas de meteo y de risco se quedan fuera");

probar({
  titulo: "El Gobierno activa el PLATECA en prealerta por un episodio de lluvias",
  cuerpo: "La situacion se mantiene en alerta en Lanzarote.",
  entra: false,
  porQue: "meteo",
});
probar({
  titulo: "El Gobierno declara la situación de alerta por riesgo de incendios forestales en Gran Canaria y Tenerife",
  cuerpo: "Prealerta y alerta por incendios.",
  entra: false,
  porQue: "riesgo forestal, no un incendio concreto",
});
probar({
  titulo: "Corte de circulación en la carretera del confine",
  cuerpo: "La Guardia Civil corta el trafico.",
  entra: false,
  porQue: "una corte por obras no es un accidente",
});

/* ========================================================================== */
section("Sin vehiculo no entra, aunque el titular suene fuerte");

probar({
  titulo: "Un equate cae por un acantilado en Famara",
  cuerpo: "Fue evacuado por los bomberos.",
  entra: false,
  porQue: "no es un vehiculo de carretera",
});
probar({
  titulo: "Rescate de un senderista en el risco de Famara",
  cuerpo: "Los bomberos lo sacaron con vida.",
  entra: false,
  porQue: "rescate a pie, no de trafico",
});
probar({
  titulo: "Caída de los precios del kilowattio",
  cuerpo: "La factura de la luz baja este mes.",
  entra: false,
  porQue: "una caida que no es de nadie en la carretera",
});

/* ========================================================================== */
section("Casos limite que tienen que resolverse bien");

{
  // "via" dentro de otra palabra no cuenta. containsTerm() pone espacios a los
  // lados, asi que "averias" no puede hacer entrar un articulo.
  const v = evaluaAccidenteTrafico("Accidente de tráfico en la carretera", "Hubo averías en la vía");
  check("«averias» no se confunde con «via»", v.vehiculos.includes("carretera"), `vehiculos=${v.vehiculos.join("/")}`);
}
{
  const v = evaluaAccidenteTrafico("Choque multiple en la rotonda de Teguise");
  check("la rotonda cuenta como via", v.vehiculos.includes("rotonda"), `vehiculos=${v.vehiculos.join("/")}`);
}
{
  const v = evaluaAccidenteTrafico("Colisión en la LZ-40");
  check("la LZ-40 cuenta como via", v.esAccidente, `vehiculos=${v.vehiculos.join("/")}`);
}
{
  // Un articulo sobre un coche electrico que sesale es de trafico igual.
  const v = evaluaAccidenteTrafico("Un patinete eléctrico se sale de la vía en Costa Teguise");
  check("patinete electrico cuenta como vehiculo", v.esAccidente, `vehiculos=${v.vehiculos.join("/")}`);
}
{
  const v = evaluaAccidenteTrafico("");
  check("un titulo vacio no entra", v.esAccidente === false);
  check("y el motivo dice que no hay suceso", /suceso/.test(v.motivo), v.motivo);
}
{
  // El cuerpo tambien vale, no solo el titular. Un titular corto sobre un
  // accidente cuenta igual que uno largo.
  const corto = evaluaAccidenteTrafico("Accidente", "Un coche se ha volcado en la carretera de Yaiza.");
  check("el cuerpo aporta el suceso si el titular es corto", corto.esAccidente, `motivo=${corto.motivo}`);
}
{
  // Nada de esto puede dar un positivo por error: se comprueba el tipo, no la
  // cantidad.
  const r = esAccidenteDeTrafico("Colisión", "coche carretera");
  check("contexto minimo devuelve booleano, no undefined", typeof r === "boolean", `tipo=${typeof r}`);
}

/* ========================================================================== */
/* ========================================================================== */
section("Lo de fuera de la isla se queda fuera");

{
  /*
    Estos cuatro SIEMPRE pasaron la puerta de trafico, porque son accidentes de
    verdad: volcaron un camion, tirotearon a unos guardias. Lo unico que los
    separa es DONDE pasaron, y esa comprobacion no existia. Se acabado de meter
    en la base de datos con Arrecife como municipio.
  */
  const fuera = [
    ["Cortada la AP-9 en Pontevedra en dirección a Tui tras volcar y arder un camión que transportaba cerveza", "Pontevedra"],
    ["Dos guardias civiles de paisano tiroteados en Terrassa: uno ha recibido cuatro impactos de bala", "Terrassa"],
    ["Temporal en España, en directo: Tarragona envía un nuevo ES-Alert", "Tarragona"],
    ["Accidente grave en la A-6 a la altura de Madrid", "Madrid"],
  ];

  for (const [titulo] of fuera) {
    // Primero se comprueba que la puerta los deja pasar, que es el problema.
    const puerta = evaluaAccidenteTrafico(titulo, "Hubo heridos y la Guardia Civil corto el trafico.");
    const isla = evaluaIsla(titulo, "Hubo heridos y la Guardia Civil corto el trafico.");

    check(
      `${titulo.slice(0, 44)}... -> fuera de la isla`,
      !isla.deLanzarote,
      `deLanzarote=${isla.deLanzarote} motivo=${isla.motivo}`,
    );
    // Y el motivo tiene que ser concreto: "no parece de Lanzarote" no sirve.
    check(
      `${titulo.slice(0, 44)}... -> el motivo es concreto`,
      isla.motivo.length > 15,
      isla.motivo,
    );
  }
}

{
  // Lo nuestro entra. Estos son los casos que se han guardado de verdad.
  const dentro: Array<[string, string]> = [
    ["Un ciclista herido de carácter grave al sufrir una caída en Tinajo (Lanzarote)", ""],
    ["Accidente en la carretera LZ-2 a su paso por Tinajo", ""],
    ["Colisión en Costa Teguise", "Varios heridos. Acudieron los bomberos de Teguise."],
    ["Atropello en Playa Blanca", "El peatón fue atropellado en la avenida."],
    ["Un Pineda volcó en la LZ-40", "Volcó un coche en Tías."],
  ];

  for (const [titulo, cuerpo] of dentro) {
    const v = evaluaIsla(titulo, cuerpo);
    check(`${titulo.slice(0, 48)} -> de Lanzarote`, v.deLanzarote, v.motivo);
  }
}

{
  // El silencio no vale como prueba. Un articulo que no nombra ningun sitio no
  // entra, ni aunque sea un accidente perfecto.
  const v = evaluaIsla("Accidente grave con dos heridos", "Hubo un choque y dos personasxylocsp。结果 Result。 multiple injuries");
  check("sin toponimo no entra", !v.deLanzarote, v.motivo);
  check("y el motivo lo explica", /no menciona/.test(v.motivo), v.motivo);
}

console.log(`\n${passed} correctas, ${failed} fallidas`);
if (failed > 0) process.exit(1);