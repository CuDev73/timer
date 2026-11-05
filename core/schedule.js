// Resolución del calendario semanal por versiones.
// Cada versión rige desde su effective_from hasta que otra versión la reemplaza.

import { assertValidDate, getWeekday } from './date-utils.js';

/**
 * Devuelve la versión vigente para una fecha:
 * la última versión con effective_from <= fecha, o null si no hay ninguna.
 */
export function getScheduleVersionForDate(scheduleVersions, date) {
  assertValidDate(date);

  let current = null;

  for (const version of scheduleVersions ?? []) {
    if (version.effective_from > date) continue;

    // Si hay dos versiones con la misma fecha, gana la última del array.
    if (current === null || version.effective_from >= current.effective_from) {
      current = version;
    }
  }

  return current;
}

/**
 * Cuota en segundos para una fecha, o null si ese día no está programado.
 * Una cuota ausente, 0 o inválida significa "no programado".
 */
export function getQuotaForDate(scheduleVersions, date) {
  const version = getScheduleVersionForDate(scheduleVersions, date);
  if (version === null) return null;

  const weekday = getWeekday(date);
  const quota = version.days?.[weekday];

  if (typeof quota !== 'number' || !Number.isFinite(quota) || quota <= 0) {
    return null;
  }

  return quota;
}

/**
 * Indica si la actividad está pausada en una fecha concreta.
 *
 * Si llega `pause_periods` (varios periodos de pausa), se usa esa lista.
 * Cada periodo tiene `{ paused_from, resumed_from }`; `resumed_from` null
 * significa que la pausa sigue abierta.
 *
 * Si no hay lista, se mantiene el modelo simple `{ status, paused_from }`
 * para no romper los datos de la Etapa 1.
 */
export function isPausedOn(activity, date) {
  const periods = activity.pause_periods;

  if (Array.isArray(periods) && periods.length > 0) {
    return periods.some(
      (period) =>
        date >= period.paused_from &&
        (period.resumed_from === null ||
          period.resumed_from === undefined ||
          date < period.resumed_from),
    );
  }

  return (
    activity.status === 'paused' &&
    Boolean(activity.paused_from) &&
    date >= activity.paused_from
  );
}

/**
 * Cuota de una actividad para una fecha.
 * Devuelve null si la fecha es anterior al inicio, si la actividad está pausada
 * o si ese día no está programado.
 */
export function getActivityQuotaForDate(activity, scheduleVersions, date) {
  if (date < activity.start_date) return null;
  if (isPausedOn(activity, date)) return null;

  return getQuotaForDate(scheduleVersions, date);
}
