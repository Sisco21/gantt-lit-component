# Gantt Lit Component — Complete AI Recreation Specification

## 1. Mission

You are an expert frontend engineer. Recreate the current `gantt-lit-component` as a production-ready, reusable, framework-agnostic Web Component.

The component is a project-planning Gantt chart built with Lit and TypeScript. It must be embeddable in another application without owning authentication, API calls, server persistence, business resource catalogues, or host-owned dialogs.

The recreated result must preserve the public contracts, user-visible behaviour, data semantics and integration points described in this document. When a detail is not explicitly defined, favour a small, accessible, responsive implementation that keeps the host application in control of business data.

Target usage:

```html
<gantt-chart></gantt-chart>
```

```ts
import 'gantt-lit-component';
import type { GanttChart, GanttData, GanttOptions } from 'gantt-lit-component';

const gantt = document.querySelector('gantt-chart') as GanttChart;
gantt.setData(project);
```

The current package version is `1.1.0`. The public custom element name is `gantt-chart` and the package is ESM-first.

## 2. Non-negotiable implementation constraints

- Use Lit and TypeScript.
- Produce a standard Web Component; do not require React, Vue, Angular or another wrapper.
- Keep all persisted dates as date-only `YYYY-MM-DD` strings.
- Parse date-only values as UTC calendar dates. Never allow browser local-timezone conversion to shift a task by one day.
- Preserve unknown project, task and resource metadata during edits, JSON round-trips, persistence and adapters.
- Keep external resource identifiers separate from local assignment identifiers.
- Keep the footer/status area owned by the host. Emit summary data instead of rendering a host footer.
- Keep all component-owned visible strings, accessibility labels, validation messages, menus, status messages and default tooltip text in a translation dictionary.
- Do not use a native `title` tooltip and a custom tooltip for the same task bar.
- Use Lit boolean property bindings for boolean attributes (`?disabled`, `?checked`, etc.). Use `ifDefined` or equivalent for optional string attributes.
- Do not silently change a task's `type` while reordering or reparenting it.
- Do not create a parent-child relationship merely because a task was dropped on a regular task.
- Do not let a compact viewport make the resource section disappear completely.

## 3. Technology and package contract

Use a package structure equivalent to:

```text
src/
  gantt-chart.ts          # public Lit component and orchestration
  types.ts                # public TypeScript contracts
  translations.ts         # English/French dictionaries
  gantt-layout.ts         # dates, zoom, coordinates, split panes
  gantt-task-tree.ts      # hierarchy, outline codes, flattening
  gantt-task-actions.ts   # collapse, move, reorder, delete branches
  gantt-scheduling.ts     # dependency scheduling and calendars
  gantt-resources.ts      # resource quantities and costs
  gantt-task-costs.ts     # task and parent cost rollups
  gantt-summary.ts        # project summary calculation
  gantt-history.ts        # immutable undo/redo snapshots
  project-codecs.ts       # JSON, MSPXML and MPP adapter integration
  persistence.ts          # local storage and persistence contracts
  utils.ts                # date and formatting utilities
  index.ts                # public exports and custom-element registration
```

Runtime dependencies are Lit and the bundled Roboto font assets. The component must work in a browser with `customElements`, `ResizeObserver`, `requestAnimationFrame`, `Intl`, `File`, `Blob`, `DOMParser` and `localStorage` where the corresponding feature is used.

The package should expose the main module, `./style.css` and `./package.json`. The main module must export `GanttChart`, `GANTT_COMPONENT_VERSION`, all public types, date utilities, project codecs, persistence helpers and translations. Register the element once:

```ts
if (!customElements.get('gantt-chart')) {
  customElements.define('gantt-chart', GanttChart);
}
```

## 4. Custom-element properties and attributes

The element must expose these Lit properties. The listed attribute names are the reflected/public HTML forms.

| Property | Attribute | Type | Behaviour |
| --- | --- | --- | --- |
| `data` | `data` | `string` | Optional JSON project input. Parse and apply it when the attribute changes. |
| `taskColors` | `task-colors` | `string` | JSON object containing task/theme colour overrides. |
| `projectId` | `project-id` | `string` | Host project identifier included in changes and persistence keys. |
| `autoSave` | `auto-save` | `boolean` | Enables automatic adapter/save-hook calls after changes. |
| `theme` | `theme` | `'light' \| 'dark'` | Built-in theme; reflect to the attribute. Default is light. |
| `visualStyle` | `visual-style` | `string` | Optional visual preset such as `material`, `fluent` or `dark-operations`. |
| `options` | none | `GanttOptions` | Full TypeScript configuration object. Prefer the property or `setOptions()`. |

Also expose:

```ts
static readonly version: string;
readonly version: string;
projectFileAdapter?: ProjectFileAdapter;
persistenceAdapter?: GanttPersistenceAdapter;
saveHook?: GanttSaveHook;
resourceProvider?: GanttResourceProvider;
readonly canUndo: boolean;
readonly canRedo: boolean;
readonly resourcesUndocked: boolean;
```

`setOptions(options)` replaces the current options object. Consumers that need to retain existing options should spread them before replacing the object.

## 5. Canonical data model

Use the following public contracts. Persist the flat pre-order task list with `parentId`; the renderer may build a nested internal tree. `children` is an internal/transient field and should not be required in canonical snapshots returned by `getData()`.

