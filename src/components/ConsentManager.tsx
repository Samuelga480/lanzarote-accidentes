"use client";

import Script from "next/script";

/**
 * CMP de InMobi Choice, la que exige la red de anuncios.
 *
 * ---------------------------------------------------------------------------
 *  POR QUE ESTA Y NO OTRA
 * ---------------------------------------------------------------------------
 *
 * Solo puede haber UNA CMP activa en un sitio: todas crean el mismo marco
 * (__tcfapiLocator) y se pisan entre si. La red de anuncios pide que la CMP
 * este certificada por TCF, y la suya lo esta. Por eso se sustituye por
 * iubenda, que tambien habia puesto antes: tener las dos rompe el consentimiento
 * y deja la publicidad bloqueada.
 *
 * ---------------------------------------------------------------------------
 *  EL STUB
 * ---------------------------------------------------------------------------
 *
 * El codigo crea el stub de la API TCF antes de que llegue el script de
 * InMobi. Sin el, las peticiones de consentimiento que llegan durante la carga
 * se pierden y la red no recibe la senal de que el visitante ha aceptado. Por eso
 * va sincrono en el head y no con strategy="afterInteractive".
 *
 * ---------------------------------------------------------------------------
 *  EL "<" ESCAPADO
 * ---------------------------------------------------------------------------
 *
 * El texto va con dangerouslySetInnerHTML, y por eso se escapan los "<". Sin
 * eso, un "</script>" dentro del codigo cerraria la etiqueta y ejecutaria lo que
 * viniera despues.
 */

/** Dominios que este script necesita que la politica de seguridad permita. */
export const CMP_HOST = "cmp.inmobi.com";

/** Dominio de la red que aporta el consentimiento. */
export const NETWORK_HOST = "www.themoneytizer.com";

/** Identificador del CMP. Es de la red de anuncios y no se cambia a mano. */
const CMP_ID = "6Fv0cGNfc_bw8";

const STUB = `
(function() {
  var host = "${NETWORK_HOST}";
  var element = document.createElement('script');
  var firstScript = document.getElementsByTagName('script')[0];
  var url = 'https://${CMP_HOST}'
    .concat('/choice/', '${CMP_ID}', '/', host, '/choice.js?tag_version=V3');
  var uspTries = 0;
  var uspTriesLimit = 3;
  element.async = true;
  element.type = 'text/javascript';
  element.src = url;

  firstScript.parentNode.insertBefore(element, firstScript);

  function makeStub() {
    var TCF_LOCATOR_NAME = '__tcfapiLocator';
    var queue = [];
    var win = window;
    var cmpFrame;

    function addFrame() {
      var doc = win.document;
      var otherCMP = !!(win.frames[TCF_LOCATOR_NAME]);

      if (!otherCMP) {
        if (doc.body) {
          var iframe = doc.createElement('iframe');
          iframe.style.cssText = 'display:none';
          iframe.name = TCF_LOCATOR_NAME;
          doc.body.appendChild(iframe);
        } else {
          setTimeout(addFrame, 5);
        }
      }
      return !otherCMP;
    }

    function tcfAPIHandler() {
      var gdprApplies;
      var args = arguments;

      if (!args.length) {
        return queue;
      } else if (args[0] === 'setGdprApplies') {
        if (args.length > 3 && args[2] === 2 && typeof args[3] === 'boolean') {
          gdprApplies = args[3];
          if (typeof args[2] === 'function') {
            args[2]('set', true);
          }
        }
      } else if (args[0] === 'ping') {
        var retr = {
          gdprApplies: gdprApplies,
          cmpLoaded: false,
          cmpStatus: 'stub'
        };
        if (typeof args[2] === 'function') {
          args[2](retr);
        }
      } else {
        if (args[0] === 'init' && typeof args[3] === 'object') {
          args[3] = Object.assign(args[3], { tag_version: 'V3' });
        }
        queue.push(args);
      }
    }

    function postMessageEventHandler(event) {
      var msgIsString = typeof event.data === 'string';
      var json = {};

      try {
        msgIsString ? (json = JSON.parse(event.data)) : (json = event.data);
      } catch (ignore) {}

      var payload = json.__tcfapiCall;

      if (payload) {
        window.__tcfapi(
          payload.command,
          payload.version,
          function(retValue, success) {
            var returnMsg = {
              __tcfapiReturn: {
                returnValue: retValue,
                success: success,
                callId: payload.callId
              }
            };
            if (msgIsString) {
              returnMsg = JSON.stringify(returnMsg);
            }
            if (event && event.source && event.source.postMessage) {
              event.source.postMessage(returnMsg, '*');
            }
          },
          payload.parameter
        );
      }
    }

    while (win) {
      try {
        if (win.frames[TCF_LOCATOR_NAME]) {
          cmpFrame = win;
          break;
        }
      } catch (ignore) {}

      if (win === window.top) break;
      win = win.parent;
    }
    if (!cmpFrame) {
      addFrame();
      win.__tcfapi = tcfAPIHandler;
      win.addEventListener('message', postMessageEventHandler, false);
    }
  };

  makeStub();

  var uspStubFunction = function() {
    var arg = arguments;
    if (typeof window.__uspapi !== uspStubFunction) {
      setTimeout(function() {
        if (typeof window.__uspapi !== 'undefined') {
          window.__uspapi.apply(window.__uspapi, arg);
        }
      }, 500);
    }
  };

  var checkIfUspIsReady = function() {
    uspTries++;
    if (window.__uspapi === uspStubFunction && uspTries < uspTriesLimit) {
      console.warn('USP is not accessible');
    } else {
      clearInterval(uspInterval);
    }
  };

  if (typeof window.__uspapi === 'undefined') {
    window.__uspapi = uspStubFunction;
    var uspInterval = setInterval(checkIfUspIsReady, 6000);
  }
})();
`;

/**
 * Etiqueta de gestion de consentimiento.
 *
 * Se monta en el head porque el stub tiene que existir antes de que la red de
 * anuncios pregunte por el consentimiento. Si llega tarde, la primera peticion
 * se queda sin respuesta y la red marca la sesion como sin consentir.
 */
/**
 * Prepara el texto para meterlo dentro de un <script>.
 *
 * Solo se escapa la secuencia que puede romper el HTML, que es "</script".
 * Ese "<\/script" dentro de una cadena de JavaScript vale exactamente lo mismo
 * que "</script", pero no cierra la etiqueta del elemento.
 *
 * Lo que NO hay que hacer es escapar todos los "<" por el planeta a "\u003c":
 * dentro de JavaScript "\u003c" no es el caracter "<", es un identificador
 * roto. Con eso cualquier comparacion del stub ("a < b") deja de compilar, y la
 * CMP entera se queda sin ejecutar sin decir nada. Ya paso: el aviso de cookies
 * salia en blanco y el unico sintoma era un SyntaxError en la consola.
 *
 * tests/consent-manager.ts comprueba que el texto final se puede cargar como
 * JavaScript, que es lo que habria pillado esto antes de desplegar.
 */
export function prepareStub(stub: string): string {
  return stub.replace(/<\/(script)/gi, "<\\/$1");
}

export function ConsentManager() {
  return <script id="inmobi-choice-cmp" dangerouslySetInnerHTML={{ __html: prepareStub(STUB) }} />;
}
