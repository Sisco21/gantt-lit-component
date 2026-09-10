import { describe, expect, it } from 'vitest';
import { calculateProjectSummary } from '../src/gantt-summary';

describe('Gantt project summary', () => {
  it('calculates schedule, cost and resource metrics', () => {
    const summary = calculateProjectSummary([
      { id: 'phase', name: 'Phase', start: '2026-01-01', end: '2026-01-03', parentId: null, type: 'parent' },
      { id: 'task', name: 'Task', start: '2026-01-01', end: '2026-01-03', progress: 50, parentId: 'phase', type: 'task', actualCost: 40, resources: [{ id: 'crew', name: 'Crew', unitCost: 10, quantity: 3, maxUnits: 4 }] },
    ], { referenceDate: '2026-01-02', isWorkingDay: date => date.getUTCDay() !== 0 && date.getUTCDay() !== 6 });

    expect(summary).toMatchObject({ durationDays: 3, workingDurationDays: 2, taskCount: 1, phaseCount: 1, progress: 50, totalCost: 30, plannedCost: 30, actualCost: 40, costVariance: 10, resourceCount: 1, totalResourceQuantity: 3, totalResourceCapacity: 4 });
  });
});