```ts
export const TaskType = {
  Task: 'task',
  Parent: 'parent',
  Milestone: 'milestone',
} as const;

export type TaskType = typeof TaskType[keyof typeof TaskType];
export type GanttTheme = 'light' | 'dark';
export type WeekNumbering = 'first-full-week' | 'iso';
export type GanttFieldValue = string | number | boolean | null;
export type GanttResourceType = 'work' | 'material' | 'expense';

export interface GanttWorkingRange {
  start: string; // HH:mm
  end: string;   // HH:mm
}

export interface GanttCalendar {
  id: string;
  name: string;
  workingDays?: number[]; // UTC day numbers: 0 Sunday ... 6 Saturday
  hours?: Partial<Record<number, GanttWorkingRange[]>>;
  exceptions?: Record<string, 'working' | 'non-working'>; // YYYY-MM-DD
}

export type DependencyType =
  | 'finish-to-start'
  | 'start-to-start'
  | 'finish-to-finish'
  | 'start-to-finish';

export interface GanttTask {
  id: string;
  name: string;
  start: string;
  end: string;
  progress: number; // clamp to 0..100
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
  editable?: boolean; // false locks built-in editing
  fields?: Record<string, GanttFieldValue>;
  resources?: GanttResource[];
  color?: string; // persisted task-bar colour
  children?: GanttTask[]; // internal/transient tree field
  collapsed?: boolean;
  metadata?: Record<string, unknown>;
}

export interface GanttResource {
  id: string;             // local assignment id, unique inside the task
  resourceId?: string;    // stable external catalogue/business id
  name: string;
  type: GanttResourceType | string;
  unit?: string;
  unitCost: number;
  quantity: number;
  calendarId?: string;
  maxUnits?: number;
  quantityByDate?: Record<string, number>;
  /** Legacy input field. Read it, but prefer quantity/quantityByDate. */
  totalQuantity?: number;
  cost?: number;
  metadata?: Record<string, GanttFieldValue>;
}

export interface GanttResourceReference {
  id: string;
  name: string;
  type?: GanttResourceType | string;
  unit?: string;
  unitCost?: number;
  quantity?: number;
  calendarId?: string;
  maxUnits?: number;
  metadata?: Record<string, GanttFieldValue>;
}

export interface GanttResourceProvider {
  search(query: string): Promise<GanttResourceReference[]>;
}

export interface GanttResourcePickerContext {
  task: GanttTask;
  assignReference: (reference: GanttResourceReference) => void;
  addResource: (resource?: Partial<GanttResource>) => void;
}

export type GanttResourcePicker =
  (context: GanttResourcePickerContext) => void | Promise<void>;

export interface GanttDependency {
  from: string;
  to: string;
  type?: DependencyType;
  lagDays?: number;
}

export interface GanttData {
  name?: string;
  tasks: GanttTask[];
  dependencies?: GanttDependency[];
  calendars?: GanttCalendar[];
  metadata?: Record<string, unknown>;
}

export interface TaskColors {
  parent?: string;
  task?: string;
  milestone?: string;
  dependency?: string;
  selected?: string;
  today?: string;
  headerBackground?: string;
  rowBackground?: string;
  rowAltBackground?: string;
}
```

### Data normalization rules

- `progress` is clamped to `0..100`.
- A missing `parentId` or an unknown parent makes a task a root task.
- Internal tree construction must detect hierarchy cycles and throw a readable validation error instead of silently dropping the branch.
- Parent ranges are derived from their children: earliest child start and latest child end.
- `getData()` returns a clone/snapshot. Do not expose mutable internal arrays directly.
- `setData()` and imports start a new history baseline.
- Unknown `metadata`, `fields`, resource metadata and project metadata must survive all normal edits.
- Add a default colour to imported/created tasks only when no colour is supplied.

## 6. Main visual layout

Build the component as a responsive planning shell with these regions:

1. **Toolbar**: import/export, local save/load, optional Undo/Redo, add task, delete, expand/collapse, optional resource docking, columns, search, fit controls and zoom.
2. **Planning panel**: left hierarchical task grid, right horizontally scrollable timeline, month/week/day headers, draggable vertical splitter, synchronized horizontal scrollbars and fixed headers.
3. **Resource panel**: appears for the selected task; left assignment grid, right daily quantity grid, same split, synchronized date scroll and draggable horizontal separator.
4. **Host-owned footer**: do not render an application footer; emit `gantt-summary-changed`.

The host is block-level with a minimum height around `320px`, uses a shadow DOM and clips overflow at the shell boundary. Use CSS custom properties instead of requiring consumers to reach into the shadow DOM.

### Splitter and panel sizing

```ts
interface GanttTaskGridSplitterOptions {
  enabled?: boolean;          // default true
  minWidth?: number | string; // px, vw or %; default 220px
  maxWidth?: number | string; // px, vw or %; default available width
  minTimelineWidth?: number | string; // default 160px
}
```

`headerWidth` sets the initial grid width. Clamp the left grid so the minimum timeline width is always retained. The same split applies to resources. Values expressed as `px`, `vw` and `%` must be resolved responsively.

Panel rules:

- `maxHeight` optionally controls the planning panel height.
- `resourcesMaxHeight` sets the preferred resource panel height.
- The planning panel contracts first on compact screens.
- Minimum planning panel height is about `140px` and minimum resource panel height is about `132px`.
- Keep the user-resized split within safe bounds.

## 7. Task grid and hierarchy

### Default task columns

| Key | Label | Default width | Notes |
| --- | --- | ---: | --- |
| `mode` | Mode | 38 | Manual/Auto/Milestone-like value. |
| `code` | Code | 42 | Outline code, falling back to id. |
| `name` | Name | 170 | Editable and required; cannot be hidden. |
| `duration` | Duration | 58 | Numeric. |
| `start` | Start | 82 | Date. |
| `end` | Finish | 82 | Date. |
| `costTotal` | Total cost | 78 | Numeric cost rollup. |

Task rows must show outline codes, indent names by hierarchy depth, provide expand/collapse toggles, highlight selection/search matches, show a lock indicator, provide a focus button, support configurable row height (`28..96px`, default `42px`) and keep task names visible inside bars while scrolling unless `stickyTaskLabels: false`.

### Hierarchy drag-and-drop rules

