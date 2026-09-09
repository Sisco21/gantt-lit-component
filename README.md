# Gantt Lit Component

A reusable, framework-agnostic Gantt web component built with Lit and TypeScript. It provides a task tree, a timeline, dependencies, resource assignments and daily quantities while keeping project data in a portable JSON model.

The component is designed to be embedded in another product: the host application owns authentication, API calls, persistence, resource catalogues and, if desired, the task editor.

## Included capabilities

- Hierarchical tasks, parent summary bars and milestones.
- Editable task grid, timeline, zoom, column picker, expandable task groups and search.
- Dragging and resizing task bars, with dependency scheduling.
- Finish-to-start, start-to-start, finish-to-finish and start-to-finish links.
- Resource assignments with per-day quantities; inactive days are displayed as gaps in a task bar.
- Resizable Gantt and resource panels, fixed headers, and independent horizontal and vertical scrolling.
- JSON and MSPXML import/export, plus an adapter interface for binary `.mpp` files.
- Change events, persistence hooks and an API-backed resource catalogue integration point.

## Install and register the component

Install the built package in the host application, then register the custom element once at application startup:

```ts
import 'gantt-lit-component';
import type { GanttChart, GanttData, GanttChange } from 'gantt-lit-component';
```

Use it in HTML or create it from TypeScript:

```html
<gantt-chart project-id="project-42"></gantt-chart>
```

```ts
const gantt = document.querySelector('gantt-chart') as GanttChart;
```

Dates use `YYYY-MM-DD` strings deliberately. This prevents timezone changes between the browser and backend from shifting tasks by one day.

## Load data

`GanttData` is the canonical format for the component, storage, JSON import/export and project-file adapters.

```ts
const data: GanttData = {
  name: 'Website delivery',
  tasks: [
    {
      id: 'phase-1',
      name: 'Planning',
      start: '2026-01-05',
      end: '2026-01-30',
      progress: 40,
      parentId: null,
      type: 'parent',
    },
    {
      id: 'research',
      name: 'Market research',
      start: '2026-01-05',
      end: '2026-01-12',
      progress: 100,
      parentId: 'phase-1',
      type: 'task',
      resources: [],
    },
  ],
  dependencies: [],
};

gantt.setData(data);
```

Use `gantt.getData()` when a complete snapshot is needed. Treat the returned data as a snapshot: make a copy before changing it outside the component, then call `setData()` to apply a bulk update.

## Catch changes and user actions

The `tasks-changed` DOM event is the primary integration hook. It is emitted after every local modification, including drag/resize operations, grid edits, resources, task creation, dependency changes and imports.

```ts
gantt.addEventListener('tasks-changed', (event) => {
  const change = (event as CustomEvent<GanttChange>).detail;

  console.log(change.reason);   // task-updated, dependency-updated, imported, ...
  console.log(change.taskId);   // affected task when applicable
  console.log(change.revision); // monotonic client-side revision
  console.log(change.data);     // full GanttData snapshot

  // Queue an API update, update a state store, write an audit entry, etc.
});
```

| Event | Detail | When to use it |
| --- | --- | --- |
| `tasks-changed` | `GanttChange` | Synchronise project changes with application state or an API. |
| `gantt-summary-changed` | `GanttProjectSummary` | Update a host-owned footer or project status area. |
| `task-selected` | `{ id, task }` | Update a host-side details panel. |
| `persistence-error` | `{ error, change }` | Show a retry/error state after an automatic save fails. |
| `project-file-error` | `{ error }` | Report an MPP import/export adapter error. |

For a simple in-memory host store, an option is also available:

```ts
gantt.options = {
  onTasksChange: (data) => projectStore.set(data),
  onTaskSelect: (taskId, task) => detailsPanel.select(taskId, task),
};
```

### Subscribe to project summary information

`gantt-summary-changed` is emitted whenever the planning data changes, including imports, undo/redo, resource changes and host calls to `setData()`. Its detail contains dates, inclusive calendar and working durations, task/phase/milestone counts, duration-weighted progress, schedule alerts, costs, and resource load/capacity. Parent phase totals are not counted twice; resources are unique by external `resourceId` when supplied, otherwise by their assignment id.

