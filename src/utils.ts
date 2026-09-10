import { GanttDependency, GanttTask } from './types';

const DAY_MS = 24 * 60 * 60 * 1000;

export function parseDateOnly(value: string | Date): Date {
  if (value instanceof Date) {
    return new Date(Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()));
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (match) {
    return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error(`Invalid date: ${value}`);
  return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));
}

export function formatDate(value: Date | string): string {
  return parseDateOnly(value).toISOString().slice(0, 10);
}

export function addDays(value: Date | string, days: number): string {
  const date = parseDateOnly(value);
  date.setUTCDate(date.getUTCDate() + days);
  return formatDate(date);
}

export function diffDays(start: Date | string, end: Date | string): number {
  return Math.round((parseDateOnly(end).getTime() - parseDateOnly(start).getTime()) / DAY_MS);
}

export function buildTaskTree(tasks: GanttTask[]): GanttTask[] {
  const byId = new Map<string, GanttTask>();
  const childrenByParent = new Map<string, GanttTask[]>();

  for (const source of tasks) {
    const task: GanttTask = {
      ...source,
      progress: clampProgress(source.progress),
      parentId: source.parentId || null,
      children: [],
    };
    byId.set(task.id, task);
  }

  for (const task of byId.values()) {
    if (!task.parentId || !byId.has(task.parentId)) continue;
    const children = childrenByParent.get(task.parentId) || [];
    children.push(task);
    childrenByParent.set(task.parentId, children);
  }

  const visiting = new Set<string>();
  const built = new Set<string>();
  const build = (task: GanttTask): GanttTask => {
    if (visiting.has(task.id)) throw new Error(`Hierarchy cycle detected around ${task.id}`);
    if (built.has(task.id)) return task;
    visiting.add(task.id);
    const children = (childrenByParent.get(task.id) || []).map(build);
    visiting.delete(task.id);
    if (!children.length) {
      const leaf = { ...task, children, collapsed: Boolean(task.collapsed) };
      built.add(task.id);
      return leaf;
    }

    const childStarts = children.map(child => child.start).sort();
    const childEnds = children.map(child => child.end).sort();
    const branch = {
      ...task,
      start: childStarts[0] || task.start,
      end: childEnds[childEnds.length - 1] || task.end,
      children,
      collapsed: Boolean(task.collapsed),
    };
    built.add(task.id);
    return branch;
  };

  const tree = [...byId.values()]
    .filter(task => !task.parentId || !byId.has(task.parentId))
    .map(build);
  // A circular branch has no root and would otherwise be silently omitted.
  for (const task of byId.values()) if (!built.has(task.id)) build(task);
  return tree;
}

export function flattenTasks(tasks: GanttTask[]): GanttTask[] {
  const result: GanttTask[] = [];
  const visit = (task: GanttTask) => {
    const { children: _children, collapsed: _collapsed, ...flat } = task;
    result.push({ ...flat });
    task.children?.forEach(visit);
  };
  tasks.forEach(visit);
  return result;
}

export function getVisibleTasks(tasks: GanttTask[]): GanttTask[] {
  const result: GanttTask[] = [];
  const visit = (task: GanttTask) => {
    result.push(task);
    if (!task.collapsed) task.children?.forEach(visit);
  };
  tasks.forEach(visit);
  return result;
}

export function getTaskDependencies(
  taskId: string,
  dependencies: GanttDependency[],
): { incoming: GanttDependency[]; outgoing: GanttDependency[] } {
  return {
    incoming: dependencies.filter(dependency => dependency.to === taskId),
    outgoing: dependencies.filter(dependency => dependency.from === taskId),
  };
}

export function getDateRange(tasks: GanttTask[]): { start: Date; end: Date } {
  if (!tasks.length) {
    const today = parseDateOnly(new Date());
    return { start: today, end: parseDateOnly(addDays(today, 30)) };
  }

  let minDate = Number.POSITIVE_INFINITY;
  let maxDate = Number.NEGATIVE_INFINITY;
  for (const task of tasks) {
    minDate = Math.min(minDate, parseDateOnly(task.start).getTime());
    maxDate = Math.max(maxDate, parseDateOnly(task.end).getTime());
  }

  return {
    start: new Date(minDate - 7 * DAY_MS),
    end: new Date(maxDate + 7 * DAY_MS),
  };
}

export function clampProgress(value: number | undefined): number {
  return Math.max(0, Math.min(100, Number.isFinite(value) ? Number(value) : 0));
}

export function getMonthLabel(date: Date, locale = 'en-US'): string {
  return date.toLocaleDateString(locale, { month: 'short', year: 'numeric', timeZone: 'UTC' });
}

export function getDayLabel(date: Date, locale = 'en-US'): string {
  return date.toLocaleDateString(locale, { day: '2-digit', month: '2-digit', timeZone: 'UTC' });
}
