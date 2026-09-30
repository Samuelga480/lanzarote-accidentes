/**
 * Tipos compartidos por las Server Actions y los formularios del panel.
 *
 * Este archivo NO lleva "use server": un archivo con esa directiva solo puede
 * exportar funciones asincronas, asi que los tipos y el estado inicial viven
 * aqui para que actions.ts quede limpio.
 */

export type ActionState = {
  ok: boolean;
  message: string;
  fieldErrors?: Record<string, string[]>;
};

/** Estado inicial de todos los formularios del panel. */
export const EMPTY_STATE: ActionState = { ok: false, message: "" };

/** Estado inicial de un formulario concreto. */
export function initialState(): ActionState {
  return { ...EMPTY_STATE };
}
