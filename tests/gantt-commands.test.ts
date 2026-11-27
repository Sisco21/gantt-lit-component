import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GanttChart } from '../src/gantt-chart';
import DefaultGantt from '../src/index';
import { GanttCommandError, proposeGanttOperation, validateCommandData } from '../src/gantt-commands';
import type { GanttCommand, GanttOperation, GanttTimePolicy } from '../src/gantt-command-types';
import type { GanttData, GanttTask } from '../src/types';

const task = (id: string, parentId: string | null = null): GanttTask => ({ id, name: '同名 مهمة', start: '2026-11-26', end: '2026-11-27', progress: 0, type: 'task', parentId });
const plan = (): GanttData => ({ tasks: [task('a'), task('b')], calendars: [{ id: 'work', name: 'Calendar', workingDays: [1, 2, 3, 4, 5], exceptions: { '2026-11-30': 'non-working', '2026-11-28': 'working' } }] });
const policy: GanttTimePolicy = { unit: 'working-day', calendarId: 'work', dependencies: 'preserve', descendants: 'reject' };
const cmd = (operation: GanttOperation, id = crypto.randomUUID()): GanttCommand => ({ id, operation });
const create = (id: string, parentId: string | null = null): GanttOperation => ({ type: 'task.create', task: task(id, parentId), placement: { parentId } });
const deferred = <T>() => { let resolve!: (value: T) => void, reject!: (error: Error) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };

