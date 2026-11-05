// Utilidades compartidas por las pruebas.
// Los casos se escriben en minutos para que sean legibles y aquí se convierten a segundos.

export const SEC_PER_MIN = 60;

/** Convierte minutos a segundos enteros. */
export function toSec(minutes) {
  return minutes * SEC_PER_MIN;
}

// Fechas fijas de prueba. 2026-01-05 es lunes.
export const MON = '2026-01-05';
export const TUE = '2026-01-06';
export const WED = '2026-01-07';
export const THU = '2026-01-08';
export const FRI = '2026-01-09';
export const SAT = '2026-01-10';
export const SUN = '2026-01-11';
export const NEXT_MON = '2026-01-12';

/**
 * Construye el mapa de cuotas semanales en segundos.
 * Acepta un número (misma cuota todos los días) o un objeto { weekday: minutos }.
 * weekday: 0 = lunes ... 6 = domingo.
 */
export function weekQuotas(quotas) {
  if (typeof quotas === 'number') {
    return {
      0: toSec(quotas),
      1: toSec(quotas),
      2: toSec(quotas),
      3: toSec(quotas),
      4: toSec(quotas),
      5: toSec(quotas),
      6: toSec(quotas),
    };
  }

  return Object.fromEntries(
    Object.entries(quotas).map(([weekday, minutes]) => [weekday, toSec(minutes)]),
  );
}

/** Crea una versión de calendario con fecha de inicio de vigencia. */
export function scheduleVersion(effective_from, quotas) {
  return { effective_from, days: weekQuotas(quotas) };
}

let sessionCounter = 0;

/** Crea una sesión terminada por defecto. */
export function makeSession(local_date, minutes, overrides = {}) {
  sessionCounter += 1;

  return {
    id: overrides.id ?? `session-${sessionCounter}`,
    activity_id: overrides.activity_id ?? 'activity-1',
    local_date,
    duration_sec: toSec(minutes),
    state: overrides.state ?? 'finished',
  };
}

/** Crea una actividad activa por defecto. */
export function makeActivity(overrides = {}) {
  return {
    id: overrides.id ?? 'activity-1',
    start_date: overrides.start_date ?? MON,
    initial_balance_sec: overrides.initial_balance_sec ?? 0,
    status: overrides.status ?? 'active',
    paused_from: overrides.paused_from ?? null,
    pause_periods: overrides.pause_periods ?? null,
  };
}