```ts
import type { GanttProjectSummary } from 'gantt-lit-component';

const updateFooter = (summary: GanttProjectSummary) => {
  startElement.textContent = summary.start ?? '—';
  endElement.textContent = summary.end ?? '—';
  durationElement.textContent = `${summary.durationDays} days`;
  progressElement.textContent = `${summary.progress}%`;
  overdueElement.textContent = String(summary.overdueTaskCount);
  costElement.textContent = `${summary.totalCost.toLocaleString()} €`;
  actualElement.textContent = `${summary.actualCost.toLocaleString()} €`;
  resourceElement.textContent = String(summary.resourceCount);
};

gantt.addEventListener('gantt-summary-changed', event => {
  updateFooter((event as CustomEvent<GanttProjectSummary>).detail);
});

// Populate a host footer immediately, before the next project edit.
updateFooter(gantt.getProjectSummary());
```

`workingDurationDays` uses `nonWorkingDays`. Set `summaryReferenceDate` to calculate schedule alerts against a business date instead of the current day. The optional `plannedCost` and `actualCost` fields on a `GanttTask` feed `plannedCost`, `actualCost`, and `costVariance`; when `plannedCost` is absent, the calculated assignment/task cost is used as the planned value.

```ts
gantt.setOptions({
  summaryReferenceDate: '2026-01-20',
  nonWorkingDays: [0, 6],
});

gantt.updateTask('task-42', {
  plannedCost: 12_500,
  actualCost: 11_400,
});
```

Use the event when the change reason and revision matter; use `onTasksChange` for a lightweight full-data callback.

## Persist locally or through an API

Set `autoSave` to `true` and inject a `GanttPersistenceAdapter`. The component calls `save()` after each change. `load()` is optional but useful to hydrate the component from the same backend.

```ts
gantt.projectId = 'project-42';
gantt.autoSave = true;

gantt.persistenceAdapter = {
  async load(projectId) {
    const response = await fetch(`/api/projects/${projectId}/planning`);
    if (response.status === 404) return null;
    if (!response.ok) throw new Error('Could not load the planning');
    return response.json();
  },

  async save(change) {
    const response = await fetch(`/api/projects/${change.projectId}/planning`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(change),
    });
    if (!response.ok) throw new Error('Could not save the planning');
  },
};

await gantt.loadFromPersistence();
```

`GanttChange` includes `projectId`, `revision`, `reason`, `taskId` and a full `data` snapshot. Send the revision to the server if optimistic locking or collaborative editing is needed.

For an additional side effect—such as an audit record, an event bus or a separate online synchronisation endpoint—use `saveHook`:

```ts
gantt.saveHook = async (change) => {
  await fetch('/api/planning-events', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(change),
  });
};
```

The persistence adapter and `saveHook` can be used together. If `autoSave` is `false`, save explicitly after a host-controlled workflow:

```ts
await gantt.saveToPersistence();
```

For browser-only usage, the package also exports `LocalStorageGanttPersistenceAdapter`:

```ts
import { LocalStorageGanttPersistenceAdapter } from 'gantt-lit-component';

gantt.projectId = 'project-42';
gantt.persistenceAdapter = new LocalStorageGanttPersistenceAdapter();
gantt.autoSave = true;
```

## Use an API resource catalogue

Resources assigned to a task are project data. A resource catalogue is external reference data and is loaded on demand through `GanttResourceProvider`. This keeps the component independent from your API and authentication model.

```ts
import type { GanttResourceProvider } from 'gantt-lit-component';

const resourceProvider: GanttResourceProvider = {
  async search(query) {
    const response = await fetch(
      `/api/resource-catalogue?search=${encodeURIComponent(query)}`,
    );
    if (!response.ok) throw new Error('Resource catalogue search failed');

    const payload = await response.json();
    return payload.items.map((item: {
      id: string;
      label: string;
      family: string;
      dailyRate: number;
      unit: string;
    }) => ({
      id: item.id,
      name: item.label,
      type: item.family,
      unit: item.unit,
      unitCost: item.dailyRate,
      metadata: { source: 'catalogue' },
    }));
  },
};

gantt.resourceProvider = resourceProvider;
```

In the built-in task editor, the **General** tab exposes the task colour, progress and **actual cost** for every item type (task, phase and milestone). The entered amount is persisted in `task.actualCost`, included in `gantt-summary-changed`, and participates in undo/redo. **Add resource** opens a resource-picker modal; its search calls `resourceProvider.search(query)`. When a user adds a result, the component creates an assignment with a fresh `resource.id` and persists the external, stable unique identifier in `resource.resourceId`. The legacy `resource.metadata.catalogId` is also retained for backward compatibility. Keep any additional business fields in `metadata`.

