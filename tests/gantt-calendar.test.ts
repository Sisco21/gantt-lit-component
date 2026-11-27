import { describe, expect, it } from 'vitest';
import { alignRangeToWeeks, getCalendarDayState, getWeekNumber, isResourceWorkingDay, isWeekStart } from '../src/gantt-calendar';

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

  it('resolves labels and working overrides without changing the weekly rule', () => {
    const calendar = {
      id: 'budget',
      name: 'Budget',
      workingDays: [1, 2, 3, 4, 5],
      exceptions: { '2026-07-14': 'non-working' as const, '2026-07-18': 'working' as const },
      exceptionLabels: { '2026-07-14': 'Fête nationale' },
    };
    expect(getCalendarDayState(calendar, new Date('2026-07-14T00:00:00Z'), [0, 6])).toMatchObject({ working: false, exception: 'non-working', label: 'Fête nationale' });
    expect(getCalendarDayState(calendar, new Date('2026-07-18T00:00:00Z'), [0, 6])).toMatchObject({ working: true, exception: 'working' });
  });
});
