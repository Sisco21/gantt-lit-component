import type { GanttData, GanttDependency, GanttOptions, GanttTask } from './types';
import type {
  GanttCommand, GanttCommandErrorCode, GanttCommandIssue, GanttCommandRequest,
  GanttCommandResult, GanttInsertion, GanttOperation, GanttTimePolicy,
} from './gantt-command-types';
import { buildTaskTree, diffDays, formatDate, parseDateOnly } from './utils';
import { flattenTaskTree } from './gantt-task-tree';
import { getCalendarDayState } from './gantt-calendar';
import { distributeResourceQuantity, getResourceTotalQuantity, getResourceCost } from './gantt-resources';

export class GanttCommandError extends Error {
  constructor(public code: GanttCommandErrorCode, public params?: GanttCommandIssue['params']) { super(code); }
}
function fail(code: GanttCommandErrorCode, params?: GanttCommandIssue['params']): never { throw new GanttCommandError(code, params); }
const own = (object: object, key: string) => Object.prototype.hasOwnProperty.call(object, key);
export function isCivilDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}
function number(value: unknown, field: string, integer = false) {
  if (typeof value !== 'number' || !Number.isFinite(value) || (integer && !Number.isSafeInteger(value))) fail('INVALID_NUMBER', { field });
}
function id(value: unknown) { if (typeof value !== 'string' || !value.trim()) fail('INVALID_DATA', { field: 'id' }); }
function requireFields(object: object, fields: readonly string[]) {
  for (const field of fields) {
    const value = field.split('.').reduce<unknown>((value, key) => value && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined, object);
    if (value === undefined || value === null || String(value).trim() === '') fail('INVALID_DATA', { field });
  }
}

/** Shared structural validation for canonical command and inline-save responses. */
export function validateCommandData(data: GanttData): void {
  if (!data || !Array.isArray(data.tasks)) fail('INVALID_DATA');
  const tasks = flattenTaskTree(data.tasks);
  const byId = new Map<string, GanttTask>();
  for (const task of tasks) {
    id(task.id);
    if (byId.has(task.id)) fail('DUPLICATE_ID', { id: task.id });
    byId.set(task.id, task);
    if (typeof task.name !== 'string' || !task.name.trim() || !['task', 'parent', 'milestone'].includes(task.type)) fail('INVALID_DATA', { id: task.id });
    if (!isCivilDate(task.start) || !isCivilDate(task.end) || task.end < task.start) fail('INVALID_DATE', { id: task.id });
    number(task.progress, 'progress');
    if (task.progress < 0 || task.progress > 100) fail('INVALID_NUMBER', { field: 'progress' });
    const resources = new Set<string>();
    for (const resource of task.resources || []) {
      id(resource.id);
      if (resources.has(resource.id)) fail('DUPLICATE_ID', { id: resource.id });
      resources.add(resource.id);
      if (typeof resource.name !== 'string' || !resource.name.trim()) fail('INVALID_DATA', { id: resource.id });
      number(resource.quantity, 'quantity'); number(resource.unitCost, 'unitCost');
      for (const [date, quantity] of Object.entries(resource.quantityByDate || {})) {
        if (!isCivilDate(date)) fail('INVALID_DATE', { date });
        number(quantity, 'quantityByDate');
      }
    }
  }
  for (const task of tasks) {
    const visited = new Set([task.id]);
    let parent = task.parentId;
    while (parent !== null && parent !== undefined) {
      if (visited.has(parent)) fail('HIERARCHY_CYCLE', { id: task.id });
      visited.add(parent);
      const target = byId.get(parent);
      if (!target) fail('NOT_FOUND', { id: parent });
      parent = target.parentId;
    }
  }
  const links = new Set<string>();
  const edges = new Map<string, string[]>();
  for (const link of data.dependencies || []) {
    const key = JSON.stringify([link.from, link.to]);
    if (!byId.has(link.from) || !byId.has(link.to) || link.from === link.to || links.has(key)) fail('INVALID_DEPENDENCY');
    if (link.type && !['finish-to-start', 'start-to-start', 'finish-to-finish', 'start-to-finish'].includes(link.type)) fail('INVALID_DEPENDENCY');
    if (link.lagDays !== undefined) number(link.lagDays, 'lagDays', true);
    for (const [source, target] of [[link.from, link.to], [link.to, link.from]]) {
      let parent = byId.get(target)?.parentId;
      while (parent) {
        if (parent === source) fail('INVALID_DEPENDENCY');
        parent = byId.get(parent)?.parentId;
      }
    }
    links.add(key);
    edges.set(link.from, [...edges.get(link.from) || [], link.to]);
  }
  const visiting = new Set<string>(), done = new Set<string>();
  const visit = (key: string) => {
    if (visiting.has(key)) fail('DEPENDENCY_CYCLE');
    if (done.has(key)) return;
    visiting.add(key); (edges.get(key) || []).forEach(visit); visiting.delete(key); done.add(key);
  };
  tasks.forEach(task => visit(task.id));
}

