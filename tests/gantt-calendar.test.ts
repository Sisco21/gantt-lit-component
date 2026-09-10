import { describe, expect, it } from 'vitest';
import { alignRangeToWeeks, getWeekNumber, isResourceWorkingDay, isWeekStart } from '../src/gantt-calendar';

describe('Gantt calendar helpers', () => {
  it('uses ISO-8601 week numbers across a year boundary', () => {
    expect(getWeekNumber(new Date('2025-12-29T00:00:00Z'), 1, 'iso')).toBe(1);
    expect(getWeekNumber(new Date('2026-01-04T00:00:00Z'), 1, 'iso')).toBe(1);
  });

  it('keeps the first complete Monday-to-Sunday week as week one', () => {
    expect(getWeekNumber(new Date('2026-01-04T00:00:00Z'), 1, 'first-full-week')).toBe(52);
    expect(getWeekNumber(new Date('2026-01-05T00:00:00Z'), 1, 'first-full-week')).toBe(1);
  });

  it('honours resource calendar exceptions and aligns a range to its weeks', () => {
    const calendar = { id: 'weekday', name: 'Weekdays', workingDays: [1, 2, 3, 4, 5], exceptions: { '2026-01-03': 'working' as const } };
    expect(isResourceWorkingDay({ id: 'crew', name: 'Crew' }, calendar, new Date('2026-01-03T00:00:00Z'), [0, 6])).toBe(true);
    expect(alignRangeToWeeks({ start: new Date('2026-01-07T00:00:00Z'), end: new Date('2026-01-08T00:00:00Z') }, 1)).toEqual({ start: new Date('2026-01-05T00:00:00Z'), end: new Date('2026-01-11T00:00:00Z') });
    expect(isWeekStart(new Date('2026-01-05T00:00:00Z'), 1)).toBe(true);
  });
});
