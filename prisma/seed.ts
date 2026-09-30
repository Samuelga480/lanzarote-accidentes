/**
 * Datos de prueba para desarrollo.
 *
 * IMPORTANTE: los accidentes de este fichero son FICTICIOS. Sirven para
 * poblar la base de datos y probar la interfaz. No son informacion real y no
 * deben publicarse como tal: antes de salir a produccion, vacia las tablas
 * Accident y Source y carga noticias verificadas.
 *
 *   npm run db:seed
 */

import { PrismaClient } from "@prisma/client";
import type { AccidentSeverity, VehicleType } from "@/lib/types";
import { MUNICIPALITIES } from "../src/lib/constants";

const prisma = new PrismaClient();

const HOUR = 60 * 60 * 1000;
const hoursAgo = (h: number) => new Date(Date.now() - h * HOUR);

/** Une parrafos con una linea en blanco. */
const P = (...paragraphs: string[]) => paragraphs.join("\n\n");

type Source = { outlet: string; url: string; excerpt: string };

type SeedAccident = {
  title: string;
  summary: string;
  body: string;
  hoursAgo: number;
  municipality: string;
  vehicleType: VehicleType;
  severity: AccidentSeverity;
  fatalities?: number;
  injuries?: number;
  featured?: boolean;
  status?: "PENDING_REVIEW" | "PUBLISHED" | "REJECTED";
  origin?: "MANUAL" | "AI";
  place: string;
  sources: Source[];
};

const CABILDO = {
  outlet: "Cabildo de Lanzarote (CEC)",
  url: "https://www.cabildodelanzarote.com/",
};

const DIARIO = {
  outlet: "Diario de Lanzarote",
  url: "https://www.diariodelanzarote.com/",
};

const DIGITAL = {
  outlet: "Lanzarote Digital",
  url: "https://www.lanzarotedigital.com/",
};