function descendants(tasks: GanttTask[], rootId: string): Set<string> {
  const result = new Set([rootId]);
  let previous = 0;
  while (previous !== result.size) {
    previous = result.size;
    tasks.forEach(task => { if (task.parentId && result.has(task.parentId)) result.add(task.id); });
  }
  return result;
}
function addDate(value: string, days: number): string {
  const date = parseDateOnly(value); date.setUTCDate(date.getUTCDate() + days);
  const result = formatDate(date);
  if (!isCivilDate(result)) fail('INVALID_DATE');
  return result;
}
function timeMath(data: GanttData, policy: GanttTimePolicy) {
  if (!policy || !['calendar-day', 'working-day'].includes(policy.unit)
    || !['preserve', 'reject', 'host'].includes(policy.dependencies) || !['include', 'reject'].includes(policy.descendants)) fail('INVALID_COMMAND');
  const calendar = data.calendars?.find(item => item.id === policy.calendarId);
  if (!calendar) fail('CALENDAR_NOT_FOUND', { id: policy.calendarId || '' });
  const working = (value: string) => policy.unit === 'calendar-day' || getCalendarDayState(calendar, parseDateOnly(value), [0, 6]).working;
  // Bounded civil-date calculations, with exceptions (including working weekends).
  const advance = (value: string, amount: number) => {
    number(amount, 'days', true);
    if (Math.abs(amount) > 36500) fail('INVALID_NUMBER', { field: 'days' });
    if (amount && policy.unit === 'working-day' && calendar.workingDays?.length === 0 && !Object.values(calendar.exceptions || {}).includes('working')) fail('NO_WORKING_DAY');
    let remaining = Math.abs(amount), result = value;
    for (let attempts = 0; remaining; attempts++) {
      if (attempts > 366000) fail('NO_WORKING_DAY');
      result = addDate(result, Math.sign(amount));
      if (working(result)) remaining--;
    }
    return result;
  };
  const duration = (start: string, end: string) => {
    const days = diffDays(start, end);
    if (days > 366000) fail('INVALID_DATE');
    let count = 0;
    for (let index = 0; index <= days; index++) if (working(addDate(start, index))) count++;
    if (!count) fail('NO_WORKING_DAY');
    return count;
  };
  return { advance, duration, working };
}
function dependencySatisfied(tasks: GanttTask[], link: GanttDependency) {
  const from = tasks.find(task => task.id === link.from)!, to = tasks.find(task => task.id === link.to)!;
  const lag = link.lagDays || 0;
  switch (link.type) {
    case 'start-to-start': return to.start >= addDate(from.start, lag);
    case 'finish-to-finish': return to.end >= addDate(from.end, lag);
    case 'start-to-finish': return to.end >= addDate(from.start, lag);
    default: return to.start >= addDate(from.end, lag + 1);
  }
}

