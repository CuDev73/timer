import { describe, expect, it } from 'vitest';
import { getQuotaForDate } from '../schedule.js';
import { NEXT_MON, TUE, WED, scheduleVersion, toSec } from './helpers.js';

describe('getQuotaForDate', () => {
  it('devuelve la cuota del día de la semana según la versión vigente', () => {
    const versions = [scheduleVersion('2026-01-01', { 0: 60, 2: 30 })];

    expect(getQuotaForDate(versions, '2026-01-05')).toBe(toSec(60)); // lunes
    expect(getQuotaForDate(versions, WED)).toBe(toSec(30)); // miércoles
    expect(getQuotaForDate(versions, TUE)).toBeNull(); // martes no programado
  });

  it('elige la última versión con effective_from <= fecha', () => {
    const versions = [
      scheduleVersion('2026-01-01', 60),
      scheduleVersion('2026-01-06', 90),
      scheduleVersion(NEXT_MON, 120),
    ];

    expect(getQuotaForDate(versions, '2026-01-05')).toBe(toSec(60));
    expect(getQuotaForDate(versions, TUE)).toBe(toSec(90));
    expect(getQuotaForDate(versions, '2026-01-11')).toBe(toSec(90));
    expect(getQuotaForDate(versions, NEXT_MON)).toBe(toSec(120));
  });

  it('una versión futura no afecta a fechas anteriores', () => {
    const versions = [
      scheduleVersion('2026-01-01', 60),
      scheduleVersion('2026-02-01', 120),
    ];

    expect(getQuotaForDate(versions, '2026-01-31')).toBe(toSec(60));
    expect(getQuotaForDate(versions, '2026-02-01')).toBe(toSec(120));
  });

  it('devuelve null si no hay versión vigente, el día falta o la cuota es 0', () => {
    const versions = [scheduleVersion('2026-01-05', { 0: 60, 1: 0 })];

    expect(getQuotaForDate(versions, '2026-01-04')).toBeNull(); // antes de la primera versión
    expect(getQuotaForDate(versions, WED)).toBeNull(); // día ausente
    expect(getQuotaForDate(versions, TUE)).toBeNull(); // cuota 0 = no programado
    expect(getQuotaForDate([], '2026-01-05')).toBeNull();
  });
});
