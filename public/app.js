// Controlador principal de la interfaz.
//
// Responsabilidades:
// - Cargar el panel desde la API.
// - Elegir qué vista mostrar según el hash de la URL.
// - Delegar clics y envíos de formularios a las acciones correspondientes.
// - Mantener el reloj del temporizador actualizado sin redibujar la tarjeta.

import { api } from './js/api.js';
import { exportDashboardJson, exportSessionsCsv } from './js/export.js';
import { formatClock, formatDateLong, formatDuration } from './js/format.js';
import {
  elapsed,
  getTimer,
  hasRunningTimers,
  pauseTimer,
  resetTimer,
  startTimer,
} from './js/timers.js';
import { activitiesViewHtml } from './js/views/activities.js';
import { historyViewHtml } from './js/views/history.js';
import { timerViewHtml } from './js/views/timer.js';

const VIEWS = ['temporizador', 'actividades', 'historial'];

// Clave donde se guarda el tema elegido. El script de index.html la lee
// antes de pintar para que la página no parpadee al cargar.
const THEME_KEY = 'timer-app.theme.v1';

// Última actividad usada en el temporizador, para recuperarla al recargar.
const LAST_ACTIVITY_KEY = 'timer-app.last-activity.v1';

const state = {
  today: null,
  activities: [],
  view: 'temporizador',
  // Actividad elegida en cada vista (son selecciones independientes).
  selectedTimerId: loadLastActivityId(),
  selectedActivityId: null,
  selectedHistoryId: null,
  // "auto" muestra la actividad elegida; "new" muestra el formulario de alta.
  configMode: 'auto',
  // Muestra el formulario de nombre y fecha de la actividad seleccionada.
  metaMode: false,
  // Incluye las actividades archivadas en la lista de configuración.
  showArchived: false,
  // Sesión que se está editando o dividiendo en el historial.
  editingSessionId: null,
  sessionFormMode: 'edit',
};

const els = {
  todayLabel: document.querySelector('#today-label'),
  toast: document.querySelector('#toast'),
  toastMessage: document.querySelector('#toast-message'),
  toastAction: document.querySelector('#toast-action'),
  refresh: document.querySelector('#refresh-btn'),
  shortcutsBtn: document.querySelector('#shortcuts-btn'),
  shortcutsDialog: document.querySelector('#shortcuts-dialog'),
  shortcutsClose: document.querySelector('#shortcuts-close'),
  themeToggle: document.querySelector('#theme-toggle'),
  themeLabel: document.querySelector('#theme-label'),
  navLinks: [...document.querySelectorAll('.nav-link')],
  views: {
    temporizador: document.querySelector('#view-temporizador'),
    actividades: document.querySelector('#view-actividades'),
    historial: document.querySelector('#view-historial'),
  },
  roots: {
    temporizador: document.querySelector('#timer-root'),
    actividades: document.querySelector('#activities-root'),
    historial: document.querySelector('#history-root'),
  },
};

