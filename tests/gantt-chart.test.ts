import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { html } from 'lit';
import { GanttChart } from '../src/gantt-chart';
import type { GanttData, GanttTask } from '../src/types';

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

  it('opens a selected task resource panel in a secondary window and docks it back', async () => {
    const popupBody = document.createElement('body');
    const popupDocument = {
      title: '',
      documentElement: document.createElement('html'),
      body: popupBody,
      createElement: document.createElement.bind(document),
      head: { append: (node: Node) => node.dispatchEvent(new Event('load')) },
    } as unknown as Document;
    const popup = {
      closed: false,
      close: vi.fn(),
      focus: vi.fn(),
      addEventListener: vi.fn(),
      document: popupDocument,
    } as unknown as Window;
    vi.spyOn(window, 'open').mockReturnValue(popup);
    gantt.options = { resourcePanel: { detachable: true } };
    gantt.selectTask('child');

    expect(gantt.undockResources()).toBe(true);
    await gantt.updateComplete;
    expect(gantt.resourcesUndocked).toBe(true);
    expect(popupBody.firstElementChild).toBeInstanceOf(GanttChart);
    expect(gantt.shadowRoot?.querySelector('.resources-viewport')).toBeNull();

    gantt.dockResources();
    await gantt.updateComplete;
    expect(popup.close).toHaveBeenCalledOnce();
    expect(gantt.resourcesUndocked).toBe(false);
    expect(gantt.shadowRoot?.querySelector('.resources-viewport')).not.toBeNull();
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
    expect(gantt.shadowRoot?.querySelector('.task-row[data-task-id="child"] .task-lock')).not.toBeNull();
    expect(gantt.shadowRoot?.querySelector('.task-bar[data-task-id="child"] .task-lock')).not.toBeNull();
    bar?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await gantt.updateComplete;
    expect(gantt.shadowRoot?.querySelector('.task-editor-dialog')).toBeNull();

    gantt.updateTask('child', { progress: 75 });
    expect(gantt.getData().tasks.find(task => task.id === 'child')?.progress).toBe(0);
  });

  it('locks and unlocks a task through the public API', async () => {
    expect(gantt.lockTask('child')).toBe(true);
    await gantt.updateComplete;
    expect(gantt.getData().tasks.find(task => task.id === 'child')?.editable).toBe(false);
    expect(gantt.shadowRoot?.querySelector<HTMLElement>('.task-bar[data-task-id="child"] .task-lock')?.hidden).toBe(false);

    gantt.updateTask('child', { progress: 75 });
    expect(gantt.getData().tasks.find(task => task.id === 'child')?.progress).toBe(0);

    expect(gantt.unlockTask('child')).toBe(true);
    await gantt.updateComplete;
    expect(gantt.shadowRoot?.querySelector<HTMLElement>('.task-bar[data-task-id="child"] .task-lock')?.hidden).toBe(true);
    gantt.updateTask('child', { progress: 75 });
    expect(gantt.getData().tasks.find(task => task.id === 'child')?.progress).toBe(75);
    expect(gantt.lockTask('unknown')).toBe(false);
  });
});

