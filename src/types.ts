/**
 * Public data contracts for the reusable Gantt component.
 *
 * Dates deliberately use YYYY-MM-DD strings. This avoids timezone surprises
 * when a plan is edited in a browser configured for a different timezone than
 * the server that stores it.
 */

import type { GanttChart } from './gantt-chart';

/** Runtime-safe task type constants for templates and host integrations. */
export const TaskType = {
  Task: 'task',
  Parent: 'parent',
  Milestone: 'milestone',
} as const;

// The type/value share a name intentionally: this keeps string-union compatibility
// while also allowing templates to use the runtime constants as `TaskType.Task`.
// eslint-disable-next-line no-redeclare
export type TaskType = typeof TaskType[keyof typeof TaskType];

/** Built-in colour theme exposed by the component's `theme` attribute. */
export type GanttTheme = 'light' | 'dark';

/** Rule used to number calendar weeks in the timeline header. */
export type WeekNumbering = 'first-full-week' | 'iso';

export type GanttFieldValue = string | number | boolean | null;

export type GanttResourceType = 'work' | 'material' | 'expense';

/** Working hours for one day. Times use the local calendar convention, HH:mm. */
export interface GanttWorkingRange {
  start: string;
  end: string;
}

/** Project or resource calendar. Exceptions take precedence over the weekly rule. */
export interface GanttCalendar {
  id: string;
  name: string;
  /** UTC day numbers: 0 = Sunday, 1 = Monday. Defaults to the project calendar. */
  workingDays?: number[];
  /** Optional future-ready hourly ranges per weekday. */
  hours?: Partial<Record<number, GanttWorkingRange[]>>;
  /** Per-date overrides keyed by YYYY-MM-DD. */
  exceptions?: Record<string, 'working' | 'non-working'>;
  /** Optional human-readable labels for per-date overrides keyed by YYYY-MM-DD. */
  exceptionLabels?: Record<string, string>;
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
  progress: number;
  parentId: string | null;
  type: TaskType;
  /** Optional planning columns commonly used by Microsoft Project-like views. */
  mode?: string;
  code?: string;
  /** Unit of work used by this assignment, for example `day`, `hour`, `m³` or `unit`. */
  unit?: string;
  unitCost?: number;
  quantity?: number;
  quantityPerDay?: number;
  /** Optional business budget used by the project summary. Falls back to calculated task cost. */
  plannedCost?: number;
  /** Optional cost already incurred, supplied by the host business system. */
  actualCost?: number;
  /** Set to `false` to lock this task against user edits in the component. Defaults to `true`. */
  editable?: boolean;
  fields?: Record<string, GanttFieldValue>;
  resources?: GanttResource[];
  /** Persisted task-bar colour. A default is added automatically when the task is imported or created. */
  color?: string;
  /** Effective calendar supplied by the host application for this task or phase. */
  calendarId?: string;
  children?: GanttTask[];
  collapsed?: boolean;
  metadata?: Record<string, unknown>;
}

export interface GanttResource {
  /** Identifier of this assignment inside the current task. */
  id: string;
  /** Stable, unique identifier of the resource in the external catalogue or business system. */
  resourceId?: string;
  name: string;
  type: GanttResourceType | string;
  /** Unit of work used by the external catalogue, for example `day`, `hour` or `unit`. */
  unit?: string;
  unitCost: number;
  quantity: number;
  /** Calendar used to validate daily quantities and distribute totals. */
  calendarId?: string;
  /** Optional daily capacity, supplied by a resource catalogue when available. */
  maxUnits?: number;
  /** Quantities keyed by YYYY-MM-DD. A missing/zero day creates a visible gap. */
  quantityByDate?: Record<string, number>;
  /** @deprecated Use `quantity`; retained when reading older project snapshots. */
  totalQuantity?: number;
  cost?: number;
  metadata?: Record<string, GanttFieldValue>;
}

/**
 * Patch accepted by the incremental assignment API. `assignmentId` is the
 * business-facing spelling used by 1.4 integrations; `id` remains accepted
 * for compatibility with the canonical `GanttResource` shape.
 */
export type GanttResourceAssignmentPatch = Partial<GanttResource> & {
  assignmentId?: string;
};

/** Canonical assignment returned by a business API. */
export type GanttResourceAssignment = GanttResource & {
  /** Optional business-facing alias for the canonical assignment id. */
  assignmentId?: string;
};

/** Ressource issue d'un référentiel métier externe. */
export interface GanttResourceReference {
  id: string;
  /** Optional business code displayed by inline catalogue suggestions. */
  code?: string;
  name: string;
  type?: GanttResourceType | string;
  unit?: string;
  unitCost?: number;
  quantity?: number;
  calendarId?: string;
  maxUnits?: number;
  metadata?: Record<string, GanttFieldValue>;
}

/** Contrat d'intégration d'un référentiel de ressources, par exemple via une API REST. */
export interface GanttResourceProvider {
  search(query: string): Promise<GanttResourceReference[]>;
}

/** API exposed to a host-owned resource selection dialog. */
export interface GanttResourcePickerContext {
  task: GanttTask;
  /** Creates an assignment from a catalogue result and preserves its catalogue ID. */
  assignReference: (reference: GanttResourceReference) => void;
  /** Creates a manual assignment when the host dialog permits it. */
  addResource: (resource?: Partial<GanttResource>) => void;
}

/** Opens a host-owned modal or drawer used to select a resource for a task. */
export type GanttResourcePicker = (context: GanttResourcePickerContext) => void | Promise<void>;

export interface GanttDependency {
  from: string;
  to: string;
  type?: DependencyType;
  /** Optional lag in whole days. */
  lagDays?: number;
}

