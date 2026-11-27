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

## External toolbar and menus (1.9.0)

Hide the built-in toolbar without accessing the shadow DOM:

```ts
gantt.options = { ...gantt.options, showToolbar: false };
zoomInButton.onclick = () => gantt.zoomIn();
zoomOutButton.onclick = () => gantt.zoomOut();
fitButton.onclick = () => gantt.fitGanttToView();
searchInput.oninput = () => gantt.searchTasks(searchInput.value);
editButton.onclick = () => gantt.openTaskEditor(); // selected task
gantt.addEventListener('view-state-changed', event => {
  const state = (event as CustomEvent<GanttViewState>).detail;
  zoomLabel.textContent = `${Math.round(state.zoom * 100)} %`;
  editButton.disabled = !state.canEditSelectedTask;
});
```

The toolbar remains visible by default. Hiding it preserves planning data, selection, draft rows, keyboard shortcuts, context menus and status/error feedback. The detached resource heading and Dock button are separate and remain visible.

| Host action | Public API |
| --- | --- |
| Zoom / fit | `getZoom()`, `setZoom(factor)`, `zoomIn()`, `zoomOut()`, `fitTaskToView(id?)`, `fitGanttToView()` |
| Search / matches | `searchTasks(query)`, `getSearchState()`, `nextSearchResult()`, `previousSearchResult()` |
| Expand / collapse | `expandAll()`, `collapseAll()`, `toggleTask(id)` |
| Selection / state | `selectTask(id)`, `getSelectedTaskId()`, `getSelectedTask()` (copy), `getViewState()`, `view-state-changed` |
| Task editor | `openTaskEditor(id?, 'general' \| 'resources' \| 'links')`, `closeTaskEditor()`; respects locks/read-only and existing external editor hooks |
| Resource picker | `openResourcePicker(taskId?)`, `closeResourcePicker()`; respects existing host picker integration |
| Columns | `getColumnSettings()`, `setColumnSettings(settings)`, `resetColumnSettings()` to build an external column menu |
| Create / edit / links / resources | `executeCommand(...)` and existing task/resource/dependency APIs; see [COMMANDS.md](COMMANDS.md) |
| Delete | `deleteTask(id)`, preserving host confirmation hooks |
| Undo / redo | `undo()` / `redo()` and `canUndo` / `canRedo` for local history; `undoCommand()` / `redoCommand()` and `canUndoCommand` / `canRedoCommand` for persisted history |
| Files / persistence | `importFile(file)`, `exportFile(format)` (Blob), `saveToPersistence()`, `loadFromPersistence()`, `saveToLocalStorage()`, `loadFromLocalStorage()`; the host owns file pickers/download controls |
| Detached resources | `undockResources()`, `dockResources()`, `resourcesUndocked` |

Zoom factors use `1 = 100%` and respect configured limits. Search highlights matches and selects/scrolls to the active result; it does not filter data. `GanttViewState` includes zoom, selection, editability, read-only, local/persisted history availability, detached state and search query/IDs/index. Subscribe once and initialize controls with `getViewState()`. Availability does not replace server authorization.

To replace right-click menus as well:

```ts
gantt.options = {
  ...gantt.options,
  showToolbar: false,
  contextMenus: false,
  onContextMenuRequested: context => {
    // kind: task | resources | timeline | dependency
    // taskId, assignmentId, dependency endpoints or ISO date; viewport x/y
    renderHostMenu(context.ownerDocument, context);
  },
};
```

Alternatively, listen to the cancelable `context-menu-requested` event and call `event.preventDefault()` to suppress just that built-in popup, or return `false` from `onContextMenuRequested`. Menus stay enabled by default. Existing context-menu templates still customize the menus inside the component. Menu elements themselves remain implementation details; external controls use public actions/settings.

`GanttContextMenuRequest` includes `kind`, viewport `x`/`y`, relevant stable IDs, `source: 'main' | 'detached'`, and `ownerDocument` for rendering a host popup in the correct window. Assignment IDs are present when a resource cell/date row was targeted, and absent on blank resource space. Task right-click selects that task before notification. Dependency requests support Shift+F10 / ContextMenu when an external handler is configured or internal menus are disabled. Detached requests are also forwarded once to the owning component and its callback. This is a UI context containing a DOM document, not a serializable planning command.

Run `pnpm build`, then `pnpm dev` and open `/examples/external-toolbar.html` for a working external toolbar and host-owned keyboard-accessible context menus. The example uses public APIs only.

## Structured commands and host-controlled editing

Version **1.8.0** adds an opt-in command API for host applications and assistants. The host resolves language/speech to stable IDs, typed numbers and civil ISO dates. Commands support task/phase creation, explicit ordering and hierarchy, calendar-based dates, assignments, dependencies, selection, separate previews, asynchronous canonical persistence, batches and persisted undo/redo hooks.

See [COMMANDS.md](COMMANDS.md) for the full options, commands, events, stable errors, concurrency guarantees and integration boundaries. Run pnpm build, then pnpm dev and open /examples/structured-commands.html for a simulated host with continuous entry, catalogue search, preview/cancel/confirm, failures, undo/redo and French/English/Arabic RTL settings. The typed assistant examples contain no voice recognition dependency.

