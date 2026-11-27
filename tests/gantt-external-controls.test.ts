import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GanttChart } from '../src/gantt-chart';
import type { GanttTask, GanttViewState } from '../src/types';

const task = (id: string, parentId: string | null = null): GanttTask => ({ id, parentId, name: '同名', start: '2026-11-02', end: '2026-11-03', progress: 0, type: 'task' });
const contextMenu = (element: Element) => element.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, composed: true, cancelable: true, clientX: 120, clientY: 90, button: 2 }));

describe('host-owned toolbar and menus', () => {
  let gantt: GanttChart;
  beforeEach(async () => {
    gantt = new GanttChart(); document.body.append(gantt);
    gantt.options = { autoSchedule: false };
    gantt.setData({ tasks: [{ ...task('phase'), type: 'parent' }, task('a', 'phase'), { ...task('b'), resources: [{ id: 'r', name: 'Crew', type: 'work', quantity: 1, unitCost: 20 }] }], dependencies: [{ from: 'a', to: 'b' }] });
    gantt.selectTask('b'); await gantt.updateComplete;
  });
  afterEach(() => gantt.remove());

  it('shows the toolbar by default and hides/restores it without changing data or selection', async () => {
    expect(gantt.shadowRoot!.querySelector('.toolbar')).not.toBeNull();
    const before = gantt.toJSON();
    gantt.options = { ...gantt.options, showToolbar: false }; await gantt.updateComplete;
    expect(gantt.shadowRoot!.querySelector('.toolbar')).toBeNull(); expect(gantt.toJSON()).toBe(before);
    expect(gantt.getSelectedTaskId()).toBe('b');
    gantt.options = { ...gantt.options, showToolbar: true }; await gantt.updateComplete;
    expect(gantt.shadowRoot!.querySelector('.toolbar')).not.toBeNull();
  });

  it('controls zoom and hierarchy through public methods while the toolbar is hidden', async () => {
    gantt.options = { ...gantt.options, showToolbar: false, minZoom: .5, maxZoom: 2 };
    expect(gantt.setZoom(1.5)).toBe(1.5); expect(gantt.zoomIn()).toBeCloseTo(1.6); expect(gantt.zoomOut()).toBeCloseTo(1.5);
    expect(gantt.setZoom(10)).toBe(2); expect(gantt.setZoom(-1)).toBe(.5); expect(gantt.setZoom(NaN)).toBe(.5);
    gantt.collapseAll(); await gantt.updateComplete;
    expect(gantt.shadowRoot!.querySelector('.task-row[data-task-id="a"]')).toBeNull();
    gantt.expandAll(); await gantt.updateComplete;
    expect(gantt.shadowRoot!.querySelector('.task-row[data-task-id="a"]')).not.toBeNull();
  });

  it('searches and navigates duplicate Unicode names externally and exposes copied state', async () => {
    gantt.collapseAll();
    expect(gantt.searchTasks('同名')).toMatchObject({ taskIds: ['phase', 'a', 'b'], index: 0, activeTaskId: 'phase' });
    expect(gantt.nextSearchResult().activeTaskId).toBe('a');
    await gantt.updateComplete; expect(gantt.shadowRoot!.querySelector('.task-row[data-task-id="a"]')).not.toBeNull();
    expect(gantt.previousSearchResult().activeTaskId).toBe('phase');
    const snapshot = gantt.getSelectedTask()!; snapshot.name = 'Changed externally';
    expect(gantt.getSelectedTask()!.name).toBe('同名');
    gantt.getSearchState().taskIds.length = 0; expect(gantt.getSearchState().taskIds).toHaveLength(3);
    expect(gantt.searchTasks('missing').index).toBe(-1);
    expect(gantt.searchTasks('').taskIds).toEqual([]);
  });

  it('keeps external view state synchronized with selection, zoom, read-only and local history', async () => {
    const states: GanttViewState[] = [];
    gantt.addEventListener('view-state-changed', event => states.push((event as CustomEvent<GanttViewState>).detail));
    gantt.options = { ...gantt.options, history: { enabled: true } };
    gantt.updateTask('b', { name: 'Updated' }); gantt.setZoom(1.4); await gantt.updateComplete;
    expect(states.at(-1)).toMatchObject({ selectedTaskId: 'b', zoom: 1.4, canUndo: true, canEditSelectedTask: true });
    gantt.clearHistory(); await gantt.updateComplete; expect(states.at(-1)!.canUndo).toBe(false);
    gantt.options = { ...gantt.options, readOnly: true }; await gantt.updateComplete;
    expect(states.at(-1)).toMatchObject({ readOnly: true, canEditSelectedTask: false });
  });

  it('opens editors and a host resource picker through public APIs while respecting locks', async () => {
    const picker = vi.fn(); gantt.options = { ...gantt.options, showToolbar: false, resourcePicker: picker };
    gantt.openTaskEditor('b', 'resources'); await gantt.updateComplete;
    expect(gantt.shadowRoot!.querySelector('.task-editor-dialog')).not.toBeNull();
    gantt.closeTaskEditor(); await gantt.updateComplete; expect(gantt.shadowRoot!.querySelector('.task-editor-dialog')).toBeNull();
    gantt.openResourcePicker(); expect(picker).toHaveBeenCalledWith(expect.objectContaining({ task: expect.objectContaining({ id: 'b' }) }));
    gantt.lockTask('b'); gantt.openTaskEditor(); gantt.openResourcePicker(); await gantt.updateComplete;
    expect(picker).toHaveBeenCalledTimes(1); expect(gantt.shadowRoot!.querySelector('.task-editor-dialog')).toBeNull();
  });

  it('exposes all four context kinds without opening internal menus when disabled', async () => {
    const requested = vi.fn(); gantt.options = { ...gantt.options, showToolbar: false, contextMenus: false, onContextMenuRequested: requested };
    await gantt.updateComplete;
    contextMenu(gantt.shadowRoot!.querySelector('.task-row[data-task-id="a"]')!); await gantt.updateComplete;
    contextMenu(gantt.shadowRoot!.querySelector('.timeline-content')!); await gantt.updateComplete;
    gantt.selectTask('b'); await gantt.updateComplete;
    const resourceCell = gantt.shadowRoot!.querySelector('.resources-left [data-assignment-id="r"]');
    expect(resourceCell, gantt.shadowRoot!.querySelector('.resources-left')!.innerHTML).not.toBeNull();
    contextMenu(resourceCell!); await gantt.updateComplete;
    const dependency = gantt.shadowRoot!.querySelector('.dependency-hit-target')!;
    dependency.dispatchEvent(new KeyboardEvent('keydown', { key: 'F10', shiftKey: true, bubbles: true, cancelable: true }));
    await gantt.updateComplete;
    expect(requested.mock.calls.map(([request]) => request.kind)).toEqual(['task', 'timeline', 'resources', 'dependency']);
    expect(requested.mock.calls[0][0]).toMatchObject({ taskId: 'a', x: 120, y: 90, source: 'main', ownerDocument: document });
    expect(requested.mock.calls[2][0].assignmentId).toBe('r');
    expect(requested.mock.calls[3][0].dependency).toMatchObject({ from: 'a', to: 'b' });
    expect(gantt.shadowRoot!.querySelector('.task-context-menu, .gantt-context-menu, .resource-context-menu, .dependency-context-menu')).toBeNull();
  });

  it('allows cancelling a specific built-in context menu with an event or callback', async () => {
    gantt.addEventListener('context-menu-requested', event => event.preventDefault(), { once: true });
    contextMenu(gantt.shadowRoot!.querySelector('.task-row[data-task-id="a"]')!); await gantt.updateComplete;
    expect(gantt.shadowRoot!.querySelector('.task-context-menu')).toBeNull();
    contextMenu(gantt.shadowRoot!.querySelector('.task-row[data-task-id="a"]')!); await gantt.updateComplete;
    expect(gantt.shadowRoot!.querySelector('.task-context-menu')).not.toBeNull();
    gantt.options = { ...gantt.options, contextMenus: false }; await gantt.updateComplete;
    expect(gantt.shadowRoot!.querySelector('.task-context-menu')).toBeNull();
    gantt.options = { ...gantt.options, contextMenus: true, onContextMenuRequested: () => false };
    contextMenu(gantt.shadowRoot!.querySelector('.task-row[data-task-id="a"]')!); await gantt.updateComplete;
    expect(gantt.shadowRoot!.querySelector('.task-context-menu')).toBeNull();
  });

  it('keeps error feedback accessible with the toolbar hidden', async () => {
    gantt.options = { ...gantt.options, showToolbar: false, commands: { enabled: true } };
    gantt.updateTask('a', { parentId: 'a' }); await gantt.updateComplete;
    expect(gantt.shadowRoot!.querySelector('.toolbar')).toBeNull();
    expect(gantt.shadowRoot!.querySelector('.status[role="alert"]')!.textContent).not.toBe('');
  });

  it('forwards detached menu requests to the owner once, with the original assignment context', async () => {
    const requested = vi.fn(), event = vi.fn();
    gantt.options = { ...gantt.options, showToolbar: false, contextMenus: false, onContextMenuRequested: requested };
    gantt.addEventListener('context-menu-requested', event);
    const popupBody = document.createElement('div'); document.body.append(popupBody);
    const popup = { closed: false, close: vi.fn(), focus: vi.fn(), addEventListener: vi.fn(), document: {
      title: '', body: popupBody, documentElement: document.createElement('html'), createElement: document.createElement.bind(document),
      head: { append: (script: HTMLElement) => script.dispatchEvent(new Event('load')) },
    } } as unknown as Window;
    vi.spyOn(window, 'open').mockReturnValue(popup);
    try {
      expect(gantt.undockResources()).toBe(true);
      const detached = popupBody.querySelector<GanttChart>('gantt-chart')!;
      await new Promise(resolve => setTimeout(resolve, 0));
      await detached.updateComplete;
      contextMenu(detached.shadowRoot!.querySelector('.resources-left [data-assignment-id="r"]')!);
      await detached.updateComplete;
      expect(requested).toHaveBeenCalledTimes(1); expect(event).toHaveBeenCalledTimes(1);
      expect(requested.mock.calls[0][0]).toMatchObject({ kind: 'resources', source: 'detached', taskId: 'b', assignmentId: 'r', ownerDocument: detached.ownerDocument });
      expect(detached.shadowRoot!.querySelector('.resource-context-menu')).toBeNull();
    } finally { gantt.dockResources(); popupBody.remove(); }
  });
});