export interface GanttData {
  name?: string;
  tasks: GanttTask[];
  dependencies?: GanttDependency[];
  /** Calendars travel with JSON, local persistence and custom MPP adapters. */
  calendars?: GanttCalendar[];
  /** Calendar used for the planning columns when no task-specific calendar overrides it. */
  projectCalendarId?: string;
  /** Extra project-level data is preserved by JSON and persistence adapters. */
  metadata?: Record<string, unknown>;
}

export interface TaskColors {
  parent?: string;
  task?: string;
  milestone?: string;
  dependency?: string;
  selected?: string;
  /** Colour of the vertical Today marker and its label. */
  today?: string;
  headerBackground?: string;
  rowBackground?: string;
  rowAltBackground?: string;
}

/** Value type used by task-grid and resource-grid columns. */
export enum GanttColumnType {
  Text = 'text',
  String = 'string',
  Number = 'number',
  Integer = 'integer',
  Decimal = 'decimal',
  Date = 'date',
}

/** String literals remain accepted for compatibility with existing column configurations. */
export type GanttColumnTypeValue = GanttColumnType | 'text' | 'string' | 'number' | 'integer' | 'decimal' | 'date';

/** Context supplied when rendering or styling a custom task-grid cell. */
export interface GanttColumnRenderContext {
  task: GanttTask;
  value: unknown;
  formattedValue: string;
}

/** Context supplied when producing a tooltip for a resource-grid cell. */
export interface GanttResourceColumnRenderContext {
  resource: GanttResource;
  task: GanttTask;
  value: unknown;
  formattedValue: string;
}

/** Editor controls supported by an editable resource-grid column. */
export type GanttResourceColumnEditor = 'text' | 'number' | 'select';

/** One option displayed by a native select resource-grid editor. */
export interface GanttResourceColumnOption {
  value: string | number;
  label: string;
  disabled?: boolean;
}

export interface GanttColumn {
  /** Built-in keys include mode, code, name, duration, start and end. */
  key: string;
  label: string;
  width: number;
  /** `string` is an alias of `text`; `integer` and `decimal` are numeric display types. */
  type?: GanttColumnTypeValue;
  editable?: boolean;
  /** A required column stays visible in the column picker. */
  required?: boolean;
  /** Set to false to hide a column initially while keeping it available in the picker. */
  visible?: boolean;
  /** Computes a display value with access to the complete task object. */
  value?: (task: GanttTask) => unknown;
  /** Formats the computed or built-in value for display. */
  format?: (value: unknown, task: GanttTask) => string;
  /** Customizes the native tooltip. Omit to use the formatted displayed value; set `false` to disable it. */
  tooltip?: false | ((context: GanttColumnRenderContext) => string | undefined);
  /** Applies the component's semantic positive, negative or neutral column tone. */
  tone?: (value: unknown, task: GanttTask) => 'positive' | 'negative' | 'neutral' | undefined;
  /** Renders custom Lit or DOM content inside a read-only task-grid cell. */
  cellTemplate?: (context: GanttColumnRenderContext) => unknown;
  /** Adds inline CSS to a task-grid cell. Useful for value-dependent visual effects. */
  cellStyle?: (context: GanttColumnRenderContext) => string | undefined;
}

/** Configures a left-side column of the resource assignment grid. */
export interface GanttResourceColumn {
  key: string;
  label: string;
  width: number;
  /** `string` is an alias of `text`; `integer` and `decimal` control numeric input defaults. */
  type?: GanttColumnTypeValue;
  /** Explicitly selects the native editor used by an editable resource column. */
  editor?: GanttResourceColumnEditor;
  /** Options used by a native select editor. Labels and values are supplied by the host application. */
  options?: readonly GanttResourceColumnOption[];
  /** Minimum accepted numeric value. Omit it to leave the input unconstrained. */
  min?: number;
  /** Numeric input increment. Use `any` for arbitrary decimal values. */
  step?: number | 'any';
  editable?: boolean;
  /** A required column stays visible in the column picker. */
  required?: boolean;
  /** Set to false to hide a resource column initially while keeping it available in the picker. */
  visible?: boolean;
  /** Computes a display value with access to both the assignment and its task. */
  value?: (resource: GanttResource, task: GanttTask) => unknown;
  /** Formats the computed or built-in value for display. */
  format?: (value: unknown, resource: GanttResource, task: GanttTask) => string;
  /** Customizes the native tooltip. Omit to use the formatted displayed value; set `false` to disable it. */
  tooltip?: false | ((context: GanttResourceColumnRenderContext) => string | undefined);
  /** Maps an edited custom-cell value back to the resource assignment. */
  setValue?: (value: string, resource: GanttResource, task: GanttTask) => Partial<GanttResource> | void;
}

/** Serializable layout of one column, suitable for a host application's settings API. */
export interface GanttColumnSetting {
  key: string;
  /** Zero-based position within its grid. */
  order: number;
  width: number;
  visible: boolean;
}

/** Complete user-adjustable layout of the task and resource grids. */
export interface GanttColumnSettings {
  taskColumns: GanttColumnSetting[];
  resourceColumns: GanttColumnSetting[];
  /** Height in pixels used by task rows in the Gantt grid and timeline. */
  taskRowHeight?: number;
}