Enabling commands also routes existing manual editors through shared validation and the host pipeline (captureManualEdits: false opts out). New inline command factories use the same pipeline. Legacy inline save callbacks remain supported as independent persistence boundaries. Global options.readOnly blocks user edits and command mutations.

## Optional inline creation rows

`options.inlineCreation` enables draft rows at the bottom of the task and resource grids, including empty grids. Both are **disabled by default**. Rows have no Add/Cancel buttons. When both resource modes are enabled, a translated selector requires an explicit choice of free entry. Existing toolbar buttons, dialogs, context menus and programmatic creation methods keep their behaviour.

The draft is UI state: it never enters `getData()`, totals, summaries, task bars, dependencies, history or exports. Only the complete record returned by the host's `save` callback is inserted. A blank row, focus/blur, Tab or Escape never creates a record.

```ts
import type { GanttChart } from 'gantt-lit-component';

const gantt = document.querySelector('gantt-chart') as GanttChart;
gantt.autoSave = false; // save callbacks below own persistence
gantt.options = {
  ...gantt.options,
  inlineCreation: {
    readOnly: false,
    confirmKey: 'Enter', // e.g. 'Ctrl+Enter', ['Enter', 'F2'], or false
    cancelKey: 'Escape', // configurable independently; false disables cancellation
    tasks: {
      enabled: true,
      getContext: context => ({
        parentId: context.selectedTask?.type === 'parent'
          ? context.selectedTask.id : context.selectedTask?.parentId ?? null,
        index: context.index,
      }),
      defaults: context => ({
        parentId: context.parentId, start: '2026-11-02', end: '2026-11-03',
        progress: 0, type: 'task',
      }),
      requiredFields: ['name', 'start', 'end'],
      validate: draft => draft.end! < draft.start!
        ? 'La fin doit être postérieure ou égale au début.' : undefined,
      save: (draft, context) => planningApi.createTask({
        ...draft, parentId: context.parentId, position: context.index,
      }), // Promise<GanttTask>, including the server-generated ID
    },
    resources: {
      enabled: true,
      modes: ['catalogue', 'free'],
      canCreate: task => task.type !== 'parent',
      search: query => planningApi.searchResources(query),
      defaults: { type: 'work', unit: 'h', quantity: 1, unitCost: 0 },
      requiredFields: ['name', 'unit', 'quantity', 'unitCost'],
      catalogueEditableFields: ['quantity', 'unitCost'],
      validate: draft => draft.quantity! <= 0 || draft.unitCost! < 0
        ? 'Vérifiez la quantité et le prix unitaire.' : undefined,
      save: (draft, context) => planningApi.createAssignment(context.task.id, {
        ...draft, mode: context.mode, resourceId: context.reference?.id,
      }), // Promise<GanttResource>, an assignment, including its ID
    },
  },
};
```

`planningApi` above represents your application's authenticated API client. A complete typed adapter and integration are provided in [examples/inline-creation.ts](examples/inline-creation.ts). Run `pnpm build`, then `pnpm dev` and open `/examples/inline-creation.html` for a runnable example with simulated asynchronous saving, catalogue search, a one-shot error switch and detachable resources.

The public contracts are exported from the package:

| Contract / option | Behaviour |
| --- | --- |
| `GanttInlineCreationOptions.readOnly` | Hides both draft rows. It only controls inline creation; use the existing task permission rules for other editing actions. |
| `tasks.enabled` / `resources.enabled` | Separate opt-ins; omitted or `false` preserves existing behaviour. Each enabled section requires either `save` or `command`. |
| `tasks.canCreate(context)` | Additional add permission. A locked or non-editable parent also prevents inline creation under that parent. |
| `tasks.getContext(context)` | Resolves `parentId` and `index` when a draft starts. Context includes snapshots of `selectedTask` and `lastTask`. The default is root insertion at the end of the flattened task tree. Keep this resolver pure: permissions also use it before a draft starts. |
| `GanttTaskCreationContext.index` | Zero-based offset in the flattened tree. The host can map this to its ordering model. `save` returns the authoritative `parentId`; the component uses `index` to insert it among siblings. |
| `defaults` | A draft object or synchronous function of the creation context. Task defaults include today's date for start/end, progress 0 and type `task`. Resource defaults include type `work`, quantity 1 and unit cost 0. Host defaults override these values and are copied. |
| `requiredFields` | Defaults to `['name']`. These are data paths, including `fields.customer` for task fields or `metadata.category` for resources. The existing column `required` flag still means “always visible”. |
| `validate(draft, context)` | Synchronous or asynchronous. Return a user-facing error string, throw an `Error`, or return nothing to accept. Native input constraints also apply. |
| `save(draft, context)` | Synchronous or asynchronous. Return a complete canonical `GanttTask` or `GanttResource`. Throw a user-facing `Error` on failure. Callbacks receive copies; do not also call `addChildTask`, `addResource` or `setData` to insert the same result. |
| `resources.modes` | `['catalogue']` by default. Use `['free']`, `['catalogue', 'free']` or `[]`. With both modes, catalogue is initially selected and the user must explicitly choose free entry. A failed/empty search never chooses free mode. |
| `confirmKey` / `cancelKey` | Shared by both grids. Default to `'Enter'` and `'Escape'`. Accept a shortcut (`'Ctrl+Enter'`, `'Alt+Backspace'`), an array of alternatives, or `false`. Modifiers must match exactly. |
| `resources.inputTemplate(context)` | Replaces editable resource inputs with host-owned controls and disables built-in catalogue search. Supplies `column`, `task`, a draft copy, `value`, `disabled`, `required`, selected `reference`, `onInput(value)`, `selectReference(referenceOrNull)` and `renderDefault()`. |
| `resources.selectionChange` | `'retain'` (default) keeps a draft per task; `'discard'` resets unsaved drafts on selection changes. Pending saves always keep their original target. |
| `tasks.command` / `resources.command` | Alternative to `save`: build a typed command, using `context.correlationId` for retry-safe correlation. Requires `commands.enabled`. See [COMMANDS.md](COMMANDS.md). |
| `resources.canCreate(task)` | Additional permission for the selected task. Existing `task.editable` and `isTaskEditable` rules apply. No resource row appears without a selected task. |
| `resources.search(query, context)` | Searches by name or code; falls back to the existing `resourceProvider.search(query)` when omitted. Suggestions expose optional `GanttResourceReference.code`. Late results from older queries or cancelled drafts are ignored. |
| `resources.catalogueEditableFields` | Additional allowlist for edits after catalogue selection; columns must also be editable. Omit to allow all editable columns. Name/code inputs search the catalogue; explicitly allowlisting them also permits editing their selected value without changing catalogue identity. |
| `GanttResourceCreationContext` | Contains the original target `task`, `mode` and selected catalogue `reference`. The task snapshot is refreshed before validation; changing selection never redirects a pending assignment. |

