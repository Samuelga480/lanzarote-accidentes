/**
 * Pruebas de la CMP de consentimiento.
 *
 * La que importa de verdad es la primera: que el texto que se mete dentro del
 * <script> se pueda cargar como JavaScript. Ese fallo ya ocurrio una vez: al
 * escapar todos los "<" por "\\u003c", cualquier comparacion del stub
 * ("a < b") se convertia en un identificador roto, la CMP no se ejecutaba y el
 * aviso de cookies salia en blanco. El unico sintoma era un SyntaxError en la
 * consola, y se llego a desplegar asi.
 */
import { prepareStub } from "../src/components/ConsentManager";

let fallos = 0;

function ok(nombre: string, condicion: boolean, detalle = "") {
  if (!condicion) fallos++;
  console.log(`  ${condicion ? "correcta" : "FALLA   "} ${nombre}${detalle ? ` -> ${detalle}` : ""}`);
}

/* -------------------------------------------------------------------------- */
console.log("\n1. EL STUB TIENE QUE COMPILAR\n");

{
  // El stub real de la red, tal cual lo entrega su panel.
  const stub = `
(function() {
  var host = "www.themoneytizer.com";
  var element = document.createElement('script');
  var firstScript = document.getElementsByTagName('script')[0];
  var url = 'https://cmp.inmobi.com'
    .concat('/choice/', '6Fv0cGNfc_bw8', '/', host, '/choice.js?tag_version=V3');
  var uspTries = 0;
  var uspTriesLimit = 3;
  element.async = true;
  element.type = 'text/javascript';
  element.src = url;
  firstScript.parentNode.insertBefore(element, firstScript);
  function makeStub() {
    var TCF_LOCATOR_NAME = '__tcfapiLocator';
    var win = window;
    if (win.__uspapi !== undefined && uspTries < uspTriesLimit) { return; }
    win.__tcfapi = function () {};
  }
  makeStub();
})();
`;

  const preparado = prepareStub(stub);
  let error: string | null = null;
  try {
    // Function compila el cuerpo sin ejecutarlo: comprueba la sintaxis.
    new Function(preparado);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  ok("el stub compila tal cual", error === null, error ?? "");
  ok("preparado sigue compilando", (() => {
    try {
      new Function(preparado);
      return true;
    } catch {
      return false;
    }
  })());
  ok("no se ha roto la comparacion con <", preparado.includes("uspTries < uspTriesLimit"));
}

/* -------------------------------------------------------------------------- */
console.log("\n2. EL ESCAPE MAL HECHO ROMPE EL CODIGO\n");

{
  // Esto es lo que se hizo por error: escapar todos los "<".
  const roto = 'if (a < b) { hacer(); }'.replace(/</g, "\\u003c");
  let falla = false;
  try {
    new Function(roto);
  } catch {
    falla = true;
  }
  ok("escapar < como \\u003c rompe el JavaScript (por eso no se hace)", falla);
}

/* -------------------------------------------------------------------------- */
console.log("\n3. CERRAR LA ETIQUETA SCRIPT SÍ SE ESCAPA\n");

{
  const conCierre = 'var s = "</script>"; var x = 1 < 2;';
  const preparado = prepareStub(conCierre);

  ok("no queda la secuencia </script literal", !preparado.includes("</script>"));
  ok("la comparacion con < sigue siendo <", preparado.includes("1 < 2"));

  let falla = false;
  try {
    new Function(preparado);
  } catch {
    falla = true;
  }
  ok("el resultado sigue compilando", !falla);
}

/* -------------------------------------------------------------------------- */
console.log("\n4. NO TOCA NADA MAS\n");

{
  const normal = "var a = 1; if (a < 2 && a > 0) { hacer(); }";
  ok("un texto normal sale intacto", prepareStub(normal) === normal);
}

console.log(`\n${fallos === 0 ? "Todas las comprobaciones correctas." : `${fallos} fallo(s).`}\n`);
process.exitCode = fallos === 0 ? 0 : 1;