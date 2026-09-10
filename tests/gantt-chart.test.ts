import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GanttChart } from '../src/gantt-chart';
import type { GanttData } from '../src/types';

const project: GanttData = {
  tasks: [
    { id: 'phase', name: 'Phase', start: '2026-01-01', end: '2026-01-03', progress: 0, parentId: null, type: 'parent' },
    { id: 'child', name: 'Child', start: '2026-01-01', end: '2026-01-03', progress: 0, parentId: 'phase', type: 'task' },
  ],
  dependencies: [{ from: 'phase', to: 'child', type: 'finish-to-start' }],
};

describe('GanttChart task deletion', () => {
  let gantt: GanttChart;

  beforeEach(async () => {
    gantt = new GanttChart();
    document.body.append(gantt);
    gantt.setData(project);
    await gantt.updateComplete;
  });

  afterEach(() => gantt.remove());

  it('keeps a task branch when the host confirmation rejects the request', async () => {
    const confirm = vi.fn().mockResolvedValue(false);
    gantt.options = { taskDeletion: { confirm } };

    await expect(gantt.deleteTask('phase', 'keyboard')).resolves.toBe(false);
    expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ source: 'keyboard', descendants: expect.arrayContaining([expect.objectContaining({ id: 'phase' }), expect.objectContaining({ id: 'child' })]) }));
    expect(gantt.getData().tasks.map(task => task.id)).toEqual(['phase', 'child']);
  });

  it('removes a complete branch and its dependencies after confirmation', async () => {
    gantt.options = { taskDeletion: { confirm: async () => true } };

    await expect(gantt.deleteTask('phase', 'toolbar')).resolves.toBe(true);
    expect(gantt.getData().tasks).toEqual([]);
    expect(gantt.getData().dependencies).toEqual([]);
  });

  it('honors a cancelable task-delete-requested event', async () => {
    gantt.addEventListener('task-delete-requested', event => event.preventDefault(), { once: true });

    await expect(gantt.deleteTask('phase')).resolves.toBe(false);
    expect(gantt.getData().tasks).toHaveLength(2);
  });
});
