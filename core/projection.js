// Proyección de cuotas futuras cubiertas por el excedente actual.

import { addDays } from './date-utils.js';
import { getTodayTarget } from './ledger.js';
import { getActivityQuotaForDate, isPausedOn } from './schedule.js';

// Límite de seguridad para no recorrer fechas infinitas.
const DEFAULT_MAX_DAYS = 366;

/**
 * Recorre las próximas fechas programadas con un saldo simulado.
 * Mientras el saldo alcance para la cuota completa, la marca como cubierta
 * y resta su cuota. Se detiene en la primera cuota que no queda cubierta.
 *
 * El saldo de partida es el saldo neto de hoy:
 * saldo cerrado + trabajado hoy - cuota de hoy.
 */
export function projectCoveredQuotas({
  activity,
  scheduleVersions,
  sessions,
  today,
  maxDays = DEFAULT_MAX_DAYS,
}) {
  const todayInfo = getTodayTarget({
    activity,
    scheduleVersions,
    sessions,
    today,
  });

  let simulatedBalance = todayInfo.balance_after_sec;
  const coveredDates = [];
  let firstUncoveredDate = null;

  let date = addDays(today, 1);

  for (let day = 0; day < maxDays; day += 1) {
    // Los días pausados no generan cuota. Si hay una reanudación futura,
    // la proyección continúa después de la pausa.
    if (!isPausedOn(activity, date)) {
      const quota = getActivityQuotaForDate(activity, scheduleVersions, date);

      if (quota !== null) {
        if (simulatedBalance >= quota) {
          coveredDates.push(date);
          simulatedBalance -= quota;
        } else {
          firstUncoveredDate = date;
          break;
        }
      }
    }

    date = addDays(date, 1);
  }

  return {
    covered_count: coveredDates.length,
    covered_dates: coveredDates,
    first_uncovered_date: firstUncoveredDate,
    remaining_balance_sec: simulatedBalance,
  };
}