Editors follow visible column order and `column.editable`. Configure editable task dates or additional fields through `taskColumns` as needed. Custom task keys map to `draft.fields`; custom resource keys map to `draft.metadata`. Resource select editors, typed options, numeric constraints, `value` and `setValue` are supported; `setValue` receives a draft snapshot with an empty assignment ID. ID and catalogue identity are not editable draft columns.

Tab and Shift+Tab move through controls. The confirmation key validates and saves the row; on success a fresh row is immediately available. The cancellation key resets the draft and suggestions. Enter on a built-in catalogue suggestion selects it, and native select editors retain their Enter behaviour. A host search control can call `event.preventDefault()` to consume a key while choosing a suggestion or closing its own popup. While validation or saving is pending, controls are disabled and further submission attempts are ignored. After success, focus returns to the first editor if the user has not moved elsewhere. After an error, the message and draft remain available for correction. Drafts are kept per task across selection changes, and shared between embedded and detached panels.

Catalogue selection copies the reference data and preserves `resourceId`. In catalogue mode, confirmation requires a selected reference. Choose free mode explicitly to create a valid non-empty free assignment. With only `['free']` configured, entry is directly in free mode. Searching or leaving the field never saves by itself. In catalogue-only mode, confirmation requires a selected reference. For free assignments, `resourceId` and the compatibility `metadata.catalogId` are removed from the outgoing draft; the host must persist an assignment without creating a catalogue entry. Return any server-calculated `quantityByDate`, prices and custom metadata in the canonical assignment: those values are preserved when it is inserted.

To plug in your own resource search input, use a Lit template (or DOM content) with the following bindings. `host-resource-search` below stands for the host application's existing widget; it emits `query-changed` with a string and `resource-selected` with a `GanttResourceReference` or `null`:

```ts
import { html } from 'lit';

gantt.options = {
  ...gantt.options,
  inlineCreation: {
    ...gantt.options.inlineCreation,
    confirmKey: 'Enter',
    cancelKey: 'Escape',
    resources: {
      ...gantt.options.inlineCreation!.resources!,
      modes: ['catalogue', 'free'],
      inputTemplate: context => context.column.key === 'name'
        ? html`<host-resource-search
            .value=${context.value}
            .disabled=${context.disabled}
            .required=${context.required}
            @query-changed=${(event: CustomEvent<string>) => context.onInput(event.detail)}
            @resource-selected=${(event: CustomEvent) => context.selectReference(event.detail)}
          ></host-resource-search>`
        : context.renderDefault(),
    },
  },
};
```

The widget owns its search and popup; consume Enter/Escape with `preventDefault()` while handling those internally. `onInput` updates the draft, and a name/code change invalidates the previous reference unless that field is explicitly editable after selection. `selectReference` selects or clears a reference without saving. Bind `disabled` during asynchronous validation/saving and manage the widget's focus when closing its popup. Stale callbacks from a cancelled or completed draft are ignored. The same template works in the detached panel. The example's `configureInlineCreation` also accepts this renderer as its optional fourth argument.

The component checks permissions before saving and after asynchronous validation. The server remains responsible for authorizing the request. Escape does not abort an already submitted save. A successful response is merged into current data even if selection changed while waiting. Confirmed inserts emit the existing `tasks-changed` notification (and assignment update notifications for resources). Existing `autoSave` hooks still observe confirmed changes if enabled; set `autoSave = false` to avoid an additional persistence request when these callbacks own saving. For retry-safe persistence after ambiguous network failures, the host API should use its normal idempotency mechanism.

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

