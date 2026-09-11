# Reusable Gantt Web Component — AI Recreation Specification

## Role

You are an expert frontend engineer. Recreate a production-ready, reusable Gantt chart web component from this specification.

The result must be a framework-agnostic Web Component built with Lit and TypeScript. It must be embeddable in an external application without taking ownership of authentication, API calls, persistence, resource catalogues or host-owned dialogs.

The component must be usable as:

```html
<gantt-chart></gantt-chart>
```

and from TypeScript:

```ts
import 'gantt-lit-component';
import type { GanttChart, GanttData, GanttOptions } from 'gantt-lit-component';

const gantt = document.querySelector('gantt-chart') as GanttChart;
gantt.setData(project);
```

Use `YYYY-MM-DD` date strings for all persisted dates. Do not let browser timezone conversion shift a task by one day.

## Main layout

Create a responsive project-planning screen with:

1. A toolbar containing import/export, local save/load, undo/redo, add task, delete, expand/collapse, columns, search, fit-to-task, fit-to-Gantt and zoom controls.
2. A split Gantt area:
   - left: hierarchical task grid;
   - right: timeline with month, week and day headers;
   - a visible, draggable vertical splitter between both sides.
3. A resource section below the planning area:
   - resource assignments for the selected task;
   - resource columns on the left;
   - daily quantities on the right;
   - the same horizontal split as the main Gantt;
   - synchronized horizontal scrolling so the task timeline and resource timeline remain aligned.
4. A host-owned project footer below the component. The component emits summary data; the host decides how to render the footer.

The component must remain usable on a small viewport. The resource section must not disappear completely. When space is limited, the planning panel may contract first while preserving at least one visible resource row.

## Canonical data model

Implement these public types:

```ts
type TaskType = 'task' | 'parent' | 'milestone';

interface GanttTask {
  id: string;
  name: string;
  start: string;
  end: string;
  progress: number;
  parentId: string | null;
  type: TaskType;
  mode?: string;
  code?: string;
  unit?: string;
  unitCost?: number;
  quantity?: number;
  quantityPerDay?: number;
  plannedCost?: number;
  actualCost?: number;
  fields?: Record<string, string | number | boolean | null>;
  resources?: GanttResource[];
  color?: string;
  collapsed?: boolean;
  metadata?: Record<string, unknown>;
}

interface GanttResource {
  id: string;
  resourceId?: string;
  name: string;
  type: 'work' | 'material' | 'expense' | string;
  unit?: string;
  unitCost: number;
  quantity: number;
  calendarId?: string;
  maxUnits?: number;
  quantityByDate?: Record<string, number>;
  totalQuantity?: number;
  cost?: number;
  metadata?: Record<string, string | number | boolean | null>;
}

interface GanttDependency {
  from: string;
  to: string;
  type?: 'finish-to-start' | 'start-to-start' | 'finish-to-finish' | 'start-to-finish';
  lagDays?: number;
}

interface GanttCalendar {
  id: string;
  name: string;
  workingDays?: number[]; // UTC day numbers: 0 Sunday ... 6 Saturday
  hours?: Record<number, { start: string; end: string }[]>;
  exceptions?: Record<string, 'working' | 'non-working'>;
}

interface GanttData {
  name?: string;
  tasks: GanttTask[];
  dependencies?: GanttDependency[];
  calendars?: GanttCalendar[];
  metadata?: Record<string, unknown>;
}
```

The data model must preserve unknown metadata and external resource identifiers during editing, JSON import/export, persistence and custom project-file adapters.

## Task tree and editing rules

- Support normal tasks, parent phases and milestones.
- A parent phase is shown as a bold phase in the left grid and as a summary bar, even if it has no children.
- A milestone has zero duration and is rendered as a diamond.
- Display outline codes such as `1`, `1.1`, `1.1.1`.
- Support expand/collapse for individual phases and expand-all/collapse-all.
- Allow drag-and-drop reordering and reparenting in the task tree.
- Dropping a task onto another task must not automatically create a new parent. It should place the moved task below the target as a sibling when the target is a normal child.
- Moving a task must preserve its `type`. A normal task must not silently become a parent phase.
- Prevent cycles in the hierarchy and report validation errors in English by default.
- Dragging and resizing bars must update dates and emit the standard change event.
- Automatic dependency scheduling must be configurable and must not destroy an explicitly supplied hierarchy.

## Timeline rendering

Render:

