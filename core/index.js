// API pública del núcleo de cálculo.
// Todas las funciones son puras: no leen la hora del sistema ni tocan una base de datos.

export {
  addDays,
  assertValidDate,
  compareDates,
  getWeekday,
  listDates,
} from './date-utils.js';

export {
  getActivityQuotaForDate,
  getQuotaForDate,
  getScheduleVersionForDate,
  isPausedOn,
} from './schedule.js';

export { closeDays, COUNTED_SESSION_STATE, getTodayTarget } from './ledger.js';

export { projectCoveredQuotas } from './projection.js';

export { computeStats, computeStreaks } from './stats.js';
