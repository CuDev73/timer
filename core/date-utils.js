// Utilidades de fecha basadas en strings 'YYYY-MM-DD'.
// No leen la hora del sistema: usan Date.UTC solo como aritmética de calendario.
// La zona horaria se resuelve fuera del núcleo.

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Valida una fecha 'YYYY-MM-DD' y la devuelve tal cual.
 * Lanza un error claro si el formato o la fecha no son válidos.
 */
export function assertValidDate(date) {
  if (typeof date !== 'string') {
    throw new Error(`Fecha inválida: se esperaba un string YYYY-MM-DD y llegó ${typeof date}`);
  }

  const match = DATE_PATTERN.exec(date);
  if (!match) {
    throw new Error(`Fecha inválida: "${date}". El formato debe ser YYYY-MM-DD.`);
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const utc = new Date(Date.UTC(year, month - 1, day));

  // Detecta fechas imposibles como 2026-02-30.
  if (
    utc.getUTCFullYear() !== year ||
    utc.getUTCMonth() !== month - 1 ||
    utc.getUTCDate() !== day
  ) {
    throw new Error(`Fecha inválida: "${date}" no existe en el calendario.`);
  }

  return date;
}

/** Convierte una fecha a número de días desde 1970-01-01 (útil para sumar días). */
function toEpochDay(date) {
  assertValidDate(date);
  const match = DATE_PATTERN.exec(date);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  return Math.floor(Date.UTC(year, month - 1, day) / MS_PER_DAY);
}

/** Convierte un número de días desde 1970-01-01 a 'YYYY-MM-DD'. */
function fromEpochDay(epochDay) {
  const utc = new Date(epochDay * MS_PER_DAY);
  const year = utc.getUTCFullYear();
  const month = String(utc.getUTCMonth() + 1).padStart(2, '0');
  const day = String(utc.getUTCDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

/** Suma (o resta, con números negativos) días a una fecha. */
export function addDays(date, days) {
  return fromEpochDay(toEpochDay(date) + days);
}

/** Compara dos fechas: -1 si a < b, 0 si son iguales, 1 si a > b. */
export function compareDates(a, b) {
  assertValidDate(a);
  assertValidDate(b);

  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/**
 * Devuelve el día de la semana con la semana empezando en lunes:
 * 0 = lunes, 1 = martes, ..., 6 = domingo.
 */
export function getWeekday(date) {
  const utc = new Date(toEpochDay(date) * MS_PER_DAY);
  // getUTCDay() usa 0 = domingo; lo desplazamos para que 0 = lunes.
  return (utc.getUTCDay() + 6) % 7;
}

/** Lista todas las fechas entre from y to, ambas incluidas. */
export function listDates(from, to) {
  assertValidDate(from);
  assertValidDate(to);

  const dates = [];
  const lastEpochDay = toEpochDay(to);

  for (let epochDay = toEpochDay(from); epochDay <= lastEpochDay; epochDay += 1) {
    dates.push(fromEpochDay(epochDay));
  }

  return dates;
}