- working and non-working day backgrounds;
- month, week and day rows;
- task bars with labels, progress and custom colors;
- phase summary bars;
- milestone diamonds;
- dependency connectors;
- a Today marker spanning the complete visible Gantt height.

The Today marker must have configurable visibility, color and label. The label may be a string or a callback. Dependency line color and solid/dashed style must be configurable independently from task colors.

Dependency connectors must use an orthogonal route. The connector should attach around the vertical middle of the source and target bars, leave the source horizontally, travel vertically through a clear corridor, then enter the target bar at its vertical center. It must not enter just above or below the target. Keep arrowheads and milestone connections visually aligned.

When a task is selected or found by search, use a theme-aware selection color with readable text. In dark mode, never use a white selected row with white text.

## Bar templates and labels

Provide independent templates for:

- regular task bars;
- phase summary bars;
- milestones;
- a fallback task-bar template;
- phase summary labels.

Every template receives at least:

```ts
{
  task,
  color,
  width,
  durationDays,
  kind // 'task' | 'summary' | 'milestone'
}
```

The built-in task name must remain visible even when a custom template is supplied. A template may append the duration, cost, progress or any other application-specific content. The task color is part of the task object and must be persisted.

The task bar height is configurable, clamped to a safe range, persisted with column settings and applied consistently to:

- left-grid rows;
- task bars;
- resource segments;
- dependency anchors;
- milestones;
- virtual scrolling calculations.

## Header configuration and zoom

Make the Gantt and resource headers independently configurable. Support:

- show/hide month, week and day rows;
- grouping day cells by week at selected zoom levels;
- zoom-specific header rules;
- custom month templates;
- custom week templates;
- custom day templates;
- custom grouped week-date templates.

Every date template must receive the date, area (`gantt` or `resources`), day, localized weekday values and the calculated `weekNumber`. Week templates must also receive their start date and day count. Support both ISO-8601 and first-full-week numbering.

Example:

```ts
gantt.setOptions({
  weekNumbering: 'iso',
  ganttHeader: {
    zoomLevels: [
      {
        maxZoom: 0.75,
        dayGrouping: 'week',
        weekDateTemplate: ({ weekNumber, start }) =>
          `W${weekNumber} · ${String(start.getUTCDate()).padStart(2, '0')}`,
      },
    ],
    dayTemplate: ({ weekdayNarrow, day, weekNumber }) =>
      `${weekdayNarrow.toUpperCase()} ${day} · W${weekNumber}`,
  },
  resourceHeader: {
    dayTemplate: ({ weekdayNarrow, day, weekNumber }) =>
      `${weekdayNarrow.toUpperCase()} ${day} · W${weekNumber}`,
  },
});
```

Labels must remain on one line where possible. Use clipping, ellipsis or a configurable compact template instead of wrapping every date cell.

## Resource management

Resources are assignments stored on tasks. The component must support:

- manual resource creation;
- daily quantities;
- inactive-day gaps;
- quantity distribution only across working days;
- resource calendars and per-date exceptions;
- resource costs and capacity;
- a unique external resource ID.

Keep catalogue resources separate from task assignments:

```ts
interface GanttResourceReference {
  id: string;
  name: string;
  type?: string;
  unit?: string;
  unitCost?: number;
  quantity?: number;
  calendarId?: string;
  maxUnits?: number;
  metadata?: Record<string, string | number | boolean | null>;
}

interface GanttResourceProvider {
  search(query: string): Promise<GanttResourceReference[]>;
}
```

The host may provide a resource provider for API-backed search, or replace the built-in Add Resource dialog with a host-owned modal:

```ts
resourcePicker: ({ task, assignReference, addResource }) => {
  // Open an application modal.
  // On selection, call assignReference(apiResource).
}
```

When a catalogue result is assigned, preserve its stable external ID in `resource.resourceId`. The assignment `resource.id` is a unique ID local to the task.

## Columns and settings

Support configurable task and resource columns with:

- label, key and width;
- text, string, integer, decimal, number and date types;
- editable/read-only state;
- required columns that cannot be hidden;
- custom value and format callbacks;
- custom cell templates and inline styles;
- positive, negative and neutral tones;
- cell tooltips that use the formatted displayed value by default;
- custom tooltip callbacks or tooltip disabling;
- resource-column callbacks receiving both the resource and parent task;
- numeric `min` and `step`, including `step: 'any'`.

The user must be able to resize, reorder and hide columns. Persist a serializable layout containing `taskColumns`, `resourceColumns`, `order`, `width`, `visible` and `taskRowHeight`.

