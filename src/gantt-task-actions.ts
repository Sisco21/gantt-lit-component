import type { GanttDependency, GanttTask } from './types';
import { flattenTaskTree, getTaskSubtreeIds } from './gantt-task-tree';

export function toggleTaskCollapsed(tasks: GanttTask[], taskId: string): GanttTask[] {
  return tasks.map(task => {
    if (task.id === taskId) return { ...task, collapsed: !task.collapsed };
    return task.children?.length ? { ...task, children: toggleTaskCollapsed(task.children, taskId) } : task;
  });
}

export function setParentTasksCollapsed(tasks: GanttTask[], collapsed: boolean): GanttTask[] {
  return tasks.map(task => ({
    ...task,
    collapsed: task.children?.length ? collapsed : task.collapsed,
    children: task.children?.length ? setParentTasksCollapsed(task.children, collapsed) : task.children,
  }));
}

export function expandTaskAncestors(tasks: GanttTask[], taskId: string): GanttTask[] {
  const byId = new Map(flattenTaskTree(tasks).map(task => [task.id, task]));
  const ancestors = new Set<string>();
  let parentId = byId.get(taskId)?.parentId || null;
  while (parentId) {
    ancestors.add(parentId);
    parentId = byId.get(parentId)?.parentId || null;
  }
  if (!ancestors.size) return tasks;
  const expand = (items: GanttTask[]): GanttTask[] => items.map(task => ({
    ...task,
    collapsed: ancestors.has(task.id) ? false : task.collapsed,
    children: task.children?.length ? expand(task.children) : task.children,
  }));
  return expand(tasks);
}

export function removeTaskBranch(
  tasks: GanttTask[],
  dependencies: GanttDependency[],
  taskId: string,
): { tasks: GanttTask[]; dependencies: GanttDependency[]; descendants: GanttTask[] } {
  const descendants = tasks.filter(task => getTaskSubtreeIds(taskId, tasks).has(task.id));
  const descendantIds = new Set(descendants.map(task => task.id));
  return {
    tasks: tasks.filter(task => !descendantIds.has(task.id)),
    dependencies: dependencies.filter(dependency => !descendantIds.has(dependency.from) && !descendantIds.has(dependency.to)),
    descendants,
  };
}

export function moveTaskParent(tasks: GanttTask[], taskId: string, parentId: string | null): GanttTask[] {
  return tasks.map(task => task.id === taskId ? { ...task, parentId } : task);
}

export function reorderTaskBranch(
  tasks: GanttTask[],
  taskId: string,
  targetTaskId: string,
  position: 'before' | 'after',
): GanttTask[] | null {
  const movingIds = getTaskSubtreeIds(taskId, tasks);
  if (!movingIds.size) return null;
  const movingTasks = tasks.filter(task => movingIds.has(task.id));
  const remainingTasks = tasks.filter(task => !movingIds.has(task.id));
  const targetIndex = remainingTasks.findIndex(task => task.id === targetTaskId);
  const target = remainingTasks[targetIndex];
  if (!target) return null;

  const reorderedTasks = [{ ...movingTasks[0], parentId: target.parentId }, ...movingTasks.slice(1)];
  let insertIndex = targetIndex;
  if (position === 'after') {
    const targetSubtreeIds = getTaskSubtreeIds(targetTaskId, remainingTasks);
    while (insertIndex < remainingTasks.length && targetSubtreeIds.has(remainingTasks[insertIndex].id)) insertIndex += 1;
  }
  remainingTasks.splice(insertIndex, 0, ...reorderedTasks);
  return remainingTasks;
}