// Useful in diagnostics, telemetry and support tickets.
console.info(GanttChart.version); // "1.9.0"
console.info(gantt.version); // "1.9.0"
```

Dates use `YYYY-MM-DD` strings deliberately. This prevents timezone changes between the browser and backend from shifting tasks by one day.

## Build and distribute the package

`pnpm build` creates the distributable `dist/` directory: the ESM component, its stylesheet, source maps and TypeScript declaration files. The package manifest includes `dist/`, this README, the changelog, the command reference and examples.

Before publishing, inspect the exact package contents locally:

```bash
pnpm build
npm pack --dry-run
npm pack
```

The final command produces an archive such as `gantt-lit-component-1.9.0.tgz`. A consuming application can test that archive before any publication:

```bash
pnpm add ../path/to/gantt-lit-component-1.9.0.tgz
```

### Publish to npm

For a public package, use an available package name or a scoped name such as `@sisco21/gantt-lit-component`, update the `name` field in `package.json`, then run:

```bash
npm login
pnpm build
npm publish --access public
```

Consumers install and register it as follows:

```bash
pnpm add @sisco21/gantt-lit-component
```

```ts
import '@sisco21/gantt-lit-component';
import type { GanttChart, GanttOptions } from '@sisco21/gantt-lit-component';
```

### Install directly from GitHub

For an unpublished package, add the repository reference to the consuming application's `package.json`:

```json
{
  "dependencies": {
    "gantt-lit-component": "github:Sisco21/gantt-lit-component#main"
  }
}
```

Then run `pnpm install`. The package `prepare` script builds the distributable files during Git-based installation. Use a version tag rather than `main` for reproducible releases, for example `github:Sisco21/gantt-lit-component#v1.9.0`.

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

## Incremental updates (1.4.0)

After the initial load, import or explicit full reload, update only the item returned by the business API. The component rebuilds the affected task branch, recalculates parent phase dates and the planning summary, and keeps selection, the active editor tab and scroll positions.

```ts
gantt.options = {
  incrementalUpdates: true,
  recalculateOnMoveEnd: true,
  preserveScroll: true,
};

gantt.data = fullPlanning; // initial load only; a JSON string is also supported for HTML attributes

const savedTask = await planningApi.updateTask(taskId, { startDate, finishDate });
gantt.updateTask(taskId, {
  start: savedTask.start,
  end: savedTask.end,
  resources: savedTask.resources,
});

const savedAssignment = await planningApi.updateAssignment(taskId, assignmentId, { quantity, unitCost });
gantt.updateResourceAssignment(taskId, {
  assignmentId,
  quantity: savedAssignment.quantity,
  unitCost: savedAssignment.unitCost,
  quantityByDate: savedAssignment.quantityByDate,
});
```

The assignment endpoint should return the canonical assignment including its recalculated occurrences (`quantityByDate`). A `void` response does not contain enough information for a reliable incremental update. Use `updateTaskResources(taskId, resources)` when the endpoint returns the complete assignment collection, or `removeResourceAssignment(taskId, assignmentId)` for a deletion.

```ts
gantt.addEventListener('task-updated', event => {
  const { taskId, reason, revision } = (event as CustomEvent).detail;
  audit.log({ taskId, reason, revision });
});

gantt.addEventListener('resource-assignment-updated', event => {
  const { taskId, assignmentId, revision } = (event as CustomEvent).detail;
  invalidateAssignmentCache(taskId, assignmentId, revision);
});
```

`UpdateReason` is one of `task-date`, `task-label`, `task-hierarchy`, `resource-added`, `resource-updated`, `resource-removed`, `manual-quantity` or `full-refresh`. `refreshTask(taskId)` is the explicit recalculation entry point when move-end recalculation is disabled.

To avoid recalculating dependencies, resource occurrences and summaries for every drag frame, set `recalculateOnMoveEnd: false`. The bar is previewed while dragging, the direct date is committed on release, and the host can call `refreshTask(taskId)` after its business API has returned the canonical result. Set `incrementalUpdates: false` only for a compatibility integration that still expects the internal full-data reconciliation path.

### Detached resources and preserved view state

The detached resource panel is synchronized automatically after an incremental update. Selection and the active tab are component state, so they are not reset when the host calls the focused APIs:

```ts
gantt.options = {
  resourcePanel: { detachable: true },
  preserveScroll: true,
};

gantt.selectTask('task-42');
gantt.undockResources();

// The current horizontal/vertical scroll, selected task and resource window
// remain in place after the API response is applied.
gantt.updateTaskResources('task-42', taskFromApi.resources ?? []);
gantt.updateResourceAssignment('task-42', assignmentFromApi);
```

The complete host-integration sample is available in [`examples/incremental-updates.ts`](examples/incremental-updates.ts).

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
| `task-delete-requested` | `GanttTaskDeleteContext` | Audit or synchronously cancel a task-deletion request with `event.preventDefault()`. |

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

`workingDurationDays` uses `nonWorkingDays`. Set `summaryReferenceDate` to calculate schedule alerts against a fixed business date instead of the current day, or provide a callback when the reference date must be recalculated dynamically. The optional `plannedCost` and `actualCost` fields on a `GanttTask` feed `plannedCost`, `actualCost`, and `costVariance`; when `plannedCost` is absent, the calculated assignment/task cost is used as the planned value.