Expose independent permissions:

```ts
columnSettings: {
  enabled: true,
  allowResize: true,
  allowReorder: true,
  allowVisibility: true,
  allowTaskRowHeight: true,
  onChange: settings => saveUserSettings(settings),
  onReset: settings => clearSavedSettings(settings),
}
```

The column drag handle should be discoverable on hover and keyboard accessible. The component must avoid Lit boolean-binding errors: boolean attributes must use boolean properties, and string attributes must use `ifDefined` or equivalent when undefined.

## Context menus and editor templates

Prevent the browser context menu inside the component.

Provide separate context-menu templates for:

1. A task or phase bar.
2. An empty Gantt timeline area.

The task menu context must provide the complete task and actions such as edit, add-after, delete, update and fit-to-view. The empty-area menu must provide the clicked date, add-task, add-phase and fit-Gantt actions.

Menus must:

- support nested submenus;
- position themselves entirely inside the viewport;
- open submenus to the opposite side when there is not enough horizontal space;
- open upward when there is not enough vertical space;
- close the previous task menu before opening a timeline menu;
- avoid unwanted nested scrollbars.

Support a built-in task editor and an external editor mode. A custom editor template must receive the current task and actions for update, move, add/remove resource, open resource picker, add/remove dependency and close.

## Tooltips

Provide configurable task-bar tooltips. The default tooltip should include:

- task name;
- start and finish dates;
- duration;
- progress;
- task color;
- assigned resources.

The custom task tooltip receives the complete task, resolved color, duration, bar kind and resources. Keep the component-owned tooltip shell and viewport-aware positioning while allowing the content to be replaced.

Do not accidentally render both a native `title` tooltip and a custom tooltip for the same element. Use one visible tooltip system. If accessibility text is required, use ARIA without creating a duplicate browser tooltip.

## Footer summary event

The component must not own the host application's footer markup. Instead, expose:

```ts
interface GanttProjectSummary {
  start: string | null;
  end: string | null;
  durationDays: number;
  workingDurationDays: number;
  referenceDate: string;
  taskCount: number;
  phaseCount: number;
  milestoneCount: number;
  progress: number;
  overdueTaskCount: number;
  nextDueDate: string | null;
  totalCost: number;
  plannedCost: number;
  actualCost: number;
  costVariance: number;
  resourceCount: number;
  totalResourceQuantity: number;
  totalResourceCapacity: number;
}
```

Emit `gantt-summary-changed` after imports, edits, drag/resize, resource changes, undo/redo and `setData()`.

The demo or host application should render fields such as Start, Finish, Duration, Progress, Work items, Schedule, Costs and Resources. Each footer field should have a translated explanation tooltip. Use a single custom tooltip implementation; do not combine it with `title`.

The schedule reference date must be configurable as either a fixed date or a callback:

```ts
summaryReferenceDate: '2026-01-20'
// or
summaryReferenceDate: () => new Date().toISOString().slice(0, 10)
```

## Events and host integration

Emit at least:

| Event | Detail | Purpose |
| --- | --- | --- |
| `tasks-changed` | `{ projectId, revision, reason, taskId, data }` | Persist or synchronise the complete project. |
| `gantt-summary-changed` | `GanttProjectSummary` | Update a host-owned footer or status area. |
| `task-selected` | `{ id, task }` | Open a host details panel with the complete task object. |
| `column-settings-changed` | `GanttColumnSettings` | Save user layout preferences. |
| `column-settings-reset` | `GanttColumnSettings` | Remove or replace saved layout preferences. |
| `persistence-error` | `{ error, change }` | Report failed automatic saves. |
| `project-file-error` | `{ error }` | Report project-file adapter errors. |
| `task-delete-requested` | `GanttTaskDeleteContext` | Confirm, audit or cancel deletion. |

Expose lightweight callbacks such as `onTaskSelect(taskId, task)`, `onTaskEdit(task)`, `onTasksChange(data)` and `saveHook(change)`.

## Undo and redo

Undo/redo is local and configurable:

```ts
history: {
  enabled: true,
  maxActions: 50,
  showControls: true,
  undoShortcut: ['Ctrl+z', 'Meta+z'],
  redoShortcut: ['Ctrl+y', 'Ctrl+Shift+z', 'Meta+y', 'Meta+Shift+z'],
}
```