- A branch move carries all descendants as a contiguous branch.
- Dropping on the upper quarter of a parent places the branch before it.
- Dropping on the lower quarter of a parent places the branch after it.
- Dropping in the middle of a parent makes the dragged branch its child.
- Dropping on a regular task always performs sibling reordering: above means before and below means after.
- Never make a regular task a parent merely because it was a drop target.
- Dropping in the left gutter of a nested row outdents the branch one level, placing it after its former parent branch.
- Dropping on the dragged row in the left gutter also supports outdent.
- Reject moves that create cycles or move a branch inside its own descendant.
- Preserve the moved task's `type`, colour, metadata, resources and all descendants.

## 8. Timeline rendering

### Date range and coordinates

- Use UTC date-only helpers for parsing, formatting, adding days and calculating differences.
- The displayed project range includes approximately seven days of padding before the earliest task and after the latest task.
- Align the displayed range to the configured first day of week.
- Render at least 31 calendar days when the project is empty or very small.
- Default day width is `24px`; effective day width is `dayWidth * zoom`.
- Task bars occupy inclusive calendar cells from `start` through `end`.
- Milestones have zero semantic duration and render as diamonds.
- The built-in `duration` field and template `durationDays` use the component's date-difference convention; project summary duration is explicitly inclusive.

### Background and headers

Render working/non-working day bands, week separators, month/week/day rows and a Today marker spanning the complete visible Gantt content height. The marker is visible by default, can be hidden with `showToday: false`, and accepts a string or callback label. Its colour is independently configurable through `taskColors.today`.

### Task visuals

- Normal task: coloured bar with progress fill, label and resize handles.
- Parent phase: summary bar with summary caps and label.
- Milestone: diamond with optional label/template.
- Locked task: selectable/visible but without mutation affordances.
- Search match and selection colours must be theme-aware.
- Persist task colours.
- If resources contain daily quantities, render active task segments and gaps for inactive days. Progress remains visible across active segments.

### Dependencies

Support `finish-to-start`, `start-to-start`, `finish-to-finish` and `start-to-finish` with optional whole-day `lagDays`.

Connectors must be orthogonal, leave the source around the vertical centre of the source bar, travel through a clear corridor, enter the target around its vertical centre, keep arrowheads/milestone connections aligned, and support independent colour (`dependencyColor` or `taskColors.dependency`) and line style (`solid` or `dashed`). Hide them when `showDependencies: false`.

Default scheduling is enabled. On initial load and after move/resize, propagate constraints to successors. A normal move shifts the whole subtree and daily resource quantities with it. A resize redistributes daily resource quantities over new working dates. Do not perform resource leveling and do not destroy the hierarchy.

## 9. Bar templates, summary labels and tooltips

```ts
type GanttTaskBarKind = 'task' | 'summary' | 'milestone';

interface GanttTaskBarTemplateContext {
  task: GanttTask;
  color: string;
  width: number;
  durationDays: number;
  kind: GanttTaskBarKind;
}

type GanttTaskBarTemplate =
  (context: GanttTaskBarTemplateContext) => unknown;
type GanttSummaryTemplate = (task: GanttTask) => unknown;
```

Expose `summaryTemplate`, `taskBarTemplate`, `taskTemplate`, `phaseTemplate`, `milestoneTemplate` and `stickyTaskLabels`.

Precedence:

- Normal task: `taskTemplate` then `taskBarTemplate`.
- Phase summary: `phaseTemplate` then `taskBarTemplate` then `summaryTemplate`.
- Milestone: `milestoneTemplate`.

The built-in task/phase name must remain visible when a custom template is supplied. Custom content is appended beside/after the built-in label.

Task tooltips use one component-owned, viewport-aware shell. The default content includes name, start, finish, duration, progress, task colour and assigned resource names. A custom tooltip replaces the content but receives:

```ts
interface GanttTaskTooltipTemplateContext {
  task: GanttTask;
  color: string;
  durationDays: number;
  kind: GanttTaskBarKind;
  resources: GanttResource[];
}
```

Set `showTaskTooltips: false` to disable task-bar tooltips. Touch pointers should not create hover tooltips.

## 10. Resources and daily quantities

Resources are assignments stored on tasks and are separate from catalogue/reference records.

### Default resource columns

| Key | Label | Default width | Editable |
| --- | --- | ---: | --- |
| `name` | Name | 150 | yes |
| `type` | Type | 105 | yes |
| `unit` | Unit of work | 105 | yes |
| `unitCost` | Unit cost | 75 | yes, numeric |
| `quantity` | Quantity | 105 | yes, numeric total |
| `cost` | Cost | 78 | read-only calculated |

Support manual creation, async catalogue search, host-owned picking, stable external ids, unit of work, costs, daily quantities, inactive gaps, calendars/exceptions, `maxUnits`, inline editing, resource context menu and removal.

When a resource is added without explicit daily quantities, distribute its requested total across working days in the task range. Preserve two decimals and put any rounding remainder on the last working day. Missing/zero daily quantity means inactive; inactive inputs are disabled and the task remains scheduled.

Calendar rules:

- `GanttData.calendars` travels through JSON, local persistence and adapters.
- A resource selects one through `calendarId`.
- Exceptions override weekly `workingDays`.
- Without a resource calendar, use project `nonWorkingDays`.
- Calendar shading is per resource row.
- Resource calendars govern availability/distribution, not resource leveling.
- Preserve `hours` for future hourly scheduling; the current view is day-based.

Quantity/cost rules:

- If `quantityByDate` has values, total quantity is their rounded sum.
- Otherwise use legacy `totalQuantity` then `quantity`.
- Resource cost is total quantity multiplied by `unitCost`.
- A task's own cost is resource-cost sum, or `unitCost * quantity` when it has no assignments.
- Parent display cost includes own cost plus child costs.

### Resource catalogue integration

The component must not know authentication or API URLs. It only calls:

```ts
gantt.resourceProvider = {
  async search(query) {
    return fetchResourceReferencesFromTheHost(query);
  },
};
```