To keep the dialog entirely in your host application, provide `resourcePicker`. It can open any modal or drawer and calls `assignReference` after the user selects an API resource:

```ts
gantt.options = {
  resourcePicker: ({ task, assignReference }) => {
    hostResourceModal.open({
      taskId: task.id,
      onSelect: (resourceFromApi) => assignReference({
        id: resourceFromApi.id, // stable external resource ID
        name: resourceFromApi.name,
        type: resourceFromApi.type,
        unitCost: resourceFromApi.unitCost,
        maxUnits: resourceFromApi.maxUnits,
      }),
    });
  },
};
```

An assigned resource can also contain daily quantities:

```ts
{
  id: 'assignment-1',
  resourceId: 'worker-42', // external unique resource ID
  name: 'Qualified worker',
  type: 'work',
  unit: 'day',
  unitCost: 400,
  quantity: 1,
  quantityByDate: {
    '2026-01-05': 1,
    '2026-01-06': 1,
    '2026-01-09': 1
  }
}
```

A missing or zero quantity is an inactive day. The timeline therefore displays a gap while the task itself remains scheduled.

## Replace the built-in task editor

The right-click **Edit task** action opens the built-in tabbed editor by default. To use a drawer, dialog or form from the host product instead, set `taskEditorMode` to `external` and open your UI from `onTaskEdit`.

```ts
import type { GanttTask, GanttResourceReference } from 'gantt-lit-component';

gantt.options = {
  taskEditorMode: 'external',
  onTaskEdit: (task: GanttTask) => {
    hostTaskDrawer.open({
      task,

      onSave: (patch: Partial<GanttTask>) => {
        gantt.updateTask(task.id, patch);
      },

      onAssignResource: (resource: GanttResourceReference) => {
        gantt.addResource(task.id, {
          name: resource.name,
          type: resource.type ?? 'work',
          unit: resource.unit,
          unitCost: resource.unitCost ?? 0,
          quantity: resource.quantity ?? 1,
          metadata: {
            ...resource.metadata,
            catalogId: resource.id,
          },
        });
      },

      onAddPredecessor: (predecessorId: string) => {
        gantt.addDependency(predecessorId, task.id, 'finish-to-start');
      },
    });
  },
};
```

With `taskEditorMode: 'external'`, the component calls `onTaskEdit` but does not display its own modal. The context menu, selection, Gantt interactions and change events remain available.

### Replace the built-in editor body with a template

Use `taskEditorTemplate` when the component dialog should remain in place but its three built-in tabs must be replaced by product-specific fields. The callback receives the current task and actions that preserve normal scheduling, resource, dependency and persistence events.

```ts
import { html } from 'lit';

gantt.setOptions({
  taskEditorTemplate: ({ task, updateTask, addResource, close }) => html`
    <label>Work package name
      <input .value=${task.name}
        @change=${(event: Event) => updateTask({ name: event.target.value })} />
    </label>
    <label>Progress
      <input type="number" min="0" max="100" .value=${String(task.progress)}
        @change=${(event: Event) => updateTask({ progress: Number(event.target.value) })} />
    </label>
    <div class="task-editor-template-actions">
      <button @click=${() => addResource({ name: 'New resource', type: 'work' })}>Add resource</button>
      <button class="primary" @click=${close}>Done</button>
    </div>
  `,
});
```

The callback can use `updateTask`, `moveTask`, `addResource`, `removeResource`, `addDependency`, `removeDependency` and `close`. Use `taskEditorMode: 'external'` instead when the host application must own the full dialog or drawer.

### Custom task right-click menu

Set `taskContextMenuTemplate` to replace the default task menu. The template receives the complete `task`, including `type`, `fields` and `metadata`, so a host can choose a different menu for any business parameter without duplicating planning logic. The component blocks the browser's native right-click menu and keeps the main menu and its submenus inside the viewport.

```ts
import { html } from 'lit';

gantt.options = {
  taskContextMenuTemplate: ({ task, close, updateTask, fitToView }) => task.metadata?.readOnly
    ? html`<button @click=${() => { fitToView(); close(); }}>View ${task.name}</button>`
    : html`
    <button @click=${() => { updateTask({ progress: 100 }); close(); }}>Mark complete</button>
    <div class="gantt-context-submenu">
      <button class="gantt-context-submenu-trigger">Actions <span>›</span></button>
      <div class="gantt-context-submenu-panel">
        <button @click=${() => { fitToView(); close(); }}>Fit ${task.name}</button>
      </div>
    </div>
  `,
};
```

