// Estadísticas calculadas a partir del libro diario.

import { assertValidDate } from './date-utils.js';

/**
 * Calcula estadísticas de un rango de fechas inclusivo.
 *
 * - Por tiempo: segundos trabajados / segundos de cuota.
 * - Por días: (cumplidos + cubiertos) / días programados.
 * - Sesiones: suma de las sesiones terminadas del ledger.
 * - Serie de saldo: saldo al cerrar cada día del rango.
 *
 * Si no se pasa rango, se usan todos los días del ledger.
 */
export function computeStats(ledger, range = {}) {
  if (range?.from) assertValidDate(range.from);
  if (range?.to) assertValidDate(range.to);

  const rows = (ledger ?? []).filter((row) => {
    if (range?.from && row.date < range.from) return false;
    if (range?.to && row.date > range.to) return false;
    return true;
  });

  const from = range?.from ?? rows[0]?.date ?? null;
  const to = range?.to ?? rows.at(-1)?.date ?? null;

  let workedSec = 0;
  let quotaSec = 0;
  let sessionCount = 0;

  const days = {
    total: 0,
    scheduled: 0,
    covered: 0,
    completed: 0,
    partial: 0,
    missed: 0,
    not_scheduled: 0,
    paused: 0,
  };

  for (const row of rows) {
    workedSec += row.worked_sec ?? 0;
    quotaSec += row.quota_sec ?? 0;
    sessionCount += row.session_count ?? 0;
    days.total += 1;

    if (row.status === 'paused') {
      days.paused += 1;
      continue;
    }

    if (!row.scheduled) {
      days.not_scheduled += 1;
      continue;
    }

    days.scheduled += 1;

    if (row.status === 'covered') days.covered += 1;
    else if (row.status === 'completed') days.completed += 1;
    else if (row.status === 'partial') days.partial += 1;
    else if (row.status === 'missed') days.missed += 1;
  }

  const daysCompletionRatio =
    days.scheduled > 0 ? (days.completed + days.covered) / days.scheduled : 0;

  return {
    range: { from, to },
    time: {
      worked_sec: workedSec,
      quota_sec: quotaSec,
      completion_ratio: quotaSec > 0 ? workedSec / quotaSec : 0,
    },
    days: {
      ...days,
      completion_ratio: daysCompletionRatio,
    },
    session_count: sessionCount,
    balance_series: rows.map((row) => ({
      date: row.date,
      balance_sec: row.balance_after_sec,
    })),
  };
}

/**
 * Racha de días programados cumplidos.
 *
 * Solo cuentan los días con cuota cerrada cuyo estado sea "completed" o
 * "covered". Los días libres y pausados no rompen la racha porque no había
 * objetivo que cumplir. Devuelve la racha actual (la que termina en el último
 * día del ledger) y la mejor racha histórica.
 */
export function computeStreaks(ledger) {
  let current = 0;
  let best = 0;

  for (const row of ledger ?? []) {
    if (!row.scheduled || row.paused) continue;

    if (row.status === 'completed' || row.status === 'covered') {
      current += 1;
      best = Math.max(best, current);
    } else {
      current = 0;
    }
  }

  return { current, best };
}