/** Lee la última actividad usada, si el navegador la guardó. */
function loadLastActivityId() {
  try {
    const value = Number(localStorage.getItem(LAST_ACTIVITY_KEY));
    return Number.isInteger(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

/** Recuerda la actividad elegida para la próxima visita. */
function rememberActivity(activityId) {
  try {
    localStorage.setItem(LAST_ACTIVITY_KEY, String(activityId));
  } catch {
    // Sin localStorage solo se pierde la preferencia.
  }
}

// --- Tema ----------------------------------------------------------------

/** Tema activo según el atributo del documento. */
function currentTheme() {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

/** Aplica el tema, actualiza el botón y lo guarda para la próxima visita. */
function applyTheme(theme) {
  const next = theme === 'light' ? 'light' : 'dark';
  const isDark = next === 'dark';

  document.documentElement.dataset.theme = next;
  els.themeLabel.textContent = isDark ? 'Oscuro' : 'Claro';

  const description = isDark
    ? 'Tema morado oscuro. Cambiar a morado claro'
    : 'Tema morado claro. Cambiar a morado oscuro';
  els.themeToggle.title = description;
  els.themeToggle.setAttribute('aria-label', description);
  els.themeToggle.setAttribute('aria-pressed', String(isDark));

  try {
    localStorage.setItem(THEME_KEY, next);
  } catch {
    // Sin localStorage el tema funciona igual, solo no se recuerda.
  }
}

// --- Avisos --------------------------------------------------------------

let toastTimeout;

function hideToast() {
  els.toast.hidden = true;
  els.toastAction.hidden = true;
  els.toastAction.onclick = null;
}

/**
 * Muestra un aviso. Si se pasa `action`, el aviso incluye un botón para
 * deshacer o completar la operación mientras siga visible.
 */
function showToast(message, kind = 'info', options = {}) {
  els.toastMessage.textContent = message;
  els.toast.className = `toast ${kind}`;
  els.toast.hidden = false;

  clearTimeout(toastTimeout);

  if (typeof options.action === 'function') {
    els.toastAction.hidden = false;
    els.toastAction.textContent = options.actionLabel ?? 'Deshacer';
    els.toastAction.onclick = async () => {
      hideToast();

      try {
        await options.action();
      } catch (error) {
        showToast(error.message, 'error');
      }
    };

    // Los avisos con acción duran más para que dé tiempo a pulsarla.
    toastTimeout = setTimeout(hideToast, options.duration ?? 9000);
  } else {
    els.toastAction.hidden = true;
    els.toastAction.onclick = null;
    toastTimeout = setTimeout(hideToast, options.duration ?? 4500);
  }
}

// --- Selecciones ---------------------------------------------------------

/** Actividades que pueden usarse hoy en el temporizador. */
function todayActivities() {
  return state.activities.filter(
    (activity) =>
      activity.status === 'active' && activity.today.scheduled && !activity.today.paused,
  );
}

/** Devuelve la actividad seleccionada o la primera de la lista. */
function pickSelected(activities, selectedId) {
  const found = activities.find((activity) => activity.id === selectedId);
  return found ? found.id : (activities[0]?.id ?? null);
}

/** Busca una sesión y su actividad en los datos ya cargados. */
function findSession(sessionId) {
  for (const activity of state.activities) {
    const sessions = activity.sessions ?? activity.recent_sessions ?? [];
    const session = sessions.find((item) => item.id === sessionId);
    if (session) return { activity, session };
  }

  return null;
}

// --- Render --------------------------------------------------------------

function render() {
  if (state.today) {
    const date = formatDateLong(state.today);
    els.todayLabel.textContent = date.charAt(0).toUpperCase() + date.slice(1);
  } else {
    els.todayLabel.textContent = 'Cargando…';
  }

  // Resalta el icono activo y oculta las otras dos vistas.
  for (const link of els.navLinks) {
    const active = link.dataset.view === state.view;
    link.classList.toggle('active', active);

    if (active) {
      link.setAttribute('aria-current', 'page');
    } else {
      link.removeAttribute('aria-current');
    }
  }

  for (const [name, section] of Object.entries(els.views)) {
    section.hidden = name !== state.view;
  }

  if (!state.today) return;

  if (state.view === 'temporizador') renderTimer();
  if (state.view === 'actividades') renderActivities();
  if (state.view === 'historial') renderHistory();

  updateDocumentTitle();
}

function renderTimer() {
  const activities = todayActivities();
  state.selectedTimerId = pickSelected(activities, state.selectedTimerId);

  if (state.selectedTimerId !== null) rememberActivity(state.selectedTimerId);

  els.roots.temporizador.innerHTML = timerViewHtml({
    activities,
    selectedId: state.selectedTimerId,
  });

  updateTimerUI();
}

function renderActivities() {
  // Las archivadas solo aparecen al pedirlo; así la lista diaria queda corta.
  const visible = state.showArchived
    ? state.activities
    : state.activities.filter((activity) => activity.status !== 'archived');

  state.selectedActivityId = pickSelected(visible, state.selectedActivityId);

  const mode =
    state.configMode === 'new' || visible.length === 0 ? 'new' : 'edit';

  els.roots.actividades.innerHTML = activitiesViewHtml({
    activities: visible,
    selectedId: state.selectedActivityId,
    mode,
    today: state.today,
    showArchived: state.showArchived,
    archivedCount: state.activities.filter((activity) => activity.status === 'archived')
      .length,
    metaMode: state.metaMode,
  });
}

function renderHistory() {
  state.selectedHistoryId = pickSelected(state.activities, state.selectedHistoryId);

  els.roots.historial.innerHTML = historyViewHtml({
    activities: state.activities,
    selectedId: state.selectedHistoryId,
    today: state.today,
    editingSessionId: state.editingSessionId,
    sessionFormMode: state.sessionFormMode,
  });
}

/** Actividad que tiene un temporizador en marcha, si hay alguna. */
function runningActivity() {
  let found = null;

  for (const activity of state.activities) {
    if (!getTimer(activity.id).running) continue;

    if (found === null || elapsed(activity.id) > elapsed(found.id)) {
      found = activity;
    }
  }

  return found;
}

/** El título de la pestaña muestra el tiempo en marcha cuando lo hay. */
function updateDocumentTitle() {
  const activity = runningActivity();

  if (activity) {
    document.title = `${formatClock(elapsed(activity.id))} · ${activity.name}`;
  } else {
    document.title = 'Cuotas de tiempo';
  }
}

/**
 * Actualiza el reloj, el texto de lo que falta y la visibilidad de los
 * botones del temporizador. Se llama cada segundo y después de cada acción.
 */
function updateTimerUI() {
  updateDocumentTitle();

  const display = els.roots.temporizador.querySelector('[data-timer-display]');
  if (!display) return;

  const activityId = Number(display.dataset.timerDisplay);
  const seconds = elapsed(activityId);
  display.textContent = formatClock(seconds);

  const activity = state.activities.find((item) => item.id === activityId);
  const remaining = els.roots.temporizador.querySelector('[data-timer-remaining]');

  if (activity && remaining) {
    const overQuota =
      activity.today.scheduled &&
      !activity.today.paused &&
      seconds > activity.today.remaining_sec;

    if (overQuota) {
      remaining.textContent = `Has superado la cuota de hoy por ${formatDuration(
        seconds - activity.today.remaining_sec,
      )}; el extra suma al saldo.`;
    } else if (activity.today.paused) {
      remaining.textContent = 'Actividad pausada';
    } else if (!activity.today.scheduled) {
      remaining.textContent = 'Día libre';
    } else if (activity.today.target_sec === 0) {
      remaining.textContent = 'Cuota cubierta';
    } else {
      const left = Math.max(0, activity.today.remaining_sec - seconds);
      remaining.textContent =
        left > 0 ? `Faltan ${formatDuration(left)}` : 'Objetivo cumplido';
    }

    remaining.classList.toggle('over-quota', overQuota);
  }

  const controls = els.roots.temporizador.querySelector(`[data-timer="${activityId}"]`);
  if (!controls) return;

  const timer = getTimer(activityId);
  const start = controls.querySelector('[data-action="timer-start"]');
  const pause = controls.querySelector('[data-action="timer-pause"]');
  const save = controls.querySelector('[data-action="timer-save"]');
  const reset = controls.querySelector('[data-action="timer-reset"]');

  if (start) {
    start.hidden = timer.running;
    start.textContent = seconds >= 1 ? 'Reanudar' : 'Iniciar';
  }

  if (pause) pause.hidden = !timer.running;
  if (save) save.hidden = seconds < 1;
  if (reset) reset.hidden = timer.running || seconds < 1;
}

// --- Carga de datos ------------------------------------------------------

async function loadDashboard() {
  try {
    const data = await api('/api/dashboard');
    state.today = data.today;
    state.activities = data.activities;
    render();
  } catch (error) {
    showToast(`No se pudo cargar el panel: ${error.message}`, 'error');
  }
}

/** Ejecuta una acción de la API, avisa del resultado y recarga el panel. */
async function withAction(action, successMessage) {
  try {
    const result = await action();
    if (successMessage) showToast(successMessage, 'success');
    await loadDashboard();
    return result;
  } catch (error) {
    showToast(error.message, 'error');
    return null;
  }
}

function collectWeek(form) {
  const days = {};

  for (let weekday = 0; weekday < 7; weekday += 1) {
    days[weekday] = Number(form.elements[`day-${weekday}`]?.value || 0);
  }

  return days;
}

// --- Acciones de actividades --------------------------------------------

async function createActivity(form) {
  const body = {
    name: form.elements.name.value,
    start_date: form.elements.start_date.value,
    // Las actividades nuevas siempre empiezan en 0: el saldo se gana con sesiones.
    initial_balance_min: 0,
    days: collectWeek(form),
  };

  try {
    const result = await api('/api/activities', {
      method: 'POST',
      body: JSON.stringify(body),
    });

    // Al crear, seleccionamos la nueva actividad y volvemos a su configuración.
    state.configMode = 'auto';
    state.metaMode = false;
    state.selectedActivityId = result.id;
    showToast('Actividad creada.', 'success');
    await loadDashboard();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

/** Guarda el nombre y la fecha de inicio desde el formulario de edición. */
async function updateActivityMeta(activityId, form) {
  const body = {
    name: form.elements.name.value,
    start_date: form.elements.start_date.value,
  };

  try {
    await api(`/api/activities/${activityId}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });

    state.metaMode = false;
    showToast('Datos de la actividad actualizados.', 'success');
    await loadDashboard();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

/** Ajusta el saldo actual recalculando el saldo inicial. */
async function adjustBalance(activityId, form) {
  const body = {
    balance_min: Number(form.elements.balance_min.value),
    today: state.today,
  };

  try {
    await api(`/api/activities/${activityId}/balance`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });

    showToast('Saldo ajustado.', 'success');
    await loadDashboard();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

function pauseActivity(activityId) {
  if (
    !window.confirm(
      '¿Pausar desde hoy? El trabajo registrado hoy dejará de contar mientras la actividad esté pausada.',
    )
  ) {
    return;
  }

  withAction(
    () =>
      api(`/api/activities/${activityId}/pause`, {
        method: 'POST',
        body: JSON.stringify({ today: state.today }),
      }),
    'Actividad pausada desde hoy.',
  );
}

function resumeActivity(activityId) {
  withAction(
    () =>
      api(`/api/activities/${activityId}/resume`, {
        method: 'POST',
        body: JSON.stringify({ today: state.today }),
      }),
    'Actividad reanudada desde hoy.',
  );
}

function archiveActivity(activityId) {
  if (
    !window.confirm(
      '¿Archivar esta actividad? Dejará de generar cuotas y se ocultará, pero conservará todo el historial.',
    )
  ) {
    return;
  }

  withAction(
    () =>
      api(`/api/activities/${activityId}/archive`, {
        method: 'POST',
        body: JSON.stringify({ today: state.today }),
      }),
    'Actividad archivada. Puedes verla con «Mostrar archivadas».',
  );
}

function unarchiveActivity(activityId) {
  withAction(
    () =>
      api(`/api/activities/${activityId}/unarchive`, {
        method: 'POST',
        body: JSON.stringify({ today: state.today }),
      }),
    'Actividad reactivada.',
  );
}

function deleteActivity(activityId) {
  if (!window.confirm('¿Eliminar la actividad y todo su historial? No se puede deshacer.')) {
    return;
  }

  withAction(
    () => api(`/api/activities/${activityId}`, { method: 'DELETE' }),
    'Actividad eliminada.',
  );
}

// --- Acciones del temporizador ------------------------------------------

async function saveSession(activityId) {
  const seconds = Math.floor(elapsed(activityId));

  if (seconds < 1) {
    showToast('El temporizador todavía está en cero.', 'warn');
    return;
  }

  const activity = state.activities.find((item) => item.id === activityId);
  const remaining = activity?.today?.remaining_sec ?? 0;
  const overQuota =
    activity?.today?.scheduled &&
    !activity.today.paused &&
    seconds > remaining;

  try {
    const result = await api(`/api/activities/${activityId}/sessions`, {
      method: 'POST',
      body: JSON.stringify({
        duration_sec: seconds,
        local_date: state.today,
        today: state.today,
      }),
    });

    resetTimer(activityId);

    if (result.state === 'needs_review') {
      showToast(
        `Sesión de ${formatDuration(seconds)} guardada, pero supera 6 h y queda pendiente de revisión.`,
        'warn',
      );
    } else if (overQuota) {
      showToast(
        `Sesión guardada. Superaste la cuota de hoy por ${formatDuration(
          seconds - remaining,
        )}; el extra suma al saldo.`,
        'warn',
      );
    } else {
      showToast('Sesión guardada.', 'success');
    }

    await loadDashboard();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

/** Borra una sesión y ofrece deshacerla volviendo a crearla igual. */
async function deleteSession(sessionId) {
  const found = findSession(sessionId);

  if (!found) {
    showToast('No se encontró la sesión.', 'error');
    return;
  }

  if (!window.confirm('¿Borrar esta sesión? El saldo se recalculará.')) return;

  const { activity, session } = found;

  try {
    await api(`/api/sessions/${sessionId}`, { method: 'DELETE' });
    await loadDashboard();

    showToast('Sesión eliminada.', 'success', {
      actionLabel: 'Deshacer',
      action: async () => {
        await api(`/api/activities/${activity.id}/sessions`, {
          method: 'POST',
          body: JSON.stringify({
            local_date: session.local_date,
            duration_sec: session.duration_sec,
            state: session.state,
            today: state.today,
          }),
        });

        await loadDashboard();
        showToast('Sesión restaurada.', 'success');
      },
    });
  } catch (error) {
    showToast(error.message, 'error');
  }
}

// --- Eventos: navegación -------------------------------------------------

function handleRouteChange() {
  const hash = window.location.hash.replace('#', '');
  state.view = VIEWS.includes(hash) ? hash : 'temporizador';

  // Normalizamos la URL: sin hash o con un hash desconocido usamos el temporizador.
  if (!VIEWS.includes(hash)) {
    window.history.replaceState(null, '', '#temporizador');
  }

  render();
  window.scrollTo({ top: 0 });
}

window.addEventListener('hashchange', handleRouteChange);

// --- Eventos: vista Temporizador ----------------------------------------

els.roots.temporizador.addEventListener('change', (event) => {
  if (event.target.id !== 'timer-activity-select') return;

  state.selectedTimerId = Number(event.target.value);
  rememberActivity(state.selectedTimerId);
  renderTimer();
});

els.roots.temporizador.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-action]');
  if (!button) return;

  const action = button.dataset.action;
  const controls = button.closest('[data-timer]');
  if (!controls) return;

  const activityId = Number(controls.dataset.timer);

  if (action === 'timer-start') {
    startTimer(activityId);
    updateTimerUI();
    return;
  }

  if (action === 'timer-pause') {
    pauseTimer(activityId);
    updateTimerUI();
    return;
  }

  if (action === 'timer-reset') {
    if (!window.confirm('¿Reiniciar el temporizador a 00:00:00?')) return;
    resetTimer(activityId);
    updateTimerUI();
    return;
  }

  if (action === 'timer-save') {
    saveSession(activityId);
  }
});

// --- Eventos: vista Actividades -----------------------------------------

els.roots.actividades.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-action]');
  if (!button) return;

  const action = button.dataset.action;

  if (action === 'select-activity') {
    state.selectedActivityId = Number(button.dataset.activityId);
    state.configMode = 'auto';
    state.metaMode = false;
    renderActivities();
    return;
  }

  if (action === 'new-activity') {
    state.configMode = 'new';
    state.metaMode = false;
    renderActivities();
    return;
  }

  if (action === 'cancel-new') {
    state.configMode = 'auto';
    renderActivities();
    return;
  }

  if (action === 'toggle-archived') {
    state.showArchived = !state.showArchived;
    state.metaMode = false;
    renderActivities();
    return;
  }

  // Las acciones de configuración viven dentro del panel de la actividad.
  const panel = button.closest('[data-activity-id]');
  const activityId = Number(panel?.dataset.activityId ?? state.selectedActivityId);
  if (!activityId) return;

  if (action === 'edit-meta') {
    state.metaMode = true;
    renderActivities();
    return;
  }

  if (action === 'cancel-meta') {
    state.metaMode = false;
    renderActivities();
    return;
  }

  if (action === 'pause') pauseActivity(activityId);
  if (action === 'resume') resumeActivity(activityId);
  if (action === 'archive') archiveActivity(activityId);
  if (action === 'unarchive') unarchiveActivity(activityId);
  if (action === 'delete-activity') deleteActivity(activityId);
});

els.roots.actividades.addEventListener('submit', (event) => {
  const form = event.target.closest('form[data-action]');
  if (!form) return;

  event.preventDefault();
  const action = form.dataset.action;

  if (action === 'create-activity') {
    createActivity(form);
    return;
  }

  const panel = form.closest('[data-activity-id]');
  const activityId = Number(panel?.dataset.activityId ?? state.selectedActivityId);
  if (!activityId) return;

  if (action === 'update-activity') {
    updateActivityMeta(activityId, form);
    return;
  }

  if (action === 'adjust-balance') {
    adjustBalance(activityId, form);
    return;
  }

  if (action === 'schedule') {
    const body = {
      effective_from: form.elements.effective_from.value,
      days: collectWeek(form),
      today: state.today,
    };

    withAction(
      () =>
        api(`/api/activities/${activityId}/schedule`, {
          method: 'PUT',
          body: JSON.stringify(body),
        }),
      'Calendario actualizado.',
    );
  }
});

// --- Eventos: vista Historial -------------------------------------------

els.roots.historial.addEventListener('change', (event) => {
  if (event.target.id !== 'history-activity-select') return;

  state.selectedHistoryId = Number(event.target.value);
  state.editingSessionId = null;
  renderHistory();
});

els.roots.historial.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-action]');
  if (!button) return;

  const action = button.dataset.action;
  const sessionId = Number(button.dataset.sessionId);

  if (action === 'export-csv') {
    exportSessionsCsv(state.activities, state.today);
    showToast('CSV de sesiones descargado.', 'success');
    return;
  }

  if (action === 'export-json') {
    exportDashboardJson(state.activities, state.today);
    showToast('Copia JSON descargada.', 'success');
    return;
  }

  if (action === 'confirm-session') {
    withAction(
      () => api(`/api/sessions/${sessionId}/confirm`, { method: 'POST' }),
      'Sesión confirmada; el saldo se recalculó.',
    );
    return;
  }

  if (action === 'delete-session') {
    deleteSession(sessionId);
    return;
  }

  if (action === 'edit-session') {
    state.editingSessionId = sessionId;
    state.sessionFormMode = 'edit';
    renderHistory();
    return;
  }

  if (action === 'split-session') {
    state.editingSessionId = sessionId;
    state.sessionFormMode = 'split';
    renderHistory();
    return;
  }

  if (action === 'cancel-session-edit') {
    state.editingSessionId = null;
    renderHistory();
  }
});

els.roots.historial.addEventListener('submit', (event) => {
  const form = event.target.closest('form[data-action]');
  if (!form) return;

  event.preventDefault();
  const action = form.dataset.action;
  const activityId = Number(form.dataset.activityId);

  if (action === 'manual-session') {
    if (!activityId) return;

    const body = {
      local_date: form.elements.local_date.value,
      minutes: Number(form.elements.minutes.value),
      today: state.today,
    };

    withAction(async () => {
      const result = await api(`/api/activities/${activityId}/sessions`, {
        method: 'POST',
        body: JSON.stringify(body),
      });

      if (result.state === 'needs_review') {
        showToast(
          'La sesión supera 6 h y queda pendiente de revisión; confírmala en la lista.',
          'warn',
        );
      } else {
        showToast('Sesión añadida.', 'success');
      }
    });
    return;
  }

  const sessionId = Number(form.dataset.sessionId);
  if (!sessionId) return;

  if (action === 'update-session') {
    const body = {
      local_date: form.elements.local_date.value,
      minutes: Number(form.elements.minutes.value),
      state: form.elements.state.value,
      today: state.today,
    };

    withAction(async () => {
      await api(`/api/sessions/${sessionId}`, {
        method: 'PUT',
        body: JSON.stringify(body),
      });
      state.editingSessionId = null;
      showToast('Sesión actualizada; el saldo se recalculó.', 'success');
    });
    return;
  }

  if (action === 'split-session') {
    const body = {
      first_minutes: Number(form.elements.first_minutes.value),
      second_date: form.elements.second_date.value,
      today: state.today,
    };

    withAction(async () => {
      await api(`/api/sessions/${sessionId}/split`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      state.editingSessionId = null;
      showToast('Sesión dividida en dos.', 'success');
    });
  }
});

// --- Atajos de teclado ---------------------------------------------------

function openShortcuts() {
  if (typeof els.shortcutsDialog.showModal === 'function') {
    els.shortcutsDialog.showModal();
  } else {
    els.shortcutsDialog.setAttribute('open', '');
  }
}

function closeShortcuts() {
  if (typeof els.shortcutsDialog.close === 'function') {
    els.shortcutsDialog.close();
  } else {
    els.shortcutsDialog.removeAttribute('open');
  }
}

function goToView(view) {
  if (!VIEWS.includes(view)) return;

  if (state.view === view) {
    render();
  } else {
    window.location.hash = view;
  }
}

function openNewActivity() {
  state.configMode = 'new';
  state.metaMode = false;

  if (state.view === 'actividades') {
    renderActivities();
  } else {
    window.location.hash = 'actividades';
  }
}

function toggleSelectedTimer() {
  if (state.view !== 'temporizador' || state.selectedTimerId === null) return;

  if (getTimer(state.selectedTimerId).running) {
    pauseTimer(state.selectedTimerId);
  } else {
    startTimer(state.selectedTimerId);
  }

  updateTimerUI();
}

document.addEventListener('keydown', (event) => {
  if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;

  const target = event.target;
  const typing =
    target instanceof HTMLElement &&
    (target.matches('input, select, textarea') || target.isContentEditable);
  if (typing) return;

  if (event.key === '?') {
    event.preventDefault();
    openShortcuts();
    return;
  }

  if (event.key === '1') {
    event.preventDefault();
    goToView('temporizador');
    return;
  }

  if (event.key === '2') {
    event.preventDefault();
    goToView('actividades');
    return;
  }

  if (event.key === '3') {
    event.preventDefault();
    goToView('historial');
    return;
  }

  if (event.key.toLowerCase() === 'n') {
    event.preventDefault();
    openNewActivity();
    return;
  }

  if (event.key.toLowerCase() === 'r') {
    event.preventDefault();
    loadDashboard();
    return;
  }

  if (event.key.toLowerCase() === 's') {
    event.preventDefault();
    toggleSelectedTimer();
  }
});

// --- Actualización manual, tema y arranque -------------------------------

els.refresh.addEventListener('click', () => loadDashboard());

els.shortcutsBtn.addEventListener('click', openShortcuts);
els.shortcutsClose.addEventListener('click', closeShortcuts);

// Cerrar el diálogo al pulsar fuera de su contenido.
els.shortcutsDialog.addEventListener('click', (event) => {
  if (event.target === els.shortcutsDialog) closeShortcuts();
});

els.themeToggle.addEventListener('click', () => {
  applyTheme(currentTheme() === 'dark' ? 'light' : 'dark');
});

// Avisa antes de cerrar si algún temporizador sigue en marcha.
window.addEventListener('beforeunload', (event) => {
  if (!hasRunningTimers()) return;

  event.preventDefault();
  event.returnValue = '';
});

// El reloj se actualiza cada segundo; el título también fuera del temporizador.
setInterval(() => {
  if (state.view === 'temporizador') {
    updateTimerUI();
  } else {
    updateDocumentTitle();
  }
}, 1000);

// Arranque: aplicamos el tema, decidimos la vista por el hash y cargamos los datos.
applyTheme(currentTheme());
handleRouteChange();
loadDashboard();
