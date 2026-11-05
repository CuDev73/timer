// Vista de configuración: lista de actividades y panel de edición.

import {
  balanceClass,
  escapeHtml,
  formatDuration,
  formatSigned,
  TODAY_STATUS_LABELS,
} from '../format.js';

const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

/** La fecha más reciente entre dos YYYY-MM-DD. */
function maxDate(a, b) {
  return a > b ? a : b;
}

/** Última versión del calendario vigente hoy (o vacío si aún no empieza). */
function scheduleForToday(activity, today) {
  let current = null;

  for (const version of activity.schedule_versions) {
    if (version.effective_from <= today) current = version;
  }

  return current?.days ?? {};
}

/** Texto corto del estado de hoy para el resumen. */
function todayDetail(today) {
  if (today.paused) return 'Actividad pausada';

  if (!today.scheduled) return 'Día no programado';

  return `${formatDuration(today.worked_sec)} de ${formatDuration(today.target_sec)}`;
}

/** Etiqueta y clase del badge según el estado de la actividad. */
function statusInfo(activity) {
  if (activity.status === 'archived') {
    return { label: 'archivada', badgeClass: 'archived' };
  }

  if (activity.status === 'paused') {
    return { label: 'pausada', badgeClass: 'paused' };
  }

  return { label: 'activa', badgeClass: 'finished' };
}

/** Formulario para crear una actividad. */
function newActivityFormHtml(today, canCancel) {
  return `
    <section class="panel">
      <div class="panel-head">
        <div>
          <h3>Nueva actividad</h3>
        </div>
        ${canCancel ? '<button class="btn ghost" type="button" data-action="cancel-new">Cancelar</button>' : ''}
      </div>

      <form class="form-grid" data-action="create-activity">
        <label>
          Nombre
          <input name="name" type="text" maxlength="120" required placeholder="Ej. Estudio" />
        </label>

        <label>
          Fecha de inicio
          <input name="start_date" type="date" value="${today}" required />
        </label>

        <fieldset class="week-fieldset">
          <legend>Cuota semanal (minutos por día)</legend>
          <div class="week-grid">
            ${WEEKDAYS.map(
              (label, weekday) =>
                `<label>${label} <input name="day-${weekday}" type="number" min="0" step="1" value="0" /></label>`,
            ).join('')}
          </div>
        </fieldset>

        <div class="form-actions">
          <button class="btn primary" type="submit">Crear actividad</button>
        </div>
      </form>
    </section>
  `;
}

/** Formulario para cambiar nombre y fecha de inicio. */
function metaFormHtml(activity) {
  return `
    <form class="form-grid meta-form" data-action="update-activity">
      <label>
        Nombre
        <input name="name" type="text" maxlength="120" value="${escapeHtml(activity.name)}" required />
      </label>

      <label>
        Fecha de inicio
        <input name="start_date" type="date" value="${escapeHtml(activity.start_date)}" required />
      </label>

      <div class="form-actions">
        <button class="btn ghost" type="button" data-action="cancel-meta">Cancelar</button>
        <button class="btn primary" type="submit">Guardar datos</button>
      </div>

      <p class="muted form-note">
        Cambiar la fecha recalcula el historial: las sesiones anteriores al nuevo inicio dejan de contar.
      </p>
    </form>
  `;
}

/** Historial de periodos de pausa. */
function pauseHistoryHtml(activity) {
  const periods = activity.pause_periods ?? [];

  if (periods.length === 0) {
    return '<p class="muted">Sin pausas registradas.</p>';
  }

  return `
    <ul class="pause-list">
      ${periods
        .map(
          (period) =>
            `<li><span>${escapeHtml(period.paused_from)}</span><span class="muted">→</span><span>${
              period.resumed_from ? escapeHtml(period.resumed_from) : 'sigue pausada'
            }</span></li>`,
        )
        .join('')}
    </ul>
  `;
}