```ts
gantt.setOptions({
  summaryReferenceDate: '2026-01-20',
  nonWorkingDays: [0, 6],
});

// Dynamic reference date: evaluated whenever getProjectSummary() runs.
gantt.setOptions({
  summaryReferenceDate: () => new Date().toISOString().slice(0, 10),
});

// Customize the Today marker independently from task-bar colours.
gantt.setOptions({
  taskColors: { today: '#d83b01' },
  todayLabel: 'Current day',
});

gantt.updateTask('task-42', {
  plannedCost: 12_500,
  actualCost: 11_400,
});
```

Use the event when the change reason and revision matter; use `onTasksChange` for a lightweight full-data callback.

### Confirm or disable task deletion

By default, the **Delete** toolbar button and the `Delete` key remove the selected task. Deleting a phase also removes all of its child tasks. Configure `taskDeletion` to disable these entry points or delegate confirmation to a host-owned dialog, permission service, or API call. The same confirmation is used by `deleteTask()` and the `deleteTask` action supplied to a custom task context menu.

```ts
import type { GanttTaskDeleteContext } from 'gantt-lit-component';

const confirmDeletion = async ({ task, descendants, source }: GanttTaskDeleteContext) => {
  return hostDialog.confirm({
    title: `Delete ${task.name}?`,
    message: descendants.length > 1
      ? `This action also removes ${descendants.length - 1} child tasks.`
      : `Requested from ${source}.`,
    confirmLabel: 'Delete',
  });
};

gantt.setOptions({
  taskDeletion: {
    enabled: true,           // false disables component-initiated deletion
    keyboardShortcut: true,  // false keeps the Delete key harmless
    confirm: confirmDeletion,
  },
});
```

`task-delete-requested` is a cancelable DOM event. It is useful for synchronous rules such as locking a phase:

```ts
gantt.addEventListener('task-delete-requested', event => {
  const request = event as CustomEvent<GanttTaskDeleteContext>;
  if (request.detail.task.metadata?.locked) event.preventDefault();
});
```

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

## Detach the resource panel

Enable a secondary, resizable browser window for the selected task's resource grid:

```ts
gantt.setOptions({
  resourcePanel: {
    detachable: true,
    windowTitle: 'Project resources',
    windowWidth: 1180,
    windowHeight: 680,
  },
});
```

The component then shows **Undock resources** when a task is selected. The window can be moved to another monitor and includes a **Dock resources** action. You can also control it from the host:

```ts
gantt.undockResources(); // Returns false when no task is selected or a pop-up is blocked.
gantt.dockResources();
```

The embedded panel makes room for the Gantt while resources are detached. The main Gantt remains the source of truth: resource edits in the secondary window are immediately applied to it, while task selection, project data, horizontal date position, theme, visual style and `--gantt-*` CSS variables are kept in sync. The browser decides which monitor opens the window; users can move it to another screen. Open it directly from a user gesture when popup blockers are active.

## Use an API resource catalogue

Resources assigned to a task are project data. A resource catalogue is external reference data and is loaded on demand through `GanttResourceProvider`. This keeps the component independent from your API and authentication model.

Each resource assignment includes an optional `unit` field representing its unit of work, such as `day`, `hour`, `m³` or `unit`. The built-in resource grid displays this value as **Unit of work** and exposes one quantity field only: **Quantity**. That field represents the calculated total after daily quantities and working calendars have been applied. The legacy `totalQuantity` field is still accepted when reading older project snapshots but is no longer displayed.

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

Set `openTaskEditorOnCreate: true` when newly created tasks should open this editor immediately, and `focusTaskOnCreate: true` to centre the new task in the timeline. The demo uses both options to offer single resource assignment through the catalogue and bulk assignment from reusable resource teams/work packages. The displayed “Suggested from the task name” section is a deterministic integration example; replace its keyword rules with a call to your AI or business recommendation service, then assign the returned `GanttResourceReference` objects through `addResource`.

### Open the editor from a Gantt bar and lock tasks

Set `openTaskEditorOnDoubleClick: true` to open the configured editor when the user double-clicks a **timeline bar**. The task grid keeps its existing double-click rename behaviour.

The task grid has an independent action. It can keep renaming, open the component editor, or do nothing:

```ts
gantt.setOptions({
  openTaskEditorOnDoubleClick: true,
  taskGridDoubleClickAction: 'edit', // 'rename' (default) | 'edit' | 'none'
});
```

To open a modal owned by the host application from a grid double-click, combine `edit` with the existing external editor hook:

```ts
gantt.setOptions({
  taskGridDoubleClickAction: 'edit',
  taskEditorMode: 'external',
  onTaskEdit: task => hostTaskModal.open(task),
});
```

Locked tasks do not invoke the editor or rename action.

Each task can be locked directly in the portable project data. A locked task remains selectable and visible, but cannot be edited, dragged, resized, deleted, or have its resources changed through the component. The public lock methods also work on an already locked task, so an authorised host workflow can unlock it directly.

```ts
gantt.setOptions({
  openTaskEditorOnDoubleClick: true,
  // Optional business rule, evaluated in addition to task.editable.
  isTaskEditable: task => task.metadata?.workflowState !== 'approved',
});

gantt.lockTask('task-42');
gantt.unlockTask('task-42');
```

