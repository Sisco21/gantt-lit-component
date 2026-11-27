import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GanttChart } from '../src/gantt-chart';
import packageInfo from '../package.json';
import type { GanttData, GanttResource } from '../src/types';

const data: GanttData = {
  tasks: [
    { id: 'phase', name: 'Phase', start: '2026-01-01', end: '2026-01-03', progress: 0, parentId: null, type: 'parent' },
    { id: 'task', name: 'Task', start: '2026-01-01', end: '2026-01-03', progress: 0, parentId: 'phase', type: 'task' },
    { id: 'successor', name: 'Successor', start: '2026-01-04', end: '2026-01-06', progress: 0, parentId: null, type: 'task' },
  ],
  dependencies: [{ from: 'task', to: 'successor', type: 'finish-to-start' }],
};

const assignment = (id: string, quantity = 2): GanttResource => ({
  id,
  resourceId: `catalogue-${id}`,
  name: id,
  type: 'work',
  unit: 'day',
  unitCost: 10,
  quantity,
  quantityByDate: { '2026-01-01': quantity },
});

describe('GanttChart incremental updates', () => {
  let gantt: GanttChart;

  beforeEach(async () => {
    gantt = new GanttChart();
    document.body.append(gantt);
    gantt.setData(data);
    await gantt.updateComplete;
  });

  afterEach(() => gantt.remove());

  it('accepts a typed GanttData object on the initial data property', async () => {
    gantt.data = data;
    await gantt.updateComplete;
    expect(gantt.getData().tasks.map(task => task.id)).toEqual(['phase', 'task', 'successor']);
  });

  it('exposes the package version and updates one task while rolling up its phase', async () => {
    const taskUpdated = vi.fn();
    gantt.addEventListener('task-updated', taskUpdated);
    gantt.selectTask('task');
    (gantt as unknown as { taskEditorTab: string }).taskEditorTab = 'resources';

    gantt.updateTask('task', { start: '2026-01-05', end: '2026-01-07', name: 'Updated task' });
    await gantt.updateComplete;

    expect(GanttChart.version).toBe(packageInfo.version);
    expect(gantt.version).toBe(packageInfo.version);
    expect(gantt.getData().tasks.find(task => task.id === 'task')).toMatchObject({ start: '2026-01-05', end: '2026-01-07', name: 'Updated task' });
    expect(gantt.getData().tasks.find(task => task.id === 'phase')).toMatchObject({ start: '2026-01-05', end: '2026-01-07' });
    expect((gantt as unknown as { selectedTaskId: string }).selectedTaskId).toBe('task');
    expect((gantt as unknown as { taskEditorTab: string }).taskEditorTab).toBe('resources');
    expect(taskUpdated).toHaveBeenCalledWith(expect.objectContaining({ detail: { taskId: 'task', reason: 'task-date', revision: 2 } }));
  });

  it('updates, replaces and removes resource assignments with focused events', () => {
    const assignmentUpdated = vi.fn();
    const taskUpdated = vi.fn();
    gantt.addEventListener('resource-assignment-updated', assignmentUpdated);
    gantt.addEventListener('task-updated', taskUpdated);

    gantt.updateTaskResources('task', [assignment('crew')]);
    expect(gantt.getData().tasks.find(task => task.id === 'task')?.resources).toEqual([assignment('crew')]);
    expect(assignmentUpdated).toHaveBeenCalledWith(expect.objectContaining({ detail: { taskId: 'task', assignmentId: 'crew', revision: 2 } }));

    gantt.updateResourceAssignment('task', { assignmentId: 'crew', quantity: 4, unitCost: 12, quantityByDate: { '2026-01-01': 4 } });
    expect(gantt.getData().tasks.find(task => task.id === 'task')?.resources?.[0]).toMatchObject({ quantity: 4, unitCost: 12, quantityByDate: { '2026-01-01': 4 } });
    expect(assignmentUpdated).toHaveBeenCalledWith(expect.objectContaining({ detail: { taskId: 'task', assignmentId: 'crew', revision: 3 } }));

    gantt.removeResourceAssignment('task', 'crew');
    expect(gantt.getData().tasks.find(task => task.id === 'task')?.resources).toEqual([]);
    expect(assignmentUpdated).toHaveBeenCalledWith(expect.objectContaining({ detail: { taskId: 'task', assignmentId: 'crew', revision: 4 } }));
    expect(taskUpdated).toHaveBeenCalledTimes(3);
  });

  it('preserves scroll positions on an incremental render', async () => {
    const root = gantt.shadowRoot!;
    const viewport = root.querySelector<HTMLElement>('.gantt-viewport')!;
    const timeline = root.querySelector<HTMLElement>('.timeline-scroll')!;
    viewport.scrollTop = 96;
    timeline.scrollLeft = 144;

    gantt.updateTask('task', { name: 'Scrolled update' });
    await gantt.updateComplete;

    expect(root.querySelector<HTMLElement>('.gantt-viewport')?.scrollTop).toBe(96);
    expect(root.querySelector<HTMLElement>('.timeline-scroll')?.scrollLeft).toBe(144);
  });

  it('defers move recalculation until refreshTask when configured', async () => {
    gantt.options = { recalculateOnMoveEnd: false };
    const task = gantt.getData().tasks.find(item => item.id === 'task')!;
    const internals = gantt as unknown as {
      startBarDrag: (event: PointerEvent, task: typeof task, mode: 'move') => void;
      applyBarDragPosition: (clientX: number) => void;
      finishBarDrag: () => void;
    };

    internals.startBarDrag(new MouseEvent('pointerdown', { button: 0, clientX: 0 }) as PointerEvent, task, 'move');
    internals.applyBarDragPosition(48);
    internals.finishBarDrag();

    expect(gantt.getData().tasks.find(item => item.id === 'task')).toMatchObject({ start: '2026-01-03', end: '2026-01-05' });
    expect(gantt.getData().tasks.find(item => item.id === 'successor')).toMatchObject({ start: '2026-01-04', end: '2026-01-06' });

    gantt.refreshTask('task');
    await gantt.updateComplete;
    expect(gantt.getData().tasks.find(item => item.id === 'successor')).toMatchObject({ start: '2026-01-06', end: '2026-01-08' });
  });
});
