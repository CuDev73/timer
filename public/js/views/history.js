// Vista de historial y estadísticas de una actividad.

import { addDays, formatShortDate, getWeekday, listDates } from '../dates.js';
import {
  balanceClass,
  DAY_STATUS_LABELS,
  escapeHtml,
  formatDuration,
  formatSigned,
  TODAY_STATUS_LABELS,
} from '../format.js';

// Semanas que se muestran en el mapa de calor.
const HEATMAP_WEEKS = 12;

/** Etiqueta corta del estado de una sesión. */
function sessionStateLabel(state) {
  if (state === 'finished') return 'contada';
  if (state === 'needs_review') return 'revisar';
  return state;
}

/** Formulario para editar una sesión en su propia fila. */
function editSessionFormHtml(activity, session, today) {
  const minutes = Math.max(1, Math.round(session.duration_sec / 60));

  return `
    <form class="session-edit-form" data-action="update-session"
      data-session-id="${session.id}" data-activity-id="${activity.id}">
      <p class="form-title">Editar sesión del ${escapeHtml(session.local_date)}</p>

      <label>
        Fecha
        <input type="date" name="local_date" value="${escapeHtml(session.local_date)}"
          min="${escapeHtml(activity.start_date)}" max="${today}" required />
      </label>

      <label>
        Minutos
        <input type="number" name="minutes" min="1" step="1" value="${minutes}" required />
      </label>

      <label>
        Estado
        <select name="state">
          <option value="finished"${session.state === 'finished' ? ' selected' : ''}>Contada</option>
          <option value="needs_review"${session.state === 'needs_review' ? ' selected' : ''}>Pendiente de revisión</option>
        </select>
      </label>

      <div class="form-actions">
        <button class="btn small ghost" type="button" data-action="cancel-session-edit">Cancelar</button>
        <button class="btn small primary" type="submit">Guardar</button>
      </div>
    </form>
  `;
}

/** Formulario para dividir una sesión y mover la segunda parte de fecha. */
function splitSessionFormHtml(activity, session, today) {
  // La primera parte debe ser menor que la sesión completa.
  const maxFirst = Math.max(1, Math.floor((session.duration_sec - 1) / 60));
  const firstMinutes = Math.max(1, Math.round(session.duration_sec / 120));
  const secondMinutes = Math.round((session.duration_sec - firstMinutes * 60) / 60);

  return `
    <form class="session-edit-form" data-action="split-session"
      data-session-id="${session.id}" data-activity-id="${activity.id}">
      <p class="form-title">Dividir sesión del ${escapeHtml(session.local_date)}</p>
      <p class="muted form-note">
        La primera parte se queda en la fecha original. La segunda parte
        (${formatDuration(secondMinutes * 60)}) se moverá a la fecha que elijas.
      </p>

      <label>
        Primera parte (min)
        <input type="number" name="first_minutes" min="1" max="${maxFirst}"
          step="1" value="${firstMinutes}" required />
      </label>

      <label>
        Fecha de la segunda parte
        <input type="date" name="second_date" value="${escapeHtml(session.local_date)}"
          min="${escapeHtml(activity.start_date)}" max="${today}" required />
      </label>

      <div class="form-actions">
        <button class="btn small ghost" type="button" data-action="cancel-session-edit">Cancelar</button>
        <button class="btn small primary" type="submit">Dividir</button>
      </div>
    </form>
  `;
}

/** Lista de sesiones con sus acciones y, si toca, el formulario abierto. */
function sessionsHtml(activity, today, editingSessionId, sessionFormMode) {
  const sessions = activity.sessions ?? activity.recent_sessions ?? [];

  if (sessions.length === 0) {
    return '<p class="muted">Sin sesiones todavía.</p>';
  }

  // Las más recientes primero, sin modificar el array original.
  const ordered = [...sessions].sort(
    (a, b) => b.local_date.localeCompare(a.local_date) || b.id - a.id,
  );

  const rows = ordered
    .map((session) => {
      if (editingSessionId === session.id) {
        return `
          <li class="is-editing">
            ${
              sessionFormMode === 'split'
                ? splitSessionFormHtml(activity, session, today)
                : editSessionFormHtml(activity, session, today)
            }
          </li>
        `;
      }

      return `
        <li>
          <span class="session-date">${escapeHtml(session.local_date)}</span>
          <span>${formatDuration(session.duration_sec)}</span>
          <span class="badge ${escapeHtml(session.state)}">${sessionStateLabel(session.state)}</span>
          <span class="spacer"></span>

          ${
            session.state === 'needs_review'
              ? `<button class="btn small" type="button" data-action="confirm-session" data-session-id="${session.id}">Confirmar</button>`
              : ''
          }
          <button class="btn small ghost" type="button" data-action="edit-session" data-session-id="${session.id}">Editar</button>
          ${
            session.duration_sec > 60
              ? `<button class="btn small ghost" type="button" data-action="split-session" data-session-id="${session.id}">Dividir</button>`
              : ''
          }
          <button class="btn small danger" type="button" data-action="delete-session" data-session-id="${session.id}">Borrar</button>
        </li>
      `;
    })
    .join('');

  return `
    <p class="muted">${sessions.length} sesión(es). Borrar o editar recalcula el saldo.</p>
    <ul class="session-list scroll">${rows}</ul>
  `;
}