/** Pure local proposal. It never performs persistence or changes the caller's objects. */
export function proposeGanttOperation(input: GanttData, operation: GanttOperation, options: GanttOptions = {}, hostSimulation = false): GanttData {
  const data = structuredClone(input);
  data.tasks = flattenTaskTree(data.tasks);
  validateCommandData(data);
  if (!operation || typeof operation.type !== 'string') fail('INVALID_COMMAND');
  const find = (taskId: string): GanttTask => data.tasks.find(task => task.id === taskId) || fail('NOT_FOUND', { id: taskId });
  const editable = (taskId: string) => {
    const task = find(taskId);
    if (task.editable === false || options.isTaskEditable?.(structuredClone(task)) === false) fail('FORBIDDEN', { id: taskId });
    return task;
  };
  if (operation.type !== 'task.select' && options.readOnly) fail('READ_ONLY');
  if (options.commands?.canExecute?.(structuredClone(operation), structuredClone(data)) === false) fail('FORBIDDEN');
  const place = (task: GanttTask, placement: GanttInsertion, branch: GanttTask[]) => {
    if (!placement || !own(placement, 'parentId')) fail('INVALID_POSITION');
    if (placement.parentId !== null) editable(placement.parentId);
    if (branch.some(item => item.id === placement.parentId)) fail('HIERARCHY_CYCLE');
    const ids = new Set(branch.map(item => item.id));
    const remaining = data.tasks.filter(item => !ids.has(item.id));
    let index = remaining.length;
    if (placement.position) {
      const keys = Object.keys(placement.position);
      if (keys.length !== 1 || !['before', 'after'].includes(keys[0])) fail('INVALID_POSITION');
      const anchorId = 'before' in placement.position ? placement.position.before : placement.position.after;
      const anchor = find(anchorId);
      if (ids.has(anchorId) || (anchor.parentId ?? null) !== placement.parentId) fail('INVALID_POSITION', { id: anchorId });
      index = remaining.findIndex(item => item.id === anchorId);
      if ('after' in placement.position) {
        const anchorIds = descendants(remaining, anchorId);
        while (index < remaining.length && anchorIds.has(remaining[index].id)) index++;
      }
    }
    task.parentId = placement.parentId;
    remaining.splice(index, 0, ...branch);
    data.tasks = remaining;
  };
  switch (operation.type) {
    case 'plan.replace': {
      if (operation.source !== 'manual') fail('INVALID_COMMAND');
      const proposed = structuredClone(operation.data);
      validateCommandData(proposed);
      proposed.tasks = flattenTaskTree(proposed.tasks);
      for (const task of data.tasks) {
        const next = proposed.tasks.find(item => item.id === task.id);
        if (JSON.stringify(next) !== JSON.stringify(task)) editable(task.id);
      }
      if (operation.taskId && data.tasks.some(task => task.id === operation.taskId)) editable(operation.taskId);
      for (const task of proposed.tasks) {
        const current = data.tasks.find(item => item.id === task.id);
        if (task.parentId && task.parentId !== current?.parentId && data.tasks.some(item => item.id === task.parentId)) editable(task.parentId);
        if (!current) {
          const context = { parentId: task.parentId, index: proposed.tasks.indexOf(task), selectedTask: null, lastTask: data.tasks.at(-1) || null };
          if (options.inlineCreation?.tasks?.canCreate?.(context) === false) fail('FORBIDDEN');
          requireFields(task, options.inlineCreation?.tasks?.requiredFields || ['name']);
        }
        const previousIds = new Set(current?.resources?.map(resource => resource.id) || []);
        if (task.resources?.some(resource => !previousIds.has(resource.id)) && options.inlineCreation?.resources?.canCreate?.(structuredClone(task)) === false) fail('FORBIDDEN');
        for (const resource of task.resources || []) if (!previousIds.has(resource.id)) requireFields(resource, options.inlineCreation?.resources?.requiredFields || ['name']);
      }
      const oldLinks = data.dependencies || [], nextLinks = proposed.dependencies || [];
      for (const link of [...oldLinks.filter(link => !nextLinks.some(next => JSON.stringify(next) === JSON.stringify(link))), ...nextLinks.filter(link => !oldLinks.some(old => JSON.stringify(old) === JSON.stringify(link)))]) {
        if (data.tasks.some(task => task.id === link.from)) editable(link.from);
        if (data.tasks.some(task => task.id === link.to)) editable(link.to);
      }
      return proposed;
    }
    case 'task.create': {
      if (!operation.task || operation.task.children?.length || operation.task.parentId !== operation.placement?.parentId) fail('INVALID_POSITION');
      if (data.tasks.some(task => task.id === operation.task.id)) fail('DUPLICATE_ID', { id: operation.task.id });
      const task = structuredClone(operation.task);
      const lastTask = data.tasks.at(-1) || null;
      place(task, operation.placement, [task]);
      validateCommandData(data);
      data.tasks = flattenTaskTree(buildTaskTree(data.tasks));
      const context = { parentId: operation.placement.parentId, index: data.tasks.findIndex(item => item.id === task.id), selectedTask: null, lastTask };
      if (options.inlineCreation?.tasks?.canCreate?.(context) === false) fail('FORBIDDEN');
      requireFields(task, options.inlineCreation?.tasks?.requiredFields || ['name']);
      break;
    }
    case 'task.move': {
      const task = editable(operation.taskId), ids = descendants(data.tasks, task.id);
      ids.forEach(editable);
      place(task, operation.placement, data.tasks.filter(item => ids.has(item.id))); break;
    }
    case 'task.update': {
      const task = editable(operation.taskId);
      if (!operation.patch || ['id', 'children', 'parentId', 'start', 'end', 'resources', 'editable', 'collapsed'].some(key => own(operation.patch, key))) fail('INVALID_COMMAND');
      Object.assign(task, operation.patch); break;
    }
    case 'task.schedule': {
      const task = editable(operation.taskId), policy = operation.policy;
      const math = timeMath(data, policy);
      if (policy.dependencies === 'host' && !hostSimulation) fail('HOST_REQUIRED');
      const ids = descendants(data.tasks, task.id);
      const change = operation.change;
      if (!change || Object.keys(change).length !== 1) fail('INVALID_COMMAND');
      if (ids.size > 1 && policy.descendants !== 'include') fail('PHASE_POLICY_REQUIRED');
      if (ids.size > 1 && !('shift' in change) && !('start' in change)) fail('PHASE_POLICY_REQUIRED');
      ids.forEach(editable);
      let shift: number | undefined;
      if ('shift' in change) { number(change.shift, 'shift', true); shift = change.shift; }
      if ('start' in change && !isCivilDate(change.start) || 'end' in change && !isCivilDate(change.end)) fail('INVALID_DATE');
      if ('start' in change && ids.size > 1) {
        shift = policy.unit === 'calendar-day' ? diffDays(task.start, change.start)
          : change.start === task.start ? 0 : (math.duration(task.start < change.start ? task.start : change.start, task.start < change.start ? change.start : task.start) - 1) * (change.start < task.start ? -1 : 1);
        if (math.advance(task.start, shift) !== change.start) fail('INVALID_DATE');
      }
      for (const target of data.tasks.filter(item => ids.has(item.id))) {
        const originalStart = target.start, originalEnd = target.end;
        if (shift === 0) continue;
        if (shift !== undefined) {
          target.start = math.advance(target.start, shift);
          target.end = policy.unit === 'calendar-day' ? math.advance(target.end, shift) : math.advance(target.start, math.duration(originalStart, originalEnd) - 1);
        } else if ('start' in change) target.start = change.start;
        else if ('end' in change) target.end = change.end;
        else if ('duration' in change) {
          number(change.duration, 'duration', true);
          if (change.duration < 1 || change.duration > 36500 || !math.working(target.start)) fail('INVALID_NUMBER', { field: 'duration' });
          target.end = math.advance(target.start, change.duration - 1);
        } else fail('INVALID_COMMAND');
        if (target.resources) target.resources = target.resources.map(resource => {
          if (!resource.quantityByDate) return resource;
          const quantityByDate = shift !== undefined && policy.unit === 'calendar-day'
            ? Object.fromEntries(Object.entries(resource.quantityByDate).map(([date, quantity]) => [addDate(date, diffDays(originalStart, target.start)), quantity]))
            : distributeResourceQuantity(target.start, target.end, getResourceTotalQuantity(resource), resource, (_resource, date) => math.working(formatDate(date)));
          return { ...resource, quantityByDate, cost: undefined, totalQuantity: undefined };
        });
      }
      break;
    }
    case 'assignment.add': {
      const task = editable(operation.taskId);
      if (options.inlineCreation?.resources?.canCreate?.(structuredClone(task)) === false) fail('FORBIDDEN');
      if (!operation.assignment) fail('INVALID_COMMAND');
      requireFields(operation.assignment, options.inlineCreation?.resources?.requiredFields || ['name']);
      if (task.resources?.some(item => item.id === operation.assignment.id)) fail('DUPLICATE_ID', { id: operation.assignment.id });
      task.resources = [...task.resources || [], structuredClone(operation.assignment)]; break;
    }
    case 'assignment.update': case 'assignment.remove': {
      const task = editable(operation.taskId);
      const resource = task.resources?.find(item => item.id === operation.assignmentId) || fail('NOT_FOUND', { id: operation.assignmentId });
      if (operation.type === 'assignment.remove') task.resources = task.resources!.filter(item => item.id !== resource.id);
      else {
        if (!operation.patch || own(operation.patch, 'id')) fail('INVALID_COMMAND');
        Object.assign(resource, operation.patch);
        if (operation.patch.quantity !== undefined && operation.patch.quantityByDate === undefined) {
          number(operation.patch.quantity, 'quantity');
          const calendarId = resource.calendarId || task.calendarId || data.projectCalendarId;
          const calendar = data.calendars?.find(calendar => calendar.id === calendarId);
          resource.quantityByDate = distributeResourceQuantity(task.start, task.end, resource.quantity, resource,
            (_resource, date) => getCalendarDayState(calendar, date, options.nonWorkingDays || [0, 6]).working);
          resource.totalQuantity = undefined;
        }
        if (operation.patch.quantity !== undefined || operation.patch.unitCost !== undefined || operation.patch.quantityByDate !== undefined) resource.cost = getResourceCost(resource);
      }
      break;
    }
    case 'dependency.add': {
      if (!operation.dependency) fail('INVALID_COMMAND');
      editable(operation.dependency.from); editable(operation.dependency.to);
      data.dependencies = [...data.dependencies || [], structuredClone(operation.dependency)]; break;
    }
    case 'dependency.update': case 'dependency.remove': {
      editable(operation.from); editable(operation.to);
      const link = data.dependencies?.find(item => item.from === operation.from && item.to === operation.to) || fail('NOT_FOUND');
      if (operation.type === 'dependency.remove') data.dependencies = data.dependencies!.filter(item => item !== link);
      else {
        if (!operation.patch || Object.keys(operation.patch).some(key => !['type', 'lagDays'].includes(key))) fail('INVALID_COMMAND');
        Object.assign(link, operation.patch);
      }
      break;
    }
    case 'task.select': find(operation.taskId); break;
    default: fail('INVALID_COMMAND');
  }
  validateCommandData(data);
  data.tasks = flattenTaskTree(buildTaskTree(data.tasks));
  if (operation.type === 'task.schedule' && operation.policy.dependencies === 'reject' && (data.dependencies || []).some(link => !dependencySatisfied(data.tasks, link))) fail('DEPENDENCY_CONFLICT');
  return data;
}

