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
  color?: string;
  children?: GanttTask[];
  collapsed?: boolean;
  metadata?: Record<string, unknown>;
}

export interface GanttResource {
  id: string;
  name: string;
  type: GanttResourceType | string;
  unit?: string;
  unitCost: number;
  quantity: number;
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
  metadata?: Record<string, GanttFieldValue>;
}

/** Contrat d'intégration d'un référentiel de ressources, par exemple via une API REST. */
export interface GanttResourceProvider {
  search(query: string): Promise<GanttResourceReference[]>;
}

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

/** Text displayed by the component. Override only the entries your product needs. */
export interface GanttTranslations {
  import: string;
  exportJson: string;
  exportMspxml: string;
  exportMpp: string;
  exportMppUnavailable: string;
  saveLocal: string;
  loadLocal: string;
  addTask: string;
  delete: string;
  expandAll: string;
  collapseAll: string;
  columns: string;
  search: string;
  previousResult: string;
  nextResult: string;
  zoomOut: string;
  zoomIn: string;
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

export interface GanttOptions {
  headerWidth?: number;
  /** Optional internal scroll height. Omit to let the component grow naturally. */
  maxHeight?: number | string;
  /** Maximum height of the resource grid before its own vertical scroll appears. */
  resourcesMaxHeight?: number | string;
  taskColumns?: GanttColumn[];
  /** Columns shown in the resource grid before the remove action. */
  resourceColumns?: GanttResourceColumn[];
  /** Custom content rendered inside the summary bar of parent tasks. Defaults to the task name. */
  summaryTemplate?: GanttSummaryTemplate;
  dayWidth?: number;
  minZoom?: number;
  maxZoom?: number;
  taskColors?: TaskColors;
  showToday?: boolean;
  showDependencies?: boolean;
  /** Reposition dependent tasks when data is loaded. Defaults to true. */
  autoSchedule?: boolean;
  /** Use 'external' to let the host application open its own task editor from onTaskEdit. */
  taskEditorMode?: 'built-in' | 'external';
  /** IETF locale used for dates, numbers and built-in labels. Defaults to navigator.language. */
  locale?: string;
  /** First day of the displayed week. Uses UTC day numbers: 0 = Sunday, 1 = Monday. Defaults to 1. */
  firstDayOfWeek?: number;
  /** Display a calendar week-number row above the timeline. Defaults to false. */
  showWeekNumbers?: boolean;
  /** `first-full-week` matches Microsoft Project-like calendars; use `iso` for ISO-8601 week numbers. */
  weekNumbering?: WeekNumbering;
  /** Days to shade as non-working. Uses UTC day numbers: 0 = Sunday, 6 = Saturday. Defaults to [0, 6]. */
  nonWorkingDays?: number[];
  /** Override individual built-in labels after locale selection. */
  translations?: Partial<GanttTranslations>;
  onTaskSelect?: (taskId: string) => void;
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