### Custom empty-Gantt right-click menu

Set `ganttContextMenuTemplate` to replace the menu shown when the user right-clicks an empty part of the timeline. It receives `date`, `addTask`, `addPhase`, `fitToView` and `close`; the component still prevents the browser menu and positions the result inside the viewport.

```ts
import { html } from 'lit';

gantt.options = {
  ganttContextMenuTemplate: ({ date, addTask, addPhase, fitToView, close }) => html`
    <button @click=${addTask}>Add task on ${date}</button>
    <button @click=${addPhase}>Add phase on ${date}</button>
    <button @click=${() => { fitToView(); close(); }}>Fit whole schedule</button>
    <button @click=${close}>Close</button>
  `,
};
```

Useful public editing methods for an external editor are:

| Method | Purpose |
| --- | --- |
| `updateTask(taskId, patch)` | Change task fields, dates, parent or resources. |
| `addChildTask(parentId, task?)` | Create a child task. |
| `addResource(taskId, resource?)` | Add an assignment to a task. |
| `moveTask(taskId, parentId)` | Move a task to another parent. |
| `reorderTask(taskId, targetTaskId, position)` | Place a task and its descendants before or after another task at the same level. |
| `undo()` / `redo()` | Restore or reapply the latest local action. Both return `true` when an action was applied. |
| `clearHistory()` | Remove all undoable and redoable actions, keeping the current state as the baseline. |
| `addDependency(from, to, type?)` | Create a task relationship. |
| `removeDependency(from, to)` | Remove a task relationship. |
| `fitTaskToView(taskId?)` | Zoom and centre one task in the Gantt timeline. |
| `fitGanttToView()` | Zoom the complete project timeline to the visible width. |
| `setData(data)` | Apply a complete host-managed data update. |

Every mutation above emits `tasks-changed`, so persistence and application state remain consistent whichever editor is used.

### Undo and redo

Undo/redo is local to the component and disabled by default. It records each completed edit as one action: grid edits, task movement and resizing, hierarchy changes, resources, dependencies, and task creation/deletion. Imports and calls to `setData()` deliberately start a new history, because the host supplied a new project state.

```ts
gantt.setOptions({
  history: {
    enabled: true,
    maxActions: 50,
    showControls: true,
    undoShortcut: ['Ctrl+z', 'Meta+z'],
    redoShortcut: ['Ctrl+y', 'Ctrl+Shift+z', 'Meta+y', 'Meta+Shift+z'],
  },
});
```

Set `enabled: false` to turn the feature off, `showControls: false` to keep only the public methods and shortcuts, or a shortcut to `false` to disable that shortcut. The built-in toolbar buttons automatically reflect `canUndo` and `canRedo`. Changes caused by these actions emit `tasks-changed` with reason `history-undo` or `history-redo`.

### Reorder tasks from the tree

Drag a row onto the upper quarter of a phase to place it **before**, or onto the lower quarter to place it **after**. Dropping in the middle of a phase makes the dragged task a child of that phase. On a regular task, the component always performs a sibling reorder: a task dragged downward goes **after** its target, while a task dragged upward goes **before** it. It never creates a parent-child relationship between two tasks. A moved task keeps its type (`task`, `parent`, or `milestone`) and carries all of its descendants with it.

The same sibling reordering is available to an external editor:

```ts
gantt.reorderTask('definition', 'market-research', 'after');
```

## Configure the view

The host can configure the initial columns, weekends and dependency scheduling. The task name column below is mandatory and cannot be hidden by users.

Call `setOptions()` when configuring a live component; it applies the new settings and refreshes the view immediately. Assigning `gantt.options = {...}` is also supported and triggers the same refresh.

```ts
gantt.setOptions({
  autoSchedule: true,
  dependencyColor: '#7551c8',
  dependencyLineStyle: 'solid',
  nonWorkingDays: [0, 6], // Sunday and Saturday; use [] to disable shading
  pan: { enabled: true, axis: 'both', trigger: 'empty-area' },
  taskColumns: [
    { key: 'code', label: 'Code', width: 70 },
    { key: 'name', label: 'Task name', width: 260, required: true },
    { key: 'duration', label: 'Duration', width: 80, type: 'number' },
    { key: 'start', label: 'Start', width: 110, type: 'date' },
    { key: 'end', label: 'Finish', width: 110, type: 'date' },
    { key: 'costTotal', label: 'Total cost', width: 100, type: 'number' },
  ],
});
```