Assigning a result creates a fresh local assignment `id`, stores the stable result `id` as `resource.resourceId`, preserves metadata and retains `metadata.catalogId` for compatibility.

With `options.resourcePicker`, do not display the built-in picker. Call the host callback with `task`, `assignReference` and `addResource`; the host may call those actions later.

## 11. Detachable resource window

```ts
interface GanttResourcePanelOptions {
  detachable?: boolean;
  windowTitle?: string;
  windowWidth?: number;  // default 980, minimum 480
  windowHeight?: number; // default 640, minimum 320
}
```

When `detachable` is true, show Undock resources when a task is selected. `undockResources()` opens a same-origin resizable popup and returns `false` when there is no selection or the popup is blocked. The popup contains the same component in resource-only mode.

Synchronize resource edits, selected task, project data, horizontal date scroll, theme, visual style and all `--gantt-*` variables. Provide Dock resources and `dockResources()`. Emit `resources-undocked` with `{ taskId }` and `resources-docked` when closed/docked. Close the popup when the main component disconnects. Tell consumers to call `undockResources()` from a user gesture when popup blockers are active. The popup must not create a second independent history or persistence stream.

## 12. Headers, locale and week numbers

Default locale is `en-US`, first day is Monday (`1`) and shaded non-working days are `[0, 6]`. Main and resource headers are independently configurable.

```ts
interface GanttDateHeaderTemplateContext {
  date: Date;
  area: 'gantt' | 'resources';
  index: number;
  day: number;
  weekNumber: number;
  weekday: string;
  weekdayNarrow: string;
  title: string;
}

interface GanttMonthHeaderTemplateContext {
  date: Date;
  label: string;
  index: number;
  dayCount: number;
}

interface GanttWeekHeaderTemplateContext {
  start: Date;
  weekNumber: number;
  number: number; // backward-compatible alias
  index: number;
  dayCount: number;
}

type GanttDateHeaderTemplate =
  (context: GanttDateHeaderTemplateContext) => unknown;
type GanttMonthHeaderTemplate =
  (context: GanttMonthHeaderTemplateContext) => unknown;
type GanttWeekHeaderTemplate =
  (context: GanttWeekHeaderTemplateContext) => unknown;
```

```ts
interface GanttHeaderZoomLevel {
  minZoom?: number;
  maxZoom?: number;
  showMonths?: boolean;
  showWeeks?: boolean;
  showDays?: boolean;
  dayGrouping?: 'day' | 'week';
  monthTemplate?: GanttMonthHeaderTemplate;
  weekTemplate?: GanttWeekHeaderTemplate;
  dayTemplate?: GanttDateHeaderTemplate;
  weekDateTemplate?: GanttWeekHeaderTemplate;
}

interface GanttTimelineHeaderOptions {
  showMonths?: boolean;
  showWeeks?: boolean;
  showDays?: boolean;
  monthTemplate?: GanttMonthHeaderTemplate;
  weekTemplate?: GanttWeekHeaderTemplate;
  dayTemplate?: GanttDateHeaderTemplate;
  zoomLevels?: GanttHeaderZoomLevel[];
}

interface GanttResourceHeaderZoomLevel {
  minZoom?: number;
  maxZoom?: number;
  visible?: boolean;
  dayGrouping?: 'day' | 'week';
  dayTemplate?: GanttDateHeaderTemplate;
  weekDateTemplate?: GanttWeekHeaderTemplate;
}

interface GanttResourceHeaderOptions {
  visible?: boolean;
  dayTemplate?: GanttDateHeaderTemplate;
  zoomLevels?: GanttResourceHeaderZoomLevel[];
}
```

Rules: first matching zoom rule wins; explicit `ganttHeader.showWeeks` overrides legacy `showWeekNumbers`; `dayGrouping: 'week'` replaces daily cells with one grouped cell per week; resource grouped headers remain aligned; callbacks receive UTC `Date` objects and localized labels; use clipping/ellipsis instead of wrapping every date cell; support `first-full-week` and ISO-8601 numbering.

## 13. Complete options contract

```ts
interface GanttOptions {
  headerWidth?: number;
  taskRowHeight?: number;
  taskGridSplitter?: GanttTaskGridSplitterOptions;
  maxHeight?: number | string;
  resourcesMaxHeight?: number | string;
  resourcePanel?: GanttResourcePanelOptions;

  taskColumns?: GanttColumn[];
  resourceColumns?: GanttResourceColumn[];
  columnSettings?: GanttColumnSettingsOptions;

  summaryTemplate?: GanttSummaryTemplate;
  taskBarTemplate?: GanttTaskBarTemplate;
  taskTemplate?: GanttTaskBarTemplate;
  phaseTemplate?: GanttTaskBarTemplate;
  milestoneTemplate?: GanttTaskBarTemplate;
  stickyTaskLabels?: boolean;

  history?: GanttHistoryOptions;
  taskDeletion?: GanttTaskDeletionOptions;
  showTaskTooltips?: boolean;
  taskTooltipTemplate?: GanttTaskTooltipTemplate;

  dayWidth?: number;
  minZoom?: number;
  maxZoom?: number;
  taskColors?: TaskColors;
  showToday?: boolean;
  todayLabel?: string | (() => string);
  showDependencies?: boolean;
  dependencyColor?: string;
  dependencyLineStyle?: 'solid' | 'dashed';
  autoSchedule?: boolean;

  taskEditorMode?: 'built-in' | 'external';
  openTaskEditorOnCreate?: boolean;
  openTaskEditorOnDoubleClick?: boolean;
  taskGridDoubleClickAction?: 'rename' | 'edit' | 'none';
  focusTaskOnCreate?: boolean;
  isTaskEditable?: (task: GanttTask) => boolean;
  taskEditorTemplate?: GanttTaskEditorTemplate;
  taskContextMenuTemplate?: GanttTaskContextMenuTemplate;
  ganttContextMenuTemplate?: GanttTimelineContextMenuTemplate;
  resourcePicker?: GanttResourcePicker;

  locale?: string;
  firstDayOfWeek?: number;
  showWeekNumbers?: boolean;
  ganttHeader?: GanttTimelineHeaderOptions;
  resourceHeader?: GanttResourceHeaderOptions;
  weekNumbering?: WeekNumbering;
  nonWorkingDays?: number[];
  summaryReferenceDate?: string | (() => string);
  pan?: GanttPanOptions;
  translations?: Partial<GanttTranslations>;

  onTaskSelect?: (taskId: string, task: GanttTask) => void;
  onTaskEdit?: (task: GanttTask) => void;
  onTasksChange?: (data: GanttData) => void;
}
```