/** Panel de configuración de una actividad existente. */
function activityConfigHtml(activity, today, metaMode) {
  const archived = activity.status === 'archived';
  const paused = activity.status === 'paused';
  const currentBalance = activity.current_balance_sec ?? activity.balance_sec;
  const days = scheduleForToday(activity, today);
  const minDate = maxDate(activity.start_date, today);
  const statusLabel = TODAY_STATUS_LABELS[activity.today.status] ?? activity.today.status;
  const badge = statusInfo(activity);

  const actions = archived
    ? `
        <a class="btn small" href="#historial">Ver historial</a>
        <button class="btn small" type="button" data-action="unarchive">Reactivar</button>
      `
    : `
        <button class="btn small ghost" type="button" data-action="edit-meta">Editar datos</button>
        ${
          paused
            ? '<button class="btn small" type="button" data-action="resume">Reanudar hoy</button>'
            : '<button class="btn small" type="button" data-action="pause">Pausar hoy</button>'
        }
        <button class="btn small ghost" type="button" data-action="archive">Archivar</button>
      `;

  return `
    <section class="panel" data-activity-id="${activity.id}">
      <div class="panel-head">
        <div>
          <h3>${escapeHtml(activity.name)}</h3>
          <p class="muted">
            Desde ${escapeHtml(activity.start_date)} ·
            <span class="badge ${badge.badgeClass}">${badge.label}</span>
          </p>
        </div>
        <div class="card-actions">${actions}</div>
      </div>

      ${metaMode && !archived ? metaFormHtml(activity) : ''}

      ${
        archived
          ? '<p class="notice">Actividad archivada: no genera cuotas nuevas y conserva todo su historial.</p>'
          : ''
      }

      <div class="metrics">
        <div class="metric">
          <span class="label">Saldo</span>
          <span class="value balance ${balanceClass(currentBalance)}">${formatSigned(currentBalance)}</span>
          <span class="detail">incluye hoy</span>
        </div>
        <div class="metric">
          <span class="label">Hoy</span>
          <span class="value">${escapeHtml(statusLabel)}</span>
          <span class="detail">${escapeHtml(todayDetail(activity.today))}</span>
        </div>
        <div class="metric">
          <span class="label">Proyección</span>
          <span class="value">${activity.projection.covered_count} día(s)</span>
          <span class="detail">
            ${
              activity.projection.first_uncovered_date
                ? `Primera sin cubrir: ${escapeHtml(activity.projection.first_uncovered_date)}`
                : 'Sin cuotas pendientes'
            }
          </span>
        </div>
      </div>

      ${
        archived
          ? ''
          : `
            <form class="schedule-form" data-action="schedule">
              <h4>Calendario semanal</h4>

              <div class="row">
                <label>
                  Vigente desde
                  <input type="date" name="effective_from" value="${minDate}" min="${minDate}" required />
                </label>
              </div>

              <div class="week-grid">
                ${WEEKDAYS.map((label, weekday) => {
                  const minutes = (days[weekday] ?? 0) / 60;
                  return `<label>${label} <input type="number" name="day-${weekday}" min="0" step="1" value="${minutes}" /></label>`;
                }).join('')}
              </div>

              <div class="form-actions">
                <button class="btn primary" type="submit">Guardar calendario</button>
              </div>
            </form>

            <details class="tool-box">
              <summary>Ajustar saldo actual</summary>
              <form class="row" data-action="adjust-balance">
                <label>
                  Nuevo saldo (min)
                  <input name="balance_min" type="number" step="1"
                    value="${Math.round(currentBalance / 60)}" required />
                </label>
                <button class="btn" type="submit">Aplicar ajuste</button>
              </form>
              <p class="muted form-note">
                Corrige deudas o tiempo previo. Recalcula el saldo inicial y el historial.
              </p>
            </details>
          `
      }

      <details class="tool-box">
        <summary>Historial de pausas</summary>
        ${pauseHistoryHtml(activity)}
      </details>

      <div class="danger-zone">
        <div>
          <strong>Eliminar actividad</strong>
          <p class="muted">Se borrará también todo su historial.</p>
        </div>
        <button class="btn danger" type="button" data-action="delete-activity">Eliminar</button>
      </div>
    </section>
  `;
}

/**
 * Devuelve el HTML de la vista Actividades.
 * `mode` puede ser "new" (formulario de creación) o "edit" (configuración).
 */
export function activitiesViewHtml({
  activities,
  selectedId,
  mode,
  today,
  showArchived = false,
  archivedCount = 0,
  metaMode = false,
}) {
  const isNew = mode === 'new' || activities.length === 0;
  const selected = activities.find((activity) => activity.id === selectedId) ?? null;

  const list = activities
    .map((activity) => {
      const active = !isNew && activity.id === selectedId;
      const badge = statusInfo(activity);

      return `
        <button
          class="activity-item ${active ? 'active' : ''} ${activity.status === 'archived' ? 'is-archived' : ''}"
          type="button"
          data-action="select-activity"
          data-activity-id="${activity.id}"
          ${active ? 'aria-current="true"' : ''}
        >
          <span class="activity-item-name">${escapeHtml(activity.name)}</span>
          <span class="badge ${badge.badgeClass}">${badge.label}</span>
        </button>
      `;
    })
    .join('');

  return `
    <div class="view-heading">
      <div>
        <h2>Actividades</h2>
      </div>
      <button class="btn primary" type="button" data-action="new-activity">Nueva actividad</button>
    </div>

    <div class="config-layout">
      <aside class="activity-picker" aria-label="Lista de actividades">
        ${
          archivedCount > 0
            ? `<div class="activity-picker-head">
                 <button class="btn small ghost" type="button" data-action="toggle-archived">
                   ${showArchived ? 'Ocultar archivadas' : `Mostrar archivadas (${archivedCount})`}
                 </button>
               </div>`
            : ''
        }
        <div class="activity-list">
          ${list || '<p class="muted">Todavía no hay actividades.</p>'}
        </div>
      </aside>

      <div class="config-main">
        ${
          isNew || selected === null
            ? newActivityFormHtml(today, activities.length > 0)
            : activityConfigHtml(selected, today, metaMode)
        }
      </div>
    </div>
  `;
}
