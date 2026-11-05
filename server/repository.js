// Acceso a datos. Aquí vive todo el SQL; el resto del servidor no escribe SQL.

import { pool, withTransaction } from './db.js';
import { notFound } from './errors.js';

/** Comprueba que la base responde. Se usa en /api/health. */
export async function ping() {
  await pool.query('SELECT 1');
}

/** Convierte una fila de activities en un objeto simple. */
function mapActivity(row) {
  return {
    id: row.id,
    name: row.name,
    start_date: row.start_date,
    initial_balance_sec: row.initial_balance_sec,
    status: row.status,
    paused_from: row.paused_from,
  };
}

/** Lista todas las actividades, de la más antigua a la más nueva. */
export async function listActivities() {
  const [rows] = await pool.query(
    'SELECT * FROM activities ORDER BY created_at ASC, id ASC',
  );

  return rows.map(mapActivity);
}

/** Busca una actividad o lanza 404. */
export async function getActivity(id) {
  const [rows] = await pool.query('SELECT * FROM activities WHERE id = ?', [id]);

  if (rows.length === 0) {
    throw notFound('Actividad no encontrada.');
  }

  return mapActivity(rows[0]);
}

/** Cambia el nombre y la fecha de inicio de una actividad. */
export async function updateActivity(id, { name, start_date }) {
  const [result] = await pool.query(
    'UPDATE activities SET name = ?, start_date = ? WHERE id = ?',
    [name, start_date, id],
  );

  if (result.affectedRows === 0) {
    throw notFound('Actividad no encontrada.');
  }
}

/** Cambia el saldo inicial; el resto del saldo se deriva del historial. */
export async function updateInitialBalance(id, initialBalanceSec) {
  const [result] = await pool.query(
    'UPDATE activities SET initial_balance_sec = ? WHERE id = ?',
    [initialBalanceSec, id],
  );

  if (result.affectedRows === 0) {
    throw notFound('Actividad no encontrada.');
  }
}

/**
 * Devuelve las versiones del calendario con sus días:
 * [{ id, effective_from, days: { 0: 3600, 2: 1800 } }, ...]
 */
export async function listScheduleVersions(activityId) {
  const [rows] = await pool.query(
    `SELECT sv.id, sv.effective_from, sd.weekday, sd.quota_sec
       FROM schedule_versions sv
       LEFT JOIN schedule_days sd ON sd.schedule_version_id = sv.id
      WHERE sv.activity_id = ?
      ORDER BY sv.effective_from ASC, sv.id ASC, sd.weekday ASC`,
    [activityId],
  );

  const versions = [];
  let current = null;

  for (const row of rows) {
    if (current === null || current.id !== row.id) {
      current = {
        id: row.id,
        effective_from: row.effective_from,
        days: {},
      };
      versions.push(current);
    }

    if (row.weekday !== null) {
      current.days[row.weekday] = row.quota_sec;
    }
  }

  return versions;
}

/** Devuelve los periodos de pausa de una actividad. */
export async function listPausePeriods(activityId) {
  const [rows] = await pool.query(
    `SELECT paused_from, resumed_from
       FROM pause_periods
      WHERE activity_id = ?
      ORDER BY paused_from ASC, id ASC`,
    [activityId],
  );

  return rows.map((row) => ({
    paused_from: row.paused_from,
    resumed_from: row.resumed_from,
  }));
}

/** Devuelve todas las sesiones de una actividad, de la más reciente a la más antigua. */
export async function listSessions(activityId) {
  const [rows] = await pool.query(
    `SELECT id, activity_id, local_date, duration_sec, state, created_at
       FROM sessions
      WHERE activity_id = ?
      ORDER BY local_date DESC, id DESC`,
    [activityId],
  );

  return rows;
}

/** Inserta una versión de calendario y sus días dentro de una transacción. */
async function insertScheduleVersion(connection, activityId, effectiveFrom, days) {
  const [versionResult] = await connection.query(
    'INSERT INTO schedule_versions (activity_id, effective_from) VALUES (?, ?)',
    [activityId, effectiveFrom],
  );

  const versionId = versionResult.insertId;
  const values = Object.entries(days)
    .filter(([, quotaSec]) => quotaSec > 0)
    .map(([weekday, quotaSec]) => [versionId, Number(weekday), quotaSec]);

  if (values.length > 0) {
    await connection.query(
      'INSERT INTO schedule_days (schedule_version_id, weekday, quota_sec) VALUES ?',
      [values],
    );
  }

  return versionId;
}

/** Crea una actividad junto con su primera versión de calendario. */
export async function createActivity({ name, start_date, initial_balance_sec, days }) {
  return withTransaction(async (connection) => {
    const [result] = await connection.query(
      'INSERT INTO activities (name, start_date, initial_balance_sec) VALUES (?, ?, ?)',
      [name, start_date, initial_balance_sec],
    );

    const activityId = result.insertId;
    await insertScheduleVersion(connection, activityId, start_date, days);

    return activityId;
  });
}

/**
 * Crea o reemplaza la versión del calendario para una fecha.
 * Se usa para editar el calendario de hoy sin duplicar versiones.
 */
