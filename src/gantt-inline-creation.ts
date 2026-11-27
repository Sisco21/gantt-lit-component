import { css, html, nothing } from 'lit';
import { ifDefined } from 'lit/directives/if-defined.js';
import type {
  GanttColumn, GanttOptions, GanttResource, GanttResourceColumn,
  GanttResourceCreationContext, GanttResourceCreationDraft, GanttResourceCreationMode, GanttInlineCreationShortcut,
  GanttResourceProvider, GanttResourceReference, GanttTask, GanttTaskCreationContext,
  GanttTaskCreationDraft, GanttTranslations,
} from './types';

interface Draft<T, C> {
  value: T;
  context?: C;
  inputs: Record<string, string>;
  busy: boolean;
  error: string;
  results: GanttResourceReference[];
  searching: boolean;
  request: number;
}

interface InlineHost {
  options: () => GanttOptions;
  provider: () => GanttResourceProvider | undefined;
  taskContext: () => GanttTaskCreationContext;
  findTask: (id: string) => GanttTask | null;
  isEditable: (task: GanttTask | null) => boolean;
  insertTask: (task: GanttTask, context: GanttTaskCreationContext) => void;
  insertResource: (taskId: string, resource: GanttResource) => void;
  update: () => void;
  afterUpdate: () => Promise<unknown>;
  t: (key: keyof GanttTranslations) => string;
}

function emptyDraft<T, C>(): Draft<T, C> {
  return { value: {} as T, inputs: {}, busy: false, error: '', results: [], searching: false, request: 0 };
}

function readField(value: object, key: string): unknown {
  return key.split('.').reduce<unknown>((item, part) =>
    item && typeof item === 'object' ? (item as Record<string, unknown>)[part] : undefined, value);
}

function writeField(value: object, key: string, input: unknown): void {
  const parts = key.split('.');
  // Draft keys come from host columns, but never permit prototype mutation.
  if (parts.some(part => ['__proto__', 'constructor', 'prototype'].includes(part))) return;
  let target = value as Record<string, unknown>;
  for (const part of parts.slice(0, -1)) {
    target[part] = { ...(target[part] as object || {}) };
    target = target[part] as Record<string, unknown>;
  }
  target[parts[parts.length - 1]] = input;
}

const numeric = (column: GanttColumn | GanttResourceColumn): boolean =>
  ['number', 'integer', 'decimal'].includes(column.type || '') || ('editor' in column && column.editor === 'number');

/** Private UI-only state, shared by the embedded and detached resource surfaces. */
export class GanttInlineCreation {
  private task = emptyDraft<GanttTaskCreationDraft, GanttTaskCreationContext>();
  private resources = new Map<string, Draft<GanttResourceCreationDraft, GanttResourceCreationContext>>();

  constructor(private host: InlineHost) {}

  private resource(taskId: string) {
    let draft = this.resources.get(taskId);
    if (!draft) {
      draft = emptyDraft<GanttResourceCreationDraft, GanttResourceCreationContext>();
      this.resources.set(taskId, draft);
    }
    return draft;
  }

  private modes(): readonly GanttResourceCreationMode[] {
    return this.host.options().inlineCreation?.resources?.modes ?? ['catalogue'];
  }

  private context(): GanttTaskCreationContext {
    const base = structuredClone(this.host.taskContext());
    return { ...base, ...this.host.options().inlineCreation?.tasks?.getContext?.(base) };
  }

  taskEnabled(): boolean {
    const options = this.host.options().inlineCreation;
    if (options?.readOnly || options?.tasks?.enabled !== true) return false;
    try {
      const context = this.task.context || this.context();
      return options.tasks.canCreate?.(context) !== false
        && (!context.parentId || this.host.isEditable(this.host.findTask(context.parentId)));
    } catch { return false; }
  }

