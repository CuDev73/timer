// Orquestación: carga datos de MySQL, los adapta al núcleo puro y arma la respuesta.

import {
  addDays,
  closeDays,
  computeStats,
  computeStreaks,
  getTodayTarget,
  getWeekday,
  isPausedOn,
  projectCoveredQuotas,
} from '../core/index.js';
import { badRequest } from './errors.js';
import * as repository from './repository.js';
import {
  initialBalanceToSeconds,
  minutesToSeconds,
  parseDate,
  parseInteger,
  parseName,
  parseScheduleDays,
  parseSessionMinutes,
  parseSessionState,
} from './validation.js';

const SIX_HOURS_SEC = 6 * 60 * 60;
const MAX_SESSION_SEC = 7 * 24 * 60 * 60;
const MAX_BALANCE_MIN = 60 * 24 * 366;

/** Fecha local del servidor en formato YYYY-MM-DD. */
export function localToday() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

/** Usa la fecha enviada por el cliente o, si falta, la fecha local del servidor. */
export function resolveToday(value) {
  if (value === undefined || value === null || value === '') {
    return localToday();
  }

  return parseDate(value, 'today');
}

/** Lunes de la semana de una fecha. */
function startOfWeek(date) {
  return addDays(date, -getWeekday(date));
}

/** Agrega los periodos de pausa al objeto de actividad que consume el núcleo. */
function toCoreActivity(activity, pausePeriods) {
  return {
    ...activity,
    pause_periods: pausePeriods,
  };
}

/** Arma todos los datos de una actividad para la interfaz. */
async function buildActivity(activity, today) {
  const [scheduleVersions, pausePeriods, sessions] = await Promise.all([
    repository.listScheduleVersions(activity.id),
    repository.listPausePeriods(activity.id),
    repository.listSessions(activity.id),
  ]);

  const coreActivity = toCoreActivity(activity, pausePeriods);

  const { ledger, balance_sec } = closeDays({
    activity: coreActivity,
    scheduleVersions,
    sessions,
    today,
  });

  const todayInfo = getTodayTarget({
    activity: coreActivity,
    scheduleVersions,
    sessions,
    today,
  });

  const projection = projectCoveredQuotas({
    activity: coreActivity,
    scheduleVersions,
    sessions,
    today,
  });

  const weekStart = startOfWeek(today);
  const streak = computeStreaks(ledger);

  // Hoy todavía está abierto, pero si ya está cumplido suma a la racha actual.
  if (
    todayInfo.scheduled &&
    !todayInfo.paused &&
    (todayInfo.status === 'completed' || todayInfo.status === 'covered')
  ) {
    streak.current += 1;
    streak.best = Math.max(streak.best, streak.current);
  }

  return {
    ...activity,
    pause_periods: pausePeriods,
    // Saldo al empezar hoy (sin el trabajo de hoy).
    balance_sec,
    // Saldo real si hoy se cerrara ahora: incluye lo trabajado hoy.
    current_balance_sec: todayInfo.balance_after_sec,
    today: todayInfo,
    projection,
    schedule_versions: scheduleVersions,
    stats: {
      week: computeStats(ledger, { from: weekStart, to: today }),
      all: computeStats(ledger),
      streak,
    },
    ledger,
    // Lista completa para exportar y reutilizar; la vista solo pinta las recientes.
    sessions,
    recent_sessions: sessions.slice(0, 20),
    pending_review: sessions.filter((session) => session.state === 'needs_review'),
  };
}

/** Devuelve el panel completo de todas las actividades. */
export async function getDashboard(today) {
  const activities = await repository.listActivities();

  return {
    today,
    activities: await Promise.all(
      activities.map((activity) => buildActivity(activity, today)),
    ),
  };
}

/** Crea una actividad con su calendario inicial. */
export async function createActivity(input) {
  if (input === null || typeof input !== 'object') {
    throw badRequest('Los datos de la actividad no son válidos.');
  }

  const name = parseName(input.name);
  const start_date = parseDate(input.start_date, 'Fecha de inicio');
  const initial_balance_sec = initialBalanceToSeconds(input.initial_balance_min);
  const days = parseScheduleDays(input.days ?? {});

  const id = await repository.createActivity({
    name,
    start_date,
    initial_balance_sec,
    days,
  });

  return { id };
}