/** Hooks called when a user changes or resets the column layout. */
export interface GanttColumnSettingsOptions {
  /** Shows the Columns control and enables its user interactions. Defaults to true. */
  enabled?: boolean;
  /** Allows resize handles on task and resource column headers. Defaults to true. */
  allowResize?: boolean;
  /** Allows drag-and-drop and arrow-button column reordering. Defaults to true. */
  allowReorder?: boolean;
  /** Allows visibility checkboxes in the Columns panel. Defaults to true. */
  allowVisibility?: boolean;
  /** Allows the task-row-height control in the Columns panel. Defaults to true. */
  allowTaskRowHeight?: boolean;
  /** Persist the complete layout in the host application (local storage, API, user profile, etc.). */
  onChange?: (settings: GanttColumnSettings) => void | Promise<void>;
  /** Remove or replace the host-side saved layout after the user chooses Reset. */
  onReset?: (settings: GanttColumnSettings) => void | Promise<void>;
}

/** Renders the label displayed on a parent-task summary bar. Strings and Lit templates are supported. */
export type GanttSummaryTemplate = (task: GanttTask) => unknown;

export type GanttTaskBarKind = 'task' | 'summary' | 'milestone';

/** Context passed when the host customizes the visible content of a Gantt task bar. */
export interface GanttTaskBarTemplateContext {
  task: GanttTask;
  color: string;
  width: number;
  /** Task duration in days, matching the built-in Duration grid column. */
  durationDays: number;
  kind: GanttTaskBarKind;
}

/** Renders the content of a task, phase summary or milestone label. The interactions remain managed by the component. */
export type GanttTaskBarTemplate = (context: GanttTaskBarTemplateContext) => unknown;

/** One or more keyboard shortcuts such as `Ctrl+z` or `Meta+Shift+z`. Set false to disable it. */
export type GanttHistoryShortcut = string | string[] | false;

/** Optional local undo/redo history maintained by the component. */
export interface GanttHistoryOptions {
  /** Enables local undo/redo. Defaults to false. */
  enabled?: boolean;
  /** Maximum number of completed actions retained. Defaults to 50. Use 0 to keep no undoable action. */
  maxActions?: number;
  /** Shows Undo and Redo buttons in the component toolbar. Defaults to true when history is enabled. */
  showControls?: boolean;
  /** Defaults to Ctrl+Z and Meta+Z. */
  undoShortcut?: GanttHistoryShortcut;
  /** Defaults to Ctrl+Y, Ctrl+Shift+Z, Meta+Y and Meta+Shift+Z. */
  redoShortcut?: GanttHistoryShortcut;
}

/** Context passed when the host customizes a task-bar tooltip. */
export interface GanttTaskTooltipTemplateContext {
  task: GanttTask;
  color: string;
  durationDays: number;
  kind: GanttTaskBarKind;
  resources: GanttResource[];
}

/** Replaces the content of the tooltip displayed while hovering a Gantt task bar. */
export type GanttTaskTooltipTemplate = (context: GanttTaskTooltipTemplateContext) => unknown;

