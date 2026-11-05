-- Esquema de la app de cuotas de tiempo.
-- Se puede ejecutar varias veces: todas las tablas usan IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS activities (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(120) NOT NULL,
  start_date DATE NOT NULL,
  initial_balance_sec INT NOT NULL DEFAULT 0,
  status ENUM('active', 'paused', 'archived') NOT NULL DEFAULT 'active',
  paused_from DATE NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Migración para bases creadas antes de existir el estado "archived".
ALTER TABLE activities
  MODIFY status ENUM('active', 'paused', 'archived') NOT NULL DEFAULT 'active';

-- Cada fila es una versión del calendario semanal.
-- Para una fecha rige la última versión con effective_from <= fecha.
CREATE TABLE IF NOT EXISTS schedule_versions (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  activity_id INT UNSIGNED NOT NULL,
  effective_from DATE NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_schedule_activity_date (activity_id, effective_from),
  CONSTRAINT fk_schedule_activity
    FOREIGN KEY (activity_id) REFERENCES activities (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Cuota en segundos por día de la semana (0 = lunes ... 6 = domingo).
-- Solo se guardan los días programados con cuota > 0.
CREATE TABLE IF NOT EXISTS schedule_days (
  schedule_version_id INT UNSIGNED NOT NULL,
  weekday TINYINT UNSIGNED NOT NULL,
  quota_sec INT UNSIGNED NOT NULL,
  PRIMARY KEY (schedule_version_id, weekday),
  CONSTRAINT fk_day_version
    FOREIGN KEY (schedule_version_id) REFERENCES schedule_versions (id) ON DELETE CASCADE,
  CONSTRAINT chk_weekday CHECK (weekday BETWEEN 0 AND 6)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Historial de pausas. resumed_from NULL significa que la pausa sigue abierta.
CREATE TABLE IF NOT EXISTS pause_periods (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  activity_id INT UNSIGNED NOT NULL,
  paused_from DATE NOT NULL,
  resumed_from DATE NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_pause_activity (activity_id),
  CONSTRAINT fk_pause_activity
    FOREIGN KEY (activity_id) REFERENCES activities (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Sesiones de trabajo. Solo las terminadas cuentan para el saldo.
CREATE TABLE IF NOT EXISTS sessions (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  activity_id INT UNSIGNED NOT NULL,
  local_date DATE NOT NULL,
  duration_sec INT UNSIGNED NOT NULL,
  state ENUM('running', 'finished', 'needs_review') NOT NULL DEFAULT 'finished',
  started_at DATETIME NULL,
  ended_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_sessions_activity_date (activity_id, local_date),
  CONSTRAINT fk_session_activity
    FOREIGN KEY (activity_id) REFERENCES activities (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