Defaults: row height `42` clamped to `28..96`; day width `24`; safe zoom range roughly `0.35..3`; Today and dependencies on; auto-schedule on; built-in editor; grid double-click rename; locale `en-US`; first day `1`; week numbers off; non-working days `[0, 6]`; history off; splitter and column settings on; deletion and Delete-key shortcut on.

## 14. Columns and user layout

```ts
export enum GanttColumnType {
  Text = 'text', String = 'string', Number = 'number',
  Integer = 'integer', Decimal = 'decimal', Date = 'date',
}

export interface GanttColumnRenderContext {
  task: GanttTask;
  value: unknown;
  formattedValue: string;
}

export interface GanttResourceColumnRenderContext {
  resource: GanttResource;
  task: GanttTask;
  value: unknown;
  formattedValue: string;
}

export interface GanttColumn {
  key: string;
  label: string;
  width: number;
  type?: GanttColumnType | 'text' | 'string' | 'number' | 'integer' | 'decimal' | 'date';
  editable?: boolean;
  required?: boolean;
  visible?: boolean;
  value?: (task: GanttTask) => unknown;
  format?: (value: unknown, task: GanttTask) => string;
  tooltip?: false | ((context: GanttColumnRenderContext) => string | undefined);
  tone?: (value: unknown, task: GanttTask) => 'positive' | 'negative' | 'neutral' | undefined;
  cellTemplate?: (context: GanttColumnRenderContext) => unknown;
  cellStyle?: (context: GanttColumnRenderContext) => string | undefined;
}

export interface GanttResourceColumn {
  key: string;
  label: string;
  width: number;
  type?: GanttColumn['type'];
  min?: number;
  step?: number | 'any';
  editable?: boolean;
  required?: boolean;
  visible?: boolean;
  value?: (resource: GanttResource, task: GanttTask) => unknown;
  format?: (value: unknown, resource: GanttResource, task: GanttTask) => string;
  tooltip?: false | ((context: GanttResourceColumnRenderContext) => string | undefined);
  setValue?: (value: string, resource: GanttResource, task: GanttTask) => Partial<GanttResource> | void;
}
```

Support custom values/formatters, all text/numeric/date types, numeric minimum/step including `step: 'any'`, semantic tones, read-only Lit templates, inline styles, formatted-value tooltips, required columns, resize handles, drag/keyboard reorder and independent task/resource permissions.

```ts
export interface GanttColumnSetting {
  key: string;
  order: number;
  width: number;
  visible: boolean;
}

export interface GanttColumnSettings {
  taskColumns: GanttColumnSetting[];
  resourceColumns: GanttColumnSetting[];
  taskRowHeight?: number;
}

export interface GanttColumnSettingsOptions {
  enabled?: boolean;
  allowResize?: boolean;
  allowReorder?: boolean;
  allowVisibility?: boolean;
  allowTaskRowHeight?: boolean;
  onChange?: (settings: GanttColumnSettings) => void | Promise<void>;
  onReset?: (settings: GanttColumnSettings) => void | Promise<void>;
}
```

Expose `getColumnSettings()`, `setColumnSettings(settings)`, `resetColumnSettings()` and `setTaskRowHeight(height)`. Emit `column-settings-changed` and `column-settings-reset` with the complete serializable settings object. Persist widths/order/visibility and row height independently from project data when the host wants user preferences.

## 15. Editors, locks and context menus

### Built-in editor

Provide a modal editor with localized tabs:

- **General**: name, type/parent, start, finish, colour, progress, actual cost.
- **Resources**: assignments, add resource, resource picker, daily quantities and removal.
- **Links**: predecessor selection, dependency type and removal.

With `taskEditorMode: 'external'`, call `onTaskEdit(task)` and do not render the component dialog. A `taskEditorTemplate` replaces the tab body but keeps the component dialog and mutation flow:

```ts
interface GanttTaskEditorTemplateContext {
  task: GanttTask;
  editable: boolean;
  updateTask: (patch: Partial<GanttTask>) => void;
  moveTask: (parentId: string | null) => void;
  addResource: (resource?: Partial<GanttResource>) => void;
  openResourcePicker: () => void;
  removeResource: (resourceId: string) => void;
  addDependency: (fromTaskId: string, type?: DependencyType) => void;
  removeDependency: (fromTaskId: string) => void;
  close: () => void;
}
```

Callbacks must be safe no-ops when `editable` is false.

### Locks

`task.editable === false` locks grid rename, drag/drop, bar move/resize, deletion, resource changes and editor mutation. The task remains selectable and visible. `isTaskEditable(task)` is an additional host rule.

Expose:

```ts
lockTask(taskId: string): boolean;
unlockTask(taskId: string): boolean;
setTaskLocked(taskId: string, locked: boolean): boolean;
```

### Task context menu

Prevent the browser context menu inside the component. Keep a task/phase/milestone menu inside the viewport. The custom template receives:

