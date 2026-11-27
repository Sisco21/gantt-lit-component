import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GanttChart } from '../src/gantt-chart';
import { html } from 'lit';
import { stringifyJson, stringifyMspXml } from '../src/project-codecs';
import type { GanttOptions, GanttResource, GanttResourceReference, GanttTask, GanttResourceCreationInputContext } from '../src/types';

const task: GanttTask = { id: 'task', name: 'Task', start: '2026-11-02', end: '2026-11-03', progress: 0, parentId: null, type: 'task', resources: [] };
const reference: GanttResourceReference = { id: 'catalogue-id', code: 'ENG', name: 'Engineer', unit: 'h', unitCost: 75, quantity: 2, metadata: { category: 'staff' } };

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

describe('inline task and resource creation', () => {
  let gantt: GanttChart;
  const row = (resource = false, chart = gantt) => chart.shadowRoot!.querySelector<HTMLElement>(`[data-inline-row="${resource ? 'resource' : 'task'}"]`)!;
  const input = (field: string, resource = false, chart = gantt) => row(resource, chart).querySelector<HTMLInputElement>(`[data-field="${field}"]`)!;
  const enter = (resource = false, chart = gantt) => row(resource, chart).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, composed: true, cancelable: true }));
  async function freeMode(chart = gantt) {
    const select = row(true, chart).querySelector<HTMLSelectElement>('[data-inline-mode]')!;
    select.value = 'free'; select.dispatchEvent(new Event('change', { bubbles: true })); await settle(chart);
  }
  async function settle(chart = gantt) { await new Promise(resolve => setTimeout(resolve, 0)); await chart.updateComplete; }
  async function type(field: string, value: string, resource = false, chart = gantt) {
    const element = input(field, resource, chart);
    expect(element, `Missing editor: ${field}`).not.toBeNull();
    element.value = value;
    element.dispatchEvent(new Event('input', { bubbles: true }));
    await settle(chart);
  }
  function configure(overrides: GanttOptions['inlineCreation'] = {}) {
    gantt.options = { locale: 'fr-FR', autoSchedule: false, history: { enabled: true }, inlineCreation: {
      tasks: { enabled: true, defaults: { start: task.start, end: task.end }, save: vi.fn(async draft => ({ ...task, ...draft, id: 'saved-task' })) },
      resources: { enabled: true, modes: ['catalogue', 'free'], save: vi.fn(async draft => ({ name: '', type: 'work', unitCost: 0, quantity: 1, ...draft, id: 'saved-resource' })) },
      ...overrides,
    } };
  }

  beforeEach(async () => {
    gantt = new GanttChart();
    document.body.append(gantt);
    gantt.setData({ tasks: [structuredClone(task)] });
    gantt.selectTask(task.id);
    await settle();
  });
  afterEach(() => gantt.remove());

  it('is disabled by default and supports independent activation, permissions and task locks', async () => {
    expect(row()).toBeNull(); expect(row(true)).toBeNull();
    configure({ resources: undefined }); await settle();
    expect(row()).not.toBeNull(); expect(row(true)).toBeNull();
    configure({ tasks: undefined }); await settle();
    expect(row()).toBeNull(); expect(row(true)).not.toBeNull();
    configure({ readOnly: true }); await settle();
    expect(row()).toBeNull(); expect(row(true)).toBeNull();
    configure(); gantt.setTaskLocked(task.id, true); await settle();
    expect(row(true)).toBeNull();
    gantt.options = { ...gantt.options, inlineCreation: { tasks: { enabled: true, canCreate: () => false, save: vi.fn() } } };
    await settle(); expect(row()).toBeNull();
  });

  it('renders in an empty plan, ignores a blank row and Escape, and excludes drafts from data and exports', async () => {
    configure(); gantt.setData({ tasks: [] }); await settle();
    const save = gantt.options.inlineCreation!.tasks!.save;
    enter(); await settle(); expect(save).not.toHaveBeenCalled();
    await type('name', 'Pending draft');
    expect(gantt.getData().tasks).toHaveLength(0);
    expect(stringifyJson(gantt.getData())).not.toContain('Pending draft');
    expect(stringifyMspXml(gantt.getData())).not.toContain('Pending draft');
    expect(gantt.canUndo).toBe(false);
    expect(gantt.shadowRoot!.querySelectorAll('.task-bar')).toHaveLength(0);
    row().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true }));
    await settle(); expect(input('name').value).toBe(''); expect(save).not.toHaveBeenCalled();
  });

  it('creates server-confirmed tasks at the host parent and position, then renews the row', async () => {
    const phase = { ...task, id: 'phase', name: 'Phase', type: 'parent' as const };
    const save = vi.fn(async (draft, context) => ({ ...task, ...draft, parentId: context.parentId, name: `${draft.name} confirmed`, id: 'server-task' }));
    configure({ tasks: { enabled: true, getContext: context => ({ parentId: context.selectedTask?.id ?? null, index: 1 }), defaults: { start: task.start, end: task.end, code: 'DEFAULT' }, requiredFields: ['name', 'code'], save } });
    gantt.setData({ tasks: [phase] }); gantt.selectTask('phase'); await settle();
    await type('name', 'New task'); enter(); await settle();
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ name: 'New task', code: 'DEFAULT' }), expect.objectContaining({ parentId: 'phase', index: 1 }));
    expect(gantt.getData().tasks.find(item => item.id === 'server-task')).toMatchObject({ name: 'New task confirmed', parentId: 'phase' });
    expect(input('name').value).toBe(''); expect(gantt.canUndo).toBe(true);
    expect(gantt.shadowRoot!.querySelectorAll('[data-inline-row="task"]')).toHaveLength(1);
  });

  it('locks validation and saving against repeated confirmation and keeps errors for correction', async () => {
    const validation = deferred<void>(); const saving = deferred<GanttTask>();
    const save = vi.fn(() => saving.promise); const validate = vi.fn(() => validation.promise);
    configure({ tasks: { enabled: true, validate, save } }); await settle();
    await type('name', 'Preserved'); enter(); enter(); await settle();
    expect(validate).toHaveBeenCalledTimes(1); expect(save).not.toHaveBeenCalled();
    expect(input('name').disabled).toBe(true);
    validation.resolve(); await settle(); expect(save).toHaveBeenCalledTimes(1);
    enter(); enter(); await settle(); expect(save).toHaveBeenCalledTimes(1);
    saving.reject(new Error('Connexion interrompue. Réessayez.')); await settle();
    expect(row().textContent).toContain('Connexion interrompue'); expect(input('name').value).toBe('Preserved'); expect(input('name').disabled).toBe(false);
  });

  it('preserves input after business validation failure, validates required custom fields and retries', async () => {
    const save = vi.fn(async draft => ({ ...task, ...draft, id: 'valid' }));
    const validate = vi.fn().mockResolvedValueOnce('Nom déjà utilisé').mockResolvedValue(undefined);
    configure({ tasks: { enabled: true, requiredFields: ['name', 'fields.customer'], validate, save } });
    await settle(); await type('name', 'Draft'); enter(); await settle();
    expect(row().textContent).toContain('fields.customer'); expect(save).not.toHaveBeenCalled();
    gantt.options = { ...gantt.options, inlineCreation: { ...gantt.options.inlineCreation, tasks: { ...gantt.options.inlineCreation!.tasks!, requiredFields: ['name'] } } };
    enter(); await settle(); expect(row().textContent).toContain('Nom déjà utilisé'); expect(input('name').value).toBe('Draft');
    enter(); await settle(); expect(save).toHaveBeenCalledTimes(1); expect(input('name').value).toBe('');
  });

  it('does not intercept Tab, ignores IME confirmation and protects component shortcuts', async () => {
    configure(); await settle(); await type('name', 'Keyboard');
    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, composed: true, cancelable: true });
    input('name').dispatchEvent(tab); expect(tab.defaultPrevented).toBe(false);
    input('name').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true, composed: true }));
    input('name').dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true, composed: true }));
    await settle(); expect(gantt.getData().tasks).toHaveLength(1); expect(gantt.options.inlineCreation!.tasks!.save).not.toHaveBeenCalled();
    input('name').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, composed: true }));
    await settle(); expect(gantt.getData().tasks).toHaveLength(2);
  });

  it('selects catalogue suggestions by keyboard and keeps catalogue identity and allowed overrides', async () => {
    const search = vi.fn(async () => [reference]);
    configure({ resources: { enabled: true, search, catalogueEditableFields: ['quantity'], save: vi.fn(async draft => ({ ...draft, id: 'assignment' } as GanttResource)) } });
    await settle(); await type('name', 'ENG', true);
    expect(search).toHaveBeenCalledWith('ENG', expect.objectContaining({ mode: 'catalogue', task: expect.objectContaining({ id: task.id }) }));
    const suggestion = row(true).querySelector<HTMLButtonElement>('[data-inline-suggestion]')!;
    expect(suggestion.textContent).toContain('ENG — Engineer');
    suggestion.click(); await settle();
    expect(input('unitCost', true)).toBeNull(); expect(input('quantity', true)).not.toBeNull();
    await type('quantity', '3', true); enter(true); await settle();
    expect(gantt.getData().tasks[0].resources![0]).toMatchObject({ id: 'assignment', resourceId: reference.id, name: 'Engineer', unit: 'h', quantity: 3, metadata: { category: 'staff' } });
    expect(gantt.shadowRoot!.querySelector<HTMLInputElement>('[aria-label="Nouvelle ressource — Nom"]')!.value).toBe('');
    expect(gantt.shadowRoot!.querySelector<HTMLInputElement>('[aria-label="Unité d’œuvre — Engineer"]')!.value).toBe('h');
    expect(input('name', true).value).toBe('');
  });

  it('requires an explicit free choice after an empty catalogue search', async () => {
    const search = vi.fn(async () => []);
    const save = vi.fn(async draft => ({ ...draft, id: 'free-assignment' } as GanttResource));
    configure({ resources: { enabled: true, modes: ['catalogue', 'free'], search, requiredFields: ['name', 'unit', 'quantity', 'unitCost'], save } }); await settle();
    await type('name', 'Custom crew', true); await type('unit', 'h', true); await type('quantity', '4', true); await type('unitCost', '30', true);
    expect(save).not.toHaveBeenCalled(); // Searching and filling never save on their own.
    enter(true); await settle(); expect(save).not.toHaveBeenCalled();
    expect(row(true).textContent).toContain('Aucune ressource trouvée');
    await freeMode();
    enter(true); await settle();
    expect(save).toHaveBeenCalledWith(expect.not.objectContaining({ resourceId: expect.anything() }), expect.objectContaining({ mode: 'free' }));
    expect(save.mock.calls[0][1].reference).toBeUndefined();
    expect(gantt.getData().tasks[0].resources![0]).toMatchObject({ name: 'Custom crew', unit: 'h', quantity: 4, unitCost: 30 });
    expect(search).toHaveBeenCalledTimes(1);
  });

  it('renders only fields and permits direct free entry when only free resources are allowed', async () => {
    configure({ resources: { enabled: true, modes: ['free'], save: vi.fn() } }); await settle();
    expect(input('name', true)).not.toBeNull();
    expect(row().querySelector('button, .inline-actions')).toBeNull();
    expect(row(true).querySelector('button, .inline-mode')).toBeNull();
    enter(true); await settle(); expect(gantt.options.inlineCreation!.resources!.save).not.toHaveBeenCalled();
  });

  it('does not turn unselected catalogue suggestions into free assignments', async () => {
    const save = vi.fn(async draft => ({ ...draft, id: 'free' } as GanttResource));
    configure({ resources: { enabled: true, modes: ['catalogue', 'free'], search: async () => [reference], save } });
    await settle(); await type('name', 'Engineer typed without selection', true);
    expect(row(true).querySelector('[data-inline-suggestion]')).not.toBeNull();
    enter(true); await settle(); expect(save).not.toHaveBeenCalled();
    await freeMode();
    enter(true); await settle();
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ name: 'Engineer typed without selection' }), expect.objectContaining({ mode: 'free' }));
    expect(save.mock.calls[0][0].resourceId).toBeUndefined();
  });

  it('still requires a selected reference when free resources are forbidden', async () => {
    configure({ resources: { enabled: true, modes: ['catalogue'], search: async () => [], save: vi.fn() } });
    await settle(); await type('name', 'Not in catalogue', true); enter(true); await settle();
    expect(gantt.options.inlineCreation!.resources!.save).not.toHaveBeenCalled();
    expect(row(true).textContent).toContain('Sélectionnez une suggestion');
    expect(input('name', true).value).toBe('Not in catalogue');
  });

  it('supports configurable confirmation and cancellation keys, including disabling a shortcut', async () => {
    configure();
    gantt.options = { ...gantt.options, inlineCreation: { ...gantt.options.inlineCreation, confirmKey: 'Ctrl+Enter', cancelKey: ['F4', 'Alt+Backspace'] } };
    await settle(); await type('name', 'Custom keys'); enter(); await settle();
    expect(gantt.options.inlineCreation!.tasks!.save).not.toHaveBeenCalled();
    input('name').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await settle();
    expect(input('name').value).toBe('Custom keys');
    input('name').dispatchEvent(new KeyboardEvent('keydown', { key: 'F4', bubbles: true })); await settle();
    expect(input('name').value).toBe('');
    await type('name', 'Confirmed');
    input('name').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true })); await settle();
    expect(gantt.options.inlineCreation!.tasks!.save).toHaveBeenCalledTimes(1);
    gantt.options = { ...gantt.options, inlineCreation: { ...gantt.options.inlineCreation, cancelKey: false, confirmKey: false } };
    await settle(); await type('name', 'Retained');
    input('name').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); enter(); await settle();
    expect(input('name').value).toBe('Retained'); expect(gantt.options.inlineCreation!.tasks!.save).toHaveBeenCalledTimes(1);
  });

  it('lets the host replace the input and consume Enter to choose a resource before saving', async () => {
    let editor!: GanttResourceCreationInputContext;
    let choosing = true;
    const search = vi.fn(async () => []);
    const save = vi.fn(async draft => ({ ...draft, id: 'host-assignment' } as GanttResource));
    configure({ resources: { enabled: true, modes: ['catalogue', 'free'], search, save,
      inputTemplate: context => {
        if (context.column.key !== 'name') return context.renderDefault();
        editor = context;
        return html`<input data-field="name" aria-label="Host search" .value=${context.value} ?disabled=${context.disabled}
          @input=${(event: Event) => context.onInput((event.target as HTMLInputElement).value)}
          @keydown=${(event: KeyboardEvent) => {
            if (choosing && event.key === 'Enter') { event.preventDefault(); context.selectReference(reference); choosing = false; }
          }} />`;
      },
    } });
    await settle(); await type('name', 'ENG', true);
    expect(search).not.toHaveBeenCalled();
    input('name', true).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); await settle();
    expect(save).not.toHaveBeenCalled(); expect(input('name', true).value).toBe('Engineer');
    enter(true); await settle();
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ resourceId: reference.id }), expect.objectContaining({ mode: 'catalogue' }));
    await type('name', 'Next draft', true);
    const staleEditor = editor;
    input('name', true).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await settle();
    staleEditor.selectReference(reference); staleEditor.onInput('Late update'); await settle();
    expect(input('name', true).value).toBe('');
  });

  it('ignores stale catalogue responses and responses after Escape', async () => {
    const first = deferred<GanttResourceReference[]>(); const second = deferred<GanttResourceReference[]>();
    const search = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    configure({ resources: { enabled: true, modes: ['catalogue', 'free'], search, save: vi.fn() } }); await settle();
    await type('name', 'old', true); await type('name', 'new', true);
    second.resolve([{ ...reference, name: 'Latest' }]); await settle(); first.resolve([{ ...reference, name: 'Obsolete' }]); await settle();
    expect(row(true).textContent).toContain('Latest'); expect(row(true).textContent).not.toContain('Obsolete');
    row(true).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await settle();
    expect(input('name', true).value).toBe('');
    expect(row(true).querySelector('[data-inline-suggestion]')).toBeNull();
  });

  it('binds a pending resource save to its original task and preserves unrelated edits', async () => {
    const pending = deferred<GanttResource>();
    configure({ resources: { enabled: true, modes: ['free'], save: vi.fn(() => pending.promise) } });
    gantt.setData({ tasks: [task, { ...task, id: 'other' }] }); await settle(); await type('name', 'For original', true); enter(true); await settle();
    gantt.selectTask('other'); gantt.updateTask('other', { name: 'Concurrent edit' }); await settle();
    pending.resolve({ id: 'saved', name: 'Confirmed', type: 'work', quantity: 4, unitCost: 20, quantityByDate: { '2026-11-02': 4 } }); await settle();
    expect(gantt.getData().tasks[0].resources![0]).toMatchObject({ name: 'Confirmed', quantityByDate: { '2026-11-02': 4 } });
    expect(gantt.getData().tasks[1]).toMatchObject({ name: 'Concurrent edit', resources: [] });
  });

  it('restores keyboard focus to the renewed task row after a confirmed save', async () => {
    configure(); await settle(); input('name').focus(); await type('name', 'Focus');
    enter(); await settle();
    expect(input('name').value).toBe(''); expect(gantt.shadowRoot!.activeElement).toBe(input('name'));
  });

  it('keeps a failed assignment draft per task, supports provider code search and custom select editors', async () => {
    configure({ resources: { enabled: true, modes: ['catalogue', 'free'], save: vi.fn().mockRejectedValue(new Error('Service indisponible')) } });
    gantt.resourceProvider = { search: vi.fn(async () => [reference]) };
    gantt.options = { ...gantt.options, resourceColumns: [
      { key: 'code', label: 'Code', width: 100, editable: true },
      { key: 'name', label: 'Name', width: 140, editable: true },
      { key: 'category', label: 'Category', width: 100, editor: 'select', editable: true, options: [{ value: 1, label: 'One' }, { value: 2, label: 'Two' }],
        value: resource => resource.metadata?.classification,
        setValue: value => ({ metadata: { classification: Number(value) } }) },
    ] };
    gantt.setData({ tasks: [task, { ...task, id: 'other' }] }); await settle();
    await type('code', 'ENG', true); expect(gantt.resourceProvider.search).toHaveBeenCalledWith('ENG');
    row(true).querySelector<HTMLButtonElement>('[data-inline-suggestion]')!.click(); await settle();
    const select = row(true).querySelector<HTMLSelectElement>('[data-field="category"]')!;
    select.value = '2'; select.dispatchEvent(new Event('change', { bubbles: true })); await settle();
    enter(true); await settle();
    expect(row(true).textContent).toContain('Service indisponible');
    gantt.selectTask('other'); await settle(); gantt.selectTask('task'); await settle();
    expect(input('name', true).value).toBe('Engineer'); expect(row(true).textContent).toContain('Service indisponible');
    expect(gantt.options.inlineCreation!.resources!.save).toHaveBeenCalledWith(expect.objectContaining({ metadata: { classification: 2 } }), expect.objectContaining({ mode: 'catalogue' }));
  });

  it('rechecks rights after asynchronous validation before sending a save', async () => {
    const validation = deferred<void>(); const save = vi.fn();
    configure({ resources: { enabled: true, modes: ['free'], validate: () => validation.promise, save } });
    await settle(); await type('name', 'Waiting', true); enter(true); await settle();
    gantt.setTaskLocked(task.id, true); validation.resolve(); await settle();
    expect(save).not.toHaveBeenCalled(); expect(row(true)).toBeNull();
    gantt.setTaskLocked(task.id, false); await settle(); expect(input('name', true).value).toBe('Waiting');
  });

  it('uses one draft and one host save across embedded and detached panels', async () => {
    configure(); await settle(); await freeMode(); await type('name', 'Shared draft', true);
    const popupBody = document.createElement('div');
    document.body.append(popupBody);
    const popup = {
      closed: false, close: vi.fn(), focus: vi.fn(), addEventListener: vi.fn(),
      document: {
        title: '', body: popupBody, documentElement: document.createElement('html'),
        createElement: document.createElement.bind(document),
        head: { append: (script: HTMLElement) => script.dispatchEvent(new Event('load')) },
      },
    } as unknown as Window;
    vi.spyOn(window, 'open').mockReturnValue(popup);
    expect(gantt.undockResources()).toBe(true);
    const detached = popupBody.querySelector<GanttChart>('gantt-chart')!;
    try {
      await settle(detached); expect(input('name', true, detached).value).toBe('Shared draft');
      enter(true, detached); await settle(); await settle(detached);
      expect(gantt.options.inlineCreation!.resources!.save).toHaveBeenCalledTimes(1);
      expect(gantt.getData().tasks[0].resources![0].name).toBe('Shared draft');
      expect(input('name', true, detached).value).toBe('');
      expect(detached.getData().tasks[0].resources![0].name).toBe('Shared draft');
      gantt.dockResources(); await settle(); expect(input('name', true).value).toBe('');
      gantt.resourceProvider = { search: vi.fn(async () => [reference]) };
      expect(gantt.undockResources()).toBe(true);
      const cataloguePanel = popupBody.querySelector<GanttChart>('gantt-chart')!;
      await settle(cataloguePanel); await type('name', 'ENG', true, cataloguePanel);
      row(true, cataloguePanel).querySelector<HTMLButtonElement>('[data-inline-suggestion]')!.click(); await settle(cataloguePanel);
      enter(true, cataloguePanel); await settle(); await settle(cataloguePanel);
      expect(gantt.options.inlineCreation!.resources!.save).toHaveBeenCalledTimes(2);
      expect(gantt.getData().tasks[0].resources!.find(item => item.resourceId === reference.id)).toBeDefined();
    } finally { gantt.dockResources(); popupBody.remove(); }
  });

  it('uses the command persistence pipeline for continuous creation without inserting twice', async () => {
    const persist = vi.fn(async request => ({ data: request.proposedData }));
    configure({ tasks: { enabled: true, command: (draft, context) => ({ id: context.correlationId!, operation: {
      type: 'task.create', task: { ...task, ...draft, id: `task-${context.correlationId}`, parentId: context.parentId }, placement: { parentId: context.parentId },
    } }) } });
    gantt.options = { ...gantt.options, commands: { enabled: true, mode: 'controlled', persist } };
    const result = vi.fn(); gantt.addEventListener('inline-creation-result', result);
    await settle(); await type('name', 'First'); enter(); enter(); await settle();
    await type('name', '第二'); enter(); await settle();
    expect(persist).toHaveBeenCalledTimes(2); expect(gantt.getData().tasks).toHaveLength(3);
    expect(gantt.getData().tasks.map(task => task.name)).toEqual(['Task', 'First', '第二']);
    expect(input('name').value).toBe(''); expect(result).toHaveBeenCalledTimes(2);
    expect(result.mock.calls[0][0].detail.result.status).toBe('committed');
  });

  it('discards unsaved resource drafts only when configured and keeps a pending original target', async () => {
    const pending = deferred<GanttResource>();
    const save = vi.fn(() => pending.promise);
    configure({ resources: { enabled: true, modes: ['free'], selectionChange: 'discard', save } });
    gantt.setData({ tasks: [task, { ...task, id: 'second' }] }); gantt.selectTask('task'); await settle();
    await type('name', 'Discard me', true); gantt.selectTask('second'); gantt.selectTask('task'); await settle();
    expect(input('name', true).value).toBe('');
    await type('name', 'Original target', true); enter(true); await settle(); gantt.selectTask('second');
    pending.resolve({ id: 'saved-original', name: 'Original target', type: 'work', unitCost: 0, quantity: 1 }); await settle();
    expect(gantt.getData().tasks.find(task => task.id === 'task')!.resources![0].id).toBe('saved-original');
    expect(gantt.getData().tasks.find(task => task.id === 'second')!.resources).toHaveLength(0);
  });

  it.each(['fr-FR', 'en-US', 'ar'])('supports keyboard drafts with Unicode and translated RTL labels: %s', async locale => {
    configure(); gantt.dir = locale === 'ar' ? 'rtl' : 'ltr';
    gantt.options = { ...gantt.options, locale, translations: locale === 'ar' ? { newTask: 'مهمة جديدة', inlineResourceMode: 'طريقة الإنشاء' } : undefined };
    await settle(); await type('name', '同名 مهمة 🚀 '.repeat(20));
    const tab = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true });
    input('name').dispatchEvent(tab); expect(tab.defaultPrevented).toBe(false);
    enter(); await settle(); expect(gantt.getData().tasks.at(-1)!.name).toContain('同名 مهمة 🚀');
    if (locale === 'ar') expect(input('name').getAttribute('aria-label')).toContain('مهمة جديدة');
    gantt.options = { ...gantt.options, readOnly: true }; await settle(); expect(row()).toBeNull(); expect(row(true)).toBeNull();
  });

  it('leaves multiline Enter to a host editor and ignores legacy composition key events', async () => {
    configure({ resources: { enabled: true, modes: ['free'], save: vi.fn(), inputTemplate: context => context.column.key === 'name'
      ? html`<textarea data-field="name" @input=${(event: Event) => context.onInput((event.target as HTMLTextAreaElement).value)}></textarea>` : context.renderDefault() } });
    await settle(); await type('name', 'Two lines', true);
    const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    input('name', true).dispatchEvent(event); expect(event.defaultPrevented).toBe(false);
    input('name', true).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 229, bubbles: true }));
    await settle(); expect(gantt.options.inlineCreation!.resources!.save).not.toHaveBeenCalled();
  });
});