  resourceEnabled(task: GanttTask | null): boolean {
    const options = this.host.options().inlineCreation;
    return !options?.readOnly && options?.resources?.enabled === true && this.modes().length > 0
      && Boolean(task) && this.host.isEditable(task) && options.resources.canCreate?.(task!) !== false;
  }

  taskHeight(rowHeight: number): number {
    return this.taskEnabled() ? rowHeight + (this.task.error ? 64 : 0) : 0;
  }

  private startTask(): boolean {
    if (this.task.context) return true;
    try {
      const context = this.context();
      const defaults = this.host.options().inlineCreation?.tasks?.defaults;
      const today = new Date().toISOString().slice(0, 10);
      this.task.value = structuredClone({
        start: today, end: today, progress: 0, type: 'task', parentId: context.parentId,
        ...(typeof defaults === 'function' ? defaults(context) : defaults),
      });
      this.task.context = context;
      this.host.update();
      return true;
    } catch (error) {
      this.task.error = this.errorMessage(error);
      this.host.update();
      return false;
    }
  }

  private ensureResource(task: GanttTask): boolean {
    const draft = this.resource(task.id);
    if (draft.context) return true;
    try {
      const mode = this.modes().includes('free') ? 'free' : 'catalogue';
      const context: GanttResourceCreationContext = { task: structuredClone(task), mode };
      const defaults = this.host.options().inlineCreation?.resources?.defaults;
      draft.value = structuredClone({ type: 'work', quantity: 1, unitCost: 0,
        ...(typeof defaults === 'function' ? defaults(context) : defaults) });
      delete draft.value.resourceId;
      draft.context = context;
    } catch (error) { draft.error = this.errorMessage(error); }
    this.host.update();
    return Boolean(draft.context);
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error && error.message ? error.message : this.host.t('inlineSaveFailed');
  }

  private cancel(taskId?: string): void {
    const draft = taskId ? this.resource(taskId) : this.task;
    if (draft.busy) return; // A request already sent to the server cannot be cancelled locally.
    draft.request++;
    if (taskId) this.resources.delete(taskId);
    else this.task = emptyDraft();
    this.host.update();
  }

  private keydown(event: KeyboardEvent, taskId?: string): void {
    // Keep component-wide shortcuts away from the row, including shadow-DOM retargeting.
    event.stopPropagation();
    if (event.isComposing || event.defaultPrevented) return;
    const config = this.host.options().inlineCreation;
    if (this.matchesKey(event, config?.cancelKey ?? 'Escape')) {
      event.preventDefault();
      this.cancel(taskId);
    } else if (this.matchesKey(event, config?.confirmKey ?? 'Enter') && !(event.target as HTMLElement).closest('[data-inline-suggestion], select')) {
      event.preventDefault();
      void this.save(taskId, event.currentTarget as HTMLElement);
    }
  }

  private matchesKey(event: KeyboardEvent, shortcut: GanttInlineCreationShortcut): boolean {
    if (shortcut === false) return false;
    const shortcuts = typeof shortcut === 'string' ? [shortcut] : shortcut;
    return shortcuts.some(value => {
      const parts = value.toLowerCase().split('+');
      const key = parts.pop();
      return key === event.key.toLowerCase()
        && event.ctrlKey === parts.includes('ctrl') && event.metaKey === parts.includes('meta')
        && event.shiftKey === parts.includes('shift') && event.altKey === parts.includes('alt');
    });
  }

  private requiredError(value: object, fields: readonly string[]): string | undefined {
    const missing = fields.filter(key => {
      const field = readField(value, key);
      return field === undefined || field === null || String(field).trim() === '';
    });
    return missing.length ? `${this.host.t('inlineRequired')}: ${missing.join(', ')}` : undefined;
  }

