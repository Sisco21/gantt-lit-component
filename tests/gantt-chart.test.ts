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

describe('GanttChart task-bar editing', () => {
  let gantt: GanttChart;

  beforeEach(async () => {
    gantt = new GanttChart();
    document.body.append(gantt);
    gantt.setData(project);
    await gantt.updateComplete;
  });

  afterEach(() => gantt.remove());

  it('opens the task editor from a double-click on an editable Gantt bar', async () => {
    gantt.options = { openTaskEditorOnDoubleClick: true };
    await gantt.updateComplete;

    const bar = gantt.shadowRoot?.querySelector<HTMLElement>('.task-bar[data-task-id="child"]');
    expect(bar).not.toBeNull();
    bar?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await gantt.updateComplete;

    expect(gantt.shadowRoot?.querySelector('.task-editor-dialog')).not.toBeNull();
  });

  it('routes a task-grid double-click to a host-owned editor', async () => {
    const onTaskEdit = vi.fn();
    gantt.options = {
      taskGridDoubleClickAction: 'edit',
      taskEditorMode: 'external',
      onTaskEdit,
    };
    await gantt.updateComplete;

    const row = gantt.shadowRoot?.querySelector<HTMLElement>('.task-row[data-task-id="child"]');
    expect(row).not.toBeNull();
    row?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));

    expect(onTaskEdit).toHaveBeenCalledWith(expect.objectContaining({ id: 'child' }));
    expect(gantt.shadowRoot?.querySelector('.task-editor-dialog')).toBeNull();
  });

  it('keeps a locked task read-only', async () => {
    gantt.setData({
      ...project,
      tasks: project.tasks.map(task => task.id === 'child' ? { ...task, editable: false } : task),
    });
    gantt.options = { openTaskEditorOnDoubleClick: true };
    await gantt.updateComplete;

    const bar = gantt.shadowRoot?.querySelector<HTMLElement>('.task-bar[data-task-id="child"]');
    expect(bar?.classList.contains('read-only')).toBe(true);
    bar?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await gantt.updateComplete;
    expect(gantt.shadowRoot?.querySelector('.task-editor-dialog')).toBeNull();

    gantt.updateTask('child', { progress: 75 });
    expect(gantt.getData().tasks.find(task => task.id === 'child')?.progress).toBe(0);
  });

  it('locks and unlocks a task through the public API', () => {
    expect(gantt.lockTask('child')).toBe(true);
    expect(gantt.getData().tasks.find(task => task.id === 'child')?.editable).toBe(false);

    gantt.updateTask('child', { progress: 75 });
    expect(gantt.getData().tasks.find(task => task.id === 'child')?.progress).toBe(0);

    expect(gantt.unlockTask('child')).toBe(true);
    gantt.updateTask('child', { progress: 75 });
    expect(gantt.getData().tasks.find(task => task.id === 'child')?.progress).toBe(75);
    expect(gantt.lockTask('unknown')).toBe(false);
  });
});
