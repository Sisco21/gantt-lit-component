import type { GanttProjectSummary, GanttTask } from './types';
import { getResourceCost, getResourceTotalQuantity, roundResourceQuantity } from './gantt-resources';
import { diffDays, parseDateOnly } from './utils';

export interface GanttSummaryOptions {
  referenceDate: string;
  isWorkingDay: (date: Date) => boolean;
}

/** Calculates the project-level metrics emitted through `gantt-summary-changed`. */
export function calculateProjectSummary(tasks: GanttTask[], { referenceDate, isWorkingDay }: GanttSummaryOptions): GanttProjectSummary {
  if (!tasks.length) {
    return {
      start: null, end: null, durationDays: 0, workingDurationDays: 0, referenceDate,
      taskCount: 0, phaseCount: 0, milestoneCount: 0, progress: 0, overdueTaskCount: 0, nextDueDate: null,
      totalCost: 0, plannedCost: 0, actualCost: 0, costVariance: 0, resourceCount: 0, totalResourceQuantity: 0, totalResourceCapacity: 0,
    };
  }

  const resources = new Set<string>();
  const resourceCapacities = new Map<string, number>();
  let totalCost = 0;
  let plannedCost = 0;
  let actualCost = 0;
  let totalResourceQuantity = 0;
  let taskCount = 0;
  let phaseCount = 0;
  let milestoneCount = 0;
  let progressWeight = 0;
  let weightedProgress = 0;
  let overdueTaskCount = 0;
  let nextDueDate: string | null = null;
  let start = tasks[0].start;
  let end = tasks[0].end;

  for (const task of tasks) {
    if (task.start < start) start = task.start;
    if (task.end > end) end = task.end;
    const resourceCost = (task.resources || []).reduce((sum, resource) => {
      const resourceKey = resource.resourceId || `${task.id}:${resource.id}`;
      resources.add(resourceKey);
      totalResourceQuantity += getResourceTotalQuantity(resource);
      resourceCapacities.set(resourceKey, Math.max(resourceCapacities.get(resourceKey) || 0, Number(resource.maxUnits) || 0));
      return sum + getResourceCost(resource);
    }, 0);
    const ownCost = resourceCost || Number(task.unitCost || task.metadata?.unitCost || 0) * Number(task.quantity || task.metadata?.quantity || 0);
    totalCost += ownCost;
    plannedCost += Number(task.plannedCost ?? task.metadata?.plannedCost ?? ownCost) || 0;
    actualCost += Number(task.actualCost ?? task.metadata?.actualCost ?? 0) || 0;

    if (task.type === 'parent') {
      phaseCount += 1;
      continue;
    }
    if (task.type === 'milestone') milestoneCount += 1;
    else taskCount += 1;
    const duration = Math.max(1, diffDays(task.start, task.end) + 1);
    progressWeight += duration;
    weightedProgress += duration * Math.max(0, Math.min(100, Number(task.progress) || 0));
    if ((Number(task.progress) || 0) < 100) {
      if (task.end < referenceDate) overdueTaskCount += 1;
      else if (!nextDueDate || task.end < nextDueDate) nextDueDate = task.end;
    }
  }

  let workingDurationDays = 0;
  const date = parseDateOnly(start);
  const lastDate = parseDateOnly(end);
  while (date <= lastDate) {
    if (isWorkingDay(date)) workingDurationDays += 1;
    date.setUTCDate(date.getUTCDate() + 1);
  }
  const roundedPlannedCost = roundResourceQuantity(plannedCost);
  const roundedActualCost = roundResourceQuantity(actualCost);
  return {
    start, end, durationDays: Math.max(0, diffDays(start, end) + 1), workingDurationDays, referenceDate,
    taskCount, phaseCount, milestoneCount, progress: roundResourceQuantity(progressWeight ? weightedProgress / progressWeight : 0), overdueTaskCount, nextDueDate,
    totalCost: roundResourceQuantity(totalCost), plannedCost: roundedPlannedCost, actualCost: roundedActualCost, costVariance: roundResourceQuantity(roundedActualCost - roundedPlannedCost),
    resourceCount: resources.size, totalResourceQuantity: roundResourceQuantity(totalResourceQuantity), totalResourceCapacity: roundResourceQuantity([...resourceCapacities.values()].reduce((sum, capacity) => sum + capacity, 0)),
  };
}
