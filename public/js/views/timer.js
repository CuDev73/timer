// Vista principal: un temporizador centrado para la actividad seleccionada.

import {
  escapeHtml,
  formatClock,
  formatDuration,
  remainingText,
  TODAY_STATUS_LABELS,
} from '../format.js';
import { elapsed, getTimer } from '../timers.js';

/** Texto del objetivo de hoy según el estado calculado por el núcleo. */
function objectiveText(today) {
  if (today.status === 'covered') return 'Cuota cubierta';
  if (!today.scheduled) return 'Día libre';
  return `Cuota: ${formatDuration(today.target_sec)}`;
}

/**
 * Devuelve el HTML de la vista Temporizador.
 * `activities` ya viene filtrado: solo activas y programadas para hoy.
 */
export function timerViewHtml({ activities, selectedId }) {
  if (activities.length === 0) {
    return `
      <div class="timer-stage">
        <div class="timer-card timer-empty">
          <h2>No hay actividades para hoy</h2>
          <p class="muted">Solo aparecen las actividades activas programadas para hoy.</p>
          <a class="btn primary" href="#actividades">Configurar actividades</a>
        </div>
      </div>
    `;
  }

  const activity = activities.find((item) => item.id === selectedId) ?? activities[0];
  const timer = getTimer(activity.id);
  const seconds = elapsed(activity.id);
  const statusLabel = TODAY_STATUS_LABELS[activity.today.status] ?? activity.today.status;
  const progress = Math.round((activity.today.progress ?? 0) * 100);

  // El sufijo "en marcha" ayuda a ver que otro temporizador sigue activo
  // aunque no sea el seleccionado.
  const options = activities
    .map((item) => {
      const running = getTimer(item.id).running ? ' · en marcha' : '';
      const selected = item.id === activity.id ? ' selected' : '';
      return `<option value="${item.id}"${selected}>${escapeHtml(item.name)}${running}</option>`;
    })
    .join('');

  return `
    <div class="timer-stage">
      <div class="timer-card">
        <label class="timer-select-label" for="timer-activity-select">Actividad</label>
        <select id="timer-activity-select" class="timer-select">
          ${options}
        </select>

        <div class="timer-clock" data-timer-display="${activity.id}">${formatClock(seconds)}</div>

        <p class="timer-meta">
          <span>${escapeHtml(objectiveText(activity.today))}</span>
          <span class="badge ${escapeHtml(activity.today.status)}">${escapeHtml(statusLabel)}</span>
        </p>

        <p class="timer-remaining" data-timer-remaining>
          ${escapeHtml(remainingText(activity.today, seconds))}
        </p>

        <div
          class="timer-progress"
          role="progressbar"
          aria-label="Progreso de hoy"
          aria-valuemin="0"
          aria-valuemax="100"
          aria-valuenow="${progress}"
        >
          <span style="width: ${progress}%"></span>
        </div>

        <div class="timer-controls" data-timer="${activity.id}">
          <button
            class="btn primary"
            type="button"
            data-action="timer-start"
            ${timer.running ? 'hidden' : ''}
          >${seconds >= 1 ? 'Reanudar' : 'Iniciar'}</button>

          <button
            class="btn primary"
            type="button"
            data-action="timer-pause"
            ${timer.running ? '' : 'hidden'}
          >Pausar</button>

          <button
            class="btn"
            type="button"
            data-action="timer-save"
            ${seconds >= 1 ? '' : 'hidden'}
          >Guardar sesión</button>

          <button
            class="btn ghost"
            type="button"
            data-action="timer-reset"
            ${!timer.running && seconds >= 1 ? '' : 'hidden'}
          >Reiniciar</button>
        </div>
      </div>
    </div>
  `;
}
