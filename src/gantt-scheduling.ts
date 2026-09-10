import type { GanttDependency, GanttResource, GanttTask } from './types';
import { distributeResourceQuantity, getResourceTotalQuantity } from './gantt-resources';
import { diffDays, formatDate, parseDateOnly } from './utils';

export type ScheduleUpdateMode = 'move' | 'resize-start' | 'resize-end';
export type ResourceWorkingDay = (resource: GanttResource, date: Date) => boolean;

function addDays(value: string, days: number): string {
  const date = parseDateOnly(value);
  date.setUTCDate(date.getUTCDate() + days);
  return formatDate(date);
}

function shiftResourceDates(task: GanttTask, days: number): void {
  if (!days || !task.resources?.length) return;
  task.resources = task.resources.map(resource => {
    if (!resource.quantityByDate) return resource;
    const quantityByDate = Object.entries(resource.quantityByDate).reduce<Record<string, number>>((shifted, [date, quantity]) => {
      shifted[addDays(date, days)] = quantity;
      return shifted;
    }, {});
    return { ...resource, quantityByDate, totalQuantity: undefined, cost: undefined };
  });
}

function redistributeResourceDates(task: GanttTask, isWorkingDay: ResourceWorkingDay): void {
  if (!task.resources?.length) return;
  task.resources = task.resources.map(resource => {
    if (!resource.quantityByDate) return resource;
    const total = getResourceTotalQuantity(resource);
    return {
      ...resource,
      quantity: total,
      quantityByDate: distributeResourceQuantity(task.start, task.end, total, resource, isWorkingDay),
      totalQuantity: undefined,
      cost: undefined,
    };
  });
}

function createTaskIndexes(tasks: GanttTask[], dependencies: GanttDependency[]) {
  const byId = new Map(tasks.map(task => [task.id, task]));
  const childrenByParent = new Map<string, string[]>();
  const outgoingBySource = new Map<string, GanttDependency[]>();
  tasks.forEach(task => {
    if (!task.parentId) return;
    const children = childrenByParent.get(task.parentId) || [];
    children.push(task.id);
    childrenByParent.set(task.parentId, children);
  });
  dependencies.forEach(dependency => {
    const outgoing = outgoingBySource.get(dependency.from) || [];
    outgoing.push(dependency);
    outgoingBySource.set(dependency.from, outgoing);
  });
  return { byId, childrenByParent, outgoingBySource };
}

function requiredSuccessorShift(source: GanttTask, successor: GanttTask, dependency: GanttDependency): number {
  const lag = dependency.lagDays || 0;
  let requiredStart = successor.start;
  let requiredEnd = successor.end;
  switch (dependency.type || 'finish-to-start') {
    case 'start-to-start': requiredStart = addDays(source.start, lag); break;
    case 'finish-to-finish': requiredEnd = addDays(source.end, lag); break;
    case 'start-to-finish': requiredEnd = addDays(source.start, lag); break;
    default: requiredStart = addDays(source.end, lag + 1); break;
  }
  return dependency.type === 'finish-to-finish' || dependency.type === 'start-to-finish'
    ? diffDays(successor.end, requiredEnd)
    : diffDays(successor.start, requiredStart);
}

/** Applies an interactive task move/resize and propagates every impacted successor. */
export function scheduleTaskDates(
  baseTasks: GanttTask[],
  dependencies: GanttDependency[],
  taskId: string,
  requestedStart: string,
  requestedEnd: string,
  mode: ScheduleUpdateMode,
  isWorkingDay: ResourceWorkingDay,
): GanttTask[] {
  const next = baseTasks.map(task => ({ ...task }));
  const { byId, childrenByParent, outgoingBySource } = createTaskIndexes(next, dependencies);
  const root = byId.get(taskId);
  if (!root) return next;

  const shiftSubtree = (rootId: string, days: number): void => {
    const task = byId.get(rootId);
    if (!task) return;
    task.start = addDays(task.start, days);
    task.end = addDays(task.end, days);
    shiftResourceDates(task, days);
    childrenByParent.get(rootId)?.forEach(childId => shiftSubtree(childId, days));
  };

  if (mode === 'move') shiftSubtree(taskId, diffDays(root.start, requestedStart));
  else {
    root.start = requestedStart;
    root.end = requestedEnd;
    redistributeResourceDates(root, isWorkingDay);
  }

  const visited = new Set<string>();
  const propagate = (sourceId: string): void => {
    if (visited.has(sourceId)) return;
    visited.add(sourceId);
    const source = byId.get(sourceId);
    if (!source) return;
    for (const dependency of outgoingBySource.get(sourceId) || []) {
      const successor = byId.get(dependency.to);
      if (!successor) continue;
      const shift = requiredSuccessorShift(source, successor, dependency);
      if (shift > 0) shiftSubtree(successor.id, shift);
      propagate(successor.id);
    }
  };
  propagate(taskId);
  return next;
}

/** Schedules a dependency graph once in topological order for initial project loading. */
export function scheduleInitialDependencies(tasks: GanttTask[], dependencies: GanttDependency[]): GanttTask[] {
  if (!dependencies.length) return tasks;
  const scheduled = tasks.map(task => ({ ...task }));
  const { byId, childrenByParent, outgoingBySource } = createTaskIndexes(scheduled, dependencies);
  const incomingCount = new Map<string, number>();
  const dependencyTaskIds = new Set<string>();

  dependencies.forEach(dependency => {
    if (!byId.has(dependency.from) || !byId.has(dependency.to)) return;
    incomingCount.set(dependency.to, (incomingCount.get(dependency.to) || 0) + 1);
    dependencyTaskIds.add(dependency.from);
    dependencyTaskIds.add(dependency.to);
  });

  const shiftSubtree = (taskId: string, days: number): void => {
    const task = byId.get(taskId);
    if (!task || !days) return;
    task.start = addDays(task.start, days);
    task.end = addDays(task.end, days);
    shiftResourceDates(task, days);
    childrenByParent.get(taskId)?.forEach(childId => shiftSubtree(childId, days));
  };

  const ready = [...dependencyTaskIds].filter(taskId => !incomingCount.get(taskId));
  while (ready.length) {
    const sourceId = ready.shift()!;
    const source = byId.get(sourceId);
    if (!source) continue;
    for (const dependency of outgoingBySource.get(sourceId) || []) {
      const successor = byId.get(dependency.to);
      if (!successor) continue;
      const shift = requiredSuccessorShift(source, successor, dependency);
      if (shift > 0) shiftSubtree(successor.id, shift);
      const remaining = (incomingCount.get(successor.id) || 0) - 1;
      incomingCount.set(successor.id, remaining);
      if (remaining === 0) ready.push(successor.id);
    }
  }
  return scheduled;
}
