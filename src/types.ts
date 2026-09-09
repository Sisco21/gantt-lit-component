/**
 * Public data contracts for the reusable Gantt component.
 *
 * Dates deliberately use YYYY-MM-DD strings. This avoids timezone surprises
 * when a plan is edited in a browser configured for a different timezone than
 * the server that stores it.
 */

export type TaskType = 'task' | 'parent' | 'milestone';

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
  unit?: string;
  unitCost?: number;
  quantity?: number;
  quantityPerDay?: number;
  fields?: Record<string, GanttFieldValue>;
  resources?: GanttResource[];
  /** Persisted task-bar colour. A default is added automatically when the task is imported or created. */
  color?: string;
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
  unit?: string;
  unitCost: number;
  quantity: number;
  /** Calendar used to validate daily quantities and distribute totals. */
  calendarId?: string;
  /** Optional daily capacity, supplied by a resource catalogue when available. */
  maxUnits?: number;
  /** Quantities keyed by YYYY-MM-DD. A missing/zero day creates a visible gap. */
  quantityByDate?: Record<string, number>;
  totalQuantity?: number;
  cost?: number;
  metadata?: Record<string, GanttFieldValue>;
}

/** Ressource issue d'un référentiel métier externe. */
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
  /** Extra project-level data is preserved by JSON and persistence adapters. */
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

export interface GanttColumn {
  /** Built-in keys include mode, code, name, duration, start and end. */
  key: string;
  label: string;
  width: number;
  type?: 'text' | 'number' | 'date';
  editable?: boolean;
  /** A required column stays visible in the column picker. */
  required?: boolean;
  /** Set to false to hide a column initially while keeping it available in the picker. */
  visible?: boolean;
  /** Computes a display value with access to the complete task object. */
  value?: (task: GanttTask) => unknown;
  /** Formats the computed or built-in value for display. */
  format?: (value: unknown, task: GanttTask) => string;
}

/** Configures a left-side column of the resource assignment grid. */
export interface GanttResourceColumn {
  key: string;
  label: string;
  width: number;
  type?: 'text' | 'number';
  editable?: boolean;
  /** Computes a display value with access to both the assignment and its task. */
  value?: (resource: GanttResource, task: GanttTask) => unknown;
  /** Formats the computed or built-in value for display. */
  format?: (value: unknown, resource: GanttResource, task: GanttTask) => string;
  /** Maps an edited custom-cell value back to the resource assignment. */
  setValue?: (value: string, resource: GanttResource, task: GanttTask) => Partial<GanttResource> | void;
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
  task: GanttTask;
  close: () => void;
  edit: () => void;
  addTaskAfter: () => void;
  deleteTask: () => void;
  updateTask: (patch: Partial<GanttTask>) => void;
  fitToView: () => void;
}

/** Replaces the built-in task right-click menu. Return Lit content, including nested menus when needed. */
export type GanttTaskContextMenuTemplate = (context: GanttTaskContextMenuTemplateContext) => unknown;

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
  cost: string;
  totalQuantity: string;
  addResource: string;
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
  required: string;
  reset: string;
  mode: string;
  duration: string;
  totalCost: string;
  automatic: string;
  manual: string;
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

export interface GanttOptions {
  headerWidth?: number;
  /** Optional internal scroll height. Omit to let the component grow naturally. */
  maxHeight?: number | string;
  /** Maximum height of the resource grid before its own vertical scroll appears. */
  resourcesMaxHeight?: number | string;
  taskColumns?: GanttColumn[];
  /** Columns shown in the resource grid before the remove action. */
  resourceColumns?: GanttResourceColumn[];
  /** Extra content appended after the task name inside the summary bar of parent tasks. */
  summaryTemplate?: GanttSummaryTemplate;
  /** Extra content appended after the task name inside task and parent summary bars. */
  taskBarTemplate?: GanttTaskBarTemplate;
  /** Extra content appended after the name inside a regular task bar. Takes precedence over `taskBarTemplate`. */
  taskTemplate?: GanttTaskBarTemplate;
  /** Extra content appended after the name inside a phase summary bar. Takes precedence over `taskBarTemplate` and `summaryTemplate`. */
  phaseTemplate?: GanttTaskBarTemplate;
  /** Content displayed beside a milestone diamond. */
  milestoneTemplate?: GanttTaskBarTemplate;
  /** Optional local undo/redo history, including its toolbar controls and keyboard shortcuts. */
  history?: GanttHistoryOptions;
  /** Set false to disable task-bar tooltips. Defaults to true. */
  showTaskTooltips?: boolean;
  /** Replaces the content of the task-bar tooltip while keeping its positioning and visual shell. */
  taskTooltipTemplate?: GanttTaskTooltipTemplate;
  dayWidth?: number;
  minZoom?: number;
  maxZoom?: number;
  taskColors?: TaskColors;
  showToday?: boolean;
  showDependencies?: boolean;
  /** Overrides the dependency-line colour without changing other task colours. */
  dependencyColor?: string;
  /** Visual stroke used for dependency connectors. Defaults to `solid`. */
  dependencyLineStyle?: 'solid' | 'dashed';
  /** Reposition dependent tasks when data is loaded. Defaults to true. */
  autoSchedule?: boolean;
  /** Use 'external' to let the host application open its own task editor from onTaskEdit. */
  taskEditorMode?: 'built-in' | 'external';
  /** Replaces the body of the built-in editor with a host-provided Lit template. */
  taskEditorTemplate?: GanttTaskEditorTemplate;
  /** Replaces the built-in task right-click menu with host-provided content. */
  taskContextMenuTemplate?: GanttTaskContextMenuTemplate;
  /** Replaces the right-click menu displayed on an empty Gantt timeline area. */
  ganttContextMenuTemplate?: GanttTimelineContextMenuTemplate;
  /** Opens a host-owned modal or drawer when the user selects Add resource. */
  resourcePicker?: GanttResourcePicker;
  /** IETF locale used for dates, numbers and built-in labels. Defaults to navigator.language. */
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
  | 'set-data'
  | 'task-created'
  | 'task-updated'
  | 'task-deleted'
  | 'task-moved'
  | 'dependency-updated'
  | 'history-undo'
  | 'history-redo'
  | 'imported';

export interface GanttChange {
  projectId: string | null;
  revision: number;
  reason: GanttChangeReason;
  taskId?: string;
  data: GanttData;
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