Custom task-editor and task-menu templates receive an `editable` flag. Their mutation callbacks are safe no-ops when that flag is `false`.

### Custom task right-click menu

Set `taskContextMenuTemplate` to replace the default task menu. The template receives the Gantt instance as `gantt`, plus the complete `task`, including `type`, `fields` and `metadata`, so a host can choose a different menu for any business parameter without duplicating planning logic. The component blocks the browser's native right-click menu and keeps the main menu and its submenus inside the viewport.

```ts
import { html } from 'lit';

gantt.options = {
  taskContextMenuTemplate: ({ gantt, task, close, updateTask, fitToView }) => task.metadata?.readOnly
    ? html`<button @click=${() => { fitToView(); close(); }}>View ${task.name}</button>`
    : html`
    <button @click=${() => { updateTask({ progress: 100 }); close(); }}>Mark complete</button>
    <button @click=${() => { gantt.lockTask(task.id); close(); }}>Lock task</button>
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

### Custom dependency right-click menu

Set `dependencyContextMenuTemplate` to receive the exact dependency represented by the arrow that was right-clicked. The component supplies the menu shell, keeps it inside the viewport, supports Escape/click-away closing and exposes the focused connector to the keyboard context-menu shortcuts (`ContextMenu` and `Shift+F10`). The host owns the application confirmation and server persistence; call `gantt.removeDependency(from, to)` only after the server accepts the deletion.

```ts
import { html } from 'lit';

gantt.options = {
  dependencyContextMenuTemplate: ({ gantt, dependency, editable, close, fitToView }) => html`
    <button
      role="menuitem"
      ?disabled=${!editable}
      @click=${async () => {
        close();
        const confirmed = await confirmDependencyInApplication(dependency);
        if (!confirmed) return;
        try {
          await deleteDependencyOnServer({
            from: dependency.from,
            to: dependency.to,
            budgetRevision: getCurrentBudgetRevision(),
          });
          // Incremental update: selection, scroll and the rest of the plan stay intact.
          gantt.removeDependency(dependency.from, dependency.to);
        } catch (error) {
          showDependencyError(error);
          // The connector remains visible because removeDependency was not called.
        }
      }}
    >
      Supprimer le lien
    </button>
    <button role="menuitem" @click=${() => { fitToView(); close(); }}>
      Ajuster la vue
    </button>
  `,
};
```

When this option is omitted, dependency arrows do not add a context-menu interaction, preserving the 1.5.0 integration behaviour. A failed or conflicting server request must leave the dependency in the host data and can offer the application's reload action.

Useful public editing methods for an external editor are:

| Method | Purpose |
| --- | --- |
| `updateTask(taskId, patch)` | Change task fields, dates, parent or resources. |
| `updateTaskResources(taskId, resources)` | Replace only one task's assignment collection with the canonical API response. |
| `updateResourceAssignment(taskId, assignment)` | Apply one assignment response or patch, including recalculated occurrences. |
| `removeResourceAssignment(taskId, assignmentId)` | Remove one assignment without reloading the planning. |
| `refreshTask(taskId)` | Recalculate the task, parent phase roll-ups, dependencies and summary. |
| `lockTask(taskId)` / `unlockTask(taskId)` | Persistently block or restore built-in editing for one task. Both return `false` if the task is unknown. |
| `setTaskLocked(taskId, locked)` | Set the same lock state when it is known as a boolean. |
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
| `setData(data)` | Apply an initial load, import or deliberate complete reload. |
| `updateCalendar(calendar)` | Update one calendar's visual exceptions without recalculating tasks, costs or dependencies. |
| `setProjectCalendarId(calendarId)` | Change the calendar used by the planning columns without reinjecting the tasks. |

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

To move a nested task out of its current parent, drag it to the left gutter of any task row in the name column. The highlighted blue left edge indicates the **outdent** action; releasing moves the complete task branch one level up, after the current parent branch. This also works when dropping back on the dragged row, which is useful when a task has no convenient sibling target.

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

### Deferred schedule editing

Task-bar move and resize calculations remain live by default. To preview only the active bar and calculate dependencies, resources, costs and summaries once on release, configure `scheduleEditing`:

```ts
gantt.options = {
  scheduleEditing: {
    enabled: true,
    dependencyCalculation: 'on-commit',
    resourceCalculation: 'on-commit',
    costCalculation: 'on-commit',
    summaryCalculation: 'on-commit',
    commitMode: 'controlled',
  },
  onScheduleEditCommit: async request => {
    const response = await saveScheduleEdit(request);
    return response.ok
      ? { status: 'accepted', data: response.data, revision: response.revision }
      : { status: 'rejected', error: response.error };
  },
};
```

Use `commitMode: 'internal'` to apply the calculated result locally. `onScheduleEditStart`, `onScheduleEditPreview` and `onScheduleEditCancel` receive the original and proposed snapshots. `isScheduleEditing()` and `cancelScheduleEdit()` expose the active session to host controls. `autoSchedule` remains responsible only for initial dependency scheduling.

The user can resize visible columns from their boundaries, open the column picker to hide optional columns, and use the toolbar to expand or collapse all parents.

The bundled demo also includes **Large sample · 1,550 tasks**. It generates 50 parent phases, 1,500 work packages, resource assignments, and dependency links in the browser, then displays the load time. It is intended for manual rendering and scrolling checks.

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

