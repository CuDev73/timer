import { describe, expect, it } from 'vitest';
import { closeDays } from '../ledger.js';
import { computeStats, computeStreaks } from '../stats.js';
import {
  FRI,
  MON,
  SAT,
  THU,
  TUE,
  WED,
  makeActivity,
  makeSession,
  scheduleVersion,
  toSec,
} from './helpers.js';

const VERSION_BASE = '2026-01-01';

/**
 * Escenario con cinco días programados (lunes a viernes):
 * - Saldo inicial +60.
 * - Lunes: trabaja 90 -> cubierto.
 * - Martes: no trabaja -> cubierto por el excedente.
 * - Miércoles: trabaja 60 -> cumplido.
 * - Jueves: no trabaja -> fallado.
 * - Viernes: no trabaja -> fallado.
 */
function buildLedger() {
  const activity = makeActivity({ start_date: MON, initial_balance_sec: toSec(60) });
  const scheduleVersions = [scheduleVersion(VERSION_BASE, { 0: 60, 1: 60, 2: 60, 3: 60, 4: 60 })];
  const sessions = [makeSession(MON, 90), makeSession(WED, 60)];

  return closeDays({ activity, scheduleVersions, sessions, today: SAT }).ledger;
}

describe('computeStats', () => {
  it('calcula cumplimiento por tiempo, por días, sesiones y serie de saldo', () => {
    const stats = computeStats(buildLedger());

    expect(stats.time).toMatchObject({
      worked_sec: toSec(150),
      quota_sec: toSec(300),
    });
    expect(stats.time.completion_ratio).toBeCloseTo(0.5);

    expect(stats.days).toMatchObject({
      total: 5,
      scheduled: 5,
      covered: 2,
      completed: 1,
      partial: 0,
      missed: 2,
      not_scheduled: 0,
      paused: 0,
    });
    expect(stats.days.completion_ratio).toBeCloseTo(3 / 5);

    expect(stats.session_count).toBe(2);
    expect(stats.balance_series).toEqual([
      { date: MON, balance_sec: toSec(90) },
      { date: TUE, balance_sec: toSec(30) },
      { date: WED, balance_sec: toSec(30) },
      { date: THU, balance_sec: toSec(-30) },
      { date: FRI, balance_sec: toSec(-90) },
    ]);
  });

  it('filtra por rango de fechas inclusivo', () => {
    const stats = computeStats(buildLedger(), { from: WED, to: FRI });

    expect(stats.range).toEqual({ from: WED, to: FRI });
    expect(stats.time).toMatchObject({
      worked_sec: toSec(60),
      quota_sec: toSec(180),
    });
    expect(stats.time.completion_ratio).toBeCloseTo(1 / 3);
    expect(stats.days).toMatchObject({
      total: 3,
      scheduled: 3,
      covered: 0,
      completed: 1,
      partial: 0,
      missed: 2,
      not_scheduled: 0,
      paused: 0,
    });
    expect(stats.days.completion_ratio).toBeCloseTo(1 / 3);
    expect(stats.session_count).toBe(1);
    expect(stats.balance_series).toEqual([
      { date: WED, balance_sec: toSec(30) },
      { date: THU, balance_sec: toSec(-30) },
      { date: FRI, balance_sec: toSec(-90) },
    ]);
  });

  it('devuelve ceros y una serie vacía si el rango no tiene días', () => {
    const stats = computeStats(buildLedger(), { from: '2026-02-01', to: '2026-02-28' });

    expect(stats.time).toEqual({
      worked_sec: 0,
      quota_sec: 0,
      completion_ratio: 0,
    });
    expect(stats.days).toEqual({
      total: 0,
      scheduled: 0,
      covered: 0,
      completed: 0,
      partial: 0,
      missed: 0,
      not_scheduled: 0,
      paused: 0,
      completion_ratio: 0,
    });
    expect(stats.session_count).toBe(0);
    expect(stats.balance_series).toEqual([]);
  });
});

describe('computeStreaks', () => {
  it('cuenta cumplidos y cubiertos, y devuelve la mejor racha histórica', () => {
    // Lunes a viernes: cubierto, cubierto, cumplido, fallado, fallado.
    expect(computeStreaks(buildLedger())).toEqual({ current: 0, best: 3 });
  });

  it('los días libres y pausados no rompen la racha actual', () => {
    const ledger = [
      { date: MON, scheduled: true, paused: false, status: 'completed' },
      { date: TUE, scheduled: false, paused: false, status: 'not_scheduled' },
      { date: WED, scheduled: true, paused: false, status: 'covered' },
      { date: THU, scheduled: true, paused: true, status: 'paused' },
      { date: FRI, scheduled: true, paused: false, status: 'completed' },
    ];

    expect(computeStreaks(ledger)).toEqual({ current: 3, best: 3 });
  });

  it('un día parcial o incumplido reinicia la racha actual', () => {
    const ledger = [
      { date: MON, scheduled: true, paused: false, status: 'completed' },
      { date: TUE, scheduled: true, paused: false, status: 'completed' },
      { date: WED, scheduled: true, paused: false, status: 'partial' },
      { date: THU, scheduled: true, paused: false, status: 'completed' },
    ];

    expect(computeStreaks(ledger)).toEqual({ current: 1, best: 2 });
  });

  it('un ledger vacío devuelve rachas en cero', () => {
    expect(computeStreaks([])).toEqual({ current: 0, best: 0 });
    expect(computeStreaks(undefined)).toEqual({ current: 0, best: 0 });
  });
});