The user can resize visible columns from their boundaries, open the column picker to hide optional columns, and use the toolbar to expand or collapse all parents.

The bundled demo also includes **Grand exemple · 1 550 tâches**. It generates 50 parent phases, 1,500 work packages, resource assignments, and dependency links in the browser, then displays the load time. It is intended for manual rendering and scrolling checks.

### Pan the timeline from empty space

Set `pan.enabled` to let users hold the left mouse button on an empty timeline cell and drag the plan. The gesture never starts on a task bar, resize handle, dependency, or separator, so task editing stays unchanged. `axis: 'horizontal'` is the default; use `axis: 'both'` to move through the task rows vertically at the same time. Panning is disabled by default to keep existing integrations behaviour-compatible.

### Summary-bar label

Parent tasks display a summary bar with the task name. Supply `summaryTemplate` to append product-specific information; it can return text or a Lit template. The task name stays visible. The demo uses this to display the total cost of a phase, including its child tasks.

```ts
import { html } from 'lit';

gantt.setOptions({
  summaryTemplate: task => html`${calculatePhaseCost(task)} €`,
});
```

The bar colour is exposed as `--gantt-summary`, with a readable default in both built-in themes.

### Customize task bars and colours

Every task has a persisted `color` field. Missing colours are initialized automatically when data is imported or a task is created, so the selected value is included in JSON exports and change events. The built-in task editor also exposes a colour picker.

Use `taskTemplate`, `phaseTemplate`, and `milestoneTemplate` to customize each Gantt object independently. Task and phase templates append information after the built-in name, so labels remain visible. A milestone template is displayed beside its diamond. The component continues to manage drag, resize, selection and dependency interactions.

A task whose `type` is `parent` is always presented as a bold phase in the left grid and as a summary bar, even when it has no children. No template is required for that distinction.

```ts
import { html } from 'lit';

gantt.setOptions({
  taskTemplate: ({ width, durationDays, task }) => width > 100
    ? html`${durationDays} days · ${task.progress}%`
    : '',
  phaseTemplate: ({ task }) => html`${task.metadata?.budget ?? 0} €`,
  milestoneTemplate: ({ task, durationDays }) => html`${task.name} · ${durationDays} days`,
});

gantt.updateTask('task-42', { color: '#7c3aed' });
```

Every template receives the task, its persisted colour, the visible bar width, `durationDays`, and a `kind` (`task`, `summary`, or `milestone`). `durationDays` matches the built-in Duration column and is recalculated whenever a task is moved or resized.

`taskBarTemplate` remains available for existing integrations; it is the fallback for regular tasks and phases. `summaryTemplate` remains the final fallback for phases.

### Custom task tooltips

Hovering a task bar shows a compact tooltip with its name, dates, duration, progress, colour and assigned resources. The tooltip follows the pointer, remains within the viewport and automatically adopts the light or dark component theme.

Set `showTaskTooltips: false` to disable it. Use `taskTooltipTemplate` to replace its content while the component continues to control its visual shell and placement. The template receives the complete `task` object, the resolved task `color`, `durationDays`, the bar `kind` (`task` or `summary`), and the assigned `resources`.

```ts
import { html } from 'lit';

gantt.setOptions({
  taskTooltipTemplate: ({ task, color, durationDays, resources }) => html`
    <div class="task-tooltip-title">
      <span class="task-tooltip-accent" style="--tooltip-color:${color}"></span>
      <span>${task.name}</span>
    </div>
    <div class="task-tooltip-details">
      <span>Duration</span><strong>${durationDays} days</strong>
      <span>Progress</span><strong>${task.progress}%</strong>
    </div>
    ${resources.length ? html`
      <div class="task-tooltip-resources">
        <strong>Resources</strong><span>${resources.map(resource => resource.name).join(', ')}</span>
      </div>
    ` : ''}
  `,
});
```

The `task-tooltip-title`, `task-tooltip-accent`, `task-tooltip-details`, and `task-tooltip-resources` classes are available for a consistent layout in custom content. Override `--gantt-tooltip-background`, `--gantt-tooltip-border`, `--gantt-tooltip-color`, or `--gantt-tooltip-shadow` on `<gantt-chart>` to restyle the shell without changing the template.

### Add business and calculated columns

