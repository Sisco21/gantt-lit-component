import type { GanttTask } from './types';

/**
 * Flattens the nested task representation used by the public API while keeping
 * the parent reference of every row.  The source tasks are never mutated.
 */
export function flattenTaskTree(tasks: GanttTask[]): GanttTask[] {
  const result: GanttTask[] = [];
  const visit = (items: GanttTask[]): void => {
    items.forEach(task => {
      result.push({ ...task, children: undefined });
      if (task.children?.length) visit(task.children);
    });
  };
  visit(tasks);
  return result;
}

/** Returns a task and every descendant from a flattened, pre-order task tree. */
export function getTaskSubtreeIds(rootId: string, tasks: GanttTask[]): Set<string> {
  const ids = new Set<string>([rootId]);
  for (let index = 0; index < tasks.length; index += 1) {
    if (ids.has(tasks[index].parentId || '')) ids.add(tasks[index].id);
  }
  return ids;
}

/** Builds display codes such as 1, 1.1 and 1.1.1 from the nested tree. */
export function getTaskOutlineCodes(tasks: GanttTask[]): Map<string, string> {
  const codes = new Map<string, string>();
  const indexOutline = (items: GanttTask[], prefix = ''): void => {
    items.forEach((task, index) => {
      const code = prefix ? `${prefix}.${index + 1}` : String(index + 1);
      codes.set(task.id, code);
      if (task.children?.length) indexOutline(task.children, code);
    });
  };
  indexOutline(tasks);
  return codes;
}

/** Resolves every task depth from its parent reference and safely tolerates cycles. */
export function getTaskDepths(tasks: GanttTask[]): Map<string, number> {
  const depths = new Map<string, number>();
  const byId = new Map(tasks.map(task => [task.id, task]));

  const resolveDepth = (taskId: string, visiting = new Set<string>()): number => {
    const cached = depths.get(taskId);
    if (cached !== undefined) return cached;
    const task = byId.get(taskId);
    if (!task?.parentId || visiting.has(taskId)) {
      depths.set(taskId, 0);
      return 0;
    }
    visiting.add(taskId);
    const depth = 1 + resolveDepth(task.parentId, visiting);
    visiting.delete(taskId);
    depths.set(taskId, depth);
    return depth;
  };

  tasks.forEach(task => resolveDepth(task.id));
  return depths;
}