const ACCIDENTS: SeedAccident[] = [
  {
    title: "Colisión frontal en la carretera de Playa Blanca deja tres heridos leves",
    summary:
      "Dos turismos colisionaron a la altura del cruce de Las Dunes. El dispositivo de emergencias se activó en el lugar. No hay heridos graves.",
    body: P(
      "Un accidente de tráfico se ha registrado esta mañana en la carretera que une Playa Blanca con Corralejo, a la altura del cruce de Las Dunes, en el municipio de Tías.",
      "Según la información facilitada por los servicios de emergencia, dos vehículos colisionaron por causas aún desconocidas. El aviso se recibió a las 09:47 y el dispositivo de emergencias se activó en la zona en pocos minutos.",
      "En el incidente hay tres personas levemente heridas, que fueron asistidas en el propio lugar por el personal sanitario. Ninguno de los afectados necesitó traslado hospitalario.",
      "La Guardia Civil mantiene la investigación para determinar las causas. Por el momento no se ha divulgado la identidad de los conductores, y este medio no la facilita por respeto a la protección de datos.",
      "El tráfico por la vía se vio afectado durante aproximadamente media hora, con retenciones hasta que los vehículos fueron retirados del lugar.",
    ),
    hoursAgo: 5,
    municipality: "tias",
    vehicleType: "COCHE",
    severity: "LEVE",
    injuries: 3,
    featured: true,
    place: "Carretera de Playa Blanca, cruce de Las Dunes",
    sources: [{ ...CABILDO, excerpt: "Parte de sincro: colisión entre dos turismos en la vía insular." }],
  },
  {
    title: "Ciclista herido tras caer en la rampa de acceso al mirador de Famara",
    summary:
      "Un varón de 52 años sufrió politraumatismos moderados al perder el control de la bicicleta en la subida al mirador. Fue evacuado al hospital.",
    body: P(
      "Un ciclista de 52 años fue evacuado este mediodía con politraumatismos moderados tras sufrir una caída en la rampa de acceso al mirador de Famara, en Teguise.",
      "El accidente se produjo cuando el varón perdió el control de la bicicleta en un tramo con pendiente pronunciada. Cayó sobre el asfalto y quedó consciente en todo momento.",
      "El personal del servicio de emergencias fue el primero en atender al herido, al que estabilizó en el lugar. Después fue evacuado en ambulancia al Hospital Universitario Insular de Arrecife, donde ingresó en observación.",
      "La zona se encuentra dentro del espacio protegido de Famara, uno de los más concurridos por ciclistas, por lo que las autoridades han recordado la necesidad de extremar la precaución durante la subida.",
    ),
    hoursAgo: 11,
    municipality: "teguise",
    vehicleType: "BICICLETA",
    severity: "MODERADO",
    injuries: 1,
    place: "Rampa de acceso al mirador de Famara",
    sources: [{ ...DIARIO, excerpt: "Ciclista evacuado tras caer en la rampa del mirador." }],
  },
  {
    title: "Motocicleta se estrella contra el quitamiedos en la avenida de Yaiza",
    summary:
      "El conductor de una moto perdió el control a la salida de una rotonda y chocó contra el quitamiedos. Fue atendido y no presenta heridas graves.",
    body: P(
      "Una motocicleta se impactó esta tarde contra el quitamiedos de la avenida principal de Yaiza, en las proximidades de la rotonda de entrada al pueblo.",
      "El conductor perdió el control al negociar la curva de salida de la glorieta. Tras la caída se mantuvo consciente, por lo que los servicios de emergencia no consideraron grave la situación.",
      "El piloto fue atendido en el propio lugar por el personal sanitario y se solicitó una grúa para retirar la moto de la calzada.",
      "Esta vía concentra bastante tráfico durante el verano y ha sido señalada como tramo de riesgo en los últimos años. El Ayuntamiento trabaja en la mejora de la señalización y del firme.",
    ),
    hoursAgo: 26,
    municipality: "yaiza",
    vehicleType: "MOTO",
    severity: "LEVE",
    place: "Avenida principal de Yaiza, rotonda de entrada",
    sources: [{ ...DIGITAL, excerpt: "Una moto termina contra el quitamiedos en Yaiza." }],
  },
  {
    title: "Camión vuelca en el acceso portuario de Arrecife y corta el paso",
    summary:
      "Un camión cisterna perdió la estabilidad durante las maniobras y quedó volcado en el acceso principal. No hubo heridos y la carga no fugó.",
    body: P(
      "Un camión cisterna perdió la estabilidad durante las maniobras de carga y quedó volcado sobre el lateral en el acceso principal a la zona portuaria de Arrecife.",
      "El vehículo transportaba combustible y realizaba maniobras de reposición en el momento del incidente. Ante la falta de espacio, el conductor perdió el control y la cisterna rodó hasta quedar apoyada en el arcén.",
      "El equipo de emergencia revisó la cisterna y confirmó que no se había producido ninguna fuga. No hay heridos. Los trabajos de retirada finalizaron entrada la tarde.",
      "Durante la maniobra, el acceso al puerto permaneció cortado alrededor de dos horas, con efecto en el tránsito de camiones y en el acceso peatonal de la zona.",
    ),
    hoursAgo: 40,
    municipality: "arrecife",
    vehicleType: "CAMION",
    severity: "MODERADO",
    place: "Zona de acceso portuaria, Arrecife",
    sources: [{ ...DIGITAL, excerpt: "Camión cisterna vuelca en el acceso al puerto insular." }],
  },
  {
    title: "Peatón atropellado al cruzar la calle en Tinaj",
    summary:
      "Una mujer de 68 años fue atropellada al cruzar por un paso de cebra. Está ingresada en observación con lesiones moderadas.",
    body: P(
      "Una mujer de 68 años fue atropellada esta mañana al cruzar la calle en Tinaj, en las proximidades del centro de salud. Iba a pie y se disponía a utilizar el paso de cebra cuando un turismo la alcanzó.",
      "El conductor se detuvo de inmediato y la asistencia llegó al lugar en cuestión de minutos. La mujer, consciente en todo momento, presenta lesiones moderadas y quedó ingresada en observación en el hospital insular.",
      "La Guardia Civil está investigando las circunstancias del atropello para determinar si se cumplieron las condiciones de cruce. Las averiguaciones incluyen el estudio de los semáforos y de la señalización.",
      "El consistorio ha reconocido que en la zona hay pasos peatonales con una señalización mejorable.",
    ),
    hoursAgo: 62,
    municipality: "tinaj",
    vehicleType: "PEATON",
    severity: "GRAVE",
    injuries: 1,
    place: "Calle del centro de salud, Tinaj",
    sources: [
      { ...CABILDO, excerpt: "Atropello en Tinaj: peatón evacuado en estado moderado." },
      { ...DIARIO, excerpt: "Mujer ingresada en observación tras ser atropellada en Tinaj." },
    ],
  },
  {
    title: "Doble colisión en la vía insular a la altura de Tinaj deja un herido",
    summary:
      "Dos accidentes ocurren uno detrás de otro en la misma carretera, en un tramo de poco más de un kilómetro. Un conductor tuvo que ser evacuado.",
    body: P(
      "Dos colisiones se produjeron sucesivamente en la carretera insular a la altura de Tinaj, en una franja de poco más de un kilómetro. La cercanía en el tiempo y el lugar llevó a pensar inicialmente en un solo incidente, pero se trata de dos accidentes independientes.",
      "En el primero, dos turismos colisionaron por alcance cuando el vehículo que circulaba detrás frenó bruscamente. En el segundo, un tercero se salió del carril tras una curva y quedó volcado.",
      "Uno de los conductores resultó herido y fue evacuado en ambulancia al hospital. La vía quedó cortada durante casi dos horas mientras los equipos del dispositivo de emergencia señalizaban las dos zonas afectadas.",
    ),
    hoursAgo: 78,
    municipality: "tinaj",
    vehicleType: "COCHE",
    severity: "MODERADO",
    injuries: 1,
    place: "Vía insular, kilómetro 12, Tinaj",
    sources: [{ ...CABILDO, excerpt: "Dos accidentes en la misma vía insular." }],
  },
  {
    title: "Peatón resulta herido leve al ser atropellado en Arrecife",
    summary:
      "El accidente ocurrió en la vía de servicio junto a la avenida. El peatón fue atendido y dado de alta en el propio lugar.",
    body: P(
      "Un peatón sufrió lesiones leves al ser atropellado por un turismo en la vía de servicio paralela a la avenida principal de Arrecife.",
      "El varón caminaba por el arcén cuando el vehículo que circulaba en sentido contrario no lo vio y le alcanzó por detrás. El conductor se detuvo de inmediato y avisó al dispositivo de emergencias.",
      "El herido fue atendido en el lugar y no necesitó traslado hospitalario. La Guardia Civil confirmó que el conductor dio aviso tras el impacto.",
      "La zona concentra un tráfico elevado a última hora de la tarde, especialmente en época vacacional.",
    ),
    hoursAgo: 96,
    municipality: "arrecife",
    vehicleType: "PEATON",
    severity: "LEVE",
    injuries: 1,
    place: "Vía de servicio junto a la avenida, Arrecife",
    sources: [{ ...DIGITAL, excerpt: "Atropello leve en la vía de servicio de Arrecife." }],
  },
  {
    title: "Patinete eléctrico y turismo chocan en la calle Real de Arrecife",
    summary:
      "El conductor del patinete salió despedido y quedó en el suelo. Fue atendido sin necesidad de traslado.",
    body: P(
      "Un patinete eléctrico y un turismo colisionaron esta mañana en la calle Real, una de las vías más transitadas de Arrecife.",
      "El conductor del patinete circulaba por la calzada en el mismo sentido que el turismo. Al girar el vehículo para acceder a un aparcamiento, el conductor no detectó la presencia de la patinete que se aproximaba por detrás. El impacto proyectó al conductor contra el suelo.",
      "El joven fue atendido en el lugar y quedó en observación sin necesidad de trasladarlo al hospital.",
      "Este incidente se suma a los varios denunciados en la zona en los últimos meses por el aumento del uso de dispositivos de movilidad personal.",
    ),
    hoursAgo: 120,
    municipality: "arrecife",
    vehicleType: "OTROS",
    severity: "LEVE",
    injuries: 1,
    place: "Calle Real, Arrecife",
    sources: [{ ...DIARIO, excerpt: "Choque entre patinete y turismo en la calle Real." }],
  },
  {
    title: "Salida de vía en la carretera de Yaiza obliga a cortar un carril",
    summary:
      "Un turismo salió despedida en una curva y quedó cruzado en la calzada. Ningún ocupante resultó herido.",
    body: P(
      "Un turismo se salió de la vía en una curva de la carretera comarcal que une Yaiza con Playa Blanca. El vehículo quedó cruzado en la calzada, bloqueando uno de los dos carriles disponibles.",
      "Ninguno de los ocupantes resultó herido, aunque el vehículo sufrió daños importantes en la zona frontal. Se activó el dispositivo de emergencia y se solicitó una grúa para la retirada.",
      "La vía, de un carril por sentido, permaneció con la circulación regulada mediante señales durante aproximadamente hora y media. El accidente coincidió con un momento de tráfico denso por la vuelta de vacaciones.",
    ),
    hoursAgo: 150,
    municipality: "yaiza",
    vehicleType: "COCHE",
    severity: "MODERADO",
    place: "Carretera comarcal Yaiza - Playa Blanca",
    sources: [{ ...DIGITAL, excerpt: "Salida de vía en la carretera de Yaiza." }],
  },
  {
    title: "Dos turismos chocan en una calle de Teguise sin herir a nadie",
    summary:
      "El accidente se produjo al cambiar uno de los vehículos de carril. La vía quedó cortada unos veinte minutos.",
    body: P(
      "Dos turismos colisionaron esta mañana en una vía urbana de Teguise. La colisión se produjo cuando uno de los vehículos cambió de carril y el otro no cedió el paso.",
      "Ambos conductores resultaron ilesos. Los daños materiales fueron de poca importancia y los vehículos pudieron apartarse de la calzada por sus propios medios.",
      "No fue necesario activar el dispositivo de emergencias. La circulación se restableció en unos veinte minutos.",
    ),
    hoursAgo: 180,
    municipality: "teguise",
    vehicleType: "COCHE",
    severity: "LEVE",
    place: "Zona centro de Teguise",
    sources: [{ ...DIARIO, excerpt: "Colisión leve entre dos vehículos en Teguise." }],
  },
  {
    title: "Peatón herido en un atropello en el polígono industrial de Arrecife",
    summary:
      "El trabajador fue atropellado al cruzar las vías del polígono a la hora de entrada. Ingresó con lesiones moderadas.",
    body: P(
      "Un hombre de 47 años fue atropellado esta mañana en el polígono industrial de Arrecife, a la hora de entrada del turno. Iba a pie por una vía interior del recinto cuando un forklift se cruzó en su camino.",
      "El conductor del vehículo industrial se detuvo de inmediato y avisó al servicio de emergencias. El herido, consciente, fue atendido en el lugar y evacuado al hospital con lesiones moderadas.",
      "La empresa responsable ha iniciado una investigación interna sobre el recorrido y la señalización de las vías peatonales del polígono. En fechas anteriores ya se habían registrado atropellos en la misma zona.",
      "Este medio no facilita el nombre ni la empresa de los implicados, respetando la normativa de protección de datos.",
    ),
    hoursAgo: 220,
    municipality: "arrecife",
    vehicleType: "PEATON",
    severity: "GRAVE",
    injuries: 1,
    place: "Polígono industrial, Arrecife",
    sources: [{ ...CABILDO, excerpt: "Atropello en el polígono industrial de Arrecife." }],
  },
  {
    title: "Moto y bicicleta chocan en la carretera de Tías sin heridos",
    summary:
      "La colisión se produjo en un tramo de curva. Ambos conductores salieron ilesos.",
    body: P(
      "Una motocicleta y una bicicleta chocaron en la carretera de Tías, a la altura del acceso a un complejo turístico. El accidente ocurrió en un tramo de curva con visibilidad reducida.",
      "Ambos conductores resultaron ilesos y no fue necesaria la intervención del servicio de emergencias. Los daños fueron menores y los vehículos quedaron apartados de la calzada.",
      "La Guardia Civil ha recordado a los conductores la necesidad de extremar la precaución en este punto, especialmente durante la temporada turística.",
    ),
    hoursAgo: 300,
    municipality: "tias",
    vehicleType: "MOTO",
    severity: "LEVE",
    place: "Acceso a complejo turístico, carretera de Tías",
    sources: [{ ...DIGITAL, excerpt: "Colisión entre moto y bicicleta en Tías." }],
  },
  {
    title: "Camión pierde la carga en la vía insular y corta el carril derecho",
    summary:
      "El vehículo perdió parte de la carga en una curva y bloqueó uno de los carriles durante una hora.",
    body: P(
      "Un camión se salió del firme en una curva de la vía insular y bloqueó el carril derecho. La carga, paletizada, se derramó parcialmente sobre la calzada.",
      "No hubo heridos y el conductor resultó ileso.",
      "El dispositivo de emergencia reguló la circulación y la carga se recogió con la ayuda de una plataforma. Los trabajos finalizaron una hora después del aviso.",
    ),
    hoursAgo: 420,
    municipality: "tinaj",
    vehicleType: "CAMION",
    severity: "MODERADO",
    place: "Vía insular, tramo de Tinaj",
    sources: [{ ...CABILDO, excerpt: "Camión pierde carga en la vía insular." }],
  },
  {
    title: "Accidente grave en la carretera del sur deja un herido en estado crítico",
    summary:
      "Un turismo se salió de la vía, chocó contra el quitamiedos y se desplazó 40 metros hasta quedar volcado.",
    body: P(
      "Un accidente grave se registró en la carretera del sur, en el término municipal de Yaiza. Un turismo se salió de la vía, impactó contra el quitamiedos y se desplazó unos 40 metros hasta quedar volcado.",
      "El dispositivo de emergencias llegó en pocos minutos. El conductor, único ocupante, resultó estar en una situación crítica y fue evacuado en ambulancia al hospital insular, donde ingresó en estado grave.",
      "La Guardia Civil está investigando las causas del accidente. La velocidad máxima de la vía está limitada a 90 km/h.",
      "Este medio no publica el nombre de los implicados ni ningún otro dato personal que permita su identificación. Toda la información procede de las autoridades y del hospital.",
    ),
    hoursAgo: 520,
    municipality: "yaiza",
    vehicleType: "COCHE",
    severity: "GRAVE",
    injuries: 1,
    place: "Carretera del sur, Yaiza",
    sources: [
      { ...CABILDO, excerpt: "Accidente grave en la carretera del sur." },
      { ...DIARIO, excerpt: "Un herido grave tras salirse de la vía en Yaiza." },
    ],
  },
  {
    title: "Ciclista herido leve en la vía de acceso a Órzola",
    summary:
      "El ciclista resultó herido leve en una caída durante la subida al pueblo. Fue asistido en el lugar.",
    body: P(
      "Un ciclista sufrió lesiones leves tras caer en la carretera de acceso a Órzola, en el término de Teguise.",
      "El accidente se produjo cuando la bicicleta derrapó en una zona de sombra con pavimento irregular. El varón quedó consciente y fue atendido por el personal del servicio de emergencias.",
      "La vía es estrecha y carece de arcenes, por lo que los ciclistasykernelrecommended extremar la precaución durante la subida.",
    ),
    hoursAgo: 640,
    municipality: "teguise",
    vehicleType: "BICICLETA",
    severity: "LEVE",
    injuries: 1,
    place: "Carretera de acceso a Órzola",
    sources: [{ ...DIGITAL, excerpt: "Ciclista herido en la vía de Órzola." }],
  },
  {
    title: "Colisión entre tres vehículos en la rotonda de acceso a Arrecife",
    summary:
      "Una cadena de choques en la rotonda dejó un herido leve y dañó la señalización.",
    body: P(
      "Una cadena de colisiones se produjo en la rotonda de acceso al puerto de Arrecife. Tres vehículos participaron en el accidente: un turismo, una furgoneta de reparto y un patinete.",
      "Un conductor resultó herido leve y fue atendido en el lugar. La señalización de la rotonda sufrió daños.",
      "La Guardia Civil advierte de que la incidencia se produjo en un punto con mucha concentración de tráfico a primera hora de la mañana.",
    ),
    hoursAgo: 760,
    municipality: "arrecife",
    vehicleType: "COCHE",
    severity: "MODERADO",
    injuries: 1,
    place: "Rotonda de acceso al puerto, Arrecife",
    sources: [{ ...DIARIO, excerpt: "Colisión múltiple en la rotonda del puerto." }],
  },
  {
    title: "Motocicleta se estrella en la subida a Haría",
    summary:
      "El conductor perdió el control en una curva cerrada. Salió ileso pero con lesiones superficiales.",
    body: P(
      "Una motocicleta se estrelló en la carretera insular del norte, a la altura de la subida a Haría. El conductor perdió el control al negociar una curva cerrada.",
      "El varón, de 40 años, salió ileso de la caída pero presenta lesiones superficiales. Fue atendido en el lugar por el personal de emergencias.",
      "El vehículo tuvo que ser retirado por una grúa. La vía se vio afectada durante unos 30 minutos.",
    ),
    hoursAgo: 900,
    municipality: "haria",
    vehicleType: "MOTO",
    severity: "LEVE",
    injuries: 1,
    place: "Carretera insular del norte, subida a Haría",
    sources: [{ ...DIGITAL, excerpt: "Caída de moto en la subida a Haría." }],
  },
  {
    title: "Furgoneta vuelca al salirse en la carretera de Betancuria",
    summary: "La furgoneta perdió el control y rodó por el arcén. No hay heridos.",
    body: P(
      "Una furgoneta se salió de la vía en la carretera que da acceso a Betancuria y rodó por el arcén hasta quedar volcada sobre su lateral.",
      "El conductor y el ocupante salieron ilesos. El vehículo fue colocado en una zona segura a la espera de la retirada.",
    ),
    hoursAgo: 1100,
    municipality: "betancuria",
    vehicleType: "OTROS",
    severity: "LEVE",
    place: "Carretera de acceso a Betancuria",
    sources: [{ ...DIARIO, excerpt: "Furgoneta vuelca en Betancuria." }],
  },
  {
    title: "Colisión en la avenida principal de San Bartolomé",
    summary: "Dos vehículos chocaron en un cruce con semáforos. Un conductor resultó herido leve.",
    body: P(
      "Dos vehículos colisionaron en la avenida principal de San Bartolomé, en un cruce regulado por semáforos. El accidente se produjo cuando uno de los conductores se cruzó en ámbar.",
      "Un conductor resultó herido leve y fue atendido en el lugar. El dispositivo de emergencia reguló la circulación hasta que los vehículos fueron estabilizados.",
    ),
    hoursAgo: 1300,
    municipality: "san-bartolome",
    vehicleType: "COCHE",
    severity: "LEVE",
    injuries: 1,
    place: "Avenida principal, San Bartolomé",
    sources: [{ ...CABILDO, excerpt: "Colisión con herido leve en San Bartolomé." }],
  },
  {
    title: "Ciclistas alcanzados por un turismo en la carretera de Femés",
    summary:
      "Un grupo de ciclistas fue alcanzado por un turismo en una zona de curvas. Tres de ellos quedaron ilesos.",
    body: P(
      "Un grupo de ciclistas fue alcanzado por un turismo en la carretera de acceso a Femés, en un tramo de curvas. Tres de ellos cayeron al suelo.",
      "El conductor se detuvo inmediatamente y avisó al dispositivo de emergencias. Los tres afectados fueron atendidos en el lugar, dos de ellos evacuados al hospital por lesiones leves y el tercero quedó en observación.",
      "La Guardia Civil advierte del riesgo de esta vía durante los días de fuerte viento, cuando las curvas con peralte son especialmente peligrosas.",
    ),
    hoursAgo: 1500,
    municipality: "femes",
    vehicleType: "BICICLETA",
    severity: "MODERADO",
    injuries: 3,
    place: "Carretera de acceso a Femés",
    sources: [{ ...DIGITAL, excerpt: "Grupo de ciclistas alcanzado por un turismo en Femés." }],
  },

  /* ---------- Borradores de ejemplo: invisibles en el sitio publico ---------- */
  {
    title: "Accidente en la vía insular de Teguise pendiente de confirmación",
    summary:
      "Borrador sin verificar. La información procede de un canal no oficial y debe revisarse antes de publicarse.",
    body: P(
      "Este es un borrador generado automáticamente. El contenido todavía no ha sido verificado por un editor y no debe considerarse información fiable.",
      "El accidente se habría producido a primera hora de la mañana en la vía insular, sin que consten heridos graves según la información preliminar.",
      "Pendiente de comprobar: fecha exacta, confirmación con el Cabildo y verificación de las fuentes citadas.",
    ),
    hoursAgo: 3,
    municipality: "teguise",
    vehicleType: "COCHE",
    severity: "MODERADO",
    status: "PENDING_REVIEW",
    origin: "AI",
    place: "Vía insular, Teguise",
    sources: [
      {
        outlet: "Fuente por verificar",
        url: "https://example.com/fuente-sin-verificar",
        excerpt: "Referencia preliminar sin confirmar.",
      },
    ],
  },
  {
    title: "Colisión de motocicletas en Tías detectada por medio no oficial",
    summary:
      "Borrador de ejemplo. El texto se generó a partir de una publicación en redes y requiere contraste con fuentes oficiales.",
    body: P(
      "Este borrador se ha generado a partir de información publicada en redes sociales, un canal que no permite verificar los hechos.",
      "La colisión se habría producido en una vía urbana de Tías.",
      "Pendiente de revisión: contraste con el Cabildo de Lanzarote, confirmación de si hay heridos y verificación de la ubicación.",
    ),
    hoursAgo: 8,
    municipality: "tias",
    vehicleType: "MOTO",
    severity: "LEVE",
    status: "PENDING_REVIEW",
    origin: "AI",
    place: "Vía urbana, Tías",
    sources: [
      {
        outlet: "Red social (sin verificar)",
        url: "https://example.com/publicacion-red-social",
        excerpt: "Publicación sin confirmar.",
      },
    ],
  },
  {
    title: "Siniestro en la carretera insular con datos no verificables",
    summary:
      "Borrador descartado durante la revisión por no poder confirmarse la información.",
    body: P(
      "Este registro se conserva como ejemplo de borrador descartado. Un editor lo revisó y determinó que la información no era verificable.",
      "No aparece en ningún lugar del sitio público.",
    ),
    hoursAgo: 200,
    municipality: "yaiza",
    vehicleType: "COCHE",
    severity: "MODERADO",
    status: "REJECTED",
    origin: "AI",
    place: "Carretera insular, Yaiza",
    sources: [
      {
        outlet: "Fuente descartada",
        url: "https://example.com/descartada",
        excerpt: "No verificable.",
      },
    ],
  },
];