Record one action per completed user operation, including grid edits, drag/resize, hierarchy changes, resources, dependencies, creation and deletion. Imports and `setData()` start a new history baseline. Expose `undo()`, `redo()` and `clearHistory()` methods, and disable toolbar buttons when no action is available.

## Localization and themes

The component must be English-first and fully localizable. All component-owned visible strings, accessibility labels, menus, editor labels, validation messages, status messages and default tooltips must come from a translation dictionary.

Provide English and French dictionaries, with English as a safe fallback. Allow partial translation overrides through options. Business names and task names are data and must not be machine-translated by the component.

Provide light and dark themes covering:

- grid and timeline backgrounds;
- headers and week separators;
- task selection;
- dependency lines;
- resource quantities;
- editors, dialogs and menus;
- inputs and focus rings;
- Today marker;
- tooltips.

Use CSS custom properties for semantic colors. The dark theme must preserve contrast when switching visual styles such as Material or Fluent. Do not use white selected backgrounds with white text.

The package should embed its Roboto font assets when the Material visual style requires them; do not rely on an external font request.

## Import, export and persistence

Support:

- JSON import/export using `GanttData`;
- MSPXML import/export;
- a `ProjectFileAdapter` interface for binary `.mpp` files, because binary MPP parsing belongs on the server or in a separately supplied adapter;
- local storage save/load helpers;
- host-provided asynchronous persistence hooks.

Do not put server credentials or API-specific logic inside the reusable component.

## Performance requirements

The large demo must be able to generate at least 1,500 tasks and many dependencies and resource assignments.

Use virtual rendering or equivalent viewport-aware rendering for large task lists. Avoid re-rendering the whole timeline during every pointer movement. Keep horizontal scroll smooth by throttling or batching layout work with `requestAnimationFrame`. Keep the task grid and timeline scroll positions synchronized without feedback loops.

Display a loading dialog or progress state while importing or generating large projects. The UI must remain responsive and must not show a blank frozen page during long operations.

## Public methods

Expose at least:

```ts
setData(data: GanttData): void;
getData(): GanttData;
setOptions(options: GanttOptions): void;
getProjectSummary(): GanttProjectSummary;
updateTask(taskId: string, patch: Partial<GanttTask>): void;
addResource(taskId: string, resource?: Partial<GanttResource>): GanttResource | null;
undo(): boolean;
redo(): boolean;
clearHistory(): void;
fitTaskToView(taskId?: string): void;
fitGanttToView(): void;
saveToLocalStorage(key?: string): void;
loadFromLocalStorage(key?: string): boolean;
resetColumnSettings(): void;
```

## Suggested project structure

Keep the implementation modular instead of placing every feature in one file:

```text
src/
  gantt-chart.ts          # public Lit component and orchestration
  types.ts                # public contracts
  translations.ts         # English/French component strings
  gantt-layout.ts         # dates, zoom, coordinates and split panes
  gantt-task-tree.ts      # hierarchy, outline codes and drag/drop rules
  gantt-scheduling.ts     # dependency scheduling and calendars
  gantt-resources.ts      # assignments, calendars and daily quantities
  gantt-task-costs.ts     # task/resource cost calculations
  gantt-summary.ts        # project summary calculation
  gantt-history.ts        # undo/redo snapshots
  gantt-task-actions.ts   # create, update and delete operations
  project-codecs.ts       # JSON/MSPXML/project adapters
  persistence.ts          # save hooks and local persistence
  utils.ts                # date and formatting helpers
```

## Acceptance criteria

The implementation is complete only when:

- the component can be embedded with no framework-specific wrapper;
- task, phase and milestone rendering is distinct and editable;
- hierarchy drag/drop preserves task types and prevents cycles;
- dependencies enter bars at their vertical center and route orthogonally;
- progress remains visible when a task has resources and daily quantity segments;
- the resource panel stays synchronized with the main Gantt timeline;
- task and resource headers support configurable templates and week numbers;
- task, phase and milestone templates preserve built-in labels;
- external resource selection preserves stable resource IDs;
- columns can be resized, reordered, hidden and persisted with independent permissions;
- undo/redo, delete confirmation and context menus are configurable;
- the Today marker spans the complete Gantt height and is configurable;
- the footer is updated through a summary event and its explanations are translated;
- only one tooltip is shown at a time, with no duplicate native tooltip;
- English and French UI strings are available;
- light and dark themes remain readable across visual styles;
- the large sample remains usable and scroll performance is acceptable;
- automated tests cover tree operations, scheduling, resource allocation, summaries, history and layout;
- lint, tests and production build all pass.