interface CommandHost {
  options(): GanttOptions;
  data(): GanttData;
  revision(): number;
  apply(data: GanttData, affectedIds: string[]): void;
  select(taskId: string, reveal: boolean): void;
  emit(name: string, result: GanttCommandResult): void;
}
const issue = (error: unknown): GanttCommandIssue => error instanceof GanttCommandError
  ? { code: error.code, params: error.params } : { code: 'INVALID_COMMAND' };
const fingerprint = (data: GanttData) => JSON.stringify({ ...data, tasks: flattenTaskTree(data.tasks).map(({ collapsed: _collapsed, ...task }) => task) });
const mutates = (command: GanttCommand) => command.operation.type === 'batch'
  ? command.operation.operations.some(operation => operation.type !== 'task.select') : command.operation.type !== 'task.select';

/** Coordinates proposals, host simulation, persistence and canonical commits. */
export class GanttCommands {
  private pending = new Map<string, { key: string; promise: Promise<GanttCommandResult> }>();
  private completed = new Map<string, { key: string; result: GanttCommandResult }>();
  private preview?: { command: GanttCommand; result: GanttCommandResult; request: GanttCommandRequest; base: string; revision: number };
  private previewGeneration = 0;
  private busy = false;
  private undoStack: string[] = [];
  private redoStack: string[] = [];
  private historyAffected = new Map<string, string[]>();
  constructor(private host: CommandHost) {}
  get canUndo(): boolean { return this.undoStack.length > 0; }
  get canRedo(): boolean { return this.redoStack.length > 0; }

