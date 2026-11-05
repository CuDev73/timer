// Utilidades de formato compartidas por las vistas.
// No tocan el DOM ni la API: solo convierten datos a texto legible.

/** Etiquetas del estado del día actual. */
export const TODAY_STATUS_LABELS = {
  pending: 'Pendiente',
  in_progress: 'En curso',
  completed: 'Cumplida',
  covered: 'Cubierta por excedente',
  not_scheduled: 'Día libre',
  paused: 'Pausada',
};

/** Etiquetas de los días ya cerrados. */
export const DAY_STATUS_LABELS = {
  completed: 'Cumplido',
  partial: 'Parcial',
  missed: 'Incumplido',
  covered: 'Cubierto',
  not_scheduled: 'Libre',
  paused: 'Pausado',
};

/** Evita inyectar HTML cuando un nombre viene de la base de datos. */
export function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** Segundos -> "1 h 20 min" (o "26 s" si dura menos de un minuto). */
export function formatDuration(seconds) {
  const abs = Math.abs(seconds);

  if (abs > 0 && abs < 60) {
    return `${Math.max(1, Math.round(abs))} s`;
  }

  const totalMinutes = Math.round(abs / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 0 && minutes > 0) return `${hours} h ${minutes} min`;
  if (hours > 0) return `${hours} h`;
  return `${minutes} min`;
}

/** Segundos con signo para mostrar saldos. */
export function formatSigned(seconds) {
  const value = Math.round(seconds);
  if (value === 0) return '0 min';
  return `${value > 0 ? '+' : '-'}${formatDuration(Math.abs(value))}`;
}

/**
 * Texto de lo que falta hoy, descontando el tiempo del temporizador
 * que todavía no se ha guardado.
 */
export function remainingText(today, timerSeconds = 0) {
  if (!today) return '';

  if (today.paused) return 'Actividad pausada';
  if (!today.scheduled) return 'Día libre';
  if (today.target_sec === 0) return 'Cuota cubierta';

  const remaining = Math.max(
    0,
    today.remaining_sec - Math.max(0, Math.floor(timerSeconds)),
  );

  return remaining > 0 ? `Faltan ${formatDuration(remaining)}` : 'Objetivo cumplido';
}

/** Segundos -> "01:23:45" para el reloj del temporizador. */
export function formatClock(seconds) {
  const total = Math.max(0, Math.floor(seconds));
  const hours = String(Math.floor(total / 3600)).padStart(2, '0');
  const minutes = String(Math.floor((total % 3600) / 60)).padStart(2, '0');
  const secs = String(total % 60).padStart(2, '0');
  return `${hours}:${minutes}:${secs}`;
}

/** Fecha YYYY-MM-DD -> "martes, 3 de noviembre de 2026". */
export function formatDateLong(date) {
  const parsed = new Date(`${date}T00:00:00`);
  return new Intl.DateTimeFormat('es', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(parsed);
}

/** Clase CSS según el signo del saldo. */
export function balanceClass(seconds) {
  if (seconds > 0) return 'positive';
  if (seconds < 0) return 'negative';
  return 'zero';
}