Every template receives the task, its persisted colour, the visible bar width, `durationDays`, and a `kind` (`task`, `summary`, or `milestone`). `durationDays` matches the built-in Duration column and is recalculated whenever a task is moved or resized. By default, the built-in task name moves into the visible portion of a long bar while the timeline scrolls, while keeping clear of the resize handles. Set `stickyTaskLabels: false` to disable this behaviour.

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

### Native select resource columns

Use `editor: 'select'` when a resource column should use a native HTML `<select>` instead of a text or numeric input. The option labels and values come entirely from the host application, so the component does not translate or calculate domain values.

```ts
import type {
  GanttResourceColumn,
  GanttResourceColumnOption,
} from 'gantt-lit-component';

const calculationTypeLabels: Record<number, string> = {
  0: 'Fixed total — smoothed',
  1: 'Fixed total — punctual',
  2: 'Duration / workshop',
  3: 'Periodic — fixed weekday',
  4: 'Periodic — every X working days',
  5: 'Stock',
  6: 'One-off service',
  7: 'Duration-based subcontracting',
  8: 'Fixed-price subcontracting',
  9: 'Milestone with punctual resource',
};

const calculationTypeOptions: GanttResourceColumnOption[] = Object.entries(calculationTypeLabels)
  .map(([value, label]) => ({ value: Number(value), label }));

const resourceColumns: GanttResourceColumn[] = [
  {
    key: 'assignmentType',
    label: 'Calculation type',
    width: 240,
    editor: 'select',
    options: calculationTypeOptions,
    editable: true,
    value: resource => Number(resource.metadata?.assignmentType ?? 2),
    format: value => calculationTypeLabels[Number(value)] ?? String(value),
    setValue: (value, resource) => ({
      metadata: {
        ...resource.metadata,
        assignmentType: Number(value),
      },
    }),
  },
];

gantt.options = { resourceColumns };
```

`GanttResourceColumnOption` has a `value`, a displayed `label`, and an optional `disabled` flag. The selected option value is passed as a string to `setValue`; convert it to the domain type required by the host application. The current raw value remains on the resource passed to `setValue`. If the current value is not in `options`, the component keeps it visible as a disabled fallback option. A select column without options is rendered read-only.

For French and English (or any other language), provide translated labels in `options` from the host application. The Gantt component displays those labels as supplied and does not translate enum values itself. `setValue` should update only the resource assignment or its metadata; validation, recalculations, quantities, costs and persistence remain the responsibility of the host application's business layer. The component emits the normal `tasks-changed` event, calls `onTasksChange`, and uses the existing `autoSave`, `saveHook` and persistence-adapter pipeline.

### User-managed column layout (order, width and visibility)

Both the task grid and the resource grid support column resizing, drag-and-drop reordering, visibility toggles and keyboard-accessible left/right buttons in the **Columns** panel. The component exposes a complete serializable layout, so the host can persist it in local storage, a user profile, or an API.

```ts
import type { GanttColumnSettings } from 'gantt-lit-component';

gantt.setOptions({
  columnSettings: {
    // Called after the user changes a width, order or visibility in either grid.
    onChange: async (settings: GanttColumnSettings) => {
      await fetch(`/api/user-settings/${currentUser.id}/gantt-columns`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
    },
    // Called after Columns > Reset. Delete the saved layout here.
    onReset: async () => {
      await fetch(`/api/user-settings/${currentUser.id}/gantt-columns`, { method: 'DELETE' });
    },
  },
});

// Apply the saved layout after the component options and columns are configured.
const saved = await fetch(`/api/user-settings/${currentUser.id}/gantt-columns`).then(response =>
  response.ok ? response.json() as Promise<GanttColumnSettings> : undefined,
);
if (saved) gantt.setColumnSettings(saved);

// Public methods are also useful for a host-owned Reset button.
const currentLayout = gantt.getColumnSettings();
gantt.resetColumnSettings();
```

`GanttColumnSettings` contains `taskColumns`, `resourceColumns` and `taskRowHeight`; each column entry has a `key`, `order`, `width` and `visible` value. Unknown column keys are safely ignored, which allows a saved setting to survive a later component upgrade. The component also emits `column-settings-changed` and `column-settings-reset`, both with the layout in `event.detail`.

The drag handle (six dots) appears at the left of each configurable header on hover. Set `columnSettings: { enabled: false }` to retain a fixed column layout and hide the Columns control and all column gestures. Each permission can also be disabled independently:

```ts
columnSettings: {
  allowResize: true,
  allowReorder: false,   // hides the six-dot handle and disables the arrow buttons
  allowVisibility: false, // shows checked columns but makes their checkboxes read-only
}
```

Mark a task or resource column with `required: true` when it must never be hidden.

### Task row height

Set a default row height through the component options. It applies consistently to the task grid, timeline bars (including resource segments and milestones), dependency anchors and virtual scrolling. Valid values are clamped to `28`–`96` pixels.

```ts
gantt.setOptions({
  taskRowHeight: 52,
  columnSettings: {
    onChange: settings => saveUserSettings(settings),
  },
});

// Or change the effective value programmatically. This also calls onChange.
gantt.setTaskRowHeight(56);
```