describe('structured commands', () => {
  let gantt: GanttChart;
  beforeEach(() => { gantt = new GanttChart(); document.body.append(gantt); gantt.options = { autoSchedule: false, commands: { enabled: true } }; gantt.setData(plan()); });
  afterEach(() => gantt.remove());
  const execute = (operation: GanttOperation) => gantt.executeCommand(cmd(operation));

  it('is opt-in, targets stable IDs with duplicate non-Latin names and returns final values', async () => {
    expect(DefaultGantt).toBe(GanttChart);
    gantt.options = {}; expect((await execute(create('c'))).issues[0].code).toBe('DISABLED');
    gantt.options = { commands: { enabled: true } };
    const result = await execute({ type: 'task.update', taskId: 'b', patch: { name: '更新 🚀' } });
    expect(result).toMatchObject({ status: 'committed', affectedIds: ['b'], issues: [] });
    expect(result.values!.tasks.find(task => task.id === 'a')!.name).toBe('同名 مهمة');
    expect(result.values!.tasks.find(task => task.id === 'b')!.name).toBe('更新 🚀');
  });

  it('keeps before/after, hierarchy and dependency operations independent', async () => {
    await execute({ ...create('phase'), task: { ...task('phase'), type: 'parent' } } as GanttOperation);
    await execute({ ...create('c'), placement: { parentId: null, position: { before: 'b' } } } as GanttOperation);
    await execute({ ...create('d'), placement: { parentId: null, position: { after: 'b' } } } as GanttOperation);
    await execute(create('child', 'phase'));
    expect(gantt.getData().tasks.map(task => task.id)).toEqual(['a', 'c', 'b', 'd', 'phase', 'child']);
    const originalDates = gantt.getData().tasks.map(task => [task.id, task.start, task.end]);
    await execute({ type: 'dependency.add', dependency: { from: 'a', to: 'b', type: 'finish-to-start' } });
    expect(gantt.getData().tasks.map(task => [task.id, task.start, task.end])).toEqual(originalDates);
    const moved = await execute({ type: 'task.move', taskId: 'd', placement: { parentId: null, position: { before: 'a' } } });
    expect(moved.affectedIds).toContain('d'); expect(gantt.getData().tasks[0].id).toBe('d');
    expect(gantt.getData().dependencies).toHaveLength(1);
    expect((await execute({ type: 'task.move', taskId: 'c', placement: { parentId: null, position: { after: 'child' } } })).issues[0].code).toBe('INVALID_POSITION');
    expect((await execute({ type: 'task.move', taskId: 'phase', placement: { parentId: 'child' } })).issues[0].code).toBe('HIERARCHY_CYCLE');
  });

  it('honours dates, explicit units, worked weekends and holiday exceptions', async () => {
    const result = await execute({ type: 'task.schedule', taskId: 'a', change: { shift: 2 }, policy });
    expect(result.values!.tasks[0]).toMatchObject({ start: '2026-11-28', end: '2026-12-01' });
    await execute({ type: 'task.schedule', taskId: 'a', change: { duration: 3 }, policy });
    expect(gantt.getData().tasks[0].end).toBe('2026-12-02');
    await execute({ type: 'task.schedule', taskId: 'a', change: { shift: -1 }, policy: { ...policy, unit: 'calendar-day' } });
    expect(gantt.getData().tasks[0]).toMatchObject({ start: '2026-11-27', end: '2026-12-01' });
  });

  it.each([
    [{ type: 'task.schedule', taskId: 'a', change: { start: '2026-02-30' }, policy }, 'INVALID_DATE'],
    [{ type: 'task.schedule', taskId: 'a', change: { duration: '2' }, policy }, 'INVALID_NUMBER'],
    [{ type: 'task.schedule', taskId: 'a', change: { shift: 1 }, policy: { ...policy, calendarId: 'missing' } }, 'CALENDAR_NOT_FOUND'],
    [{ type: 'task.schedule', taskId: 'a', change: { shift: 1 }, policy: { ...policy, dependencies: 'host' } }, 'HOST_REQUIRED'],
    [{ type: 'task.update', taskId: 'deleted', patch: { name: 'x' } }, 'NOT_FOUND'],
    [{ type: 'task.update', taskId: 'a', patch: { start: '2026-11-01' } }, 'INVALID_COMMAND'],
    [{ type: 'task.update', taskId: 'a', patch: { editable: true } }, 'INVALID_COMMAND'],
    [{ type: 'dependency.add', dependency: { from: 'a', to: 'a' } }, 'INVALID_DEPENDENCY'],
  ])('rejects invalid operation %# without changing confirmed data', async (operation, code) => {
    const before = gantt.toJSON();
    const result = await execute(operation as GanttOperation);
    expect(result.status).toBe('failed'); expect(result.issues[0].code).toBe(code); expect(gantt.toJSON()).toBe(before);
  });

  it('requires an explicit descendant policy and checks locks throughout a phase', async () => {
    gantt.setData({ ...plan(), tasks: [{ ...task('p'), type: 'parent' }, task('a', 'p')] });
    const move: GanttOperation = { type: 'task.schedule', taskId: 'p', change: { shift: 1 }, policy };
    expect((await execute(move)).issues[0].code).toBe('PHASE_POLICY_REQUIRED');
    const accepted = await execute({ ...move, policy: { ...policy, descendants: 'include' } });
    expect(accepted.values!.tasks.find(task => task.id === 'a')!.start).toBe('2026-11-27');
    gantt.setTaskLocked('a', true);
    expect((await execute({ ...move, policy: { ...policy, descendants: 'include' } })).issues[0].code).toBe('FORBIDDEN');
  });

  it('rejects dependency conflicts without implicitly propagating, and detects cycles', async () => {
    await execute({ type: 'dependency.add', dependency: { from: 'a', to: 'b' } });
    expect((await execute({ type: 'task.schedule', taskId: 'a', change: { shift: 2 }, policy: { ...policy, dependencies: 'reject' } })).issues[0].code).toBe('DEPENDENCY_CONFLICT');
    expect((await execute({ type: 'dependency.add', dependency: { from: 'b', to: 'a' } })).issues[0].code).toBe('DEPENDENCY_CYCLE');
    await execute({ type: 'dependency.update', from: 'a', to: 'b', patch: { type: 'start-to-start', lagDays: 2 } });
    expect(gantt.getData().dependencies![0]).toMatchObject({ type: 'start-to-start', lagDays: 2 });
    await execute({ type: 'dependency.remove', from: 'a', to: 'b' }); expect(gantt.getData().dependencies).toHaveLength(0);
  });

  it('adds, edits and removes canonical assignments without creating a catalogue record', async () => {
    const event = vi.fn(); gantt.addEventListener('resource-assignment-updated', event);
    await execute({ type: 'assignment.add', taskId: 'a', assignment: { id: 'assignment', resourceId: 'external-42', name: 'عامل', type: 'work', unit: 'h', quantity: 2, unitCost: 12 } });
    await execute({ type: 'assignment.update', taskId: 'a', assignmentId: 'assignment', patch: { quantity: 4 } });
    expect(gantt.getData().tasks[0].resources![0]).toMatchObject({ resourceId: 'external-42', quantity: 4 });
    expect(Object.values(gantt.getData().tasks[0].resources![0].quantityByDate!).reduce((total, value) => total + value, 0)).toBe(4);
    await execute({ type: 'assignment.remove', taskId: 'a', assignmentId: 'assignment' });
    expect(gantt.getData().tasks[0].resources).toHaveLength(0); expect(event).toHaveBeenCalledTimes(3);
  });

  it('retains only separate preview data, supports cancellation and ignores superseded host simulations', async () => {
    const first = deferred<GanttData>(), second = deferred<GanttData>();
    gantt.options = { ...gantt.options, commands: { enabled: true, simulate: vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise) } };
    const one = gantt.previewCommand(cmd(create('one'))), two = gantt.previewCommand(cmd(create('two')));
    second.resolve({ ...plan(), tasks: [...plan().tasks, task('two')] }); expect((await two).previewSource).toBe('host');
    first.resolve({ ...plan(), tasks: [...plan().tasks, task('one')] }); expect((await one).status).toBe('cancelled');
    expect(gantt.getCommandPreview()!.values!.tasks.at(-1)!.id).toBe('two'); expect(gantt.getData().tasks).toHaveLength(2);
    gantt.cancelCommandPreview(); expect(gantt.getCommandPreview()).toBeUndefined();
  });

  it('invalidates preview on a revision change and reveals collapsed targets', async () => {
    await gantt.previewCommand(cmd(create('c'))); gantt.setData({ ...plan(), tasks: [{ ...task('a'), name: 'Changed' }, task('b')] });
    expect((await gantt.commitCommandPreview()).issues[0].code).toBe('REVISION_CONFLICT');
    gantt.setData({ tasks: [{ ...task('p'), type: 'parent', collapsed: true }, task('child', 'p')] });
    await execute({ type: 'task.select', taskId: 'child', reveal: true });
    expect(gantt.getData().tasks.map(task => task.id)).toContain('child');
    await gantt.updateComplete;
    expect(gantt.shadowRoot!.querySelector('[data-task-id="child"]')).not.toBeNull();
  });

  it('blocks duplicate submissions and applies only a canonical asynchronous response', async () => {
    const pending = deferred<{ data: GanttData; undoToken: string }>(), persist = vi.fn(() => pending.promise), autosave = vi.fn();
    gantt.saveHook = autosave; gantt.options = { ...gantt.options, commands: { enabled: true, mode: 'controlled', persist } };
    const command = { ...cmd(create('c'), 'request'), expectedRevision: gantt.commandRevision };
    const one = gantt.executeCommand(command), two = gantt.executeCommand(command);
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(persist).toHaveBeenCalledTimes(1); expect(gantt.getData().tasks).toHaveLength(2);
    expect((await execute(create('busy'))).issues[0].code).toBe('BUSY');
    const canonical = { ...plan(), tasks: [...plan().tasks, { ...task('c'), name: 'Server value' }] };
    pending.resolve({ data: canonical, undoToken: 'undo-1' });
    expect((await one).status).toBe('committed'); expect((await two).status).toBe('committed');
    expect(gantt.getData().tasks.at(-1)!.name).toBe('Server value'); expect(autosave).not.toHaveBeenCalled();
    expect((await gantt.executeCommand(command)).status).toBe('committed'); expect(persist).toHaveBeenCalledTimes(1);
    expect((await gantt.executeCommand({ ...command, operation: create('different') })).issues[0].code).toBe('DUPLICATE_ID');
  });

  it('keeps data on persistence failure, retries the same ID, and rejects incomplete responses', async () => {
    const persist = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ data: { ...plan(), tasks: [...plan().tasks, task('c')] } }).mockResolvedValueOnce({ data: { tasks: [task('bad'), task('bad')] } });
    gantt.options = { ...gantt.options, commands: { enabled: true, mode: 'controlled', persist } };
    const command = cmd(create('c'));
    expect((await gantt.executeCommand(command)).issues[0].code).toBe('PERSIST_FAILED'); expect(gantt.getData().tasks).toHaveLength(2);
    expect((await gantt.executeCommand(command)).status).toBe('committed');
    expect((await execute(create('bad'))).issues[0].code).toBe('INVALID_RESPONSE'); expect(gantt.getData().tasks).toHaveLength(3);
  });

  it('reports a persisted conflict instead of overwriting edits made during saving', async () => {
    const saving = deferred<{ data: GanttData }>();
    gantt.options = { ...gantt.options, commands: { enabled: true, mode: 'controlled', persist: () => saving.promise } };
    const pending = execute(create('c')); await new Promise(resolve => setTimeout(resolve, 0));
    gantt.setData({ ...plan(), tasks: [{ ...task('a'), name: 'Concurrent edit' }, task('b')] }); saving.resolve({ data: { ...plan(), tasks: [...plan().tasks, task('c')] } });
    expect(await pending).toMatchObject({ status: 'failed', persisted: true, issues: [{ code: 'REVISION_CONFLICT' }] });
    expect(gantt.getData().tasks[0].name).toBe('Concurrent edit'); expect(gantt.getData().tasks).toHaveLength(2);
  });

  it('commits an atomic group once after success and exposes non-atomic partial results', async () => {
    const event = vi.fn(); gantt.addEventListener('tasks-changed', event);
    const group: GanttCommand = { id: 'atomic', operation: { type: 'batch', atomic: true, operations: [create('c'), create('a')] } };
    expect((await gantt.executeCommand(group)).status).toBe('failed'); expect(gantt.getData().tasks).toHaveLength(2); expect(event).not.toHaveBeenCalled();
    const partial = await gantt.executeCommand({ ...group, id: 'partial', operation: { ...group.operation, type: 'batch', atomic: false, operations: [create('c'), create('a')] } });
    expect(partial.status).toBe('partial'); expect(partial.results!.map(result => result.status)).toEqual(['committed', 'failed']); expect(event).toHaveBeenCalledTimes(1);
  });

  it('never confirms an atomic group if its host transaction fails', async () => {
    const persist = vi.fn(async () => { throw new GanttCommandError('REVISION_CONFLICT', { expected: 4 }); });
    gantt.options = { ...gantt.options, commands: { enabled: true, mode: 'controlled', persist } };
    const result = await gantt.executeCommand({ id: 'transaction', operation: { type: 'batch', atomic: true, operations: [create('c'), create('d')] } });
    expect(persist).toHaveBeenCalledTimes(1); expect(result.issues[0].code).toBe('REVISION_CONFLICT'); expect(gantt.getData().tasks).toHaveLength(2);
  });

  it('checks read-only and permissions after asynchronous validation, and reports hidden inserts', async () => {
    const validation = deferred<void>(), persist = vi.fn();
    gantt.options = { commands: { enabled: true, mode: 'controlled', validate: () => validation.promise, persist } };
    const pending = execute(create('c')); gantt.options = { ...gantt.options, readOnly: true }; validation.resolve();
    expect((await pending).issues[0].code).toBe('READ_ONLY'); expect(persist).not.toHaveBeenCalled();
    gantt.options = { commands: { enabled: true, isTaskVisible: id => id !== 'c' } };
    expect((await execute(create('c'))).hiddenIds).toEqual(['c']);
    gantt.options = { ...gantt.options, isTaskEditable: () => false };
    expect((await execute({ type: 'task.update', taskId: 'a', patch: { name: 'blocked' } })).issues[0].code).toBe('FORBIDDEN');
  });

  it('persists undo/redo through host tokens and preserves history on a revision conflict', async () => {
    const history = vi.fn().mockRejectedValueOnce(new GanttCommandError('REVISION_CONFLICT')).mockResolvedValueOnce({ data: plan(), undoToken: 'redo' }).mockResolvedValueOnce({ data: { ...plan(), tasks: [...plan().tasks, task('c')] } });
    gantt.options = { ...gantt.options, commands: { enabled: true, mode: 'controlled', persist: request => ({ data: request.proposedData, undoToken: 'undo' }), history } };
    await execute(create('c')); expect((await gantt.undoCommand('h1')).issues[0].code).toBe('REVISION_CONFLICT');
    expect((await gantt.undoCommand('h2')).status).toBe('committed'); expect(gantt.getData().tasks).toHaveLength(2);
    expect((await gantt.redoCommand('h3')).status).toBe('committed'); expect(gantt.getData().tasks).toHaveLength(3);
    expect(history.mock.calls[2][0]).toMatchObject({ direction: 'redo', token: 'redo' });
  });

  it('pure validation and proposals never mutate host objects', () => {
    const input = plan(), before = JSON.stringify(input);
    const result = proposeGanttOperation(input, create('c'));
    expect(result.tasks).toHaveLength(3); expect(JSON.stringify(input)).toBe(before);
    expect(() => validateCommandData({ tasks: [task('same'), task('same')] })).toThrow('DUPLICATE_ID');
  });

  it('routes existing manual edits through host validation without confirming early', async () => {
    const saving = deferred<{ data: GanttData }>();
    const persist = vi.fn(() => saving.promise), changed = vi.fn();
    gantt.options = { ...gantt.options, commands: { enabled: true, mode: 'controlled', persist } };
    gantt.addEventListener('tasks-changed', changed);
    gantt.updateTask('a', { name: 'Manual value' });
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(gantt.getData().tasks[0].name).toBe('同名 مهمة'); expect(changed).not.toHaveBeenCalled();
    const request = persist.mock.calls[0][0];
    expect(request.command.operation).toMatchObject({ type: 'plan.replace', source: 'manual', taskId: 'a' });
    saving.resolve({ data: request.proposedData }); await new Promise(resolve => setTimeout(resolve, 0));
    expect(gantt.getData().tasks[0].name).toBe('Manual value'); expect(changed).toHaveBeenCalledTimes(1);
  });

  it('keeps confirmed manual values when the host rejects them and honours shared business validation', async () => {
    const persist = vi.fn(), validation = vi.fn(() => [{ code: 'INVALID_DATA' as const, params: { field: 'name' } }]);
    gantt.options = { ...gantt.options, commands: { enabled: true, mode: 'controlled', persist, validate: validation } };
    gantt.updateTask('a', { name: 'Forbidden business value' }); await new Promise(resolve => setTimeout(resolve, 0));
    expect(gantt.getData().tasks[0].name).toBe('同名 مهمة'); expect(persist).not.toHaveBeenCalled();
    expect((await execute({ type: 'task.update', taskId: 'a', patch: { name: 'Forbidden business value' } })).issues[0].code).toBe('INVALID_DATA');
    expect(validation).toHaveBeenCalledTimes(2);
  });

  it('forwards exactly the approved server simulation when confirming a preview', async () => {
    const simulate = vi.fn(request => ({ ...request.proposedData, metadata: { simulationToken: 'approved-version' } }));
    const persist = vi.fn(request => ({ data: request.proposedData }));
    gantt.options = { ...gantt.options, commands: { enabled: true, mode: 'controlled', simulate, persist } };
    await gantt.previewCommand(cmd(create('c')));
    expect((await gantt.commitCommandPreview()).status).toBe('committed');
    expect(simulate).toHaveBeenCalledTimes(1); expect(persist.mock.calls[0][0].proposedData.metadata.simulationToken).toBe('approved-version');
  });

  it.each([null, {}, { id: 'empty' }, { id: 'batch', operation: { type: 'batch' } }, { id: 'task', operation: { type: 'task.create' } }, { id: 'null-op', operation: { type: 'batch', atomic: true, operations: [null] } }])('returns a structured error for malformed runtime JSON %#', async value => {
    const result = await gantt.executeCommand(value as unknown as GanttCommand);
    expect(result.status).toBe('failed'); expect(result.issues[0].code).toBeTruthy(); expect(gantt.getData().tasks).toHaveLength(2);
  });

  it('keeps collapse state during a save without treating a view change as a data conflict', async () => {
    gantt.setData({ ...plan(), tasks: [{ ...task('p'), type: 'parent', collapsed: false }, task('a', 'p')] });
    const pending = deferred<{ data: GanttData }>(); let proposed!: GanttData;
    gantt.options = { ...gantt.options, commands: { enabled: true, mode: 'controlled', persist: request => { proposed = request.proposedData; return pending.promise; } } };
    const result = execute({ type: 'task.update', taskId: 'a', patch: { name: 'Canonical' } });
    await new Promise(resolve => setTimeout(resolve, 0)); gantt.toggleTask('p');
    pending.resolve({ data: proposed }); expect((await result).status).toBe('committed');
    await gantt.updateComplete;
    expect(gantt.shadowRoot!.querySelector('.task-row[data-task-id="a"]')).toBeNull();
  });

  it('shares the command owner with detached resources and never reschedules canonical data there', async () => {
    const persist = vi.fn(request => ({ data: request.proposedData }));
    gantt.options = { autoSchedule: true, commands: { enabled: true, mode: 'controlled', persist } };
    await execute({ type: 'dependency.add', dependency: { from: 'a', to: 'b' } });
    gantt.selectTask('a');
    const popupBody = document.createElement('div'); document.body.append(popupBody);
    const popup = { closed: false, close: vi.fn(), focus: vi.fn(), addEventListener: vi.fn(), document: {
      title: '', body: popupBody, documentElement: document.createElement('html'), createElement: document.createElement.bind(document),
      head: { append: (script: HTMLElement) => script.dispatchEvent(new Event('load')) },
    } } as unknown as Window;
    vi.spyOn(window, 'open').mockReturnValue(popup);
    try {
      expect(gantt.undockResources()).toBe(true);
      const detached = popupBody.querySelector<GanttChart>('gantt-chart')!;
      await detached.updateComplete;
      expect(detached.getData().tasks.map(task => [task.start, task.end])).toEqual(gantt.getData().tasks.map(task => [task.start, task.end]));
      expect(detached.commandRevision).toBe(gantt.commandRevision);
      detached.addResource('a', { id: 'detached-assignment', name: 'عامل', unit: 'h', unitCost: 2, quantity: 3 });
      await new Promise(resolve => setTimeout(resolve, 0)); await gantt.updateComplete; await detached.updateComplete;
      expect(gantt.getData().tasks[0].resources![0].id).toBe('detached-assignment');
      expect(detached.getData().tasks.map(task => [task.start, task.end])).toEqual(gantt.getData().tasks.map(task => [task.start, task.end]));
      expect(persist).toHaveBeenCalledTimes(2);
    } finally { gantt.dockResources(); popupBody.remove(); }
  });
});
