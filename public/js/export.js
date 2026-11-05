// Exportación de datos desde el navegador. Sin librerías externas.

/** Escapa un valor para CSV con separador ";". */
function csvCell(value) {
  const text = String(value ?? '');
  return /[";\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** Descarga un archivo generado en memoria. */
function download(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();

  // Damos un margen para que el navegador empiece la descarga.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function sessionStateLabel(state) {
  if (state === 'finished') return 'contada';
  if (state === 'needs_review') return 'revisar';
  return state;
}

/** Exporta todas las sesiones de todas las actividades a CSV. */
export function exportSessionsCsv(activities, today) {
  const lines = ['Actividad;Fecha;Minutos;Estado'];

  for (const activity of activities) {
    const sessions = activity.sessions ?? activity.recent_sessions ?? [];

    for (const session of sessions) {
      lines.push(
        [
          csvCell(activity.name),
          session.local_date,
          (session.duration_sec / 60).toFixed(1).replace('.', ','),
          sessionStateLabel(session.state),
        ].join(';'),
      );
    }
  }

  // BOM para que Excel reconozca UTF-8.
  download(
    `sesiones-${today}.csv`,
    `\uFEFF${lines.join('\r\n')}\r\n`,
    'text/csv;charset=utf-8',
  );
}

/** Exporta una copia completa de los datos visibles en JSON. */
export function exportDashboardJson(activities, today) {
  const payload = {
    exported_at: new Date().toISOString(),
    today,
    activities,
  };

  download(
    `cuotas-tiempo-${today}.json`,
    JSON.stringify(payload, null, 2),
    'application/json;charset=utf-8',
  );
}