/** Tabla de los últimos días cerrados. */
function ledgerHtml(activity) {
  if (activity.ledger.length === 0) {
    return '<p class="muted">Todavía no hay días cerrados.</p>';
  }

  const rows = activity.ledger
    .slice(-14)
    .reverse()
    .map(
      (row) => `
        <tr>
          <td>${escapeHtml(row.date)}</td>
          <td>${escapeHtml(DAY_STATUS_LABELS[row.status] ?? row.status)}</td>
          <td>${row.scheduled ? formatDuration(row.quota_sec) : '—'}</td>
          <td>${formatDuration(row.worked_sec)}</td>
          <td>${formatSigned(row.balance_after_sec)}</td>
        </tr>
      `,
    )
    .join('');

  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr><th>Fecha</th><th>Estado</th><th>Cuota</th><th>Trabajado</th><th>Saldo</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <p class="muted">Últimos 14 días cerrados.</p>
  `;
}

/** Clase del mapa de calor según el estado del día. */
function heatClass(status) {
  if (status === 'completed' || status === 'covered') return 'good';
  if (status === 'partial' || status === 'in_progress') return 'partial';
  if (status === 'missed') return 'bad';
  if (status === 'paused') return 'paused';
  if (status === 'pending') return 'pending';
  return 'free';
}

/** Mapa de calor de las últimas 12 semanas. */
function heatmapHtml(activity, today) {
  const end = addDays(today, 6 - getWeekday(today)); // domingo de esta semana
  const start = addDays(end, -(HEATMAP_WEEKS * 7 - 1)); // lunes de hace 11 semanas
  const ledgerByDate = new Map(activity.ledger.map((row) => [row.date, row]));

  const cells = listDates(start, end)
    .map((date) => {
      if (date > today) {
        return `<span class="heat-cell future" title="${escapeHtml(
          formatShortDate(date),
        )} · día futuro" aria-hidden="true"></span>`;
      }

      if (date < activity.start_date) {
        return `<span class="heat-cell before" title="${escapeHtml(
          formatShortDate(date),
        )} · antes del inicio" aria-hidden="true"></span>`;
      }

      // Hoy todavía no está en el ledger: usamos el estado calculado.
      const row =
        date === today
          ? {
              date,
              status: activity.today.status,
              scheduled: activity.today.scheduled,
              paused: activity.today.paused,
              worked_sec: activity.today.worked_sec,
              quota_sec: activity.today.target_sec,
            }
          : ledgerByDate.get(date);

      if (!row) {
        return `<span class="heat-cell free" title="${escapeHtml(
          formatShortDate(date),
        )} · sin datos" aria-hidden="true"></span>`;
      }

      const label = DAY_STATUS_LABELS[row.status] ?? TODAY_STATUS_LABELS[row.status] ?? row.status;
      const detail = row.scheduled
        ? `${formatDuration(row.worked_sec)} de ${formatDuration(row.quota_sec)}`
        : `${formatDuration(row.worked_sec)} en día libre`;

      return `<span class="heat-cell ${heatClass(row.status)}"
        title="${escapeHtml(formatShortDate(date))} · ${escapeHtml(label)} · ${escapeHtml(detail)}"
        aria-label="${escapeHtml(formatShortDate(date))}: ${escapeHtml(label)}, ${escapeHtml(detail)}"></span>`;
    })
    .join('');

  return `
    <div class="heatmap">
      <div class="heatmap-grid">${cells}</div>
    </div>
    <div class="heatmap-legend">
      <span><i class="heat-cell good"></i> cumplido</span>
      <span><i class="heat-cell partial"></i> parcial</span>
      <span><i class="heat-cell bad"></i> incumplido</span>
      <span><i class="heat-cell paused"></i> pausado</span>
      <span><i class="heat-cell free"></i> libre</span>
    </div>
    <p class="muted">Últimas 12 semanas. Pasa el cursor por un día para ver el detalle.</p>
  `;
}

