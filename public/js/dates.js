// Utilidades de fecha para la interfaz.
// Se basan en strings YYYY-MM-DD y Date.UTC solo como aritmética de calendario.

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function toEpochDay(date) {
  const [year, month, day] = date.split('-').map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / MS_PER_DAY);
}

function fromEpochDay(epochDay) {
  const utc = new Date(epochDay * MS_PER_DAY);
  const year = utc.getUTCFullYear();
  const month = String(utc.getUTCMonth() + 1).padStart(2, '0');
  const day = String(utc.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Suma (o resta) días a una fecha YYYY-MM-DD. */
export function addDays(date, days) {
  return fromEpochDay(toEpochDay(date) + days);
}

/** Día de la semana con lunes = 0 y domingo = 6. */
export function getWeekday(date) {
  const utc = new Date(toEpochDay(date) * MS_PER_DAY);
  return (utc.getUTCDay() + 6) % 7;
}

/** Lista de fechas entre dos fechas, ambas incluidas. */
export function listDates(from, to) {
  const dates = [];
  const last = toEpochDay(to);

  for (let day = toEpochDay(from); day <= last; day += 1) {
    dates.push(fromEpochDay(day));
  }

  return dates;
}

/** Fecha corta para tooltips: "3 nov 2026". */
export function formatShortDate(date) {
  const [year, month, day] = date.split('-').map(Number);
  return new Intl.DateTimeFormat('es', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, day)));
}