Both grids accept extra columns. A task column receives the full `GanttTask`; a resource column receives both the `GanttResource` assignment and its parent `GanttTask`. This makes business calculations possible without changing the component.

```ts
gantt.options = {
  taskColumns: [
    { key: 'name', label: 'Task', width: 260, required: true },
    // Built-in, read-only unless editable is explicitly set to true.
    { key: 'actualCost', label: 'Actual cost', width: 110, type: 'number' },
    {
      key: 'weightedCost',
      label: 'Cost × coefficient',
      width: 140,
      type: 'number',
      value: task => (task.resources || []).reduce((total, resource) => {
        const quantity = Object.values(resource.quantityByDate || {}).reduce(
          (sum, value) => sum + Number(value || 0),
          0,
        ) || resource.quantity;
        const coefficient = Number(resource.metadata?.coefficient ?? 1);
        return total + quantity * resource.unitCost * coefficient;
      }, 0),
      format: value => `${Number(value).toFixed(2)} €`,
    },
  ],

  resourceColumns: [
    { key: 'name', label: 'Resource', width: 170, editable: true },
    {
      key: 'coefficient',
      label: 'Coefficient',
      width: 90,
      type: 'number',
      editable: true,
      value: resource => Number(resource.metadata?.coefficient ?? 1),
      setValue: (value, resource) => ({
        metadata: { ...resource.metadata, coefficient: Number(value) || 1 },
      }),
    },
  ],
};
```

For a custom resource column, omit `setValue` to make it read-only. With `editable: true` and no `setValue`, the component stores the typed value in `resource.metadata[column.key]`.

### Numeric resource inputs

Editable resource columns use the `GanttColumnType` enum. `string` (or the legacy `text`), `integer`, `decimal`, and `number` remain accepted as strings for compatibility. Use `step` and `min` when the default input rule does not match the business value.

```ts
import { GanttColumnType } from 'gantt-lit-component';

resourceColumns: [
  { key: 'name', label: 'Name', width: 180, type: GanttColumnType.String, editable: true },
  { key: 'quantity', label: 'Quantity', width: 80, type: GanttColumnType.Integer, min: 0, step: 1, editable: true },
  { key: 'coefficient', label: 'Coefficient', width: 96, type: GanttColumnType.Decimal, min: 0.01, step: 0.05, editable: true },
  { key: 'unitCost', label: 'Unit cost', width: 92, type: GanttColumnType.Decimal, min: 0, step: 0.01, editable: true },
]
```

`integer` defaults to a step of `1`; `decimal` defaults to `any`. `step` accepts a number or `any`. The legacy `number` type keeps its existing defaults for compatibility.

For task-grid indicators, `GanttColumn.tone` can return `positive`, `negative` or `neutral`. The component applies its theme-aware semantic colour; keep the signed value in `format` as well so the meaning does not depend on colour alone. The demo's `Delta` column uses `actualCost - costWithCoefficient` with this option.

### Custom cell templates and CSS effects

Use `cellTemplate` to render Lit content and `cellStyle` to compute inline CSS from the full task and cell value. This is useful for icons, badges, emphasis, colour, shadows, borders or transitions, while keeping the column read-only.

```ts
import { html } from 'lit';
import type { GanttColumnRenderContext } from 'gantt-lit-component';

const deltaStyle = ({ value }: GanttColumnRenderContext) => {
  const saving = Number(value) < 0;
  const color = saving ? 'var(--gantt-green)' : 'var(--gantt-red)';
  return `color:${color}; background:color-mix(in srgb, ${color} 14%, transparent); font-weight:700; transition:color 140ms ease`;
};

const deltaTemplate = ({ formattedValue }: GanttColumnRenderContext) => html`
  <span style="display:inline-flex; align-items:center; white-space:nowrap">${formattedValue}</span>
`;

gantt.setOptions({
  taskColumns: [{
    key: 'delta',
    label: 'Delta',
    width: 120,
    type: 'number',
    value: task => Number(task.actualCost || 0) - calculateCostWithCoefficient(task),
    format: value => formatSignedCost(value),
    tone: value => Number(value) < 0 ? 'positive' : 'negative',
    cellTemplate: deltaTemplate,
    cellStyle: deltaStyle,
  }],
});
```

## Resize the task grid and timeline

The divider between the left task grid and the right timeline is draggable by default. `headerWidth` still sets the initial left-grid width; `taskGridSplitter` defines the interactive bounds. The same split is applied to the resource panel, so dates remain aligned.

