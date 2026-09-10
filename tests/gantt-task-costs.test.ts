import { describe, expect, it } from 'vitest';
import { calculateTaskCosts } from '../src/gantt-task-costs';
import type { GanttTask } from '../src/types';

const baseTask = (id: string): GanttTask => ({
  id,
  name: id,
  start: '2026-01-01',
  end: '2026-01-01',
  progress: 0,
  parentId: null,
  type: 'task',
});

describe('Gantt task costs', () => {
  it('rolls assignment and child costs up to parent tasks', () => {
    const phase = {
      ...baseTask('phase'),
      type: 'parent' as const,
      resources: [{ id: 'manager', name: 'Manager', type: 'work', unitCost: 20, quantity: 2 }],
      children: [{
        ...baseTask('task'),
        parentId: 'phase',
        resources: [{ id: 'crew', name: 'Crew', type: 'work', unitCost: 10, quantity: 3 }],
      }],
    };

    const costs = calculateTaskCosts([phase], resource => resource.unitCost * resource.quantity);

    expect(costs.get('task')).toBe(30);
    expect(costs.get('phase')).toBe(70);
  });

  it('uses unit cost and quantity when a task has no assignments', () => {
    const costs = calculateTaskCosts([{ ...baseTask('task'), unitCost: 12.5, quantity: 4 }], () => 0);

    expect(costs.get('task')).toBe(50);
  });
});
