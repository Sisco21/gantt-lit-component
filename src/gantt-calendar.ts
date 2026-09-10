import type { GanttCalendar, GanttResource } from './types';
import { diffDays, formatDate } from './utils';

export interface GanttDateHeaderLabels {
  weekday: string;
  weekdayNarrow: string;
  title: string;
}

/** Caches locale-aware labels used repeatedly by the timeline headers. */
export class GanttDateFormatterCache {
  private locale = '';
  private formatters?: {
    month: Intl.DateTimeFormat;
    weekday: Intl.DateTimeFormat;
    weekdayNarrow: Intl.DateTimeFormat;
    title: Intl.DateTimeFormat;
  };
  private readonly labels = new Map<string, GanttDateHeaderLabels>();

  formatMonth(date: Date, locale: string): string {
    return this.getFormatters(locale).month.format(date);
  }

  formatHeaderLabels(date: Date, locale: string): GanttDateHeaderLabels {
    const key = `${locale}:${formatDate(date)}`;
    const cached = this.labels.get(key);
    if (cached) return cached;
    const formatters = this.getFormatters(locale);
    const result = {
      weekday: formatters.weekday.format(date),
      weekdayNarrow: formatters.weekdayNarrow.format(date),
      title: formatters.title.format(date),
    };
    this.labels.set(key, result);
    return result;
  }

  private getFormatters(locale: string): NonNullable<GanttDateFormatterCache['formatters']> {
    if (!this.formatters || this.locale !== locale) {
      this.locale = locale;
      this.labels.clear();
      this.formatters = {
        month: new Intl.DateTimeFormat(locale, { month: 'short', year: 'numeric', timeZone: 'UTC' }),
        weekday: new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' }),
        weekdayNarrow: new Intl.DateTimeFormat(locale, { weekday: 'narrow', timeZone: 'UTC' }),
        title: new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }),
      };
    }
    return this.formatters;
  }
}

export function normalizeFirstDayOfWeek(value: number | undefined): number {
  return Number.isInteger(value) && value! >= 0 && value! <= 6 ? value! : 1;
}

export function getWeekStartDate(date: Date, firstDayOfWeek: number): Date {
  const start = new Date(date.getTime());
  start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() - firstDayOfWeek + 7) % 7));
  return start;
}

export function isWeekStart(date: Date, firstDayOfWeek: number): boolean {
  return date.getUTCDay() === firstDayOfWeek;
}

export function getIsoWeekNumber(date: Date): number {
  const thursday = new Date(date.getTime());
  thursday.setUTCDate(thursday.getUTCDate() + 4 - (thursday.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1));
  return Math.ceil((diffDays(yearStart, thursday) + 1) / 7);
}

export function getWeekNumber(date: Date, firstDayOfWeek: number, numbering: 'iso' | 'first-full-week' | undefined): number {
  if (numbering === 'iso') return getIsoWeekNumber(date);
  const firstFullWeek = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  firstFullWeek.setUTCDate(firstFullWeek.getUTCDate() + ((firstDayOfWeek - firstFullWeek.getUTCDay() + 7) % 7));
  if (date < firstFullWeek) return getWeekNumber(new Date(Date.UTC(date.getUTCFullYear() - 1, 11, 31)), firstDayOfWeek, numbering);
  return Math.floor(diffDays(firstFullWeek, date) / 7) + 1;
}

export function alignRangeToWeeks(range: { start: Date; end: Date }, firstDayOfWeek: number): { start: Date; end: Date } {
  const start = getWeekStartDate(range.start, firstDayOfWeek);
  const end = new Date(range.end.getTime());
  end.setUTCDate(end.getUTCDate() + ((firstDayOfWeek + 6 - end.getUTCDay() + 7) % 7));
  return { start, end };
}

export function isNonWorkingDay(date: Date, nonWorkingDays: number[]): boolean {
  return nonWorkingDays.includes(date.getUTCDay());
}

export function isNonWorkingBlockStart(date: Date, nonWorkingDays: number[]): boolean {
  if (!isNonWorkingDay(date, nonWorkingDays)) return false;
  const previous = new Date(date.getTime());
  previous.setUTCDate(previous.getUTCDate() - 1);
  return !isNonWorkingDay(previous, nonWorkingDays);
}

export function isResourceWorkingDay(resource: GanttResource, calendar: GanttCalendar | undefined, date: Date, nonWorkingDays: number[]): boolean {
  const exception = calendar?.exceptions?.[formatDate(date)];
  if (exception === 'working') return true;
  if (exception === 'non-working') return false;
  return calendar?.workingDays ? calendar.workingDays.includes(date.getUTCDay()) : !isNonWorkingDay(date, nonWorkingDays);
}
