import type {
  GanttChart, GanttResource, GanttResourceCreationContext, GanttResourceCreationDraft,
  GanttResourceReference, GanttTask, GanttTaskCreationContext, GanttTaskCreationDraft,
  GanttResourceCreationInputTemplate,
} from '../src/index';

/** The host implements these methods using its authenticated business API. */
export interface InlineCreationApi {
  searchResources(query: string): Promise<GanttResourceReference[]>;
  createTask(draft: GanttTaskCreationDraft, context: GanttTaskCreationContext): Promise<GanttTask>;
  createAssignment(draft: GanttResourceCreationDraft, context: GanttResourceCreationContext): Promise<GanttResource>;
}

export interface InlineCreationRights {
  readOnly: boolean;
  addTasks: boolean;
  addResources: boolean;
  catalogue: boolean;
  freeResources: boolean;
}

/** Call again when host permissions change. No component-side persistence is needed. */
export function configureInlineCreation(gantt: GanttChart, api: InlineCreationApi, rights: InlineCreationRights, inputTemplate?: GanttResourceCreationInputTemplate): void {
  gantt.autoSave = false;
  gantt.options = {
    ...gantt.options,
    locale: 'fr-FR',
    resourcePanel: { ...gantt.options.resourcePanel, detachable: true },
    taskColumns: [
      { key: 'name', label: 'Désignation', width: 200, editable: true, required: true },
      { key: 'start', label: 'Début', width: 130, type: 'date', editable: true },
      { key: 'end', label: 'Fin', width: 130, type: 'date', editable: true },
    ],
    inlineCreation: {
      readOnly: rights.readOnly,
      confirmKey: 'Enter',
      cancelKey: 'Escape',
      tasks: {
        enabled: rights.addTasks,
        canCreate: context => !context.selectedTask || context.selectedTask.editable !== false,
        getContext: context => ({
          parentId: context.selectedTask?.type === 'parent' ? context.selectedTask.id : context.selectedTask?.parentId ?? null,
          index: context.index, // Append to this phase; an API can impose another ordering.
        }),
        defaults: context => ({ parentId: context.parentId, start: '2026-11-02', end: '2026-11-03', progress: 0, type: 'task' }),
        requiredFields: ['name', 'start', 'end'],
        validate: draft => draft.end! < draft.start! ? 'La fin doit être postérieure ou égale au début.' : undefined,
        save: (draft, context) => api.createTask(draft, context),
      },
      resources: {
        enabled: rights.addResources,
        modes: [...(rights.catalogue ? ['catalogue' as const] : []), ...(rights.freeResources ? ['free' as const] : [])],
        canCreate: task => task.type !== 'parent',
        search: query => api.searchResources(query),
        inputTemplate,
        defaults: () => ({ type: 'work', unit: 'h', quantity: 1, unitCost: 0 }),
        requiredFields: ['name', 'unit', 'quantity', 'unitCost'],
        catalogueEditableFields: ['quantity', 'unitCost'],
        validate: draft => (draft.quantity! <= 0 || draft.unitCost! < 0) ? 'La quantité doit être positive et le prix ne peut pas être négatif.' : undefined,
        save: (draft, context) => api.createAssignment(draft, context),
      },
    },
  };
}

/** Example REST adapter. These routes are illustrative and belong to the host. */
export function restInlineCreationApi(baseUrl: string): InlineCreationApi {
  async function request<T>(path: string, body?: unknown): Promise<T> {
    const response = await fetch(`${baseUrl}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => null);
      throw new Error(error?.message || `Enregistrement impossible (${response.status}). Réessayez.`);
    }
    return response.json() as Promise<T>;
  }
  return {
    searchResources: query => request(`/resources?${new URLSearchParams({ query })}`),
    createTask: (draft, context) => request('/tasks', { task: draft, parentId: context.parentId, index: context.index }),
    // This endpoint creates an assignment only, including for mode === 'free'.
    createAssignment: (draft, context) => request(`/tasks/${encodeURIComponent(context.task.id)}/assignments`, {
      assignment: draft, mode: context.mode, resourceId: context.reference?.id,
    }),
  };
}