/** Cambia el nombre y la fecha de inicio de una actividad. */
export async function updateActivity(activityId, input) {
  if (input === null || typeof input !== 'object') {
    throw badRequest('Los datos de la actividad no son válidos.');
  }

  const activity = await repository.getActivity(activityId);

  if (activity.status === 'archived') {
    throw badRequest('Reactiva la actividad antes de editarla.');
  }

  const name = parseName(input.name);
  const start_date = parseDate(input.start_date, 'Fecha de inicio');

  await repository.updateActivity(activityId, { name, start_date });

  return { id: activityId, name, start_date };
}

/**
 * Ajusta el saldo actual de una actividad.
 *
 * El saldo se deriva del historial, así que el ajuste se aplica al saldo
 * inicial. Así el saldo actual cambia exactamente en la diferencia pedida
 * sin añadir tablas ni fórmulas nuevas.
 */
export async function adjustBalance(activityId, input, today) {
  if (input === null || typeof input !== 'object') {
    throw badRequest('El ajuste de saldo no es válido.');
  }

  const activity = await repository.getActivity(activityId);

  if (activity.status === 'archived') {
    throw badRequest('Reactiva la actividad antes de ajustar su saldo.');
  }

  const targetSec = minutesToSeconds(input.balance_min, 'Saldo actual', {
    min: -MAX_BALANCE_MIN,
    max: MAX_BALANCE_MIN,
  });

  const [scheduleVersions, pausePeriods, sessions] = await Promise.all([
    repository.listScheduleVersions(activityId),
    repository.listPausePeriods(activityId),
    repository.listSessions(activityId),
  ]);

  const coreActivity = toCoreActivity(activity, pausePeriods);
  const todayInfo = getTodayTarget({
    activity: coreActivity,
    scheduleVersions,
    sessions,
    today,
  });

  const initialBalanceSec =
    activity.initial_balance_sec + (targetSec - todayInfo.balance_after_sec);

  await repository.updateInitialBalance(activityId, initialBalanceSec);

  return {
    id: activityId,
    initial_balance_sec: initialBalanceSec,
    current_balance_sec: targetSec,
  };
}

/** Añade o reemplaza una versión del calendario sin tocar días cerrados. */
export async function addScheduleVersion(activityId, input, today) {
  if (input === null || typeof input !== 'object') {
    throw badRequest('Los datos del calendario no son válidos.');
  }

  const activity = await repository.getActivity(activityId);
  const effective_from = parseDate(input.effective_from, 'Vigente desde');

  // La nueva versión no puede empezar antes de hoy ni antes del inicio.
  const minimumDate = activity.start_date > today ? activity.start_date : today;

  if (effective_from < minimumDate) {
    throw badRequest(
      `La nueva versión no puede ser anterior a ${minimumDate}; los días cerrados no se modifican.`,
    );
  }

  const days = parseScheduleDays(input.days ?? {});
  const versionId = await repository.saveScheduleVersion(
    activityId,
    effective_from,
    days,
  );

  return { id: versionId, effective_from };
}

/** Pausa la actividad desde hoy. */
export async function pauseActivity(activityId, today) {
  const activity = await repository.getActivity(activityId);

  if (activity.status === 'archived') {
    throw badRequest('La actividad está archivada; reactívala primero.');
  }

  await repository.pauseActivity(activityId, today);

  return { status: 'paused', paused_from: today };
}

/** Reanuda la actividad desde hoy. */
export async function resumeActivity(activityId, today) {
  const activity = await repository.getActivity(activityId);

  if (activity.status === 'archived') {
    throw badRequest('La actividad está archivada; reactívala primero.');
  }

  await repository.resumeActivity(activityId, today);

  return { status: 'active', paused_from: null };
}

/** Archiva una actividad sin borrar su historial. */
export async function archiveActivity(activityId, today) {
  const activity = await repository.getActivity(activityId);

  if (activity.status === 'archived') {
    return { status: 'archived', archived_from: activity.paused_from };
  }

  await repository.archiveActivity(activityId, today);

  return { status: 'archived', archived_from: today };
}

/** Reactiva una actividad archivada. */
export async function unarchiveActivity(activityId, today) {
  const activity = await repository.getActivity(activityId);

  if (activity.status !== 'archived') {
    return { status: activity.status, archived_from: null };
  }

  await repository.unarchiveActivity(activityId, today);

  return { status: 'active', archived_from: null };
}

/** Resuelve la duración de una sesión: acepta segundos exactos o minutos. */
function resolveSessionDuration(input) {
  if (input.duration_sec !== undefined) {
    return parseInteger(input.duration_sec, 'Duración', {
      min: 1,
      max: MAX_SESSION_SEC,
    });
  }

  return parseSessionMinutes(input.minutes) * 60;
}