  private async save(taskId: string | undefined, row: HTMLElement): Promise<void> {
    const draft = taskId ? this.resource(taskId) : this.task;
    const options = this.host.options().inlineCreation;
    const task = taskId ? this.host.findTask(taskId) : null;
    if (draft.busy || (taskId ? !task || !this.resourceEnabled(task) : !this.taskEnabled())) return;
    if (!Object.values(draft.inputs).some(value => value.trim()) && !(draft.context && 'reference' in draft.context && draft.context.reference)) return;
    if (!draft.context) return;
    const invalid = Array.from(row.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input, select'))
      .find(input => !input.disabled && !input.checkValidity());
    if (invalid) {
      draft.error = this.host.t('inlineInvalid');
      invalid.focus();
      this.host.update();
      return;
    }
    const root = row.getRootNode() as ShadowRoot;
    const hadFocus = row.contains(root.activeElement || row.ownerDocument.activeElement);
    const restoreFocus = () => {
      const active = root.activeElement;
      if (hadFocus && (!active || row.contains(active)) &&
        (!row.ownerDocument.activeElement || row.ownerDocument.activeElement === row.ownerDocument.body || row.ownerDocument.activeElement === root.host)) {
        row.querySelector<HTMLElement>('input:not(:disabled), select:not(:disabled)')?.focus();
      }
    };
    draft.busy = true; // Includes async validation; blocks repeated Enter/clicks immediately.
    draft.error = '';
    draft.request++;
    draft.searching = false;
    draft.results = [];
    this.host.update();
    try {
      if (taskId) {
        const config = options!.resources!;
        const state = draft as Draft<GanttResourceCreationDraft, GanttResourceCreationContext>;
        const context = structuredClone(state.context!);
        context.task = structuredClone(task!);
        context.mode = context.reference ? 'catalogue' : this.modes().includes('free') ? 'free' : 'catalogue';
        if (!this.modes().includes(context.mode)) throw new Error(this.host.t('inlineNotAllowed'));
        if (context.mode === 'catalogue' && !context.reference) throw new Error(this.host.t('inlineSelectReference'));
        const value = structuredClone(state.value);
        // Catalogue identity is immutable. Free assignments have no catalogue identity.
        if (context.mode === 'catalogue') value.resourceId = context.reference!.id;
        else {
          delete value.resourceId;
          if (value.metadata) delete value.metadata.catalogId;
        }
        const error = this.requiredError(value, config.requiredFields ?? ['name']) || await config.validate?.(value, context);
        if (error) throw new Error(error);
        if (!this.resourceEnabled(this.host.findTask(taskId)) || !this.modes().includes(context.mode)) throw new Error(this.host.t('inlineNotAllowed'));
        const saved = await config.save(value, context);
        if (!saved?.id || !saved.name || !Number.isFinite(saved.unitCost) || !Number.isFinite(saved.quantity)) throw new Error(this.host.t('inlineInvalidResponse'));
        if (context.mode === 'catalogue' && saved.resourceId !== context.reference!.id) throw new Error(this.host.t('inlineInvalidResponse'));
        if (context.mode === 'free' && saved.resourceId) throw new Error(this.host.t('inlineInvalidResponse'));
        this.host.insertResource(taskId, structuredClone(saved));
        this.resources.delete(taskId);
      } else {
        const config = options!.tasks!;
        const state = draft as Draft<GanttTaskCreationDraft, GanttTaskCreationContext>;
        const value = structuredClone(state.value);
        const context = structuredClone(state.context!);
        const error = this.requiredError(value, config.requiredFields ?? ['name']) || await config.validate?.(value, context);
        if (error) throw new Error(error);
        if (!this.taskEnabled()) throw new Error(this.host.t('inlineNotAllowed'));
        const saved = await config.save(value, context);
        if (!saved?.id || !saved.name || !/^\d{4}-\d{2}-\d{2}$/.test(saved.start) || !/^\d{4}-\d{2}-\d{2}$/.test(saved.end) || !Number.isFinite(saved.progress)) throw new Error(this.host.t('inlineInvalidResponse'));
        this.host.insertTask(structuredClone(saved), context);
        this.task = emptyDraft();
      }
    } catch (error) { draft.error = this.errorMessage(error); }
    finally {
      draft.busy = false;
      this.host.update();
      // Disabled controls lose focus in browsers. Restore it after Lit has updated,
      // unless the user has deliberately moved to another control while waiting.
      void this.host.afterUpdate().then(restoreFocus);
    }
  }

  private async search(taskId: string, query: string): Promise<void> {
    const state = this.resource(taskId);
    const context = state.context;
    if (!context || !this.modes().includes('catalogue')) return;
    const request = ++state.request;
    state.results = [];
    state.searching = Boolean(query.trim());
    this.host.update();
    if (!query.trim()) return;
    try {
      const search = this.host.options().inlineCreation?.resources?.search;
      const provider = this.host.provider();
      if (!search && !provider) return;
      const results = search ? await search(query, { ...structuredClone(context), mode: 'catalogue' }) : await provider!.search(query);
      if (state.request !== request) return;
      state.results = results;
    } catch (error) {
      if (state.request === request) state.error = this.errorMessage(error);
    } finally {
      if (state.request === request) { state.searching = false; this.host.update(); }
    }
  }

  private selectReference(taskId: string, reference: GanttResourceReference, row: HTMLElement | null): void {
    const state = this.resource(taskId);
    const task = this.host.findTask(taskId);
    if (state.busy || !task || !this.resourceEnabled(task) || !this.modes().includes('catalogue') || !this.ensureResource(task)) return;
    state.request++;
    const context = { ...state.context!, mode: 'catalogue' as const, reference: structuredClone(reference) };
    state.context = context;
    state.value = {
      ...state.value, resourceId: reference.id, name: reference.name, type: reference.type || 'work',
      unit: reference.unit, unitCost: reference.unitCost ?? 0, quantity: reference.quantity ?? 1,
      calendarId: reference.calendarId, maxUnits: reference.maxUnits,
      metadata: { ...state.value.metadata, ...reference.metadata, code: reference.code ?? reference.metadata?.code ?? '', catalogId: reference.id },
    };
    state.inputs = {};
    state.results = [];
    state.searching = false;
    state.error = '';
    this.host.update();
    if (row) void this.host.afterUpdate().then(() => {
      const next = row.querySelector<HTMLElement>('input:not([data-field="name"]):not([data-field="code"]), select[data-field]')
        || row.querySelector<HTMLElement>('input');
      next?.focus();
    });
  }

  private input(column: GanttColumn | GanttResourceColumn, raw: string, task?: GanttTask): void {
    if (task ? !this.resourceEnabled(task) : !this.taskEnabled()) return;
    if (task ? !this.ensureResource(task) : !this.startTask()) return;
    const state = task ? this.resource(task.id) : this.task;
    if (state.busy) return;
    const key = this.fieldKey(column.key, Boolean(task));
    state.inputs[key] = raw;
    state.error = '';
    let value: unknown = numeric(column) ? (raw === '' ? undefined : Number(raw)) : raw;
    if (task && 'options' in column && column.editor === 'select') {
      value = column.options?.find(option => String(option.value) === raw)?.value ?? raw;
    }
    if (task && (column as GanttResourceColumn).setValue) {
      const snapshot: GanttResource = { id: '', name: '', type: 'work', unitCost: 0, quantity: 1, ...structuredClone(state.value as GanttResourceCreationDraft) };
      Object.assign(state.value, (column as GanttResourceColumn).setValue!(raw, snapshot, structuredClone(task)));
    } else writeField(state.value, key, value);
    if (task) {
      const resource = this.resource(task.id);
      const editableAfterSelection = resource.context?.reference && this.host.options().inlineCreation?.resources?.catalogueEditableFields?.includes(column.key);
      if (['name', 'code'].includes(column.key) && !editableAfterSelection) {
        this.clearReference(task.id);
        if (!this.host.options().inlineCreation?.resources?.inputTemplate) void this.search(task.id, raw);
      }
    }
    this.host.update();
  }

  private clearReference(taskId: string): void {
    const state = this.resource(taskId);
    if (state.busy || !state.context) return;
    state.request++;
    state.results = [];
    state.searching = false;
    delete state.context.reference;
    state.context.mode = this.modes().includes('free') ? 'free' : 'catalogue';
    delete state.value.resourceId;
    if (state.value.metadata) delete state.value.metadata.catalogId;
    this.host.update();
  }

  private fieldKey(key: string, resource: boolean): string {
    if (key.includes('.')) return key;
    const known = resource
      ? ['name', 'type', 'unit', 'unitCost', 'quantity', 'calendarId', 'maxUnits']
      : ['name', 'code', 'start', 'end', 'progress', 'type', 'mode', 'unit', 'unitCost', 'quantity', 'quantityPerDay', 'plannedCost', 'actualCost', 'calendarId', 'color'];
    return key === 'totalQuantity' && resource ? 'quantity' : known.includes(key) ? key : `${resource ? 'metadata' : 'fields'}.${key}`;
  }

  private editor(column: GanttColumn | GanttResourceColumn, task?: GanttTask, useTemplate = true): unknown {
    const state = task ? this.resource(task.id) : this.task;
    const key = this.fieldKey(column.key, Boolean(task));
    const resource = task ? this.resource(task.id) : undefined;
    const allowlist = this.host.options().inlineCreation?.resources?.catalogueEditableFields;
    const searchField = ['name', 'code'].includes(column.key);
    const editable = column.editable && (!resource?.context?.reference || searchField || !allowlist || allowlist.includes(column.key));
    const resourceValue = task && (column as GanttResourceColumn).value && state.context
      ? (column as GanttResourceColumn).value!({ id: '', name: '', type: 'work', unitCost: 0, quantity: 1, ...state.value as GanttResourceCreationDraft }, task)
      : readField(state.value, key);
    const value = state.inputs[key] ?? resourceValue ?? '';
    const label = `${this.host.t(task ? 'newResource' : 'newTask')} — ${column.label}`;
    if (!editable) return html`<span>${String(value)}</span>`;
    const required = (task ? this.host.options().inlineCreation?.resources?.requiredFields : this.host.options().inlineCreation?.tasks?.requiredFields) ?? ['name'];
    const template = this.host.options().inlineCreation?.resources?.inputTemplate;
    if (task && template && useTemplate) {
      const current = () => this.resources.get(task.id) === state && !state.busy && this.resourceEnabled(this.host.findTask(task.id));
      return template({
        task: structuredClone(task), column: column as GanttResourceColumn,
        draft: structuredClone(state.value as GanttResourceCreationDraft), value: String(value),
        disabled: state.busy, required: required.includes(key), reference: resource?.context?.reference ? structuredClone(resource.context.reference) : undefined,
        onInput: value => { if (current()) this.input(column, value, task); },
        selectReference: reference => {
          if (!current()) return;
          if (reference) this.selectReference(task.id, reference, null);
          else this.clearReference(task.id);
        },
        renderDefault: () => this.editor(column, task, false),
      });
    }
    if ('editor' in column && column.editor === 'select') {
      return html`<select aria-label=${label} data-field=${column.key} .value=${String(value)} ?disabled=${state.busy} ?required=${required.includes(key)} @change=${(event: Event) => this.input(column, (event.target as HTMLSelectElement).value, task)}>
        <option value=""></option>${(column.options || []).map(option => html`<option value=${String(option.value)} ?disabled=${option.disabled}>${option.label}</option>`)}
      </select>`;
    }
    return html`<input aria-label=${label} data-field=${column.key} type=${numeric(column) ? 'number' : column.type === 'date' ? 'date' : 'text'}
      .value=${String(value)} ?disabled=${state.busy} ?required=${required.includes(key)}
      min=${ifDefined('min' in column ? column.min : undefined)} step=${'step' in column ? String(column.step ?? 'any') : column.type === 'integer' ? '1' : 'any'}
      placeholder=${column.key === 'name' ? this.host.t(task ? 'newResource' : 'newTask') : ''}
      @focus=${() => { if (task) this.ensureResource(task); else this.startTask(); }}
      @input=${(event: Event) => this.input(column, (event.target as HTMLInputElement).value, task)} />`;
  }

  private feedback(taskId?: string) {
    const state = taskId ? this.resource(taskId) : this.task;
    return html`<div class="inline-feedback" role="alert" ?hidden=${!state.error}>${state.error}</div>
      <span class="inline-saving" role="status">${state.busy ? this.host.t('inlineSaving') : ''}</span>`;
  }

  renderTask(columns: GanttColumn[], width: (column: GanttColumn) => number, top: number, rowHeight: number) {
    if (!this.taskEnabled()) return nothing;
    return html`<div class="inline-task" data-inline-row="task" role="group" aria-label=${this.host.t('newTask')} aria-busy=${String(this.task.busy)} style="top:${top}px" @keydown=${(event: KeyboardEvent) => this.keydown(event)}>
      <div class="task-cells" style="height:${rowHeight}px">${columns.map(column => html`<div class="task-cell" style="width:${width(column)}px">${this.editor(column)}</div>`)}</div>
      ${this.feedback()}
    </div>`;
  }

  renderResource(task: GanttTask, columns: GanttResourceColumn[]) {
    if (!this.resourceEnabled(task)) return nothing;
    const state = this.resource(task.id);
    return html`<div class="inline-resource" data-inline-row="resource" role="group" aria-label=${this.host.t('newResource')} aria-busy=${String(state.busy)} @keydown=${(event: KeyboardEvent) => this.keydown(event, task.id)}>
      <div class="resources-grid">${columns.map(column => html`<div class="resource-cell">${this.editor(column, task)}</div>`)}<div class="resource-cell"></div></div>
      ${state.searching ? html`<div class="inline-feedback" role="status">${this.host.t('searching')}</div>` : nothing}
      ${state.results.length ? html`<div class="inline-suggestions" role="group" aria-label=${this.host.t('resourceCatalogue')}>${state.results.map(reference => html`<button data-inline-suggestion @click=${(event: Event) => this.selectReference(task.id, reference, (event.currentTarget as HTMLElement).closest<HTMLElement>('[data-inline-row]')!)}>${reference.code ? `${reference.code} — ` : ''}${reference.name}</button>`)}</div>` : nothing}
      ${this.feedback(task.id)}
    </div>`;
  }
}

export const inlineCreationStyles = css`
  .inline-task, .inline-resource { background: var(--gantt-row); color: var(--gantt-text); border-top: 1px dashed var(--gantt-control-border); }
  .inline-task { position: absolute; left: 0; width: max(100%, var(--task-columns-width)); z-index: 6; }
  .inline-resource { grid-column: 1 / -1; min-width: 0; }
  .inline-task input { box-sizing: border-box; width: 100%; min-width: 0; font: inherit; padding: 4px; border: 1px solid var(--gantt-control-border); border-radius: 3px; background: var(--gantt-input-background); color: inherit; }
  [data-inline-row] input:focus-visible, [data-inline-row] select:focus-visible, [data-inline-row] button:focus-visible { outline: 2px solid var(--gantt-focus-ring, #2563eb); outline-offset: 1px; }
  .inline-saving { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
  .inline-feedback { padding: 4px 8px; font-size: 12px; white-space: normal; overflow-wrap: anywhere; }
  .inline-feedback[role='alert'] { color: var(--gantt-red); }
  .inline-suggestions { display: flex; flex-direction: column; align-items: stretch; max-height: 180px; overflow: auto; padding: 4px 8px; gap: 3px; }
  .inline-suggestions button { text-align: start; white-space: normal; }
`;
