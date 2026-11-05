// Validación de los datos que llegan por la API.
// Los mensajes están en español para mostrarlos directamente en la interfaz.

import { assertValidDate } from '../core/index.js';
import { badRequest } from './errors.js';

const MAX_MINUTES = 60 * 24 * 366; // un año, de sobra para una cuota o saldo
const MAX_SESSION_MINUTES = 60 * 24 * 7; // una sesión de hasta 7 días

/** Valida y normaliza un texto obligatorio. */
export function parseName(value, field = 'Nombre') {
  if (typeof value !== 'string' || value.trim() === '') {
    throw badRequest(`${field} es obligatorio.`);
  }

  const name = value.trim();
  if (name.length > 120) {
    throw badRequest(`${field} no puede superar 120 caracteres.`);
  }

  return name;
}

/** Valida una fecha 'YYYY-MM-DD' usando las utilidades del núcleo. */
export function parseDate(value, field = 'Fecha') {
  try {
    return assertValidDate(value);
  } catch (error) {
    throw badRequest(`${field}: ${error.message}`);
  }
}

/** Valida un entero dentro de un rango. */
export function parseInteger(value, field, { min = 0, max = MAX_MINUTES } = {}) {
  const number = typeof value === 'number' ? value : Number(value);

  if (!Number.isInteger(number)) {
    throw badRequest(`${field} debe ser un número entero.`);
  }

  if (number < min || number > max) {
    throw badRequest(`${field} debe estar entre ${min} y ${max}.`);
  }

  return number;
}

/** Convierte minutos a segundos. */
export function minutesToSeconds(value, field, options = {}) {
  return parseInteger(value, field, options) * 60;
}

/** Convierte un saldo inicial en minutos (puede ser negativo) a segundos. */
export function initialBalanceToSeconds(value) {
  return minutesToSeconds(value ?? 0, 'Saldo inicial', {
    min: -MAX_MINUTES,
    max: MAX_MINUTES,
  });
}

/**
 * Convierte un objeto { weekday: minutos } en { weekday: segundos }.
 * Ignora los días con 0 minutos porque significan "no programado".
 */
export function parseScheduleDays(days, field = 'Calendario') {
  if (days === null || typeof days !== 'object' || Array.isArray(days)) {
    throw badRequest(`${field} debe ser un objeto { weekday: minutos }.`);
  }

  const result = {};

  for (const [key, value] of Object.entries(days)) {
    const weekday = parseInteger(key, `${field}: día de la semana`, { min: 0, max: 6 });
    const seconds = minutesToSeconds(value, `${field}: día ${weekday}`, {
      min: 0,
      max: 60 * 24,
    });

    if (seconds > 0) {
      result[weekday] = seconds;
    }
  }

  return result;
}

/** Valida el estado de una sesión enviada manualmente o por el temporizador. */
export function parseSessionState(value) {
  if (value === undefined || value === null) return 'finished';

  if (value !== 'finished' && value !== 'needs_review') {
    throw badRequest('El estado de la sesión debe ser "finished" o "needs_review".');
  }

  return value;
}

/** Valida una duración de sesión en minutos. */
export function parseSessionMinutes(value) {
  return parseInteger(value, 'Duración', { min: 1, max: MAX_SESSION_MINUTES });
}

/** Valida un id numérico de la URL. */
export function parseId(value, field = 'Id') {
  return parseInteger(value, field, { min: 1, max: Number.MAX_SAFE_INTEGER });
}