/** Registra una sesión terminada o pendiente de revisión. */
export async function addSession(activityId, input, today) {
  if (input === null || typeof input !== 'object') {
    throw badRequest('Los datos de la sesión no son válidos.');
  }

  const activity = await repository.getActivity(activityId);
  const local_date = parseDate(input.local_date, 'Fecha de la sesión');

  if (local_date > today) {
    throw badRequest('No se pueden registrar sesiones en el futuro.');
  }

  if (local_date < activity.start_date) {
    throw badRequest('La sesión no puede ser anterior al inicio de la actividad.');
  }

  const pausePeriods = await repository.listPausePeriods(activityId);
  const coreActivity = toCoreActivity(activity, pausePeriods);

  if (isPausedOn(coreActivity, local_date)) {
    throw badRequest('No se pueden registrar sesiones en un día pausado.');
  }

  const duration_sec = resolveSessionDuration(input);

  // Regla del MVP: más de 6 horas queda pendiente de revisión.
  const requestedState = parseSessionState(input.state);
  const state =
    duration_sec > SIX_HOURS_SEC ? 'needs_review' : requestedState;

  const id = await repository.createSession({
    activity_id: activityId,
    local_date,
    duration_sec,
    state,
  });

  return { id, state, duration_sec };
}

/** Valida que una fecha pueda recibir una sesión de una actividad. */
async function assertSessionDate(activity, local_date, today) {
  if (local_date > today) {
    throw badRequest('No se pueden registrar sesiones en el futuro.');
  }

  if (local_date < activity.start_date) {
    throw badRequest('La sesión no puede ser anterior al inicio de la actividad.');
  }

  const pausePeriods = await repository.listPausePeriods(activity.id);

  if (isPausedOn(toCoreActivity(activity, pausePeriods), local_date)) {
    throw badRequest('No se pueden registrar sesiones en un día pausado.');
  }
}

/** Edita la fecha, la duración y el estado de una sesión. */
export async function updateSession(id, input, today) {
  if (input === null || typeof input !== 'object') {
    throw badRequest('Los datos de la sesión no son válidos.');
  }

  const session = await repository.getSession(id);
  const activity = await repository.getActivity(session.activity_id);
  const local_date = parseDate(
    input.local_date ?? session.local_date,
    'Fecha de la sesión',
  );

  await assertSessionDate(activity, local_date, today);

  const minutes = input.minutes ?? Math.max(1, Math.round(session.duration_sec / 60));
  const duration_sec =
    input.duration_sec !== undefined
      ? resolveSessionDuration({ duration_sec: input.duration_sec })
      : resolveSessionDuration({ minutes });

  const requestedState = parseSessionState(input.state ?? session.state);
  const state =
    duration_sec > SIX_HOURS_SEC ? 'needs_review' : requestedState;

  await repository.updateSession(id, { local_date, duration_sec, state });

  return { id, local_date, duration_sec, state };
}

/** Divide una sesión en dos, moviendo la segunda parte a otra fecha. */
export async function splitSession(id, input, today) {
  if (input === null || typeof input !== 'object') {
    throw badRequest('Los datos de la división no son válidos.');
  }

  const session = await repository.getSession(id);
  const activity = await repository.getActivity(session.activity_id);
  const firstSec = parseSessionMinutes(input.first_minutes) * 60;

  if (firstSec >= session.duration_sec) {
    throw badRequest('La primera parte debe ser menor que la sesión original.');
  }

  const second_date = parseDate(
    input.second_date ?? session.local_date,
    'Fecha de la segunda parte',
  );

  await assertSessionDate(activity, second_date, today);

  const secondSec = session.duration_sec - firstSec;
  const stateFor = (seconds) =>
    seconds > SIX_HOURS_SEC ? 'needs_review' : 'finished';

  await repository.updateSession(id, {
    local_date: session.local_date,
    duration_sec: firstSec,
    state: stateFor(firstSec),
  });

  const secondId = await repository.createSession({
    activity_id: session.activity_id,
    local_date: second_date,
    duration_sec: secondSec,
    state: stateFor(secondSec),
  });

  return {
    id,
    second_id: secondId,
    first_sec: firstSec,
    second_sec: secondSec,
    second_date,
  };
}

/** Confirma una sesión pendiente de revisión. */
export async function confirmSession(id) {
  await repository.confirmSession(id);
  return { id, state: 'finished' };
}

/** Elimina una sesión y deja que el saldo se recalcule. */
export async function deleteSession(id) {
  await repository.deleteSession(id);
  return { id, deleted: true };
}

/** Elimina una actividad y todo su historial. */
export async function deleteActivity(id) {
  await repository.deleteActivity(id);
  return { id, deleted: true };
}
