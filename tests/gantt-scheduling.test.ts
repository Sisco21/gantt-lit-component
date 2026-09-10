import { describe, expect, it } from 'vitest';
import { scheduleInitialDependencies, scheduleTaskDates } from '../src/gantt-scheduling';
import type { GanttTask } from '../src/types';

const tasks: GanttTask[] = [
  { id: 'a', name: 'A', start: '2026-01-01', end: '2026-01-03', parentId: null, type: 'task' },
  { id: 'b', name: 'B', start: '2026-01-02', end: '2026-01-04', parentId: null, type: 'task' },
];

describe('Gantt dependency scheduling', () => {
  it('moves a finish-to-start successor during initial scheduling', () => {
    const scheduled = scheduleInitialDependencies(tasks, [{ from: 'a', to: 'b', type: 'finish-to-start' }]);
    expect(scheduled.find(task => task.id === 'b')).toMatchObject({ start: '2026-01-04', end: '2026-01-06' });
  });

  it('propagates an interactive move to successor tasks', () => {
    const scheduled = scheduleTaskDates(tasks, [{ from: 'a', to: 'b', type: 'finish-to-start' }], 'a', '2026-01-05', '2026-01-07', 'move', () => true);
    expect(scheduled.find(task => task.id === 'a')).toMatchObject({ start: '2026-01-05', end: '2026-01-07' });
    expect(scheduled.find(task => task.id === 'b')).toMatchObject({ start: '2026-01-08', end: '2026-01-10' });
  });
});
