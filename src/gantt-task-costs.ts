import type { GanttResource, GanttTask } from './types';

/**
 * Calculates a roll-up cost for every task. Parent values include the cost of
 * their descendants, whereas leaf values contain only their own assignments or
 * unit-cost × quantity fallback.
 */
export function calculateTaskCosts(
  tasks: GanttTask[],
  getResourceCost: (resource: GanttResource) => number,
): Map<string, number> {
  const costs = new Map<string, number>();

  const resolveCost = (task: GanttTask): number => {
    const cached = costs.get(task.id);
    if (cached !== undefined) return cached;
    const ownResources = (task.resources || []).reduce((total, resource) => total + getResourceCost(resource), 0);
    const ownCost = ownResources || Number(task.unitCost || task.metadata?.unitCost || 0) * Number(task.quantity || task.metadata?.quantity || 0);
    const total = ownCost + (task.children || []).reduce((sum, child) => sum + resolveCost(child), 0);
    costs.set(task.id, total);
    return total;
  };

  tasks.forEach(resolveCost);
  return costs;
}