function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90);
}

async function main() {
  console.log("Sembrando datos de prueba...");

  // Limpieza, en orden por claves foraneas
  await prisma.revision.deleteMany();
  await prisma.source.deleteMany();
  await prisma.accident.deleteMany();

  for (const m of MUNICIPALITIES) {
    await prisma.municipality.upsert({
      where: { slug: m.slug },
      update: { name: m.name, lat: m.lat, lon: m.lon },
      create: { slug: m.slug, name: m.name, lat: m.lat, lon: m.lon, island: "Lanzarote" },
    });
  }
  console.log(`  ${MUNICIPALITIES.length} municipios`);

  const municipalities = await prisma.municipality.findMany();
  const bySlug = new Map(municipalities.map((m) => [m.slug, m]));

  let created = 0;
  for (const a of ACCIDENTS) {
    const municipality = bySlug.get(a.municipality);
    if (!municipality) {
      console.warn(`  ! municipio desconocido: ${a.municipality}`);
      continue;
    }

    // Coordenada aproximada derivada del centro del municipio (nunca exacta).
    const jitter = () => (Math.random() - 0.5) * 0.02;
    const approxLat = municipality.lat + jitter();
    const approxLon = municipality.lon + jitter();

    const base = slugify(a.title);
    const clash = await prisma.accident.findUnique({ where: { slug: base }, select: { id: true } });
    const slug = clash ? `${base}-${created + 1}` : base;

    await prisma.accident.create({
      data: {
        slug,
        title: a.title,
        summary: a.summary,
        body: a.body,
        occurredAt: hoursAgo(a.hoursAgo),
        municipalityId: municipality.id,
        vehicleType: a.vehicleType,
        severity: a.severity,
        fatalities: a.fatalities ?? 0,
        injuries: a.injuries ?? 0,
        status: a.status ?? "PUBLISHED",
        origin: a.origin ?? "MANUAL",
        isFeatured: a.featured ?? false,
        approxLat,
        approxLon,
        locationDescription: a.place,
        sources: { create: a.sources },
      },
    });
    created++;
  }

  const byStatus = await prisma.accident.groupBy({ by: ["status"], _count: { _all: true } });
  console.log(`  ${created} accidentes insertados`);
  for (const s of byStatus) console.log(`    ${s.status}: ${s._count._all}`);
  console.log("Listo. Ejecuta `npm run dev` y abre http://localhost:3000");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
