import { describe, expect, it } from 'vitest';
import { projectCoveredQuotas } from '../projection.js';
import {
  FRI,
  MON,
  NEXT_MON,
  SAT,
  SUN,
  THU,
  TUE,
  WED,
  makeActivity,
  makeSession,
  scheduleVersion,
  toSec,
} from './helpers.js';

const VERSION_BASE = '2026-01-01';

describe('projectCoveredQuotas', () => {
  it('D. con +240 cubre martes, miércoles, jueves y viernes; se detiene en sábado', () => {
    const activity = makeActivity({ start_date: MON });
    const scheduleVersions = [scheduleVersion(VERSION_BASE, 60)];
    const sessions = [makeSession(MON, 300)];

    const projection = projectCoveredQuotas({
      activity,
      scheduleVersions,
      sessions,
      today: MON,
    });

    expect(projection.covered_count).toBe(4);
    expect(projection.covered_dates).toEqual([TUE, WED, THU, FRI]);
    expect(projection.first_uncovered_date).toBe(SAT);
    expect(projection.remaining_balance_sec).toBe(0);
  });

  it('sin excedente no cubre ninguna cuota futura', () => {
    const activity = makeActivity({ start_date: MON });
    const scheduleVersions = [scheduleVersion(VERSION_BASE, 60)];

    const projection = projectCoveredQuotas({
      activity,
      scheduleVersions,
      sessions: [],
      today: MON,
    });

    expect(projection.covered_count).toBe(0);
    expect(projection.covered_dates).toEqual([]);
    expect(projection.first_uncovered_date).toBe(TUE);
    expect(projection.remaining_balance_sec).toBe(toSec(-60));
  });

  it('usa el saldo inicial y el saldo neto de hoy', () => {
    const activity = makeActivity({ start_date: MON, initial_balance_sec: toSec(120) });
    const scheduleVersions = [scheduleVersion(VERSION_BASE, 60)];

    const projection = projectCoveredQuotas({
      activity,
      scheduleVersions,
      sessions: [],
      today: MON,
    });

    // 120 - 60 (cuota de hoy) = 60: alcanza para el martes.
    expect(projection.covered_dates).toEqual([TUE]);
    expect(projection.first_uncovered_date).toBe(WED);
    expect(projection.remaining_balance_sec).toBe(0);
  });

  it('respeta los días no programados', () => {
    const activity = makeActivity({ start_date: MON, initial_balance_sec: toSec(180) });
    const scheduleVersions = [scheduleVersion(VERSION_BASE, { 0: 60, 2: 60, 4: 60 })];

    const projection = projectCoveredQuotas({
      activity,
      scheduleVersions,
      sessions: [],
      today: MON,
    });

    // Hoy lunes consume 60: quedan 120 para miércoles y viernes.
    expect(projection.covered_dates).toEqual([WED, FRI]);
    expect(projection.first_uncovered_date).toBe(NEXT_MON);
    expect(projection.remaining_balance_sec).toBe(0);
  });

  it('aplica versiones futuras del calendario', () => {
    const activity = makeActivity({ start_date: MON, initial_balance_sec: toSec(600) });
    const scheduleVersions = [
      scheduleVersion(VERSION_BASE, 60),
      scheduleVersion(NEXT_MON, 90),
    ];

    const projection = projectCoveredQuotas({
      activity,
      scheduleVersions,
      sessions: [],
      today: MON,
    });

    // Martes a domingo: 6 x 60 = 360. Luego lunes y martes a 90.
    expect(projection.covered_count).toBe(8);
    expect(projection.covered_dates).toContain(NEXT_MON);
    expect(projection.first_uncovered_date).toBe('2026-01-14');
    expect(projection.remaining_balance_sec).toBe(0);
  });

  it('salta los días pausados y sigue proyectando después de una reanudación', () => {
    const activity = makeActivity({
      start_date: MON,
      initial_balance_sec: toSec(240),
      pause_periods: [
        { paused_from: TUE, resumed_from: THU },
      ],
    });
    const scheduleVersions = [scheduleVersion(VERSION_BASE, 60)];

    const projection = projectCoveredQuotas({
      activity,
      scheduleVersions,
      sessions: [],
      today: MON,
    });

    // Hoy lunes consume 60: quedan 180 para jueves, viernes y sábado.
    expect(projection.covered_dates).toEqual([THU, FRI, SAT]);
    expect(projection.first_uncovered_date).toBe(SUN);
    expect(projection.remaining_balance_sec).toBe(0);
  });

  it('una actividad pausada no proyecta cuotas futuras', () => {
    const activity = makeActivity({
      start_date: MON,
      initial_balance_sec: toSec(240),
      status: 'paused',
      paused_from: TUE,
    });
    const scheduleVersions = [scheduleVersion(VERSION_BASE, 60)];

    const projection = projectCoveredQuotas({
      activity,
      scheduleVersions,
      sessions: [],
      today: MON,
    });

    expect(projection.covered_count).toBe(0);
    expect(projection.covered_dates).toEqual([]);
    expect(projection.first_uncovered_date).toBeNull();
    expect(projection.remaining_balance_sec).toBe(toSec(180));
  });
});
