/**
 * Ventana del ano civil, en hora de Canarias.
 *
 * ---------------------------------------------------------------------------
 *  POR QUE UN MODULO PROPIO
 * ---------------------------------------------------------------------------
 *
 * El resumen anual se decide en dos instantes: el 1 de enero a las 00:00 y el
 * 31 de diciembre a las 23:59:59. Si el corte se hiciera conUTC, en invierno
 * (Canarias esta en UTC+0) funcionaria, pero en verano (UTC+1) un accidente de
 * las 23:30 del 31 de diciembre caeria en el ano que viene. El corte tiene que
 * hacerse en hora de Canarias.
 *
 * Canary cambia de UTC+0 a UTC+1 en horario de verano, asi que no vale con sumar
 * una hora fija: canaryLocalToUtc() resuelve el offset real con Intl.
 *
 * El fin es exclusivo ([start, end)): asi un accidente del 31 de diciembre a
 * las 23:59:30 entra, y no hace falta un .999 artificial que siempre acaba
 * fuera de rango en algun motor.
 *
 * Todas las funciones son puras y reciben `now` para poder probarlas sin
 * depender del reloj.
 */

import { canaryLocalToUtc, toInputDateTime } from "@/lib/format";

/** Nombre de cada mes, para el reparto mensual. */
export const MONTH_LABELS = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
] as const;

/** Anos que se admiten. Acota lo que se puede pedir desde una URL. */
export const MIN_YEAR = 2000;
export const MAX_YEAR = 2100;

/** Un ano solo si es un entero dentro del rango admitido. */
export function isValidYear(v: unknown): v is number {
  return (
    typeof v === "number" &&
    Number.isInteger(v) &&
    v >= MIN_YEAR &&
    v <= MAX_YEAR
  );
}

/** Ano civil al que pertenece un instante, segun el reloj de Canarias. */
export function canaryYearOf(d: Date): number {
  return Number(toInputDateTime(d).slice(0, 4));
}

/** Mes (1-12) de un instante, segun el reloj de Canarias. */
export function canaryMonthOf(d: Date): number {
  return Number(toInputDateTime(d).slice(5, 7));
}

/**
 * Ventana [start, end) del ano `year` en Canarias.
 *
 * Empieza el 1 de enero a las 00:00 y termina el 31 de diciembre a las 23:59.
 */
export function yearWindow(year: number): { start: Date; end: Date } {
  return {
    start: canaryLocalToUtc(`${year}-01-01T00:00`),
    // El fin es el 1 de enero del ano siguiente a las 00:00: es el mismo
    // instante que el 31 de diciembre a las 23:59:59.999, pero expresandolo de
    // forma que no haya que sumar un milisegundo a mano.
    end: canaryLocalToUtc(`${year + 1}-01-01T00:00`),
  };
}

/** El ano ya cerro: su ventana termina antes o en el mismo instante que `now`. */
export function isYearClosed(year: number, now: Date = new Date()): boolean {
  return yearWindow(year).end.getTime() <= now.getTime();
}

/** Cuenta atras hasta el cierre del ano, o null si el ano ya cerro. */
export function countdownToYearEnd(
  year: number,
  now: Date = new Date(),
): { days: number; hours: number; minutes: number } | null {
  const left = yearWindow(year).end.getTime() - now.getTime();
  if (left <= 0) return null;

  const minutes = Math.floor(left / 60_000);
  return {
    days: Math.floor(minutes / 1440),
    hours: Math.floor((minutes % 1440) / 60),
    minutes: minutes % 60,
  };
}