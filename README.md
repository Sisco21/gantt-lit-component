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
| `task-selected` | `{ id, task }` | Update a host-side details panel. |
| `persistence-error` | `{ error, change }` | Show a retry/error state after an automatic save fails. |
| `project-file-error` | `{ error }` | Report an MPP import/export adapter error. |

For a simple in-memory host store, an option is also available:

```ts
gantt.options = {
  onTasksChange: (data) => projectStore.set(data),
  onTaskSelect: (taskId) => detailsPanel.select(taskId),
};
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

In the built-in task editor, searching resources calls `resourceProvider.search(query)`. When a user adds a result, the component creates an assignment with a fresh assignment ID and stores the catalogue identifier in `resource.metadata.catalogId`. Keep any additional business fields in `metadata`.

An assigned resource can also contain daily quantities:

```ts
{
  id: 'assignment-1',
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

Useful public editing methods for an external editor are:

| Method | Purpose |
| --- | --- |
| `updateTask(taskId, patch)` | Change task fields, dates, parent or resources. |
| `addChildTask(parentId, task?)` | Create a child task. |
| `addResource(taskId, resource?)` | Add an assignment to a task. |
| `moveTask(taskId, parentId)` | Move a task to another parent. |
| `addDependency(from, to, type?)` | Create a task relationship. |
| `removeDependency(from, to)` | Remove a task relationship. |
| `setData(data)` | Apply a complete host-managed data update. |

Every mutation above emits `tasks-changed`, so persistence and application state remain consistent whichever editor is used.

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

Use `taskBarTemplate` to append information after the task name inside regular task bars and parent summary bars. The component keeps the task title visible and continues to manage drag, resize, selection and dependency interactions.

```ts
import { html } from 'lit';

gantt.setOptions({
  taskBarTemplate: ({ task, color, width, durationDays, kind }) => kind === 'summary'
    ? html`${task.metadata?.budget ?? 0} €`
    : width > 100
      ? html`${durationDays} days · ${task.progress}%`
      : '',
});

gantt.updateTask('task-42', { color: '#7c3aed' });
```

The template receives the task, its persisted colour, the visible bar width, `durationDays`, and a `kind` (`task` or `summary`). `durationDays` matches the built-in Duration column and is recalculated whenever a task is moved or resized.

### Add business and calculated columns

Both grids accept extra columns. A task column receives the full `GanttTask`; a resource column receives both the `GanttResource` assignment and its parent `GanttTask`. This makes business calculations possible without changing the component.

```ts
gantt.options = {
  taskColumns: [
    { key: 'name', label: 'Task', width: 260, required: true },
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

## Calendar, localisation and theme overrides

By default, the component uses the browser locale (`navigator.language`), starts weeks on Monday, and shades Saturday and Sunday. Built-in French and English dictionaries live in [`src/translations.ts`](src/translations.ts); other locales use English as a safe fallback. Override any label through `translations` when your product needs another language or specific terminology.

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
  },
};
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