export async function saveScheduleVersion(activityId, effectiveFrom, days) {
  return withTransaction(async (connection) => {
    const [existing] = await connection.query(
      'SELECT id FROM schedule_versions WHERE activity_id = ? AND effective_from = ?',
      [activityId, effectiveFrom],
    );

    let versionId;

    if (existing.length > 0) {
      versionId = existing[0].id;
      await connection.query(
        'DELETE FROM schedule_days WHERE schedule_version_id = ?',
        [versionId],
      );
    } else {
      const [result] = await connection.query(
        'INSERT INTO schedule_versions (activity_id, effective_from) VALUES (?, ?)',
        [activityId, effectiveFrom],
      );
      versionId = result.insertId;
    }

    const values = Object.entries(days)
      .filter(([, quotaSec]) => quotaSec > 0)
      .map(([weekday, quotaSec]) => [versionId, Number(weekday), quotaSec]);

    if (values.length > 0) {
      await connection.query(
        'INSERT INTO schedule_days (schedule_version_id, weekday, quota_sec) VALUES ?',
        [values],
      );
    }

    return versionId;
  });
}

/** Abre un periodo de pausa si no hay uno abierto y actualiza la actividad. */
export async function pauseActivity(activityId, date) {
  return withTransaction(async (connection) => {
    const [openPeriods] = await connection.query(
      `SELECT id FROM pause_periods
        WHERE activity_id = ? AND resumed_from IS NULL
        ORDER BY id DESC LIMIT 1`,
      [activityId],
    );

    if (openPeriods.length === 0) {
      await connection.query(
        'INSERT INTO pause_periods (activity_id, paused_from) VALUES (?, ?)',
        [activityId, date],
      );
    }

    await connection.query(
      "UPDATE activities SET status = 'paused', paused_from = ? WHERE id = ?",
      [date, activityId],
    );
  });
}

/** Cierra el periodo de pausa abierto y marca la actividad como activa. */
export async function resumeActivity(activityId, date) {
  return withTransaction(async (connection) => {
    await connection.query(
      `UPDATE pause_periods
          SET resumed_from = ?
        WHERE activity_id = ? AND resumed_from IS NULL`,
      [date, activityId],
    );

    await connection.query(
      "UPDATE activities SET status = 'active', paused_from = NULL WHERE id = ?",
      [activityId],
    );
  });
}

/**
 * Archiva una actividad: deja de generar cuotas y se oculta del temporizador,
 * pero conserva todo el historial. Reutiliza el mecanismo de pausa para que
 * el saldo quede congelado desde la fecha indicada.
 */
export async function archiveActivity(activityId, date) {
  return withTransaction(async (connection) => {
    const [openPeriods] = await connection.query(
      `SELECT id FROM pause_periods
        WHERE activity_id = ? AND resumed_from IS NULL
        ORDER BY id DESC LIMIT 1`,
      [activityId],
    );

    if (openPeriods.length === 0) {
      await connection.query(
        'INSERT INTO pause_periods (activity_id, paused_from) VALUES (?, ?)',
        [activityId, date],
      );
    }

    await connection.query(
      "UPDATE activities SET status = 'archived', paused_from = ? WHERE id = ?",
      [date, activityId],
    );
  });
}

/** Reactiva una actividad archivada cerrando su pausa abierta. */
export async function unarchiveActivity(activityId, date) {
  return withTransaction(async (connection) => {
    await connection.query(
      `UPDATE pause_periods
          SET resumed_from = ?
        WHERE activity_id = ? AND resumed_from IS NULL`,
      [date, activityId],
    );

    await connection.query(
      "UPDATE activities SET status = 'active', paused_from = NULL WHERE id = ?",
      [activityId],
    );
  });
}

/** Inserta una sesión y devuelve su id. */
export async function createSession({
  activity_id,
  local_date,
  duration_sec,
  state,
}) {
  const [result] = await pool.query(
    `INSERT INTO sessions (activity_id, local_date, duration_sec, state)
     VALUES (?, ?, ?, ?)`,
    [activity_id, local_date, duration_sec, state],
  );

  return result.insertId;
}

/** Busca una sesión o lanza 404. */
export async function getSession(id) {
  const [rows] = await pool.query(
    `SELECT id, activity_id, local_date, duration_sec, state, created_at
       FROM sessions
      WHERE id = ?`,
    [id],
  );

  if (rows.length === 0) {
    throw notFound('Sesión no encontrada.');
  }

  return rows[0];
}

/** Actualiza fecha, duración y estado de una sesión existente. */
export async function updateSession(id, { local_date, duration_sec, state }) {
  const [result] = await pool.query(
    `UPDATE sessions
        SET local_date = ?, duration_sec = ?, state = ?
      WHERE id = ?`,
    [local_date, duration_sec, state, id],
  );

  if (result.affectedRows === 0) {
    throw notFound('Sesión no encontrada.');
  }
}

/** Confirma una sesión que estaba pendiente de revisión. */
export async function confirmSession(id) {
  const [result] = await pool.query(
    "UPDATE sessions SET state = 'finished' WHERE id = ? AND state = 'needs_review'",
    [id],
  );

  if (result.affectedRows === 0) {
    throw notFound('Sesión pendiente de revisión no encontrada.');
  }
}

/** Elimina una sesión. El saldo se recalcula automáticamente al consultar. */
export async function deleteSession(id) {
  const [result] = await pool.query('DELETE FROM sessions WHERE id = ?', [id]);

  if (result.affectedRows === 0) {
    throw notFound('Sesión no encontrada.');
  }
}

/** Elimina una actividad y todo su historial (cascada). */
export async function deleteActivity(id) {
  const [result] = await pool.query('DELETE FROM activities WHERE id = ?', [id]);

  if (result.affectedRows === 0) {
    throw notFound('Actividad no encontrada.');
  }
}