```ts
interface GanttTaskContextMenuTemplateContext {
  gantt: GanttChart;
  task: GanttTask;
  editable: boolean;
  close: () => void;
  edit: () => void;
  addTaskAfter: () => void;
  deleteTask: () => Promise<boolean>;
  updateTask: (patch: Partial<GanttTask>) => void;
  fitToView: () => void;
}
```

The built-in editable menu supports Edit task and Add task after; a locked task supports Fit task. Custom menus may add delete and nested submenus.

### Empty timeline context menu

Right-clicking empty timeline space must close any previous task menu and provide the clicked date:

```ts
interface GanttTimelineContextMenuTemplateContext {
  close: () => void;
  fitToView: () => void;
  date: string;
  addTask: () => void;
  addPhase: () => void;
}
```

Open submenus to the opposite side when needed, move them upward when there is not enough vertical space and avoid unwanted nested scrollbars.

### Task deletion and double-click

```ts
interface GanttTaskDeleteContext {
  task: GanttTask;
  descendants: GanttTask[];
  source: 'toolbar' | 'keyboard' | 'context-menu' | 'api';
}

interface GanttTaskDeletionOptions {
  enabled?: boolean;
  keyboardShortcut?: boolean;
  confirm?: (context: GanttTaskDeleteContext) => boolean | Promise<boolean>;
}
```

Before deletion, emit a cancelable `task-delete-requested` event. If not cancelled, call the optional async confirmation. Deleting a phase removes its complete descendant branch and any dependency touching a removed task.

Grid double-click defaults to inline rename (`taskGridDoubleClickAction: 'rename'`); `edit` opens the configured editor; `none` disables it. Timeline bar double-click opens the editor only when `openTaskEditorOnDoubleClick` is true. New tasks can open the editor with `openTaskEditorOnCreate` and centre with `focusTaskOnCreate`.

## 16. Search, pan, scroll and performance

Search task/resource text from the toolbar. Highlight matches and provide previous/next navigation that expands ancestors and scrolls the current result into view.

```ts
interface GanttPanOptions {
  enabled?: boolean;
  axis?: 'horizontal' | 'both';
  trigger?: 'empty-area';
}
```

Pan starts only from empty timeline space and is disabled by default.

Performance requirements:

- Support at least 1,500 tasks, many dependencies and many resource assignments.
- Virtualize task rows while preserving full scroll height; render the viewport plus about eight overscan rows.
- Render a buffered horizontal window of resource dates.
- Batch pointer/scroll work with `requestAnimationFrame`.
- Avoid a full timeline render on every bar pointer movement.
- Synchronize paired scroll containers without feedback loops.
- Use `ResizeObserver` for viewport measurements.
- Keep labels sticky in the visible portion of a bar without triggering a Lit render on every scroll.
- Show a loading/progress state for long imports or large project generation.

## 17. Localization and translations

Provide complete English and French dictionaries. Select French for locales beginning with `fr`; use English as a safe fallback, then apply `options.translations` overrides.

At minimum cover:

```text
import, exportJson, exportMspxml, exportMpp, exportMppUnavailable,
saveLocal, loadLocal, undo, redo, addTask, addPhase, delete,
expandAll, collapseAll, columns, search, previousResult, nextResult,
zoomOut, zoomIn, fitTask, fitGantt, noTasks, noPlanningData, today,
resources, undockResources, dockResources, resourcesWindowBlocked, cost,
unit, unitCost, quantity, totalQuantity, addResource, newTask, newResource,
editTask, addTaskAfter, close, general, links, name, code, type, color,
progress, actualCost, parent, root, start, finish, task, phase, milestone,
resourceCatalogue, searchResource, searching, resource, add,
noResourceAssigned, noLink, addPredecessor, columnMenuTitle, taskColumns,
resourceColumns, taskRowHeight, required, reset, mode, duration, totalCost,
automatic, manual, invalidJson, ganttHorizontalScroll, resizeColumn,
resizeResourceColumn, moveColumnEarlier, moveColumnLater, reorderColumn,
resizeTaskGrid, resizeResourceGrid, toggleTask, lockedTask, focusTask,
nonWorkingDay, resourceCalendarFor, resizeStart, resizeEnd,
projectImported, projectLoadedFromPersistence, projectSaved,
projectSavedLocal, projectLoadedLocal, saveFailed, importFailed,
exportComplete, exportFailed, saveLocalFailed, noLocalProject,
loadLocalFailed, resourcePickerUnavailable, resourceCatalogueUnavailable,
resourceAlreadyAssigned, resourceProviderLater, weekNumber,
finishToStart, startToStart, finishToFinish, startToFinish
```

Support placeholders `{file}`, `{extension}`, `{column}` and `{name}`. Business task/resource names are data and must not be machine-translated.

## 18. Themes and styling

Ship light and dark themes with readable contrast for shell, toolbar, headers, grid rows, timeline/resource backgrounds, non-working days, resource closures, tasks, parents, milestones, progress, selection, search, dependencies, Today, editors, inputs, menus, tooltips, focus rings and locked states.

Use semantic CSS custom properties. At minimum support:

```css
--gantt-header --gantt-border --gantt-muted --gantt-blue --gantt-green
--gantt-red --gantt-row --gantt-row-alt --gantt-non-working-day
--gantt-empty-background --gantt-empty-color --gantt-parent --gantt-task
--gantt-milestone --gantt-dependency --gantt-locked-border --gantt-surface
--gantt-tooltip-background --gantt-tooltip-border --gantt-tooltip-color
--gantt-tooltip-shadow --gantt-control-background --gantt-control-hover
--gantt-control-border --gantt-input-background --gantt-grid-line
--gantt-selection --gantt-selection-foreground --gantt-summary
--gantt-search-match --gantt-search-match-foreground
```

Dark mode must never combine a white selected background with white selected text. The Material preset uses bundled Roboto weights 400, 500 and 700 and must not make an external font request. Provide optional presets:

