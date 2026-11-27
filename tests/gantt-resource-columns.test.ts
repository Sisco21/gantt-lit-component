import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GanttChart } from '../src/gantt-chart';
import type { GanttData, GanttResourceColumn } from '../src/types';

const baseData: GanttData = {
  tasks: [{
    id: 'task-1',
    name: 'Task',
    start: '2026-01-01',
    end: '2026-01-03',
    progress: 0,
    parentId: null,
    type: 'task',
    resources: [{
      id: 'resource-1',
      name: 'Crew',
      type: 'work',
      unitCost: 10,
      quantity: 1,
      metadata: { assignmentType: 2 },
    }],
  }],
};

const selectOptions = [
  { value: 1, label: 'Fixed total' },
  { value: 2, label: 'Duration / workshop' },
  { value: 3, label: 'Periodic', disabled: true },
] as const;

function createSelectColumn(overrides: Partial<GanttResourceColumn> = {}): GanttResourceColumn {
  return {
    key: 'assignmentType',
    label: 'Calculation type',
    width: 180,
    editor: 'select',
    options: selectOptions,
    editable: true,
    value: resource => resource.metadata?.assignmentType,
    ...overrides,
  };
}

describe('GanttChart resource column editors', () => {
  let gantt: GanttChart;

  beforeEach(async () => {
    gantt = new GanttChart();
    document.body.append(gantt);
    gantt.options = { resourceColumns: [createSelectColumn()] };
    gantt.setData(baseData);
    gantt.selectTask('task-1');
    await gantt.updateComplete;
  });

  afterEach(() => gantt.remove());

  it('renders configured native select options and selects the current value', () => {
    const select = gantt.shadowRoot?.querySelector<HTMLSelectElement>('.resource-cell select');

    expect(select).not.toBeNull();
    expect(Array.from(select?.options || []).map(option => option.textContent)).toEqual([
      'Fixed total',
      'Duration / workshop',
      'Periodic',
    ]);
    expect(select?.value).toBe('2');
    expect(select?.selectedOptions[0]?.textContent).toBe('Duration / workshop');
    expect(select?.options[2]?.disabled).toBe(true);
    expect(select?.getAttribute('aria-label')).toBe('Calculation type — Crew');
  });

  it('calls setValue and uses the existing change notification and save pipeline', async () => {
    const setValue = vi.fn((value: string, resource: { metadata?: Record<string, unknown> }) => ({
      metadata: { ...resource.metadata, assignmentType: Number(value) },
    }));
    const onTasksChange = vi.fn();
    const saveHook = vi.fn().mockResolvedValue(undefined);
    const tasksChanged = vi.fn();
    gantt.options = { resourceColumns: [createSelectColumn({ setValue })], onTasksChange };
    gantt.autoSave = true;
    gantt.saveHook = saveHook;
    gantt.addEventListener('tasks-changed', tasksChanged);
    await gantt.updateComplete;

    const select = gantt.shadowRoot?.querySelector<HTMLSelectElement>('.resource-cell select');
    expect(select).not.toBeNull();
    if (!select) return;
    select.value = '1';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await gantt.updateComplete;

    expect(setValue).toHaveBeenCalledWith('1', expect.objectContaining({ metadata: { assignmentType: 2 } }), expect.objectContaining({ id: 'task-1' }));
    expect(gantt.getData().tasks[0].resources?.[0].metadata?.assignmentType).toBe(1);
    expect(tasksChanged).toHaveBeenCalledOnce();
    expect(onTasksChange).toHaveBeenCalledOnce();
    expect(saveHook).toHaveBeenCalledOnce();
  });

  it('renders an unknown current value as a disabled fallback option', async () => {
    gantt.setData({
      ...baseData,
      tasks: [{ ...baseData.tasks[0], resources: [{ ...baseData.tasks[0].resources![0], metadata: { assignmentType: 99 } }] }],
    });
    gantt.selectTask('task-1');
    await gantt.updateComplete;

    const select = gantt.shadowRoot?.querySelector<HTMLSelectElement>('.resource-cell select');
    expect(select?.value).toBe('99');
    expect(select?.options[0]?.value).toBe('99');
    expect(select?.options[0]?.disabled).toBe(true);
    expect(select?.options[0]?.textContent).toBe('99');
  });

  it('renders a select without options as read-only', async () => {
    gantt.options = { resourceColumns: [createSelectColumn({ options: undefined })] };
    await gantt.updateComplete;

    expect(gantt.shadowRoot?.querySelector('.resource-cell select')).toBeNull();
    expect(gantt.shadowRoot?.querySelector('.resources-left .resource-cell')?.textContent).toContain('2');
  });

  it('keeps text and numeric editors working and remains keyboard accessible in both themes', async () => {
    gantt.options = {
      resourceColumns: [
        { key: 'name', label: 'Resource', width: 120, editor: 'text', editable: true },
        { key: 'unitCost', label: 'Unit cost', width: 90, editor: 'number', editable: true },
        createSelectColumn(),
      ],
    };
    for (const theme of ['light', 'dark'] as const) {
      gantt.theme = theme;
      await gantt.updateComplete;
      expect(gantt.getAttribute('theme')).toBe(theme);
      expect(gantt.shadowRoot?.querySelector<HTMLInputElement>('input[type="text"]')).not.toBeNull();
      expect(gantt.shadowRoot?.querySelector<HTMLInputElement>('input[type="number"]')).not.toBeNull();
      const select = gantt.shadowRoot?.querySelector<HTMLSelectElement>('.resource-cell select');
      expect(select?.hasAttribute('disabled')).toBe(false);
      select?.focus();
      expect(gantt.shadowRoot?.activeElement).toBe(select);
      select?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    }
  });
});