describe('GanttChart dependency context menu', () => {
  let gantt: GanttChart;

  beforeEach(async () => {
    gantt = new GanttChart();
    document.body.append(gantt);
    gantt.setData({
      tasks: [
        { id: 'source', name: 'Source', start: '2026-01-01', end: '2026-01-03', progress: 0, parentId: null, type: 'task' },
        { id: 'middle', name: 'Middle', start: '2026-01-04', end: '2026-01-06', progress: 0, parentId: null, type: 'task' },
        { id: 'target', name: 'Target', start: '2026-01-07', end: '2026-01-09', progress: 0, parentId: null, type: 'task' },
      ],
      dependencies: [
        { from: 'source', to: 'middle', type: 'finish-to-start', lagDays: 1 },
        { from: 'middle', to: 'target', type: 'start-to-start' },
      ],
    });
    await gantt.updateComplete;
  });

  afterEach(() => gantt.remove());

  it('opens the menu for the dependency whose arrow was targeted', async () => {
    const template = vi.fn(({ dependency, close }: { dependency: { from: string; to: string }; close: () => void }) => html`<button @click=${close}>Remove ${dependency.from} → ${dependency.to}</button>`);
    gantt.options = { dependencyContextMenuTemplate: template };
    await gantt.updateComplete;

    const arrows = gantt.shadowRoot?.querySelectorAll<HTMLButtonElement>('.dependency-hit-target');
    expect(arrows).toHaveLength(2);
    arrows?.[1].dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 120, clientY: 80, button: 2 }));
    await gantt.updateComplete;

    expect(template).toHaveBeenLastCalledWith(expect.objectContaining({
      dependency: { from: 'middle', to: 'target', type: 'start-to-start' },
      editable: true,
      gantt,
    }));
    expect(gantt.shadowRoot?.querySelector('.dependency-context-menu')?.textContent).toContain('middle → target');
  });

  it('keeps task right-click behaviour separate from dependency arrows', async () => {
    gantt.options = {
      dependencyContextMenuTemplate: () => html`<button>Remove link</button>`,
    };
    await gantt.updateComplete;

    const taskBar = gantt.shadowRoot?.querySelector<HTMLElement>('.task-bar[data-task-id="middle"]');
    taskBar?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 20, clientY: 20, button: 2 }));
    await gantt.updateComplete;

    expect(gantt.shadowRoot?.querySelector('.task-context-menu')).not.toBeNull();
    expect(gantt.shadowRoot?.querySelector('.dependency-context-menu')).toBeNull();
  });

  it('positions the dependency menu inside the viewport at the lower-right edge', async () => {
    gantt.options = {
      dependencyContextMenuTemplate: () => html`<button>Remove link</button>`,
    };
    await gantt.updateComplete;

    const arrow = gantt.shadowRoot?.querySelector<HTMLButtonElement>('.dependency-hit-target');
    const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;
    const rectSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
      if (this.classList.contains('dependency-context-menu')) {
        return { left: 1016, top: 760, width: 190, height: 64, right: 1206, bottom: 824 } as DOMRect;
      }
      return originalGetBoundingClientRect.call(this);
    });
    arrow?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 1016, clientY: 760, button: 2 }));
    await gantt.updateComplete;

    expect(gantt.shadowRoot?.querySelector<HTMLElement>('.dependency-context-menu')?.style.left).toBe('826px');
    rectSpy.mockRestore();
  });

  it('opens from Shift+F10, closes with Escape and does not remove on cancel', async () => {
    gantt.options = {
      dependencyContextMenuTemplate: ({ dependency, close }) => html`<button @click=${close}>Cancel ${dependency.from}</button>`,
    };
    await gantt.updateComplete;

    const arrow = gantt.shadowRoot?.querySelector<HTMLButtonElement>('.dependency-hit-target');
    arrow?.dispatchEvent(new KeyboardEvent('keydown', { key: 'F10', shiftKey: true, bubbles: true }));
    await gantt.updateComplete;
    expect(gantt.shadowRoot?.querySelector('.dependency-context-menu')).not.toBeNull();

    gantt.shadowRoot?.querySelector<HTMLButtonElement>('.dependency-context-menu button')?.click();
    await gantt.updateComplete;
    expect(gantt.getData().dependencies).toHaveLength(2);

    arrow?.dispatchEvent(new KeyboardEvent('keydown', { key: 'F10', shiftKey: true, bubbles: true }));
    await gantt.updateComplete;
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await gantt.updateComplete;
    expect(gantt.shadowRoot?.querySelector('.dependency-context-menu')).toBeNull();
    expect(gantt.getData().dependencies).toHaveLength(2);
  });

  it('removes only the targeted dependency incrementally', async () => {
    const applyData = vi.spyOn(gantt as unknown as { applyData: (...args: unknown[]) => void }, 'applyData');
    gantt.removeDependency('middle', 'target');
    await gantt.updateComplete;

    expect(gantt.getData().dependencies).toEqual([{ from: 'source', to: 'middle', type: 'finish-to-start', lagDays: 1 }]);
    expect(applyData).not.toHaveBeenCalled();
  });
});