```ts
gantt.options = {
  headerWidth: 420, // optional initial width of the left grid
  taskGridSplitter: {
    enabled: true,             // default: true; false removes the draggable separator
    minWidth: 260,             // default: 220px
    maxWidth: '50vw',          // optional; omitted = all available space
    minTimelineWidth: 200,     // default: 160px, always retained on the right
  },
};
```

`minWidth`, `maxWidth` and `minTimelineWidth` accept a number (pixels) or a string in `px`, `vw` or `%`. For example, use `maxWidth: '50vw'` for half the browser viewport, `maxWidth: '60%'` for 60% of the component width, or `maxWidth: '900px'` for a fixed limit. Responsive values are recalculated when the component changes size.

## Calendar, localisation and theme overrides

By default, the component uses the browser locale (`navigator.language`), starts weeks on Monday, and shades Saturday and Sunday. Built-in French and English dictionaries live in [`src/translations.ts`](src/translations.ts); other locales use English as a safe fallback. All built-in visible labels, accessibility names, tooltips, validation/status messages and default menus use this dictionary. Override any label through `translations` when your product needs another language or specific terminology.

```ts
gantt.options = {
  locale: navigator.language, // for example: 'fr-FR' or 'en-GB'
  firstDayOfWeek: 1,          // 0 = Sunday, 1 = Monday, … 6 = Saturday
  showWeekNumbers: true,      // adds a week-number row above the timeline
  weekNumbering: 'first-full-week', // first complete week is W 1; use 'iso' for ISO-8601
  nonWorkingDays: [0, 6],     // days to shade; [] disables non-working-day shading
  translations: {
    resources: 'People and equipment',
    noPlanningData: 'Nothing has been planned yet.',
    focusTask: 'Centre task in timeline',
    resizeTaskGrid: 'Resize task grid',
    projectImported: 'Project imported: {file}',
  },
};
```

Translation values with placeholders support `{file}`, `{extension}`, `{column}` and `{name}`. Keep those placeholders in the translated sentence; their order can be changed to suit the language.

### Configurable date headers

`ganttHeader` controls the month, week and day levels in the planning header. `resourceHeader` controls the complete resource-header row. Both can render each date cell with a template; the example below displays French-style compact labels such as `V 16`.

```ts
gantt.setOptions({
  dayWidth: 30, // give compact labels such as "V 16" enough room
  ganttHeader: {
    showMonths: true,
    showWeeks: true,
    showDays: true,
    monthTemplate: ({ label }) => label,
    weekTemplate: ({ number }) => `S ${number}`,
    dayTemplate: ({ weekdayNarrow, day }) => `${weekdayNarrow.toLocaleUpperCase()} ${day}`,
    zoomLevels: [
      // The first matching level applies: aggregate date labels by week at low zoom.
      {
        maxZoom: 0.74,
        dayGrouping: 'week',
        weekDateTemplate: ({ start }) => String(start.getUTCDate()).padStart(2, '0'),
      },
      { minZoom: 0.75, dayGrouping: 'day' },
    ],
  },
  resourceHeader: {
    visible: true,
    dayTemplate: ({ weekdayNarrow, day }) => `${weekdayNarrow.toLocaleUpperCase()} ${day}`,
    zoomLevels: [
      { maxZoom: 0.74, dayGrouping: 'week', weekDateTemplate: ({ start }) => String(start.getUTCDate()).padStart(2, '0') },
      { minZoom: 0.75, dayGrouping: 'day' },
    ],
  },
});
```

Set `showMonths`, `showWeeks` or `showDays` to `false` to remove a Gantt header level. Set `resourceHeader.visible` to `false` to remove both the resource-column labels and its date row. `showWeeks` overrides the legacy `showWeekNumbers` option when provided.

`zoomLevels` lets the planning header adapt to the current zoom. Each rule accepts `minZoom`, `maxZoom`, the same visibility flags and templates, plus `dayGrouping: 'week'` to replace daily cells with one date label per week. The first matching rule wins; omit `zoomLevels` to keep a stable header.

`resourceHeader.zoomLevels` follows the same matching rule and supports `visible`, `dayGrouping`, `dayTemplate` and `weekDateTemplate`, so its date row changes at exactly the same thresholds as the planning header.

Both `weekTemplate` and `weekDateTemplate` receive `weekNumber`; `number` remains available as a backward-compatible alias.

Both Gantt and resource `dayTemplate` callbacks receive `weekNumber`, calculated with the configured `weekNumbering` rule.