/** Gráfico de líneas del saldo al cerrar cada día. */
function balanceChartHtml(activity) {
  const series = activity.stats.all.balance_series ?? [];

  if (series.length < 2) {
    return '<p class="muted">Se necesitan al menos dos días cerrados para dibujar el gráfico.</p>';
  }

  const width = 600;
  const height = 170;
  const pad = 18;
  const values = series.map((point) => point.balance_sec);
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const span = max - min || 1;

  const x = (index) => pad + (index * (width - 2 * pad)) / (series.length - 1);
  const y = (value) => pad + ((max - value) * (height - 2 * pad)) / span;

  const points = series
    .map((point, index) => `${x(index).toFixed(1)},${y(point.balance_sec).toFixed(1)}`)
    .join(' ');
  const zeroY = y(0).toFixed(1);
  const last = series.at(-1);
  const first = series[0];

  return `
    <div class="chart-wrap">
      <svg class="balance-chart" viewBox="0 0 ${width} ${height}" role="img"
        aria-label="Evolución del saldo entre ${escapeHtml(first.date)} y ${escapeHtml(last.date)}">
        <line x1="${pad}" y1="${zeroY}" x2="${width - pad}" y2="${zeroY}" class="chart-zero" />
        <polyline points="${points}" class="chart-line" />
        <circle cx="${x(series.length - 1).toFixed(1)}" cy="${y(last.balance_sec).toFixed(1)}"
          r="4" class="chart-dot" />
      </svg>

      <div class="chart-labels">
        <span>${escapeHtml(first.date)}</span>
        <span class="balance ${balanceClass(last.balance_sec)}">${formatSigned(last.balance_sec)}</span>
        <span>${escapeHtml(last.date)}</span>
      </div>
    </div>
    <p class="muted">Saldo al cerrar cada día. La línea central marca el cero.</p>
  `;
}

/** Barras del resumen semanal: días cumplidos y tiempo trabajado. */
function weekSummaryHtml(activity) {
  const week = activity.stats.week;
  const daysRatio = Math.round((week.days.completion_ratio ?? 0) * 100);
  const timeRatio = Math.round((week.time.completion_ratio ?? 0) * 100);
  // La barra no puede pasar de 100%, aunque el texto muestre el excedente real.
  const timeBar = Math.min(100, timeRatio);
  const doneDays = week.days.completed + week.days.covered;

  return `
    <div class="summary-row">
      <div class="summary-label">
        <span>Días cumplidos</span>
        <strong>${doneDays} de ${week.days.scheduled} · ${daysRatio}%</strong>
      </div>
      <div class="summary-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100"
        aria-valuenow="${daysRatio}" aria-label="Días cumplidos de la semana">
        <span style="width: ${daysRatio}%"></span>
      </div>
    </div>

    <div class="summary-row">
      <div class="summary-label">
        <span>Tiempo trabajado</span>
        <strong>${formatDuration(week.time.worked_sec)} de ${formatDuration(week.time.quota_sec)} · ${timeRatio}%</strong>
      </div>
      <div class="summary-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100"
        aria-valuenow="${timeBar}" aria-label="Tiempo trabajado de la semana">
        <span style="width: ${timeBar}%"></span>
      </div>
    </div>

    <p class="muted">${week.session_count} sesión(es) contada(s) esta semana.</p>
  `;
}

/** Formulario para registrar una sesión pasada a mano. */
function manualSessionFormHtml(activity, today) {
  if (activity.start_date > today) {
    return '<p class="muted">Podrás añadir sesiones manuales cuando la actividad haya comenzado.</p>';
  }

  if (activity.status === 'archived') {
    return '<p class="muted">Reactiva la actividad para añadir sesiones nuevas.</p>';
  }

  return `
    <form class="schedule-form" data-action="manual-session" data-activity-id="${activity.id}">
      <p class="muted">Más de 6 h requiere confirmación.</p>
      <div class="row">
        <label>
          Fecha
          <input type="date" name="local_date" value="${today}"
            min="${escapeHtml(activity.start_date)}" max="${today}" required />
        </label>
        <label>
          Minutos
          <input type="number" name="minutes" min="1" step="1" value="30" required />
        </label>
        <button class="btn primary" type="submit">Añadir sesión</button>
      </div>
    </form>
  `;
}

