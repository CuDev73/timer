import { describe, expect, it } from 'vitest';
import { closeDays, getTodayTarget } from '../ledger.js';
import { getQuotaForDate } from '../schedule.js';
import {
  FRI,
  MON,
  NEXT_MON,
  THU,
  TUE,
  WED,
  makeActivity,
  makeSession,
  scheduleVersion,
  toSec,
} from './helpers.js';

const VERSION_BASE = '2026-01-01';

describe('closeDays y getTodayTarget: casos de la Etapa 0', () => {
  it('A. incumplimiento: 40 de 60 el lunes deja saldo -20 y el martes pide 80', () => {
    const activity = makeActivity({ start_date: MON });
    const scheduleVersions = [scheduleVersion(VERSION_BASE, 60)];
    const sessions = [makeSession(MON, 40)];

    const { ledger, balance_sec } = closeDays({
      activity,
      scheduleVersions,
      sessions,
      today: TUE,
    });

    expect(balance_sec).toBe(toSec(-20));
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({
      date: MON,
      scheduled: true,
      quota_sec: toSec(60),
      balance_before_sec: 0,
      target_sec: toSec(60),
      worked_sec: toSec(40),
      covered_sec: 0,
      balance_after_sec: toSec(-20),
      status: 'partial',
      session_count: 1,
    });

    const today = getTodayTarget({ activity, scheduleVersions, sessions, today: TUE });

    expect(today).toMatchObject({
      date: TUE,
      scheduled: true,
      quota_sec: toSec(60),
      balance_before_sec: toSec(-20),
      target_sec: toSec(80),
      worked_sec: 0,
      status: 'pending',
      remaining_sec: toSec(80),
    });
  });

  it('B. exacto: 60 de 60 el lunes deja saldo 0 y el martes pide 60', () => {
    const activity = makeActivity({ start_date: MON });
    const scheduleVersions = [scheduleVersion(VERSION_BASE, 60)];
    const sessions = [makeSession(MON, 60)];

    const { ledger, balance_sec } = closeDays({
      activity,
      scheduleVersions,
      sessions,
      today: TUE,
    });

    expect(balance_sec).toBe(0);
    expect(ledger[0]).toMatchObject({
      target_sec: toSec(60),
      worked_sec: toSec(60),
      balance_after_sec: 0,
      status: 'completed',
    });

    const today = getTodayTarget({ activity, scheduleVersions, sessions, today: TUE });
    expect(today.target_sec).toBe(toSec(60));
    expect(today.status).toBe('pending');
  });

  it('C. extra: 90 de 60 el lunes deja saldo +30 y el martes pide 30', () => {
    const activity = makeActivity({ start_date: MON });
    const scheduleVersions = [scheduleVersion(VERSION_BASE, 60)];
    const sessions = [makeSession(MON, 90)];

    const { ledger, balance_sec } = closeDays({
      activity,
      scheduleVersions,
      sessions,
      today: TUE,
    });

    expect(balance_sec).toBe(toSec(30));
    expect(ledger[0]).toMatchObject({
      target_sec: toSec(60),
      worked_sec: toSec(90),
      balance_after_sec: toSec(30),
      status: 'completed',
    });

    const today = getTodayTarget({ activity, scheduleVersions, sessions, today: TUE });
    expect(today.target_sec).toBe(toSec(30));
  });

  it('D. compensación: 300 el lunes cubren las cuatro cuotas siguientes', () => {
    const activity = makeActivity({ start_date: MON });
    const scheduleVersions = [scheduleVersion(VERSION_BASE, 60)];
    const sessions = [makeSession(MON, 300)];

    // Hoy es lunes: aún no hay días cerrados.
    const { ledger, balance_sec } = closeDays({
      activity,
      scheduleVersions,
      sessions,
      today: MON,
    });
    expect(ledger).toEqual([]);
    expect(balance_sec).toBe(0);

    // El lunes trabaja 300: al cerrar el día el saldo sería 300 - 60 = +240.
    const today = getTodayTarget({ activity, scheduleVersions, sessions, today: MON });
    expect(today).toMatchObject({
      target_sec: toSec(60),
      worked_sec: toSec(300),
      status: 'completed',
      balance_after_sec: toSec(240),
    });
  });

  it('E. días sin actividad en medio: el saldo se mantiene y se arrastra', () => {
    const activity = makeActivity({ start_date: MON });
    const scheduleVersions = [
      scheduleVersion(VERSION_BASE, { 0: 60, 1: 90, 3: 30, 4: 60 }),
    ];
    const sessions = [makeSession(MON, 100), makeSession(TUE, 20)];

    const { ledger, balance_sec } = closeDays({
      activity,
      scheduleVersions,
      sessions,
      today: THU,
    });

    expect(balance_sec).toBe(toSec(-30));
    expect(ledger).toHaveLength(3);

    expect(ledger[0]).toMatchObject({
      date: MON,
      quota_sec: toSec(60),
      target_sec: toSec(60),
      worked_sec: toSec(100),
      balance_after_sec: toSec(40),
      status: 'completed',
    });

    expect(ledger[1]).toMatchObject({
      date: TUE,
      quota_sec: toSec(90),
      balance_before_sec: toSec(40),
      target_sec: toSec(50),
      worked_sec: toSec(20),
      covered_sec: toSec(40),
      balance_after_sec: toSec(-30),
      status: 'partial',
    });

    // El miércoles no está programado: no hay cuota ni consumo de saldo.
    expect(ledger[2]).toMatchObject({
      date: WED,
      scheduled: false,
      quota_sec: 0,
      target_sec: 0,
      worked_sec: 0,
      balance_after_sec: toSec(-30),
      status: 'not_scheduled',
    });
    expect(getQuotaForDate(scheduleVersions, WED)).toBeNull();

    const today = getTodayTarget({ activity, scheduleVersions, sessions, today: THU });
    expect(today).toMatchObject({
      quota_sec: toSec(30),
      balance_before_sec: toSec(-30),
      target_sec: toSec(60),
      status: 'pending',
    });
  });

  it('F. trabajo en día cubierto: S=+120, q=60, trabaja 20 -> S=+80', () => {
    const activity = makeActivity({ start_date: MON, initial_balance_sec: toSec(120) });
    const scheduleVersions = [scheduleVersion(VERSION_BASE, 60)];
    const sessions = [makeSession(MON, 20)];

    const today = getTodayTarget({ activity, scheduleVersions, sessions, today: MON });

    expect(today).toMatchObject({
      quota_sec: toSec(60),
      balance_before_sec: toSec(120),
      target_sec: 0,
      covered_sec: toSec(60),
      worked_sec: toSec(20),
      balance_after_sec: toSec(80),
      status: 'covered',
      remaining_sec: 0,
      progress: 1,
    });
  });

  it('G. cambio de cuota: S=+100 y mañana la cuota pasa de 60 a 90 -> S=+10', () => {
    const activity = makeActivity({ start_date: MON, initial_balance_sec: toSec(100) });
    const scheduleVersions = [
      scheduleVersion(VERSION_BASE, 60),
      scheduleVersion(TUE, 90), // nueva versión vigente desde el martes
    ];
    // El lunes trabaja justo su cuota: el saldo sigue en +100 al empezar el martes.
    const sessions = [makeSession(MON, 60)];

    const { ledger, balance_sec } = closeDays({
      activity,
      scheduleVersions,
      sessions,
      today: TUE,
    });

    // El lunes pasado conserva la cuota antigua.
    expect(balance_sec).toBe(toSec(100));
    expect(ledger[0]).toMatchObject({
      date: MON,
      quota_sec: toSec(60),
      target_sec: 0,
      worked_sec: toSec(60),
      balance_after_sec: toSec(100),
      status: 'covered',
    });
    expect(getQuotaForDate(scheduleVersions, MON)).toBe(toSec(60));

    const today = getTodayTarget({
      activity,
      scheduleVersions,
      sessions,
      today: TUE,
    });

    expect(today).toMatchObject({
      quota_sec: toSec(90),
      target_sec: 0,
      balance_after_sec: toSec(10),
      status: 'covered',
    });
  });
});

