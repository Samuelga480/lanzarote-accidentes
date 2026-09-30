import type { Metadata } from "next";
import { SITE } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Aviso legal y privacidad",
  description:
    "Criterios editoriales, política de privacidad y tratamiento de datos personales del portal de accidentes de tráfico en Lanzarote.",
  alternates: { canonical: "/privacidad" },
};

export default function PrivacyPage() {
  return (
    <div className="container-page py-8 max-w-3xl">
      <h1 className="font-serif text-3xl md:text-4xl font-bold leading-tight mb-2">
        Aviso legal y privacidad
      </h1>
      <p className="text-xs text-ink-mute mb-8">
        Última actualización: {new Date().getFullYear()} · {SITE.organization}
      </p>

      <div className="prose-news">
        <h2 className="font-serif text-xl font-bold mt-8 mb-3 first:mt-0">
          Qué datos personales no publicamos
        </h2>
        <p>
          Esta web tiene como regla no publicar información que pueda identificar o localizar a personas
          concretas en relación con un accidente. En concreto, nunca se difunden:
        </p>
        <ul className="list-disc pl-5 space-y-1.5 mb-5 text-ink-soft">
          <li>Matrículas de vehículos, en ningún formato.</li>
          <li>Teléfonos móviles o fijos.</li>
          <li>DNI, NIE o cualquier documento de identidad.</li>
          <li>Direcciones de domicilio o direcciones exactas del lugar del accidente.</li>
          <li>Nombres y apellidos de conductores, heridos o testigos.</li>
          <li>Correos electrónicos.</li>
        </ul>
        <p>
          Antes de guardar cualquier noticia —escrita por una persona o generada automáticamente— el sistema
          analiza el texto y elimina de forma automática los matrículas, teléfonos, documentos y correos que
          detecta. El editor ve un aviso con lo que se ha suprimido.
        </p>

        <h2 className="font-serif text-xl font-bold mt-8 mb-3">Ubicaciones aproximadas</h2>
        <p>
          El mapa no marca el punto exacto de ningún accidente. Cuando una fuente facilita una coordenada, el
          sistema la desplaza de forma aleatoria entre 400 y 900 metros antes de guardarla. El marcador
          representa, por tanto, un área, no un punto, y no permite identificar una vivienda, un negocio ni una
          dirección concreta.
        </p>

        <h2 className="font-serif text-xl font-bold mt-8 mb-3">Noticias generadas por IA</h2>
        <p>
          El proyecto está preparado para que un sistema de inteligencia artificial recopile información de
          fuentes públicas y redacte borradores. Esas noticias{" "}
          <strong className="text-ink">nunca se publican automáticamente</strong>: se crean siempre con el
          estado «pendiente de revisión» y solo un editor puede aprobarlas. Si un borrador se publica, la
          noticia conserva la lista de fuentes consultadas para que cualquier persona pueda contrastarla.
        </p>

        <h2 className="font-serif text-xl font-bold mt-8 mb-3">Fuentes</h2>
        <p>
          Cada noticia incluye las fuentes de las que procede. Cuando la información procede de una
          comunicación oficial (Cabildo de Lanzarote, dispositivo de emergencias, cuerpos de seguridad), se
          indica expresamente. Las referencias a datos procedentes de redes sociales o canales no oficiales se
          señalan como no verificadas y requieren confirmación antes de publicarse.
        </p>

        <h2 className="font-serif text-xl font-bold mt-8 mb-3">Fin de la información</h2>
        <p>
          Las noticias se publican con una finalidad estrictamente informativa y de seguridad vial. En caso de
          emergencia, o si necesitas información sobre un accidente concreto, contacta con el <strong>112</strong>{" "}
          o con las fuerzas de seguridad del Estado. Los datos publicados pueden no ser completos o estar
          desactualizados en el momento de la consulta.
        </p>

        <h2 className="font-serif text-xl font-bold mt-8 mb-3">Retirada de contenido</h2>
        <p>
          Si consideras que una noticia publicada contiene un dato que no debería figurar o vulnera tus
          derechos, puedes solicitar su revisión y retirada. Cada registro editorial conserva un historial de
          cambios con el responsable de la edición, de modo que siempre se puede saber quién aprobó qué y
          cuándo.
        </p>

        <h2 className="font-serif text-xl font-bold mt-8 mb-3">Aviso sobre los datos de prueba</h2>
        <p>
          Si estás ejecutando esta instalación de forma local, la base de datos viene rellena con{" "}
          <strong className="text-ink">noticias ficticias</strong> incluidas únicamente para probar la
          interfaz. No corresponden a accidentes reales. Antes de publicar el sitio, vacía esas tablas y carga
          información verificada.
        </p>
      </div>
    </div>
  );
}