/** Devuelve el HTML de la vista Historial y estadísticas. */
export function historyViewHtml({
  activities,
  selectedId,
  today,
  editingSessionId = null,
  sessionFormMode = 'edit',
}) {
  if (activities.length === 0) {
    return `
      <div class="empty">
        <h2>Sin historial todavía</h2>
        <p>Crea una actividad para empezar a registrar sesiones.</p>
        <a class="btn primary" href="#actividades">Ir a Actividades</a>
      </div>
    `;
  }

  const activity = activities.find((item) => item.id === selectedId) ?? activities[0];
  const currentBalance = activity.current_balance_sec ?? activity.balance_sec;
  const week = activity.stats.week;
  const all = activity.stats.all;
  const streak = activity.stats.streak ?? { current: 0, best: 0 };

  const weekDetail =
    week.time.quota_sec > 0
      ? `${formatDuration(week.time.worked_sec)} de ${formatDuration(week.time.quota_sec)}`
      : 'Sin cuota en días cerrados';

  const options = activities
    .map(
      (item) =>
        `<option value="${item.id}"${item.id === activity.id ? ' selected' : ''}>${escapeHtml(
          item.name,
        )}${item.status === 'archived' ? ' (archivada)' : ''}</option>`,
    )
    .join('');

  return `
    <div class="view-heading">
      <div>
        <h2>Historial</h2>
        ${
          activity.status === 'archived'
            ? '<p class="muted">Actividad archivada: el historial se conserva, pero no genera cuotas nuevas.</p>'
            : ''
        }
      </div>
    </div>

    <div class="history-toolbar">
      <label>
        Actividad
        <select id="history-activity-select">${options}</select>
      </label>

      <div class="history-export">
        <button class="btn small" type="button" data-action="export-csv">Exportar CSV</button>
        <button class="btn small" type="button" data-action="export-json">Exportar JSON</button>
      </div>
    </div>

    <div class="metrics">
      <div class="metric">
        <span class="label">Saldo actual</span>
        <span class="value balance ${balanceClass(currentBalance)}">${formatSigned(currentBalance)}</span>
        <span class="detail">incluye hoy</span>
      </div>
      <div class="metric">
        <span class="label">Racha</span>
        <span class="value">${streak.current} día(s)</span>
        <span class="detail">mejor racha: ${streak.best}</span>
      </div>
      <div class="metric">
        <span class="label">Semana cerrada</span>
        <span class="value">${Math.round((week.days.completion_ratio ?? 0) * 100)}% de días</span>
        <span class="detail">${weekDetail}</span>
      </div>
      <div class="metric">
        <span class="label">Histórico</span>
        <span class="value">${formatDuration(all.time.worked_sec)}</span>
        <span class="detail">${all.session_count} sesiones · ${Math.round(
          (all.days.completion_ratio ?? 0) * 100,
        )}% de días</span>
      </div>
      <div class="metric">
        <span class="label">Por confirmar</span>
        <span class="value">${activity.pending_review.length}</span>
        <span class="detail">sesiones de más de 6 h</span>
      </div>
    </div>

    <section class="panel history-section">
      <h3>Resumen semanal</h3>
      ${weekSummaryHtml(activity)}
    </section>

    <section class="panel history-section">
      <h3>Evolución del saldo</h3>
      ${balanceChartHtml(activity)}
    </section>

    <section class="panel history-section">
      <h3>Mapa de calor</h3>
      ${heatmapHtml(activity, today)}
    </section>

    <section class="panel history-section">
      <h3>Sesiones</h3>
      ${sessionsHtml(activity, today, editingSessionId, sessionFormMode)}
    </section>

    <section class="panel history-section">
      <h3>Añadir sesión manual</h3>
      ${manualSessionFormHtml(activity, today)}
    </section>

    <section class="panel history-section">
      <h3>Días cerrados</h3>
      ${ledgerHtml(activity)}
    </section>
  `;
}
