/**
 * Tipos y estado inicial de los formularios de acceso.
 *
 * Este archivo NO lleva "use server": un archivo con esa directiva solo puede
 * exportar funciones asincronas, asi que los tipos y el estado inicial viven
 * aqui para que `actions.ts` quede limpio. Es el mismo motivo por el que existe
 * `src/app/admin/action-state.ts`.
 */

export type LoginState = {
  /** Texto en rojo. Vacio si no hay error. */
  error: string;
  /** Texto informativo. Vacio si no hay nada que avisar. */
  aviso: string;
  /**
   * La contrasena era correcta pero el correo sigue sin confirmar. En ese caso se
   * muestra el boton de reenviar y se recuerda el correo ya escrito.
   */
  necesitaReenvio: boolean;
  /** Correo del intento, para el formulario de reenvio. */
  email: string;
};

/** Estado inicial: sin errores y sin avisos. */
export const LOGIN_INICIAL: LoginState = {
  error: "",
  aviso: "",
  necesitaReenvio: false,
  email: "",
};