describe('GanttChart deferred schedule editing', () => {
  const deferredProject: GanttData = {
    tasks: [
      { id: 'source', name: 'Source', start: '2026-01-01', end: '2026-01-03', progress: 0, parentId: null, type: 'task' },
      { id: 'successor', name: 'Successor', start: '2026-01-04', end: '2026-01-06', progress: 0, parentId: null, type: 'task' },
    ],
    dependencies: [{ from: 'source', to: 'successor', type: 'finish-to-start' }],
  };
  let gantt: GanttChart;

  beforeEach(async () => {
    gantt = new GanttChart();
    document.body.append(gantt);
    gantt.setData(deferredProject);
    await gantt.updateComplete;
  });

  afterEach(() => gantt.remove());

  const startMove = (chart: GanttChart, taskId: string): void => {
    const task = chart.getData().tasks.find(item => item.id === taskId) as GanttTask;
    const internals = chart as unknown as {
      startBarDrag: (event: PointerEvent, task: GanttTask, mode: 'move') => void;
      applyBarDragPosition: (clientX: number) => void;
      finishBarDrag: () => void;
    };
    internals.startBarDrag(new MouseEvent('pointerdown', { button: 0, clientX: 0 }) as PointerEvent, task, 'move');
    internals.applyBarDragPosition(48);
  };

  it('keeps canonical data unchanged during deferred frames and calculates once on release', async () => {
    const onTasksChange = vi.fn();
    const onPreview = vi.fn();
    gantt.options = {
      onTasksChange,
      scheduleEditing: {
        enabled: true,
        dependencyCalculation: 'on-commit',
        resourceCalculation: 'on-commit',
        costCalculation: 'on-commit',
        summaryCalculation: 'on-commit',
        onScheduleEditPreview: onPreview,
      },
    };

    startMove(gantt, 'source');
    expect(gantt.isScheduleEditing()).toBe(true);
    expect(gantt.getData().tasks.find(task => task.id === 'source')).toMatchObject({ start: '2026-01-01', end: '2026-01-03' });
    expect(gantt.getData().tasks.find(task => task.id === 'successor')).toMatchObject({ start: '2026-01-04', end: '2026-01-06' });
    expect(onTasksChange).not.toHaveBeenCalled();
    expect(onPreview).toHaveBeenCalledWith(expect.objectContaining({ proposedStart: '2026-01-03', proposedEnd: '2026-01-05' }));

    const internals = gantt as unknown as { finishBarDrag: () => void };
    internals.finishBarDrag();
    await gantt.updateComplete;

    expect(gantt.isScheduleEditing()).toBe(false);
    expect(gantt.getData().tasks.find(task => task.id === 'source')).toMatchObject({ start: '2026-01-03', end: '2026-01-05' });
    expect(gantt.getData().tasks.find(task => task.id === 'successor')).toMatchObject({ start: '2026-01-06', end: '2026-01-08' });
    expect(onTasksChange).toHaveBeenCalledOnce();
  });

  it('keeps the timeline origin stable when a drag crosses either date-window edge', () => {
    gantt.options = {
      scheduleEditing: {
        enabled: true,
        dependencyCalculation: 'on-commit',
        resourceCalculation: 'on-commit',
        costCalculation: 'on-commit',
        summaryCalculation: 'on-commit',
      },
    };
    const task = gantt.getData().tasks.find(item => item.id === 'source') as GanttTask;
    const internals = gantt as unknown as {
      startBarDrag: (event: PointerEvent, task: GanttTask, mode: 'move') => void;
      applyBarDragPosition: (clientX: number) => void;
      finishBarDrag: () => void;
      scheduleEditSession: { timelineRange: { start: Date; end: Date } };
    };
    internals.startBarDrag(new MouseEvent('pointerdown', { button: 0, clientX: 0 }) as PointerEvent, task, 'move');
    const initialStart = internals.scheduleEditSession.timelineRange.start.getTime();
    const initialEnd = internals.scheduleEditSession.timelineRange.end.getTime();

    internals.applyBarDragPosition(24 * 30);
    expect(internals.scheduleEditSession.timelineRange.start.getTime()).toBe(initialStart);
    expect(internals.scheduleEditSession.timelineRange.end.getTime()).toBeGreaterThan(initialEnd);

    internals.applyBarDragPosition(-24 * 30);
    expect(internals.scheduleEditSession.timelineRange.start.getTime()).toBeLessThan(initialStart);
    expect(gantt.shadowRoot?.querySelector<HTMLElement>('.timeline-scroll')?.scrollLeft).toBeGreaterThan(0);
    internals.finishBarDrag();
  });

  it('waits for a controlled commit and applies the canonical result atomically', async () => {
    let resolveCommit: ((result: { status: 'accepted'; data: GanttData; revision: number }) => void) | undefined;
    const canonical: GanttData = {
      ...deferredProject,
      tasks: deferredProject.tasks.map(task => task.id === 'source' ? { ...task, start: '2026-01-03', end: '2026-01-05' } : { ...task, start: '2026-01-06', end: '2026-01-08' }),
    };
    const onTasksChange = vi.fn();
    const onScheduleEditCommit = vi.fn(() => new Promise<{ status: 'accepted'; data: GanttData; revision: number }>(resolve => { resolveCommit = resolve; }));
    gantt.options = {
      onTasksChange,
      scheduleEditing: { enabled: true, commitMode: 'controlled', onScheduleEditCommit },
    };

    startMove(gantt, 'source');
    (gantt as unknown as { finishBarDrag: () => void }).finishBarDrag();
    await Promise.resolve();
    expect(gantt.isScheduleEditing()).toBe(true);
    expect(onScheduleEditCommit).toHaveBeenCalledWith(expect.objectContaining({ taskId: 'source', baseRevision: expect.any(Number) }));
    expect(gantt.getData().tasks).toMatchObject(deferredProject.tasks);
    expect(gantt.getData().dependencies).toEqual(deferredProject.dependencies);
    expect(onTasksChange).not.toHaveBeenCalled();

    resolveCommit?.({ status: 'accepted', data: canonical, revision: 12 });
    await new Promise(resolve => setTimeout(resolve, 0));
    await gantt.updateComplete;
    expect(gantt.isScheduleEditing()).toBe(false);
    expect(gantt.getData().tasks.find(task => task.id === 'source')).toMatchObject({ start: '2026-01-03', end: '2026-01-05' });
    expect(onTasksChange).toHaveBeenCalledOnce();
  });

  it('restores the original state and leaves history untouched when cancelled', async () => {
    const onCancel = vi.fn();
    gantt.options = {
      history: { enabled: true },
      scheduleEditing: {
        enabled: true,
        dependencyCalculation: 'on-commit',
        onScheduleEditCancel: onCancel,
      },
    };
    gantt.clearHistory();
    startMove(gantt, 'source');
    gantt.cancelScheduleEdit();
    await gantt.updateComplete;

    expect(gantt.isScheduleEditing()).toBe(false);
    expect(gantt.getData().tasks).toMatchObject(deferredProject.tasks);
    expect(gantt.getData().dependencies).toEqual(deferredProject.dependencies);
    expect(gantt.canUndo).toBe(false);
    expect(onCancel).toHaveBeenCalledWith(expect.objectContaining({ proposedStart: '2026-01-03', proposedEnd: '2026-01-05' }));
  });
});