describe('closeDays y getTodayTarget: casos extra', () => {
  it('una actividad pausada no genera cuotas y congela el saldo', () => {
    const activity = makeActivity({
      start_date: MON,
      status: 'paused',
      paused_from: WED,
    });
    const scheduleVersions = [scheduleVersion(VERSION_BASE, 60)];

    const { ledger, balance_sec } = closeDays({
      activity,
      scheduleVersions,
      sessions: [],
      today: FRI,
    });

    expect(balance_sec).toBe(toSec(-120));
    expect(ledger).toHaveLength(4);

    // Lunes y martes todavía generan deuda.
    expect(ledger[0]).toMatchObject({ date: MON, status: 'missed', balance_after_sec: toSec(-60) });
    expect(ledger[1]).toMatchObject({ date: TUE, status: 'missed', balance_after_sec: toSec(-120) });

    // Miércoles y jueves quedan congelados.
    expect(ledger[2]).toMatchObject({
      date: WED,
      scheduled: false,
      status: 'paused',
      quota_sec: 0,
      balance_after_sec: toSec(-120),
    });
    expect(ledger[3]).toMatchObject({
      date: THU,
      status: 'paused',
      balance_after_sec: toSec(-120),
    });

    const today = getTodayTarget({ activity, scheduleVersions, sessions: [], today: FRI });
    expect(today).toMatchObject({
      date: FRI,
      scheduled: false,
      status: 'paused',
      target_sec: 0,
      balance_before_sec: toSec(-120),
      balance_after_sec: toSec(-120),
    });
  });

  it('soporta varios periodos de pausa y reanuda las cuotas después', () => {
    const activity = makeActivity({
      start_date: MON,
      pause_periods: [
        { paused_from: TUE, resumed_from: THU },
      ],
    });
    const scheduleVersions = [scheduleVersion(VERSION_BASE, 60)];

    const { ledger, balance_sec } = closeDays({
      activity,
      scheduleVersions,
      sessions: [],
      today: FRI,
    });

    expect(balance_sec).toBe(toSec(-120));
    expect(ledger).toHaveLength(4);

    expect(ledger[0]).toMatchObject({ date: MON, status: 'missed', balance_after_sec: toSec(-60) });
    expect(ledger[1]).toMatchObject({ date: TUE, status: 'paused', balance_after_sec: toSec(-60) });
    expect(ledger[2]).toMatchObject({ date: WED, status: 'paused', balance_after_sec: toSec(-60) });
    expect(ledger[3]).toMatchObject({
      date: THU,
      status: 'missed',
      target_sec: toSec(120),
      balance_after_sec: toSec(-120),
    });

    const today = getTodayTarget({ activity, scheduleVersions, sessions: [], today: FRI });
    expect(today).toMatchObject({
      date: FRI,
      status: 'pending',
      target_sec: toSec(180),
      balance_before_sec: toSec(-120),
    });
  });

  it('el trabajo en un día no programado suma a favor', () => {
    const activity = makeActivity({ start_date: MON });
    const scheduleVersions = [scheduleVersion(VERSION_BASE, { 0: 60 })]; // solo lunes
    const sessions = [makeSession(TUE, 100)];

    const { ledger, balance_sec } = closeDays({
      activity,
      scheduleVersions,
      sessions,
      today: WED,
    });

    expect(balance_sec).toBe(toSec(40));
    expect(ledger[0]).toMatchObject({ date: MON, status: 'missed', balance_after_sec: toSec(-60) });
    expect(ledger[1]).toMatchObject({
      date: TUE,
      scheduled: false,
      quota_sec: 0,
      target_sec: 0,
      worked_sec: toSec(100),
      balance_after_sec: toSec(40),
      status: 'not_scheduled',
    });

    const today = getTodayTarget({ activity, scheduleVersions, sessions, today: WED });
    expect(today).toMatchObject({
      scheduled: false,
      status: 'not_scheduled',
      target_sec: 0,
      balance_before_sec: toSec(40),
      balance_after_sec: toSec(40),
    });
  });

  it('solo cuentan las sesiones terminadas de esta actividad', () => {
    const activity = makeActivity({ start_date: MON });
    const scheduleVersions = [scheduleVersion(VERSION_BASE, 60)];
    const sessions = [
      makeSession(MON, 40),
      makeSession(MON, 100, { state: 'running' }),
      makeSession(MON, 100, { state: 'needs_review' }),
      makeSession(MON, 100, { activity_id: 'otra-actividad' }),
      makeSession(TUE, 30), // hoy: no entra en el libro cerrado, sí en el objetivo de hoy
    ];

    const { ledger, balance_sec } = closeDays({
      activity,
      scheduleVersions,
      sessions,
      today: TUE,
    });

    expect(balance_sec).toBe(toSec(-20));
    expect(ledger[0]).toMatchObject({
      worked_sec: toSec(40),
      session_count: 1,
      balance_after_sec: toSec(-20),
    });

    const today = getTodayTarget({ activity, scheduleVersions, sessions, today: TUE });
    expect(today).toMatchObject({
      worked_sec: toSec(30),
      target_sec: toSec(80),
      remaining_sec: toSec(50),
      status: 'in_progress',
      balance_after_sec: toSec(-50),
    });
    expect(today.progress).toBeCloseTo(30 / 80);
  });

  it('marca missed cuando un día cerrado no tuvo trabajo ni excedente', () => {
    const activity = makeActivity({ start_date: MON });
    const scheduleVersions = [scheduleVersion(VERSION_BASE, 60)];

    const { ledger } = closeDays({
      activity,
      scheduleVersions,
      sessions: [],
      today: TUE,
    });

    expect(ledger[0]).toMatchObject({
      date: MON,
      target_sec: toSec(60),
      worked_sec: 0,
      status: 'missed',
      balance_after_sec: toSec(-60),
    });
  });

  it('si hoy es anterior al inicio, no hay libro y se conserva el saldo inicial', () => {
    const activity = makeActivity({ start_date: NEXT_MON, initial_balance_sec: toSec(15) });
    const scheduleVersions = [scheduleVersion(VERSION_BASE, 60)];

    const { ledger, balance_sec } = closeDays({
      activity,
      scheduleVersions,
      sessions: [],
      today: MON,
    });

    expect(ledger).toEqual([]);
    expect(balance_sec).toBe(toSec(15));
  });
});