The **Task row height** slider in the Columns panel changes the same value and stores it in `GanttColumnSettings.taskRowHeight`. Set `columnSettings.allowTaskRowHeight: false` to hide that slider while retaining the host-provided `taskRowHeight`.

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

### Column tooltips

Every left-grid cell displays its formatted value as a native tooltip by default. Override it through `tooltip`, or set it to `false` when the cell should not expose a tooltip. The same option exists on `GanttResourceColumn`; its context additionally contains `resource`.

```ts
{
  key: 'delta',
  label: 'Delta',
  width: 120,
  value: task => Number(task.actualCost || 0) - calculateCostWithCoefficient(task),
  format: value => formatSignedCost(value),
  tooltip: ({ task, formattedValue }) =>
    `${task.name}\nActual cost compared with planned cost: ${formattedValue}`,
},

// Disables the tooltip for this column.
{ key: 'code', label: 'Code', width: 64, tooltip: false },
```

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

By default, the component uses English (`en-US`), starts weeks on Monday, and shades Saturday and Sunday. Built-in French and English dictionaries live in [`src/translations.ts`](src/translations.ts); other locales use English as a safe fallback. All built-in visible labels, accessibility names, tooltips, validation/status messages and default menus use this dictionary. Set `locale` explicitly when your product needs another language or specific terminology.

The bundled demo includes a **Language** selector for English and French. It changes the page controls, demo-only templates and summaries, then reapplies `options.locale` to the component. Task and resource names are business data and are deliberately not machine-translated; supply localized values from the hosting product when needed.

```ts
gantt.options = {
  locale: 'fr-FR', // for example: 'fr-FR' or 'en-GB'
  firstDayOfWeek: 1,          // 0 = Sunday, 1 = Monday, … 6 = Saturday
  showWeekNumbers: true,      // adds a week-number row above the timeline
  weekNumbering: 'first-full-week', // first complete week is W 1; use 'iso' for ISO-8601
  nonWorkingDays: [0, 6],     // days to shade; [] disables non-working-day shading
  translations: {
    resources: 'People and equipment',
    newTask: 'New work item',
    newResource: 'New catalogue resource',
    noPlanningData: 'Nothing has been planned yet.',
    focusTask: 'Centre task in timeline',
    resizeTaskGrid: 'Resize task grid',
    projectImported: 'Project imported: {file}',
  },
};
```

Translation values with placeholders support `{file}`, `{extension}`, `{column}` and `{name}`. Keep those placeholders in the translated sentence; their order can be changed to suit the language.

The demo overrides `newTask` and `newResource` in both English and French so the default names shown when creating tasks or manual resources can be replaced without modifying the component. Translation overrides are applied after locale selection and can contain only the labels that need changing.

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

Calendars belong to `GanttData`, so they are preserved in JSON, local persistence and custom project-file adapters. The host application resolves inheritance before passing the data: `GanttData.projectCalendarId` is the budget/project calendar, `GanttTask.calendarId` is the effective task/phase calendar, and a resource's existing `calendarId` takes precedence for its row. The resource grid shades its closed days on that specific row, blocks edits on those dates and spreads a total quantity only across working dates.

Calendar exceptions are visual only. `working` can reopen a normal weekend, while `non-working` uses a distinct, theme-aware tint. `exceptionLabels` adds an accessible label to the date title and resource input tooltip. For example, this marks 14 July as **Fête nationale** across the planning columns:

The planning and resource panels share the component's available vertical space. On a compact viewport, the planning panel contracts first so the selected task's resources remain visible. Set `resourcesMaxHeight` when an integration needs a different preferred resource-panel height; the horizontal separator remains user-resizable without allowing the resources to disappear.

```ts
gantt.setOptions({
  maxHeight: 440,
  resourcesMaxHeight: 260,
});
```

```ts
gantt.setData({
  projectCalendarId: 'weekday',
  calendars: [
    { id: 'weekday', name: 'Weekdays', workingDays: [1, 2, 3, 4, 5] },
    {
      id: 'site-six-days',
      name: 'Site, Monday to Saturday',
      workingDays: [1, 2, 3, 4, 5, 6],
      exceptions: { '2026-07-14': 'non-working' },
      exceptionLabels: { '2026-07-14': 'Fête nationale' },
    },
  ],
  tasks: [{
    id: 'survey', name: 'Survey', start: '2026-07-13', end: '2026-07-18',
    progress: 0, parentId: null, type: 'task',
    resources: [{ id: 'crew', name: 'Crew', type: 'work', unitCost: 500, quantity: 1, calendarId: 'weekday', maxUnits: 2 }],
}],
});
```

Calendar-only refreshes keep selection, zoom and both scroll axes intact and do not require `gantt.data = ...`:

```ts
gantt.updateCalendar({
  id: 'weekday',
  name: 'Weekdays',
  workingDays: [1, 2, 3, 4, 5],
  exceptions: { '2026-07-14': 'non-working' },
  exceptionLabels: { '2026-07-14': 'Fête nationale' },
});
gantt.setProjectCalendarId('weekday');
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
  --gantt-calendar-non-working: #fff0df;
  --gantt-calendar-working: #eaf7ef;
  --gantt-calendar-exception-border: #d97706;
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
