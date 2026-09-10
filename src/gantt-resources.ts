import type { GanttResource } from './types';
import { diffDays, formatDate, parseDateOnly } from './utils';

/** Normalises resource quantities and costs to two decimals. */
export function roundResourceQuantity(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function getResourceTotalQuantity(resource: GanttResource): number {
  const daily = resource.quantityByDate;
  if (daily && Object.keys(daily).length) {
    return roundResourceQuantity(Object.values(daily).reduce((total, value) => total + (Number(value) || 0), 0));
  }
  return roundResourceQuantity(Number(resource.totalQuantity ?? resource.quantity) || 0);
}

export function getResourceCost(resource: GanttResource): number {
  return roundResourceQuantity(getResourceTotalQuantity(resource) * (Number(resource.unitCost) || 0));
}

/** Distributes a total over each working day, assigning any rounding remainder to the last day. */
export function distributeResourceQuantity(
  start: string,
  end: string,
  requestedTotal: number,
  resource?: GanttResource,
  isWorkingDay: (resource: GanttResource, date: Date) => boolean = () => true,
): Record<string, number> | undefined {
  const total = Number.isFinite(requestedTotal) && requestedTotal > 0 ? roundResourceQuantity(requestedTotal) : 0;
  if (!total) return undefined;
  const dates = Array.from({ length: Math.max(1, diffDays(start, end) + 1) }, (_, index) => {
    const date = parseDateOnly(start);
    date.setUTCDate(date.getUTCDate() + index);
    return { key: formatDate(date), date };
  });
  const workingDates = resource ? dates.filter(({ date }) => isWorkingDay(resource, date)) : dates;
  if (!workingDates.length) return undefined;
  const amountPerDay = roundResourceQuantity(total / workingDates.length);
  const quantities: Record<string, number> = {};
  let allocated = 0;
  workingDates.forEach(({ key }, index) => {
    const value = index === workingDates.length - 1 ? roundResourceQuantity(total - allocated) : amountPerDay;
    if (value > 0) quantities[key] = value;
    allocated = roundResourceQuantity(allocated + value);
  });
  return quantities;
}
