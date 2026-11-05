// Libro diario (ledger) y objetivo del día.
// Todo se deriva del historial: sesiones terminadas + cuotas cerradas + saldo inicial.

import { addDays, assertValidDate, compareDates, listDates } from './date-utils.js';
import { getActivityQuotaForDate, isPausedOn } from './schedule.js';

// Solo las sesiones terminadas cuentan para el saldo.
export const COUNTED_SESSION_STATE = 'finished';

/**
 * Agrupa el tiempo trabajado por fecha para una actividad.
 * Ignora sesiones de otras actividades, sesiones no terminadas y duraciones no positivas.
 */
function getWorkByDate(sessions, activityId) {
  const workByDate = new Map();

  for (const session of sessions ?? []) {
    if (session.activity_id !== activityId) continue;
    if (session.state !== COUNTED_SESSION_STATE) continue;
    if (!(session.duration_sec > 0)) continue;

    const current = workByDate.get(session.local_date) ?? {
      worked_sec: 0,
      session_count: 0,
    };

    current.worked_sec += session.duration_sec;
    current.session_count += 1;
    workByDate.set(session.local_date, current);
  }

  return workByDate;
}

/** Estado de un día ya cerrado. */
function getClosedDayStatus({ scheduled, target, worked }) {
  if (!scheduled) return 'not_scheduled';
  if (target === 0) return 'covered';
  if (worked >= target) return 'completed';
  if (worked > 0) return 'partial';
  return 'missed';
}

/**
 * Cierra todos los días desde start_date hasta ayer y devuelve:
 * - ledger: una fila por cada día cerrado.
 * - balance_sec: saldo resultante al empezar hoy.
 *
 * Cada fila distingue tiempo trabajado de tiempo cubierto por excedente.
 * Los días pausados no generan cuota y dejan el saldo congelado.
 */
export function closeDays({ activity, scheduleVersions, sessions, today }) {
  assertValidDate(today);

  const ledger = [];
  let balance = activity.initial_balance_sec ?? 0;

  const yesterday = addDays(today, -1);

  // Si la actividad todavía no empezó, no hay días cerrados.
  if (compareDates(activity.start_date, yesterday) > 0) {
    return { ledger, balance_sec: balance };
  }

  const workByDate = getWorkByDate(sessions, activity.id);

  for (const date of listDates(activity.start_date, yesterday)) {
    const balanceBefore = balance;

    // Día pausado: no hay cuota, no se cuenta trabajo y el saldo no cambia.
    if (isPausedOn(activity, date)) {
      ledger.push({
        date,
        scheduled: false,
        paused: true,
        quota_sec: 0,
        balance_before_sec: balanceBefore,
        target_sec: 0,
        worked_sec: 0,
        covered_sec: 0,
        balance_after_sec: balanceBefore,
        status: 'paused',
        session_count: 0,
      });
      continue;
    }

    const quota = getActivityQuotaForDate(activity, scheduleVersions, date);
    const scheduled = quota !== null;
    const quotaSec = quota ?? 0;

    const work = workByDate.get(date) ?? { worked_sec: 0, session_count: 0 };
    const workedSec = work.worked_sec;

    // T(n) = max(0, q(n) - S(n-1))
    const targetSec = scheduled ? Math.max(0, quotaSec - balanceBefore) : 0;

    // covered = q - T: la parte de la cuota que paga el excedente anterior.
    const coveredSec = scheduled ? quotaSec - targetSec : 0;

    // S(n) = S(n-1) + W(n) - q(n). Sin cuota, todo el trabajo suma a favor.
    balance = balanceBefore + workedSec - quotaSec;

    ledger.push({
      date,
      scheduled,
      paused: false,
      quota_sec: quotaSec,
      balance_before_sec: balanceBefore,
      target_sec: targetSec,
      worked_sec: workedSec,
      covered_sec: coveredSec,
      balance_after_sec: balance,
      status: getClosedDayStatus({
        scheduled,
        target: targetSec,
        worked: workedSec,
      }),
      session_count: work.session_count,
    });
  }

  return { ledger, balance_sec: balance };
}

/**
 * Datos del día de hoy: cuota, objetivo, trabajo, progreso y estado.
 * "today" está abierto: no forma parte del ledger, pero su trabajo sí se refleja
 * en balance_after_sec (saldo que tendría el día si se cerrara ahora).
 */
export function getTodayTarget({ activity, scheduleVersions, sessions, today }) {
  assertValidDate(today);

  const { balance_sec: balanceBefore } = closeDays({
    activity,
    scheduleVersions,
    sessions,
    today,
  });

  const paused = isPausedOn(activity, today);
  const notStarted = today < activity.start_date;
  const quota = getActivityQuotaForDate(activity, scheduleVersions, today);
  const scheduled = quota !== null;
  const quotaSec = quota ?? 0;

  // Si la actividad está pausada o aún no empezó, las sesiones de hoy no cuentan.
  const work =
    paused || notStarted
      ? { worked_sec: 0, session_count: 0 }
      : getWorkByDate(sessions, activity.id).get(today) ?? {
          worked_sec: 0,
          session_count: 0,
        };

  const workedSec = work.worked_sec;
  const targetSec = scheduled ? Math.max(0, quotaSec - balanceBefore) : 0;
  const coveredSec = scheduled ? quotaSec - targetSec : 0;
  const remainingSec = Math.max(0, targetSec - workedSec);

  let status;
  if (paused) {
    status = 'paused';
  } else if (!scheduled) {
    status = 'not_scheduled';
  } else if (targetSec === 0) {
    status = 'covered';
  } else if (workedSec >= targetSec) {
    status = 'completed';
  } else if (workedSec > 0) {
    status = 'in_progress';
  } else {
    status = 'pending';
  }

  // Progreso entre 0 y 1. Si no hay objetivo porque el día está cubierto, es 1.
  const progress =
    targetSec > 0
      ? Math.min(1, workedSec / targetSec)
      : status === 'covered'
        ? 1
        : 0;

  // Saldo que tendría el día si se cerrara ahora.
  const balanceAfterSec = scheduled
    ? balanceBefore + workedSec - quotaSec
    : balanceBefore + workedSec;

  return {
    date: today,
    scheduled,
    paused,
    quota_sec: quotaSec,
    balance_before_sec: balanceBefore,
    target_sec: targetSec,
    covered_sec: coveredSec,
    worked_sec: workedSec,
    remaining_sec: remainingSec,
    progress,
    balance_after_sec: balanceAfterSec,
    status,
    session_count: work.session_count,
  };
}
