/**
 * Estado del formulario de alta de cuenta.
 *
 * Sin "use server" a proposito: un archivo con esa directiva solo puede exportar
 * funciones asincronas.
 */

export type RegisterState = {
  error: string;
  /** Email ya escrito, para no perderlo si hay que corregir otra cosa. */
  email: string;
};

export const REGISTRO_INICIAL: RegisterState = { error: "", email: "" };