/** Actions exposed to a custom task-editor template rendered inside the component dialog. */
export interface GanttTaskEditorTemplateContext {
  task: GanttTask;
  /** Whether the current task accepts user changes. */
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

/** Replaces the built-in task-editor tabs while keeping the component dialog and its persistence flow. */
export type GanttTaskEditorTemplate = (context: GanttTaskEditorTemplateContext) => unknown;

/** Actions available while rendering a task's right-click menu. */
export interface GanttTaskContextMenuTemplateContext {
  /** The Gantt component instance that opened this menu. */
  gantt: GanttChart;
  task: GanttTask;
  /** Whether mutation actions are available for this task. */
  editable: boolean;
  close: () => void;
  edit: () => void;
  addTaskAfter: () => void;
  deleteTask: () => Promise<boolean>;
  updateTask: (patch: Partial<GanttTask>) => void;
  fitToView: () => void;
}

/** Replaces the built-in task right-click menu. Return Lit content, including nested menus when needed. */
export type GanttTaskContextMenuTemplate = (context: GanttTaskContextMenuTemplateContext) => unknown;

/** Actions available while rendering a dependency's right-click menu. */
export interface GanttDependencyContextMenuTemplateContext {
  /** The Gantt component instance that opened this menu. */
  gantt: GanttChart;
  /** The dependency represented by the focused connector arrow. */
  dependency: GanttDependency;
  /** Whether the endpoint tasks allow dependency mutations. */
  editable: boolean;
  close: () => void;
  fitToView: () => void;
}

/** Replaces the content of the dependency right-click menu. */
export type GanttDependencyContextMenuTemplate = (context: GanttDependencyContextMenuTemplateContext) => unknown;

/** Actions available while rendering the right-click menu of an empty Gantt timeline area. */
export interface GanttTimelineContextMenuTemplateContext {
  close: () => void;
  fitToView: () => void;
  /** Date corresponding to the empty timeline cell that was right-clicked. */
  date: string;
  addTask: () => void;
  addPhase: () => void;
}

/** Replaces the built-in right-click menu displayed on an empty Gantt timeline area. */
export type GanttTimelineContextMenuTemplate = (context: GanttTimelineContextMenuTemplateContext) => unknown;

/** Text displayed by the component. Override only the entries your product needs. */
export interface GanttTranslations {
  inlineResourceMode: string;
  inlineFreeResource: string;
  inlineNoResults: string;
  inlineSaveFailed: string;
  inlineSaving: string;
  inlineRequired: string;
  inlineInvalid: string;
  inlineNotAllowed: string;
  inlineSelectReference: string;
  inlineInvalidResponse: string;
  import: string;
  exportJson: string;
  exportMspxml: string;
  exportMpp: string;
  exportMppUnavailable: string;
  saveLocal: string;
  loadLocal: string;
  undo: string;
  redo: string;
  addTask: string;
  addPhase: string;
  delete: string;
  expandAll: string;
  collapseAll: string;
  columns: string;
  search: string;
  previousResult: string;
  nextResult: string;
  zoomOut: string;
  zoomIn: string;
  fitTask: string;
  fitGantt: string;
  noTasks: string;
  noPlanningData: string;
  today: string;
  resources: string;
  undockResources: string;
  dockResources: string;
  resourcesWindowBlocked: string;
  cost: string;
  unit: string;
  unitCost: string;
  quantity: string;
  totalQuantity: string;
  addResource: string;
  newTask: string;
  newResource: string;
  editTask: string;
  addTaskAfter: string;
  close: string;
  general: string;
  links: string;
  name: string;
  code: string;
  type: string;
  color: string;
  progress: string;
  actualCost: string;
  parent: string;
  root: string;
  start: string;
  finish: string;
  task: string;
  phase: string;
  milestone: string;
  resourceCatalogue: string;
  searchResource: string;
  searching: string;
  resource: string;
  add: string;
  noResourceAssigned: string;
  noLink: string;
  addPredecessor: string;
  columnMenuTitle: string;
  taskColumns: string;
  resourceColumns: string;
  taskRowHeight: string;
  required: string;
  reset: string;
  mode: string;
  duration: string;
  totalCost: string;
  automatic: string;
  manual: string;
  invalidJson: string;
  ganttHorizontalScroll: string;
  resizeColumn: string;
  resizeResourceColumn: string;
  moveColumnEarlier: string;
  moveColumnLater: string;
  reorderColumn: string;
  resizeTaskGrid: string;
  resizeResourceGrid: string;
  toggleTask: string;
  lockedTask: string;
  focusTask: string;
  nonWorkingDay: string;
  resourceCalendarFor: string;
  resizeStart: string;
  resizeEnd: string;
  projectImported: string;
  projectLoadedFromPersistence: string;
  projectSaved: string;
  projectSavedLocal: string;
  projectLoadedLocal: string;
  saveFailed: string;
  importFailed: string;
  exportComplete: string;
  exportFailed: string;
  saveLocalFailed: string;
  noLocalProject: string;
  loadLocalFailed: string;
  resourcePickerUnavailable: string;
  resourceCatalogueUnavailable: string;
  resourceAlreadyAssigned: string;
  resourceProviderLater: string;
  weekNumber: string;
  finishToStart: string;
  startToStart: string;
  finishToFinish: string;
  startToFinish: string;
}

/** Drag-to-pan behaviour for the empty part of the Gantt timeline. */
export interface GanttPanOptions {
  /** Enables left-click panning. Disabled by default to preserve existing interactions. */
  enabled?: boolean;
  /** Pans horizontally, or horizontally and through the Gantt's vertical task list. */
  axis?: 'horizontal' | 'both';
  /** Reserved for future triggers; panning currently starts only from empty timeline space. */
  trigger?: 'empty-area';
}

/** Data exposed to a custom cell in a Gantt or resource date header. */
export interface GanttDateHeaderTemplateContext {
  date: Date;
  area: 'gantt' | 'resources';
  index: number;
  day: number;
  /** Calendar week number calculated with the configured week-numbering rule. */
  weekNumber: number;
  weekday: string;
  weekdayNarrow: string;
  title: string;
}

/** Renders one date cell in the planning or resource header. */
export type GanttDateHeaderTemplate = (context: GanttDateHeaderTemplateContext) => unknown;

/** Data exposed to a custom month cell in the Gantt header. */
export interface GanttMonthHeaderTemplateContext {
  date: Date;
  label: string;
  index: number;
  dayCount: number;
}

/** Renders one month cell in the Gantt header. */
export type GanttMonthHeaderTemplate = (context: GanttMonthHeaderTemplateContext) => unknown;

/** Data exposed to a custom week cell in the Gantt header. */
export interface GanttWeekHeaderTemplateContext {
  start: Date;
  /** Calendar week number calculated with the configured week-numbering rule. */
  weekNumber: number;
  /** @deprecated Use `weekNumber`; kept for backward compatibility. */
  number: number;
  index: number;
  dayCount: number;
}

/** Renders one week cell in the Gantt header. */
export type GanttWeekHeaderTemplate = (context: GanttWeekHeaderTemplateContext) => unknown;

export type GanttHeaderDayGrouping = 'day' | 'week';

/** Header rendering rules activated when the current Gantt zoom falls within the declared range. */
export interface GanttHeaderZoomLevel {
  minZoom?: number;
  maxZoom?: number;
  showMonths?: boolean;
  showWeeks?: boolean;
  showDays?: boolean;
  /** `week` replaces individual date cells with one date cell per calendar week. */
  dayGrouping?: GanttHeaderDayGrouping;
  monthTemplate?: GanttMonthHeaderTemplate;
  weekTemplate?: GanttWeekHeaderTemplate;
  dayTemplate?: GanttDateHeaderTemplate;
  /** Label rendered in the grouped date row when `dayGrouping` is `week`. */
  weekDateTemplate?: GanttWeekHeaderTemplate;
}

/** Visibility and date-cell rendering controls for the main Gantt header. */
export interface GanttTimelineHeaderOptions {
  showMonths?: boolean;
  showWeeks?: boolean;
  showDays?: boolean;
  monthTemplate?: GanttMonthHeaderTemplate;
  weekTemplate?: GanttWeekHeaderTemplate;
  dayTemplate?: GanttDateHeaderTemplate;
  /** First matching rule controls the header at the current zoom level. */
  zoomLevels?: GanttHeaderZoomLevel[];
}

/** Resource-header rendering rules activated when the current Gantt zoom falls within the declared range. */
export interface GanttResourceHeaderZoomLevel {
  minZoom?: number;
  maxZoom?: number;
  visible?: boolean;
  dayGrouping?: GanttHeaderDayGrouping;
  dayTemplate?: GanttDateHeaderTemplate;
  weekDateTemplate?: GanttWeekHeaderTemplate;
}

/** Visibility and date-cell rendering controls for the resource header. */
export interface GanttResourceHeaderOptions {
  /** Hides both the resource-column labels and the date row when false. */
  visible?: boolean;
  dayTemplate?: GanttDateHeaderTemplate;
  /** First matching rule controls the resource date row at the current zoom level. */
  zoomLevels?: GanttResourceHeaderZoomLevel[];
}

/** Controls the optional secondary window used to display the selected task's resources. */
export interface GanttResourcePanelOptions {
  /** Shows an Undock resources control in the component toolbar. Defaults to false. */
  detachable?: boolean;
  /** Title used for the secondary window. Defaults to the selected task and Resources. */
  windowTitle?: string;
  /** Initial width of the secondary window in pixels. Defaults to 980. */
  windowWidth?: number;
  /** Initial height of the secondary window in pixels. Defaults to 640. */
  windowHeight?: number;
}

/** Controls the draggable split between the task grid and the timeline. */
export interface GanttTaskGridSplitterOptions {
  /** Enables the draggable separator. Defaults to true. */
  enabled?: boolean;
  /** Minimum width of the left task grid. Accepts pixels, `vw` or `%`. Defaults to 220px. */
  minWidth?: number | string;
  /** Maximum width of the left task grid. Accepts pixels, `vw` or `%`; omitted means available width. */
  maxWidth?: number | string;
  /** Space preserved for the right timeline. Accepts pixels, `vw` or `%`. Defaults to 160px. */
  minTimelineWidth?: number | string;
}

/** Origin of a task deletion request. */
export type GanttTaskDeleteSource = 'toolbar' | 'keyboard' | 'context-menu' | 'api';

/** Information supplied before a task, or its complete child branch, is removed. */
export interface GanttTaskDeleteContext {
  /** Task explicitly selected for deletion. */
  task: GanttTask;
  /** The selected task followed by every child task that will be removed. */
  descendants: GanttTask[];
  source: GanttTaskDeleteSource;
}

/** Controls task-deletion entry points and lets the host application confirm an action. */
export interface GanttTaskDeletionOptions {
  /** Disables all component-initiated task deletion. Defaults to true. */
  enabled?: boolean;
  /** Enables the Delete keyboard key when a task is selected. Defaults to true. */
  keyboardShortcut?: boolean;
  /**
   * Host-owned confirmation hook. Return `false` (or a Promise resolving to false)
   * to keep the task; this is ideal for an external dialog or permission check.
   */
  confirm?: (context: GanttTaskDeleteContext) => boolean | Promise<boolean>;
}

/** Calculation strategy used while a task bar is being moved or resized. */
export type GanttCalculationMode = 'live' | 'on-commit';

/** The kind of timeline edit currently being performed. */
export type GanttScheduleEditMode = 'move' | 'resize-start' | 'resize-end';

/** Snapshot supplied to schedule-edit lifecycle callbacks. */
export interface GanttScheduleEditContext {
  taskId: string;
  mode: GanttScheduleEditMode;
  originalStart: string;
  originalEnd: string;
  proposedStart: string;
  proposedEnd: string;
  originalData: GanttData;
  previewData: GanttData;
}

/** Request sent to the host when schedule editing uses a controlled commit. */
export interface GanttScheduleCommitRequest {
  taskId: string;
  mode: GanttScheduleEditMode;
  originalStart: string;
  originalEnd: string;
  proposedStart: string;
  proposedEnd: string;
  baseRevision?: number;
}

/** Result returned by a controlled schedule-edit commit. */
export interface GanttScheduleCommitResult {
  status: 'accepted' | 'rejected';
  data?: GanttData;
  revision?: number;
  error?: string;
}

/** Controls deferred schedule calculations and host-owned schedule commits. */
export interface GanttScheduleEditingOptions {
  /** Enables task move and resize schedule editing. Defaults to true when configured. */
  enabled?: boolean;
  dependencyCalculation?: GanttCalculationMode;
  resourceCalculation?: GanttCalculationMode;
  costCalculation?: GanttCalculationMode;
  summaryCalculation?: GanttCalculationMode;
  commitMode?: 'internal' | 'controlled';
  onScheduleEditStart?: (context: GanttScheduleEditContext) => void;
  onScheduleEditPreview?: (context: GanttScheduleEditContext) => void;
  onScheduleEditCancel?: (context: GanttScheduleEditContext) => void;
  onScheduleEditCommit?: (request: GanttScheduleCommitRequest) => GanttScheduleCommitResult | Promise<GanttScheduleCommitResult>;
}

/** Controls the 1.4 incremental update path and view-state preservation. */
export interface GanttIncrementalUpdateOptions {
  /** Keeps targeted API updates on the incremental render path. Defaults to true. */
  incrementalUpdates?: boolean;
  /** Recalculates dependencies, occurrences and summaries when a move ends. Defaults to true. */
  recalculateOnMoveEnd?: boolean;
  /** Restores horizontal and vertical scroll positions after an update. Defaults to true. */
  preserveScroll?: boolean;
}

/** A draft never belongs to getData(), calculations, history or exports. */
export type GanttTaskCreationDraft = Partial<Omit<GanttTask, 'id' | 'children'>>;
export type GanttResourceCreationDraft = Partial<Omit<GanttResource, 'id'>>;
export type GanttResourceCreationMode = 'catalogue' | 'free';
export type GanttInlineCreationShortcut = string | readonly string[] | false;

/** Bind a host-owned resource search input to the current creation draft. */
export interface GanttResourceCreationInputContext {
  task: GanttTask;
  column: GanttResourceColumn;
  draft: GanttResourceCreationDraft;
  value: string;
  disabled: boolean;
  required: boolean;
  reference?: GanttResourceReference;
  /** Updates this field and invalidates a previous catalogue choice for name/code. */
  onInput: (value: string) => void;
  /** Selects a catalogue result, or clears the choice with null. Does not save. */
  selectReference: (reference: GanttResourceReference | null) => void;
  renderDefault: () => unknown;
}

export type GanttResourceCreationInputTemplate = (context: GanttResourceCreationInputContext) => unknown;

export interface GanttTaskCreationContext {
  /** Stable for this draft, including retries. Send to a retry-safe host endpoint. */
  correlationId?: string;
  selectedTask: GanttTask | null;
  lastTask: GanttTask | null;
  /** Defaults to root. Resolved once when the user starts a draft. */
  parentId: string | null;
  /** Insertion offset in the flattened task tree; defaults to its length. */
  index: number;
}

export interface GanttResourceCreationContext {
  correlationId?: string;
  task: GanttTask;
  mode: GanttResourceCreationMode;
  /** Present only after an explicit catalogue selection. */
  reference?: GanttResourceReference;
}

/** Return an error message to keep the draft, or nothing to accept it. */
export type GanttCreationValidation = string | void;

export interface GanttTaskInlineCreationOptions {
  /** Opt-in. Defaults to false. */
  enabled?: boolean;
  canCreate?: (context: GanttTaskCreationContext) => boolean;
  getContext?: (context: GanttTaskCreationContext) => Partial<Pick<GanttTaskCreationContext, 'parentId' | 'index'>>;
  defaults?: GanttTaskCreationDraft | ((context: GanttTaskCreationContext) => GanttTaskCreationDraft);
  /** Defaults to ['name']. Custom fields use fields.myKey. Unrelated to column.required. */
  requiredFields?: readonly string[];
  validate?: (draft: GanttTaskCreationDraft, context: GanttTaskCreationContext) => GanttCreationValidation | Promise<GanttCreationValidation>;
  /** Persist once and return the complete server-confirmed task, including its ID. */
  save?: (draft: GanttTaskCreationDraft, context: GanttTaskCreationContext) => GanttTask | Promise<GanttTask>;
  /** Alternative to save: uses the same validation/persistence pipeline as external commands. */
  command?: (draft: GanttTaskCreationDraft, context: GanttTaskCreationContext) => import('./gantt-command-types').GanttCommand;
}

export interface GanttResourceInlineCreationOptions {
  /** Opt-in. Defaults to false. */
  enabled?: boolean;
  /** Defaults to ['catalogue']. With both modes, free entry requires an explicit choice. */
  modes?: readonly GanttResourceCreationMode[];
  /** Defaults to retain: keep unsaved drafts per task. Pending saves always keep their original target. */
  selectionChange?: 'retain' | 'discard';
  /** Replaces editable inputs, e.g. with a host search widget. Disables built-in catalogue search. */
  inputTemplate?: GanttResourceCreationInputTemplate;
  canCreate?: (task: GanttTask) => boolean;
  /** Overrides resourceProvider.search for this row. Queries can contain a code or name. */
  search?: (query: string, context: GanttResourceCreationContext) => Promise<GanttResourceReference[]>;
  defaults?: GanttResourceCreationDraft | ((context: GanttResourceCreationContext) => GanttResourceCreationDraft);
  /** Defaults to ['name']. Custom fields use metadata.myKey. */
  requiredFields?: readonly string[];
  /** Additional allowlist for catalogue fields; column.editable must also be true. */
  catalogueEditableFields?: readonly string[];
  validate?: (draft: GanttResourceCreationDraft, context: GanttResourceCreationContext) => GanttCreationValidation | Promise<GanttCreationValidation>;
  /** Returns an assignment, never a catalogue entry. Free entries must not be added to the catalogue. */
  save?: (draft: GanttResourceCreationDraft, context: GanttResourceCreationContext) => GanttResource | Promise<GanttResource>;
  command?: (draft: GanttResourceCreationDraft, context: GanttResourceCreationContext) => import('./gantt-command-types').GanttCommand;
}

export interface GanttInlineCreationOptions {
  /** Hides both creation rows regardless of their enabled state. Defaults to false. */
  readOnly?: boolean;
  /** Keyboard key/shortcut or alternatives. Defaults to Enter. Use false to disable. */
  confirmKey?: GanttInlineCreationShortcut;
  /** Keyboard key/shortcut or alternatives. Defaults to Escape. Use false to disable. */
  cancelKey?: GanttInlineCreationShortcut;
  tasks?: GanttTaskInlineCreationOptions;
  resources?: GanttResourceInlineCreationOptions;
}

export interface GanttSearchState {
  query: string;
  taskIds: string[];
  /** Zero-based active match, or -1. */
  index: number;
  activeTaskId: string | null;
}

export interface GanttViewState {
  zoom: number;
  selectedTaskId: string | null;
  canEditSelectedTask: boolean;
  readOnly: boolean;
  canUndo: boolean;
  canRedo: boolean;
  canUndoCommand: boolean;
  canRedoCommand: boolean;
  resourcesUndocked: boolean;
  search: GanttSearchState;
}

/** UI integration context, separate from serializable planning commands. */
export interface GanttContextMenuRequest {
  kind: 'task' | 'resources' | 'timeline' | 'dependency';
  x: number;
  y: number;
  taskId?: string;
  assignmentId?: string;
  date?: string;
  dependency?: GanttDependency;
  source: 'main' | 'detached';
  /** Render an external popup in this document, including for a detached panel. */
  ownerDocument: Document;
}

export interface GanttOptions extends GanttIncrementalUpdateOptions {
  /** Show the main built-in toolbar. Defaults to true; public actions remain available. */
  showToolbar?: boolean;
  /** Enable built-in context menus. Defaults to true; request events still fire when false. */
  contextMenus?: boolean;
  /** Return false to replace the built-in popup with a host-owned menu. */
  onContextMenuRequested?: (context: GanttContextMenuRequest) => void | boolean;
  /** Global user-edit lock, including command execution and draft rows. */
  readOnly?: boolean;
  /** Structured commands are disabled by default. */
  commands?: import('./gantt-command-types').GanttCommandOptions;
  /** Independent opt-in creation rows. Existing creation entry points are preserved. */
  inlineCreation?: GanttInlineCreationOptions;
  headerWidth?: number;
  /** Default height of each task row in pixels. Clamped between 28 and 96; defaults to 42. */
  taskRowHeight?: number;
  /** Configures the resizable split between the task grid and the right-side timeline. */
  taskGridSplitter?: GanttTaskGridSplitterOptions;
  /** Optional internal scroll height. Omit to let the component grow naturally. */
  maxHeight?: number | string;
  /** Preferred height of the resource grid. It contracts on compact screens while preserving a usable resource row. */
  resourcesMaxHeight?: number | string;
  /** Enables an optional secondary window for the selected task's resource grid. */
  resourcePanel?: GanttResourcePanelOptions;
  taskColumns?: GanttColumn[];
  /** Columns shown in the resource grid before the remove action. */
  resourceColumns?: GanttResourceColumn[];
  /** User-customizable column order, visibility and width for both grids. */
  columnSettings?: GanttColumnSettingsOptions;
  /** Extra content appended after the task name inside the summary bar of parent tasks. */
  summaryTemplate?: GanttSummaryTemplate;
  /** Extra content appended after the task name inside task and parent summary bars. */
  taskBarTemplate?: GanttTaskBarTemplate;
  /** Extra content appended after the name inside a regular task bar. Takes precedence over `taskBarTemplate`. */
  taskTemplate?: GanttTaskBarTemplate;
  /** Keeps a task name visible within its bar while horizontally scrolling. Defaults to true. */
  stickyTaskLabels?: boolean;
  /** Extra content appended after the name inside a phase summary bar. Takes precedence over `taskBarTemplate` and `summaryTemplate`. */
  phaseTemplate?: GanttTaskBarTemplate;
  /** Content displayed beside a milestone diamond. */
  milestoneTemplate?: GanttTaskBarTemplate;
  /** Optional local undo/redo history, including its toolbar controls and keyboard shortcuts. */
  history?: GanttHistoryOptions;
  /** Controls deletion from the toolbar, Delete key and task context menus. */
  taskDeletion?: GanttTaskDeletionOptions;
  /** Controls live/deferred calculations and optional host-owned schedule commits. */
  scheduleEditing?: GanttScheduleEditingOptions;
  /** Set false to disable task-bar tooltips. Defaults to true. */
  showTaskTooltips?: boolean;
  /** Replaces the content of the task-bar tooltip while keeping its positioning and visual shell. */
  taskTooltipTemplate?: GanttTaskTooltipTemplate;
  dayWidth?: number;
  minZoom?: number;
  maxZoom?: number;
  taskColors?: TaskColors;
  showToday?: boolean;
  /** Replaces the built-in Today label. A callback is evaluated during rendering. */
  todayLabel?: string | (() => string);
  showDependencies?: boolean;
  /** Overrides the dependency-line colour without changing other task colours. */
  dependencyColor?: string;
  /** Visual stroke used for dependency connectors. Defaults to `solid`. */
  dependencyLineStyle?: 'solid' | 'dashed';
  /** Reposition dependent tasks when data is loaded. Defaults to true. */
  autoSchedule?: boolean;
  /** Use 'external' to let the host application open its own task editor from onTaskEdit. */
  taskEditorMode?: 'built-in' | 'external';
  /** Opens the built-in or custom task editor after addChildTask(). Defaults to false. */
  openTaskEditorOnCreate?: boolean;
  /** Opens the configured task editor when a task bar is double-clicked. Defaults to false. */
  openTaskEditorOnDoubleClick?: boolean;
  /**
   * Behaviour of a double-click in the left task grid. Defaults to `rename` to
   * preserve the existing inline rename prompt. Use `edit` to open the configured
   * built-in or host-owned editor, or `none` to disable the gesture.
   */
  taskGridDoubleClickAction?: 'rename' | 'edit' | 'none';
  /** Centres a newly created task in the Gantt timeline. Defaults to false. */
  focusTaskOnCreate?: boolean;
  /** Additional rule used to lock tasks according to a workflow state or user permissions. */
  isTaskEditable?: (task: GanttTask) => boolean;
  /** Replaces the body of the built-in editor with a host-provided Lit template. */
  taskEditorTemplate?: GanttTaskEditorTemplate;
  /** Replaces the built-in task right-click menu with host-provided content. */
  taskContextMenuTemplate?: GanttTaskContextMenuTemplate;
  /** Replaces the right-click menu displayed on a dependency connector arrow. */
  dependencyContextMenuTemplate?: GanttDependencyContextMenuTemplate;
  /** Replaces the right-click menu displayed on an empty Gantt timeline area. */
  ganttContextMenuTemplate?: GanttTimelineContextMenuTemplate;
  /** Opens a host-owned modal or drawer when the user selects Add resource. */
  resourcePicker?: GanttResourcePicker;
  /** Called when a task move/resize session starts. */
  onScheduleEditStart?: (context: GanttScheduleEditContext) => void;
  /** Called for a task move/resize preview frame. */
  onScheduleEditPreview?: (context: GanttScheduleEditContext) => void;
  /** Called when a task move/resize session is cancelled or rejected. */
  onScheduleEditCancel?: (context: GanttScheduleEditContext) => void;
  /** Resolves a controlled task move/resize commit. */
  onScheduleEditCommit?: (request: GanttScheduleCommitRequest) => GanttScheduleCommitResult | Promise<GanttScheduleCommitResult>;
  /** IETF locale used for dates, numbers and built-in labels. Defaults to en-US. */
  locale?: string;
  /** First day of the displayed week. Uses UTC day numbers: 0 = Sunday, 1 = Monday. Defaults to 1. */
  firstDayOfWeek?: number;
  /** Display a calendar week-number row above the timeline. Defaults to false. */
  showWeekNumbers?: boolean;
  /** Controls visible levels and date-cell rendering in the main Gantt header. */
  ganttHeader?: GanttTimelineHeaderOptions;
  /** Controls visibility and date-cell rendering in the resource header. */
  resourceHeader?: GanttResourceHeaderOptions;
  /** `first-full-week` matches Microsoft Project-like calendars; use `iso` for ISO-8601 week numbers. */
  weekNumbering?: WeekNumbering;
  /** Days to shade as non-working. Uses UTC day numbers: 0 = Sunday, 6 = Saturday. Defaults to [0, 6]. */
  nonWorkingDays?: number[];
  /** Date used to calculate overdue tasks in `GanttProjectSummary`. Defaults to today. A callback is re-evaluated whenever the summary is calculated. */
  summaryReferenceDate?: string | (() => string);
  /** Enables mouse panning from an empty part of the Gantt timeline. */
  pan?: GanttPanOptions;
  /** Override individual built-in labels after locale selection. */
  translations?: Partial<GanttTranslations>;
  /** Called with the selected task id and its complete task object. */
  onTaskSelect?: (taskId: string, task: GanttTask) => void;
  onTaskEdit?: (task: GanttTask) => void;
  onTasksChange?: (data: GanttData) => void;
}

export type ProjectFileFormat = 'json' | 'mspxml' | 'mpp';

export interface ProjectFileAdapter {
  /** Read a binary Microsoft Project file and convert it to the canonical model. */
  importMpp(file: File | ArrayBuffer): Promise<GanttData>;
  /** Convert the canonical model to a binary Microsoft Project file. */
  exportMpp(data: GanttData): Promise<Blob | ArrayBuffer>;
}

export type GanttChangeReason =
  | 'command'
  | 'set-data'
  | 'task-created'
  | 'task-updated'
  | 'task-deleted'
  | 'task-moved'
  | 'dependency-updated'
  | 'history-undo'
  | 'history-redo'
  | 'imported';

/** Reason emitted by the focused 1.4 task-updated event. */
export type UpdateReason =
  | 'task-date'
  | 'task-label'
  | 'task-hierarchy'
  | 'resource-added'
  | 'resource-updated'
  | 'resource-removed'
  | 'manual-quantity'
  | 'full-refresh';

export interface GanttTaskUpdatedEventDetail {
  taskId: string;
  reason: UpdateReason;
  revision: number;
}

export interface GanttResourceAssignmentUpdatedEventDetail {
  taskId: string;
  assignmentId: string;
  revision: number;
}

export interface GanttChange {
  projectId: string | null;
  revision: number;
  reason: GanttChangeReason;
  taskId?: string;
  data: GanttData;
}

/** Compact project information emitted for host-owned status bars and footers. */
export interface GanttProjectSummary {
  /** Earliest task start, or null when the project has no tasks. */
  start: string | null;
  /** Latest task finish, or null when the project has no tasks. */
  end: string | null;
  /** Inclusive calendar duration between `start` and `end`. */
  durationDays: number;
  /** Inclusive project duration after excluding configured non-working days. */
  workingDurationDays: number;
  /** Date used to determine overdue tasks. */
  referenceDate: string;
  /** Number of normal tasks, excluding phases and milestones. */
  taskCount: number;
  phaseCount: number;
  milestoneCount: number;
  /** Duration-weighted progress of normal tasks and milestones, from 0 to 100. */
  progress: number;
  /** Incomplete work whose finish date falls before `referenceDate`. */
  overdueTaskCount: number;
  /** Nearest finish date among incomplete work that is not yet overdue. */
  nextDueDate: string | null;
  /** Sum of own task and resource costs; parent summaries are not counted twice. */
  totalCost: number;
  /** Total planned cost, using `plannedCost` when supplied. */
  plannedCost: number;
  /** Total actual cost supplied through `actualCost`. */
  actualCost: number;
  /** Actual minus planned cost. A positive amount is over budget. */
  costVariance: number;
  /** Distinct assigned resources, keyed by external `resourceId` when available. */
  resourceCount: number;
  /** Sum of assigned resource quantities across the planning. */
  totalResourceQuantity: number;
  /** Sum of configured capacity (`maxUnits`) for distinct resources. */
  totalResourceCapacity: number;
}

export interface GanttPersistenceAdapter {
  load?(projectId: string): Promise<GanttData | null>;
  save(change: GanttChange): Promise<void>;
}

export type GanttSaveHook = (change: GanttChange) => void | Promise<void>;

export interface GanttState {
  zoom: number;
  scrollLeft: number;
  scrollTop: number;
  selectedTaskId: string | null;
}
