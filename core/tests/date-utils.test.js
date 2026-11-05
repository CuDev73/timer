import { describe, expect, it } from 'vitest';
import { addDays, compareDates, getWeekday, listDates } from '../date-utils.js';

describe('utilidades de fecha', () => {
  it('suma y resta días cruzando meses y años', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('usa lunes = 0 y domingo = 6', () => {
    expect(getWeekday('2026-01-05')).toBe(0);
    expect(getWeekday('2026-01-11')).toBe(6);
  });

  it('lista fechas inclusivas y devuelve vacío si el rango está invertido', () => {
    expect(listDates('2026-01-05', '2026-01-07')).toEqual([
      '2026-01-05',
      '2026-01-06',
      '2026-01-07',
    ]);
    expect(listDates('2026-01-07', '2026-01-05')).toEqual([]);
  });

  it('compara fechas YYYY-MM-DD', () => {
    expect(compareDates('2026-01-05', '2026-01-06')).toBeLessThan(0);
    expect(compareDates('2026-01-06', '2026-01-06')).toBe(0);
    expect(compareDates('2026-01-07', '2026-01-06')).toBeGreaterThan(0);
  });
});
