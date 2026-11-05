// Temporizadores por actividad, guardados en localStorage.
//
// Cada temporizador guarda:
// - running: si está corriendo ahora.
// - startedAt: marca de tiempo (ms) del último "Iniciar" o "Reanudar".
// - accumulatedSec: segundos acumulados antes de esa marca.
//
// El tiempo transcurrido se calcula con Date.now(), así que no se pierde
// al recargar la página ni al cambiar de vista.

const TIMERS_KEY = 'timer-app.timers.v1';

function loadTimers() {
  try {
    return JSON.parse(localStorage.getItem(TIMERS_KEY)) ?? {};
  } catch {
    return {};
  }
}

let timers = loadTimers();

function saveTimers() {
  try {
    localStorage.setItem(TIMERS_KEY, JSON.stringify(timers));
  } catch {
    // Si localStorage no está disponible, el temporizador funciona en memoria.
  }
}

/** Devuelve el temporizador de una actividad (sin crearlo si no existe). */
export function getTimer(activityId) {
  return timers[activityId] ?? {
    running: false,
    startedAt: null,
    accumulatedSec: 0,
  };
}

function setTimer(activityId, value) {
  timers[activityId] = value;
  saveTimers();
}

/** Segundos acumulados, incluido el tramo que está corriendo. */
export function elapsed(activityId) {
  const timer = getTimer(activityId);
  const runningPart =
    timer.running && timer.startedAt ? (Date.now() - timer.startedAt) / 1000 : 0;

  return timer.accumulatedSec + runningPart;
}

/** Arranca o reanuda sin perder lo acumulado. */
export function startTimer(activityId) {
  const timer = getTimer(activityId);
  if (timer.running) return;

  setTimer(activityId, {
    running: true,
    startedAt: Date.now(),
    accumulatedSec: timer.accumulatedSec,
  });
}

/** Detiene el reloj y guarda los segundos acumulados. */
export function pauseTimer(activityId) {
  const timer = getTimer(activityId);
  if (!timer.running) return;

  setTimer(activityId, {
    running: false,
    startedAt: null,
    accumulatedSec: elapsed(activityId),
  });
}

/** Indica si hay algún temporizador corriendo (para avisar al cerrar). */
export function hasRunningTimers() {
  return Object.values(timers).some((timer) => timer.running);
}

/** Vuelve a 00:00:00. */
export function resetTimer(activityId) {
  setTimer(activityId, {
    running: false,
    startedAt: null,
    accumulatedSec: 0,
  });
}