  private result(command: GanttCommand, status: GanttCommandResult['status'], issues: GanttCommandIssue[] = [], values?: GanttData): GanttCommandResult {
    const before = new Map(flattenTaskTree(this.host.data().tasks).map(task => [task.id, JSON.stringify(task)]));
    const after = Array.isArray(values?.tasks) ? flattenTaskTree(values!.tasks) : [];
    const requested = command?.operation?.type === 'batch' ? command.operation.operations : command?.operation ? [command.operation] : [];
    const operations = Array.isArray(requested) ? requested.filter(operation => operation && typeof operation === 'object') : [];
    const explicit = operations.flatMap(operation => 'taskId' in operation && operation.taskId ? [operation.taskId]
      : operation.type === 'task.create' ? [operation.task?.id]
      : operation.type === 'dependency.add' ? [operation.dependency?.from, operation.dependency?.to]
      : 'from' in operation ? [operation.from, operation.to] : []).filter((id): id is string => typeof id === 'string');
    return { id: command?.id || '', status, revision: this.host.revision(), issues, values,
      affectedAssignments: operations.flatMap(operation => operation.type === 'assignment.add' && operation.assignment ? [{ taskId: operation.taskId, assignmentId: operation.assignment.id }]
        : operation.type === 'assignment.update' || operation.type === 'assignment.remove' ? [{ taskId: operation.taskId, assignmentId: operation.assignmentId }] : []),
      affectedIds: [...new Set([...explicit, ...after.filter(task => before.get(task.id) !== JSON.stringify(task)).map(task => task.id),
        ...[...before.keys()].filter(id => values && !after.some(task => task.id === id))])] };
  }
  private check(command: GanttCommand) {
    if (this.host.options().commands?.enabled !== true) fail('DISABLED');
    if (!command || typeof command.id !== 'string' || !command.id.trim() || !command.operation) fail('INVALID_COMMAND');
    if (command.expectedRevision !== undefined && command.expectedRevision !== this.host.revision()) fail('REVISION_CONFLICT');
    if (command.operation.type === 'batch' && (!Array.isArray(command.operation.operations) || !command.operation.operations.length || typeof command.operation.atomic !== 'boolean')) fail('INVALID_COMMAND');
  }
  private async prepare(command: GanttCommand, approved?: GanttCommandRequest): Promise<GanttCommandRequest> {
    this.check(command);
    const options = this.host.options(), config = options.commands!;
    const request: GanttCommandRequest = { command: structuredClone(command), baseRevision: this.host.revision(), data: structuredClone(this.host.data()), proposedData: structuredClone(this.host.data()), source: 'local' };
    const operations = command.operation.type === 'batch' ? command.operation.operations : [command.operation];
    for (const operation of operations) request.proposedData = proposeGanttOperation(request.proposedData, operation, options, Boolean(config.simulate));
    if (approved) { request.proposedData = structuredClone(approved.proposedData); request.source = approved.source; }
    let issues;
    try { issues = await config.validate?.(structuredClone(request)); }
    catch (error) { if (error instanceof GanttCommandError) throw error; fail('VALIDATION_FAILED'); }
    if (issues?.length) throw new GanttCommandError(issues[0].code, issues[0].params);
    if (config.simulate && !approved) {
      try { request.proposedData = structuredClone(await config.simulate(structuredClone(request))); }
      catch (error) { if (error instanceof GanttCommandError) throw error; fail('SIMULATION_FAILED'); }
      validateCommandData(request.proposedData);
      request.source = 'host';
    }
    if (request.baseRevision !== this.host.revision() || fingerprint(request.data) !== fingerprint(this.host.data())) fail('REVISION_CONFLICT');
    this.check(command);
    let checked = request.data;
    for (const operation of operations) checked = proposeGanttOperation(checked, operation, this.host.options(), Boolean(config.simulate));
    return request;
  }
  async validate(command: GanttCommand): Promise<GanttCommandResult> {
    try { const request = await this.prepare(command); return this.result(command, 'valid', [], request.proposedData); }
    catch (error) { return this.result(command, 'failed', [issue(error)]); }
  }
  async previewCommand(command: GanttCommand): Promise<GanttCommandResult> {
    this.cancelPreview();
    const generation = this.previewGeneration;
    const base = fingerprint(this.host.data()), revision = this.host.revision();
    try {
      const request = await this.prepare(command);
      if (generation !== this.previewGeneration) return this.result(command, 'cancelled', [{ code: 'CANCELLED' }]);
      if (base !== fingerprint(this.host.data()) || revision !== this.host.revision()) fail('REVISION_CONFLICT');
      const result = { ...this.result(command, 'preview', [], request.proposedData), previewSource: request.source };
      this.preview = { command: structuredClone(command), result: structuredClone(result), request: structuredClone(request), base, revision };
      this.host.emit('command-preview', structuredClone(result)); return result;
    } catch (error) { return this.result(command, 'failed', [issue(error)]); }
  }
  getPreview(): GanttCommandResult | undefined { return this.preview ? structuredClone(this.preview.result) : undefined; }
  cancelPreview(): void {
    this.previewGeneration++;
    if (this.preview) this.host.emit('command-preview-cancelled', { ...structuredClone(this.preview.result), status: 'cancelled' });
    this.preview = undefined;
  }
  commitPreview(): Promise<GanttCommandResult> {
    const preview = this.preview;
    if (!preview) return Promise.resolve(this.result({ id: '', operation: { type: 'batch', atomic: true, operations: [] } }, 'failed', [{ code: 'NOT_FOUND' }]));
    if (preview.base !== fingerprint(this.host.data()) || preview.revision !== this.host.revision()) return Promise.resolve(this.result(preview.command, 'failed', [{ code: 'REVISION_CONFLICT' }]));
    return this.execute(preview.command);
  }
  execute(command: GanttCommand): Promise<GanttCommandResult> {
    let snapshot: GanttCommand, key: string;
    try {
      snapshot = structuredClone(command);
      if (!snapshot || typeof snapshot.id !== 'string') fail('INVALID_COMMAND');
      key = JSON.stringify(snapshot);
    }
    catch (error) { return Promise.resolve(this.result(command, 'failed', [issue(error)])); }
    const existing = this.pending.get(snapshot.id) || this.completed.get(snapshot.id);
    if (existing) {
      if (existing.key !== key) return Promise.resolve(this.result(snapshot, 'failed', [{ code: 'DUPLICATE_ID' }]));
      return 'promise' in existing ? existing.promise.then(result => structuredClone(result)) : Promise.resolve(structuredClone(existing.result));
    }
    try { this.check(snapshot); }
    catch (error) { return Promise.resolve(this.result(snapshot, 'failed', [issue(error)])); }
    if (this.busy) return Promise.resolve(this.result(snapshot, 'failed', [{ code: 'BUSY' }]));
    this.busy = true;
    const approved = this.preview && JSON.stringify(this.preview.command) === key && this.preview.base === fingerprint(this.host.data()) && this.preview.revision === this.host.revision() ? this.preview.request : undefined;
    const promise = this.run(snapshot, approved).then(result => {
      if (['committed', 'partial'].includes(result.status) || result.persisted) this.completed.set(snapshot.id, { key, result: structuredClone(result) });
      this.host.emit('command-result', structuredClone(result)); return result;
    }).finally(() => { this.busy = false; this.pending.delete(snapshot.id); });
    this.pending.set(snapshot.id, { key, promise });
    return promise.then(result => structuredClone(result));
  }
  private async run(command: GanttCommand, approved?: GanttCommandRequest): Promise<GanttCommandResult> {
    if (command.operation.type === 'batch' && !command.operation.atomic) {
      const results: GanttCommandResult[] = [];
      for (const [index, operation] of command.operation.operations.entries()) {
        results.push(await this.run({ id: `${command.id}/${index}`, operation }));
      }
      const count = results.filter(result => result.status === 'committed').length;
      return { ...this.result(command, count === results.length ? 'committed' : count ? 'partial' : 'failed'), results,
        affectedIds: [...new Set(results.flatMap(result => result.affectedIds))], affectedAssignments: results.flatMap(result => result.affectedAssignments || []),
        persisted: results.some(result => result.persisted), issues: results.flatMap(result => result.issues), values: structuredClone(this.host.data()) };
    }
    let persisted = false, canonical: GanttData | undefined;
    try {
      const base = fingerprint(this.host.data());
      const request = await this.prepare(command, approved);
      const config = this.host.options().commands!;
      const current = () => {
        if (request.baseRevision !== this.host.revision() || base !== fingerprint(this.host.data())) fail('REVISION_CONFLICT');
      };
      current(); this.check(command);
      let token: string | undefined;
      canonical = request.proposedData;
      if (mutates(command) && config.mode === 'controlled') {
        if (!config.persist) fail('HOST_REQUIRED');
        let response;
        try { response = await config.persist(structuredClone(request)); }
        catch (error) { if (error instanceof GanttCommandError) throw error; fail('PERSIST_FAILED'); }
        persisted = true;
        if (!response?.data) fail('INVALID_RESPONSE');
        canonical = structuredClone(response.data); token = response.undoToken;
        try { validateCommandData(canonical); } catch { canonical = undefined; fail('INVALID_RESPONSE'); }
      }
      current(); this.check(command);
      canonical = { ...canonical!, tasks: flattenTaskTree(buildTaskTree(flattenTaskTree(canonical!.tasks))) };
      // Creation IDs are allocated by the host before submission and must survive canonicalization.
      for (const operation of command.operation.type === 'batch' ? command.operation.operations : [command.operation]) {
        if (operation.type === 'task.create' && !canonical.tasks.some(task => task.id === operation.task.id)) fail('INVALID_RESPONSE');
        if (operation.type === 'assignment.add' && !canonical.tasks.find(task => task.id === operation.taskId)?.resources?.some(resource => resource.id === operation.assignment.id)) fail('INVALID_RESPONSE');
      }
      const result = this.result(command, 'committed', [], canonical);
      if (mutates(command)) this.host.apply(canonical!, result.affectedIds);
      const operations = command.operation.type === 'batch' ? command.operation.operations : [command.operation];
      for (const operation of operations) if (operation.type === 'task.select') this.host.select(operation.taskId, operation.reveal !== false);
      result.revision = this.host.revision(); result.values = structuredClone(this.host.data());
      result.persisted = persisted;
      result.hiddenIds = result.affectedIds.filter(id => config.isTaskVisible?.(id) === false);
      if (token) { this.undoStack.push(token); this.historyAffected.set(token, result.affectedIds); }
      if (mutates(command)) this.redoStack = [];
      this.cancelPreview(); return result;
    } catch (error) { return { ...this.result(command, 'failed', [issue(error)], persisted ? canonical : undefined), persisted }; }
  }
  history(direction: 'undo' | 'redo', id: string, expectedRevision?: number): Promise<GanttCommandResult> {
    const key = JSON.stringify({ direction, id, expectedRevision });
    const command: GanttCommand = { id, expectedRevision, operation: { type: 'task.select', taskId: '' } };
    const existing = this.pending.get(id) || this.completed.get(id);
    if (existing) {
      if (existing.key !== key) return Promise.resolve(this.result(command, 'failed', [{ code: 'DUPLICATE_ID' }]));
      return 'promise' in existing ? existing.promise.then(result => structuredClone(result)) : Promise.resolve(structuredClone(existing.result));
    }
    if (this.busy) return Promise.resolve(this.result(command, 'failed', [{ code: 'BUSY' }]));
    const promise = this.runHistory(direction, id, expectedRevision ?? this.host.revision()).then(result => {
      if (result.status === 'committed' || result.persisted) this.completed.set(id, { key, result: structuredClone(result) });
      this.host.emit('command-result', structuredClone(result)); return result;
    }).finally(() => this.pending.delete(id));
    this.pending.set(id, { key, promise });
    return promise.then(result => structuredClone(result));
  }
  private async runHistory(direction: 'undo' | 'redo', id: string, expectedRevision: number): Promise<GanttCommandResult> {
    const command: GanttCommand = { id, expectedRevision, operation: { type: 'task.select', taskId: '' } };
    if (this.busy) return this.result(command, 'failed', [{ code: 'BUSY' }]);
    this.busy = true;
    let persisted = false, canonical: GanttData | undefined;
    try {
      this.check(command);
      if (this.host.options().readOnly) fail('READ_ONLY');
      const stack = direction === 'undo' ? this.undoStack : this.redoStack;
      const token = stack.at(-1), callback = this.host.options().commands?.history;
      if (!token) fail('NOT_FOUND');
      if (!callback) fail('HOST_REQUIRED');
      for (const taskId of this.historyAffected.get(token) || []) {
        const task = this.host.data().tasks.find(task => task.id === taskId);
        if (task && (task.editable === false || this.host.options().isTaskEditable?.(structuredClone(task)) === false)) fail('FORBIDDEN', { id: taskId });
      }
      const base = fingerprint(this.host.data());
      const response = await callback({ direction, token, id, baseRevision: expectedRevision, data: structuredClone(this.host.data()) });
      persisted = true; canonical = response?.data;
      try { validateCommandData(canonical!); } catch { canonical = undefined; fail('INVALID_RESPONSE'); }
      if (expectedRevision !== this.host.revision() || base !== fingerprint(this.host.data())) fail('REVISION_CONFLICT');
      canonical = { ...canonical!, tasks: flattenTaskTree(buildTaskTree(flattenTaskTree(canonical!.tasks))) };
      const result = this.result(command, 'committed', [], canonical);
      this.host.apply(canonical, result.affectedIds);
      stack.pop(); (direction === 'undo' ? this.redoStack : this.undoStack).push(response.undoToken || token);
      this.historyAffected.set(response.undoToken || token, result.affectedIds);
      result.revision = this.host.revision(); result.persisted = true; result.values = structuredClone(this.host.data());
      this.cancelPreview(); return result;
    } catch (error) { return { ...this.result(command, 'failed', [error instanceof GanttCommandError ? issue(error) : { code: 'PERSIST_FAILED' }], persisted ? canonical : undefined), persisted }; }
    finally { this.busy = false; }
  }
}