- `material`: Roboto, rounded shell/buttons/bars, roomier toolbar.
- `fluent`: Segoe UI-like typography, flatter shell, compact controls.
- `dark-operations`: compact dark-operations treatment.

## 19. Summary event and calculations

Do not render the host footer. Expose:

```ts
export interface GanttProjectSummary {
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

Rules: empty projects return null dates/zero metrics; dates are earliest/latest; `durationDays` is inclusive; `workingDurationDays` excludes `nonWorkingDays`; `referenceDate` uses `summaryReferenceDate` or today; task/phase/milestone counts are separate; progress is duration-weighted over normal tasks and milestones; incomplete work before the reference date is overdue; `nextDueDate` is the nearest not-yet-overdue incomplete finish; parent costs are not double-counted; planned/actual/variance follow the fields above; resources are unique by external `resourceId`, otherwise `taskId:assignmentId`; capacity is summed once per distinct resource; quantities and monetary values round to two decimals.

Emit `gantt-summary-changed` after `setData`, import, task/resource/dependency edits, drag/resize, undo/redo and other host-triggered project changes.

## 20. Events

Dispatch DOM events with `{ bubbles: true, composed: true }` where applicable.

| Event | Detail | Purpose |
| --- | --- | --- |
| `tasks-changed` | `GanttChange` | Persist/synchronize the complete project snapshot. |
| `gantt-summary-changed` | `GanttProjectSummary` | Update a host-owned footer/status bar. |
| `task-selected` | `{ id: string; task: GanttTask }` | Open a host detail panel. |
| `column-settings-changed` | `GanttColumnSettings` | Save user layout preferences. |
| `column-settings-reset` | `GanttColumnSettings` | Clear/replace saved layout. |
| `persistence-error` | `{ error: unknown; change: GanttChange }` | Report failed automatic saves. |
| `project-file-error` | `{ error: unknown }` | Report adapter/import errors. |
| `task-delete-requested` | `GanttTaskDeleteContext` | Cancel, confirm, audit or authorize deletion. Cancelable. |
| `resources-undocked` | `{ taskId: string \| null }` | Resource popup opened. |
| `resources-docked` | `undefined` | Resource popup closed/docked. |
| `resources-dock-requested` | `undefined` | Popup request to return to the main panel. |

```ts
export type GanttChangeReason =
  | 'set-data' | 'task-created' | 'task-updated' | 'task-deleted'
  | 'task-moved' | 'dependency-updated' | 'history-undo'
  | 'history-redo' | 'imported';

export interface GanttChange {
  projectId: string | null;
  revision: number;
  reason: GanttChangeReason;
  taskId?: string;
  data: GanttData;
}
```

`revision` is a monotonically increasing client-side revision. Every `tasks-changed` detail contains the full portable snapshot, not only a patch.

## 21. Undo and redo

```ts
interface GanttHistoryOptions {
  enabled?: boolean; // default false
  maxActions?: number; // default 50; 0 means retain none
  showControls?: boolean;
  undoShortcut?: string | string[] | false;
  redoShortcut?: string | string[] | false;
}
```

Record one immutable snapshot per completed grid edit, bar move/resize, hierarchy move/reorder/outdent, task creation/deletion, resource change, daily quantity update, dependency update and lock/unlock change. Imports and `setData()` reset the baseline. Undo/redo emit `tasks-changed` with `history-undo`/`history-redo` and update the summary. Disable toolbar buttons when no action is available.

Default shortcuts:

```ts
undoShortcut: ['Ctrl+z', 'Meta+z'];
redoShortcut: ['Ctrl+y', 'Ctrl+Shift+z', 'Meta+y', 'Meta+Shift+z'];
```

## 22. Public methods

```ts
setData(data: GanttData): void;
getData(): GanttData;
setOptions(options: GanttOptions): void;
getProjectSummary(): GanttProjectSummary;

updateTask(taskId: string, patch: Partial<GanttTask>): void;
addChildTask(parentId: string, task?: Partial<GanttTask>): GanttTask;
deleteTask(taskId: string, source?: 'toolbar' | 'keyboard' | 'context-menu' | 'api'): Promise<boolean>;
moveTask(taskId: string, parentId: string | null): void;
reorderTask(taskId: string, targetTaskId: string, position: 'before' | 'after'): void;
lockTask(taskId: string): boolean;
unlockTask(taskId: string): boolean;
setTaskLocked(taskId: string, locked: boolean): boolean;

addResource(taskId: string, resource?: Partial<GanttResource>): GanttResource | null;
addDependency(from: string, to: string, type?: DependencyType): void;
removeDependency(from: string, to: string): void;
selectTask(taskId: string): void;
toggleTask(taskId: string): void;
setTaskRowHeight(height: number): void;
fitTaskToView(taskId?: string): void;
fitGanttToView(): void;

undo(): boolean;
redo(): boolean;
clearHistory(): void;
getColumnSettings(): GanttColumnSettings;
setColumnSettings(settings: Partial<GanttColumnSettings>): void;
resetColumnSettings(): void;

toJSON(): string;
toMSProjectXML(): string;
importFile(file: File): Promise<GanttData>;
exportFile(format: 'json' | 'mspxml' | 'mpp'): Promise<Blob>;
saveToLocalStorage(key?: string): void;
loadFromLocalStorage(key?: string): boolean;
loadFromPersistence(): Promise<boolean>;
saveToPersistence(): Promise<void>;
undockResources(): boolean;
dockResources(): void;
```

`addChildTask('')` creates a root task. New tasks default to today's UTC-safe date, a seven-day range, progress `0`, type `task`, a generated id and a default colour. Explicit fields must win.

## 23. Persistence and file codecs

```ts
export interface GanttPersistenceAdapter {
  load?(projectId: string): Promise<GanttData | null>;
  save(change: GanttChange): Promise<void>;
}

export type GanttSaveHook =
  (change: GanttChange) => void | Promise<void>;