```ts
dayTemplate: ({ weekdayNarrow, day, weekNumber }) =>
  `S${weekNumber} ${weekdayNarrow} ${day}`,
```

The first-day setting aligns the timeline to complete weeks and draws a subtle divider at the first day of each displayed week. With `showWeekNumbers`, the component displays a compact calendar-week row below the month header. `first-full-week` matches Microsoft Project-like calendars: the first complete week of the year is W 1 and a week crossing December/January stays attached to the previous year. Set `weekNumbering: 'iso'` for ISO-8601 numbering. Date headers and numeric values are formatted using `locale`.

### Resource calendars

Calendars belong to `GanttData`, so they are preserved in JSON, local persistence and custom project-file adapters. A resource selects one through `calendarId`. The resource grid then shades its closed days on that specific row, blocks edits on those dates and spreads a total quantity only across working dates.

```ts
gantt.setData({
  calendars: [
    { id: 'weekday', name: 'Weekdays', workingDays: [1, 2, 3, 4, 5] },
    {
      id: 'site-six-days',
      name: 'Site, Monday to Saturday',
      workingDays: [1, 2, 3, 4, 5, 6],
      exceptions: { '2026-12-25': 'non-working' },
    },
  ],
  tasks: [{
    id: 'survey', name: 'Survey', start: '2026-12-21', end: '2026-12-31',
    progress: 0, parentId: null, type: 'task',
    resources: [{ id: 'crew', name: 'Crew', type: 'work', unitCost: 500, quantity: 1, calendarId: 'weekday', maxUnits: 2 }],
  }],
});
```

`hours` is also available on a calendar for future hourly scheduling, but the current Gantt view remains day-based. Automatic dependency scheduling still uses the project calendar; resource calendars currently govern availability and quantity allocation, not resource leveling.

The component exposes CSS custom properties so a host application can apply its own design system without reaching into the component’s shadow DOM:

```css
gantt-chart {
  --gantt-header: #18233a;
  --gantt-border: #30415f;
  --gantt-muted: #7183a3;
  --gantt-row: #ffffff;
  --gantt-row-alt: #f6f8fc;
  --gantt-grid-line: #e5eaf2;
  --gantt-non-working-day: #edf1f7;
  --gantt-task: #167c5d;
  --gantt-parent: #2f69c7;
  --gantt-milestone: #d44d67;
  --gantt-dependency: #7551c8;
  --gantt-empty-background: #ffffff;
  --gantt-empty-color: #53627a;
}
```

`--gantt-empty-background` ensures the empty planning message remains above non-working-day shading and can be adapted to the host’s surface colour.

`--gantt-grid-line` controls every row and day-cell divider. It is the variable to adjust when the grid lines need to be softer or stronger in a custom dark theme.

## Built-in light and dark themes

The component ships with a light theme by default and a dark theme that covers the grid, timeline, menus, editors and input controls. The Material visual style also includes the Latin Roboto weights 400, 500 and 700; no web-font request or operating-system installation is required. Import the package stylesheet once in the host application so those embedded font files are available:

```ts
import 'gantt-lit-component/style.css';
import 'gantt-lit-component';
```

Select a theme with the `theme` attribute or property:

```html
<gantt-chart theme="dark"></gantt-chart>
```

```ts
gantt.theme = userPreferences.darkMode ? 'dark' : 'light';
```

The same public CSS custom properties can still be overridden for a product-specific palette in either theme.

## Import and export

JSON and Microsoft Project XML (`MSPXML`) are supported in the browser:

```ts
const json = gantt.toJSON();
const mspxml = gantt.toMSProjectXML();
const file = await gantt.exportFile('mspxml');
```

Binary Microsoft Project `.mpp` files require a specialised parser/writer. Keep it behind a server endpoint or worker and inject `ProjectFileAdapter`:

```ts
gantt.projectFileAdapter = {
  async importMpp(file) {
    const body = file instanceof File ? await file.arrayBuffer() : file;
    const response = await fetch('/api/project-files/import-mpp', {
      method: 'POST',
      headers: { 'content-type': 'application/octet-stream' },
      body,
    });
    if (!response.ok) throw new Error('MPP import failed');
    return response.json();
  },

  async exportMpp(data) {
    const response = await fetch('/api/project-files/export-mpp', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error('MPP export failed');
    return response.blob();
  },
};
```

## Build the package

```bash
pnpm build
```