```

With `autoSave`, call the configured adapter and/or save hook after each committed change. Run both when both exist. On failure emit `persistence-error` and show a localized status. `saveToPersistence()` explicitly saves a `set-data` change and rejects if neither adapter nor hook exists.

Direct local storage helpers use default key `gantt:<projectId-or-default>`. Also export:

```ts
class LocalStorageGanttPersistenceAdapter implements GanttPersistenceAdapter {
  constructor(keyPrefix?: string); // default `gantt-project`
  load(projectId: string): Promise<GanttData | null>;
  save(change: GanttChange): Promise<void>;
  remove(projectId: string): void;
}
```

JSON must be normalized, pretty-printed and round-trippable. MSPXML import/export must handle project name, task UID/ID, Name, Start, Finish, PercentComplete, Summary, Milestone, OutlineLevel and PredecessorLink, with dependency type mapping `0` finish-finish, `1` finish-start, `2` start-start, `3` start-finish. Preserve dependency lag where supported.

Binary `.mpp` requires an explicit adapter:

```ts
export interface ProjectFileAdapter {
  importMpp(file: File | ArrayBuffer): Promise<GanttData>;
  exportMpp(data: GanttData): Promise<Blob | ArrayBuffer>;
}
```

Without an adapter, disable or error the MPP action with a localized explanation. Never pretend the browser can parse binary MPP without a supplied implementation.

## 24. Accessibility and interaction quality

- Use semantic buttons, inputs, selects, roles and labels.
- Keep focus-visible rings readable in both themes.
- Add localized labels to row toggles, focus controls, resizers, search navigation, resource quantity inputs and popup controls.
- Use `aria-live="polite"` for search counters/status where appropriate.
- Mark locked rows as read-only.
- Make column order controls keyboard accessible.
- Keep context menus and tooltips inside the viewport.
- Keep date labels on one line where possible.
- Do not expose duplicate browser-native tooltips for elements already using the custom tooltip shell.

## 25. Suggested integration example

```ts
const gantt = document.querySelector('gantt-chart') as GanttChart;

gantt.options = {
  locale: 'en-US',
  taskGridSplitter: {
    minWidth: 280,
    maxWidth: '50vw',
    minTimelineWidth: 320,
  },
  resourcePanel: { detachable: true },
  history: { enabled: true, maxActions: 50 },
  summaryReferenceDate: '2026-01-20',
  ganttHeader: {
    showMonths: true,
    showWeeks: true,
    showDays: true,
    dayTemplate: ({ weekdayNarrow, day, weekNumber }) =>
      `${weekdayNarrow.toUpperCase()} ${day} · W${weekNumber}`,
  },
  resourceHeader: {
    dayTemplate: ({ weekdayNarrow, day, weekNumber }) =>
      `${weekdayNarrow.toUpperCase()} ${day} · W${weekNumber}`,
  },
  onTaskSelect: (id, task) => hostDetailsPanel.open(id, task),
  onTaskEdit: task => hostTaskEditor.open(task),
};

gantt.addEventListener('tasks-changed', event => {
  const change = (event as CustomEvent<GanttChange>).detail;
  hostStore.replace(change.data);
});

gantt.addEventListener('gantt-summary-changed', event => {
  hostFooter.update((event as CustomEvent<GanttProjectSummary>).detail);
});
```

## 26. Acceptance criteria

The recreation is complete only when:

- It runs as `<gantt-chart>` with no framework wrapper.
- It exposes the documented properties, TypeScript contracts, methods and events.
- It loads/returns portable JSON with UTC-safe dates.
- Tasks, phases and milestones render distinctly and remain editable according to locks.
- Parent ranges, outline codes, collapse/expand and hierarchy moves work.
- Regular-task drops remain sibling reorders and never silently change `type`.
- Cycles are rejected with an English-readable validation error by default.
- Dependencies support all four link types, lag, initial scheduling and propagation.
- Dependency connectors enter targets at bar centre and route orthogonally.
- Progress remains visible when daily resource segments introduce gaps.
- Resource panels remain visible and horizontally synchronized.
- Resource calendars shade closed days, disable inputs and distribute totals only across working days.
- Stable external resource ids are preserved.
- Detachable resources synchronize data, selection, scroll, theme and CSS variables.
- Main/resource headers support independent templates, grouping and week numbering.
- Bars, summaries, milestones, tooltips, cells and menus are templateable without losing built-in labels/interactions.
- Columns resize/reorder/hide and persist with independent permissions.
- Row height is clamped and included in column settings.
- Undo/redo, deletion confirmation and cancelable deletion events work.
- JSON/MSPXML work and MPP uses an explicit adapter.
- Only one tooltip system is visible at a time.
- English/French dictionaries and safe English fallback exist.
- Light/dark themes and visual presets preserve contrast.
- At least 1,500 tasks remain usable with virtual rendering and batched scrolling.
- Automated tests cover dates, tree operations, scheduling, resources, costs, summaries, history, layout, codecs and component interactions.
- Lint, tests and production build pass.

## 27. Verification checklist

Run the equivalent of:

```bash
pnpm lint
pnpm test
pnpm build
```

Also manually verify:

1. A project crossing daylight-saving boundaries keeps the same `YYYY-MM-DD` dates.
2. A parent phase derives its range and cost without double-counting children.
3. A milestone renders as a diamond and participates in dependencies.
4. A weekday-only resource receives no weekend quantity.
5. A zero quantity creates a visible gap but does not remove the task bar.
6. A locked task cannot be renamed, moved, resized, deleted or resource-edited.
7. A dark selected row has readable contrast.
8. A custom bar template still shows the built-in task name.
9. Today and dependency connectors remain aligned after zoom and scroll.
10. Main and detached resource timelines stay aligned while either scrolls.
11. A task context menu closes before an empty-timeline menu opens.
12. No native `title` tooltip duplicates the custom task tooltip.
