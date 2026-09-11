import '@fontsource/roboto/latin-400.css';
import '@fontsource/roboto/latin-500.css';
import '@fontsource/roboto/latin-700.css';
import { LitElement, css, html, nothing } from 'lit';
import { ifDefined } from 'lit/directives/if-defined.js';
import {
  GanttChange,
  GanttChangeReason,
  GanttCalendar,
  GanttColumn,
  GanttColumnSetting,
  GanttColumnSettings,
  GanttData,
  GanttDateHeaderTemplate,
  GanttDependency,
  GanttOptions,
  GanttPersistenceAdapter,
  GanttResource,
  GanttResourceColumn,
  GanttResourceColumnRenderContext,
  GanttResourceProvider,
  GanttResourceReference,
  GanttProjectSummary,
  GanttSaveHook,
  GanttTask,
  GanttTaskDeleteContext,
  GanttTaskDeleteSource,
  GanttTaskBarKind,
  GanttTheme,
  GanttTranslations,
  ProjectFileAdapter,
  ProjectFileFormat,
  TaskColors,
} from './types';
import {
  buildTaskTree,
  diffDays,
  formatDate,
  getDateRange,
  getVisibleTasks,
  parseDateOnly,
} from './utils';
import {
  exportProjectFile,
  importProjectFile,
  parseJson,
  stringifyJson,
  stringifyMspXml,
} from './project-codecs';
import { getBuiltInTranslations } from './translations';
import {
  calculateResourceDateWindow,
  calculateTaskGridSizing,
  clampGanttPanelHeight,
} from './gantt-layout';
import { GanttHistory } from './gantt-history';
import {
  GanttDateFormatterCache,
  alignRangeToWeeks as alignCalendarRangeToWeeks,
  getWeekNumber as calculateWeekNumber,
  getWeekStartDate as calculateWeekStartDate,
  isNonWorkingBlockStart as calculateNonWorkingBlockStart,
  isNonWorkingDay as calculateNonWorkingDay,
  isResourceWorkingDay as calculateResourceWorkingDay,
  isWeekStart as calculateWeekStart,
  normalizeFirstDayOfWeek,
} from './gantt-calendar';
import {
  distributeResourceQuantity,
  getResourceCost as calculateResourceCost,
  getResourceTotalQuantity as calculateResourceTotalQuantity,
  roundResourceQuantity,
} from './gantt-resources';
import { scheduleInitialDependencies, scheduleTaskDates } from './gantt-scheduling';
import { calculateProjectSummary } from './gantt-summary';
import { flattenTaskTree, getTaskDepths, getTaskOutlineCodes, getTaskSubtreeIds } from './gantt-task-tree';
import { calculateTaskCosts } from './gantt-task-costs';
import { expandTaskAncestors, moveTaskParent, outdentTaskBranch, removeTaskBranch, reorderTaskBranch, setParentTasksCollapsed, toggleTaskCollapsed } from './gantt-task-actions';

const ROW_HEIGHT = 42;
const HEADER_HEIGHT = 58;

/** Public component version. Keep this aligned with package.json. */
export const GANTT_COMPONENT_VERSION = '1.1.0';

type DefaultTaskColumn = Omit<GanttColumn, 'label'> & { labelKey: keyof GanttTranslations };
type DefaultResourceColumn = Omit<GanttResourceColumn, 'label'> & { labelKey: keyof GanttTranslations };

const DEFAULT_TASK_COLUMNS: DefaultTaskColumn[] = [
  { key: 'mode', labelKey: 'mode', width: 38 },
  { key: 'code', labelKey: 'code', width: 42 },
  { key: 'name', labelKey: 'name', width: 170, editable: true, required: true },
  { key: 'duration', labelKey: 'duration', width: 58, type: 'number' },
  { key: 'start', labelKey: 'start', width: 82, type: 'date' },
  { key: 'end', labelKey: 'finish', width: 82, type: 'date' },
  { key: 'costTotal', labelKey: 'totalCost', width: 78, type: 'number' },
];

const DEFAULT_RESOURCE_COLUMNS: DefaultResourceColumn[] = [
  { key: 'name', labelKey: 'name', width: 150, editable: true },
  { key: 'type', labelKey: 'type', width: 105, editable: true },
  { key: 'unit', labelKey: 'unit', width: 105, editable: true },
  { key: 'unitCost', labelKey: 'unitCost', width: 75, type: 'number', editable: true },
  { key: 'quantity', labelKey: 'quantity', width: 105, type: 'number', editable: true },
  { key: 'cost', labelKey: 'cost', width: 78, type: 'number' },
];

/**
 * Reusable Gantt Web Component.
 *
 * The component owns the visual/editor state. File formats and persistence
 * are deliberately adapters so applications can choose where the data lives.
 */
export class GanttChart extends LitElement {
  /** Version of the installed Gantt component package. */
  static readonly version = GANTT_COMPONENT_VERSION;

  /** Version exposed on the custom-element instance for diagnostics and support. */
  get version(): string { return GANTT_COMPONENT_VERSION; }

  static properties = {
    data: { type: String },
    taskColors: { attribute: 'task-colors', type: String },
    projectId: { attribute: 'project-id', type: String },
    autoSave: { attribute: 'auto-save', type: Boolean },
    theme: { type: String, reflect: true },
    visualStyle: { attribute: 'visual-style', type: String, reflect: true },
  };

  static styles = css`
    :host {
      display: block;
      min-width: 0;
      min-height: 320px;
      overflow: hidden;
      color: #172033;
      font-family: var(--gantt-font-family, Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
      font-size: var(--gantt-font-size, 13px);
      --gantt-header: #f5f7fb;
      --gantt-border: #dce2ec;
      --gantt-muted: #64748b;
      --gantt-blue: #3478d4;
      --gantt-green: #26966f;
      --gantt-red: #dc5b65;
      --gantt-row: #fff;
      --gantt-row-alt: #fbfcfe;
      --gantt-non-working-day: #f0f3f8;
      --gantt-empty-background: #fff;
      --gantt-empty-color: #64748b;
      --gantt-parent: #3478d4;
      --gantt-task: #26966f;
      --gantt-milestone: #dc5b65;
      --gantt-dependency: #3b82c4;
      --gantt-surface: #fff;
      --gantt-tooltip-background: var(--gantt-surface);
      --gantt-tooltip-border: var(--gantt-control-border);
      --gantt-tooltip-color: inherit;
      --gantt-tooltip-shadow: 0 12px 28px rgb(15 23 42 / 24%);
      --gantt-control-background: #fff;
      --gantt-control-hover: #f4f7fb;
      --gantt-control-border: #cbd5e1;
      --gantt-input-background: #fff;
      --gantt-grid-line: #edf0f5;
      --gantt-selection: #eaf2ff;
      --gantt-selection-foreground: #172033;
      --gantt-summary: #111827;
      --gantt-search-match: #fffbed;
      --gantt-search-match-foreground: #172033;
    }

    :host([theme="dark"]) {
      color: #e5edf8;
      --gantt-header: #1d293b;
      --gantt-border: #394a63;
      --gantt-muted: #aab8cf;
      --gantt-blue: #65a5ff;
      --gantt-green: #3ec58e;
      --gantt-red: #fb7185;
      --gantt-row: #121c2b;
      --gantt-row-alt: #172235;
      --gantt-non-working-day: #202d41;
      --gantt-empty-background: #121c2b;
      --gantt-empty-color: #b8c5d8;
      --gantt-parent: #65a5ff;
      --gantt-task: #3ec58e;
      --gantt-milestone: #fb7185;
      --gantt-dependency: #b987ff;
      --gantt-surface: #121c2b;
      --gantt-control-background: #1b283a;
      --gantt-control-hover: #26364c;
      --gantt-control-border: #4a5d78;
      --gantt-input-background: #111a28;
      --gantt-grid-line: #27354a;
      --gantt-selection: #2a4b72;
      --gantt-selection-foreground: #e5edf8;
      --gantt-summary: #aab8cf;
      --gantt-search-match: #3d321c;
      --gantt-search-match-foreground: #fef3c7;
    }

    /* Optional visual presets used by the demo and available to host applications. */
    :host([visual-style="material"]) {
      /* Roboto is bundled with the component; Calibri remains a safe fallback. */
      font-family: Roboto, Calibri, sans-serif;
      font-size: 13px;
    }
    :host([visual-style="material"]) .shell { border-radius: 12px; }
    :host([visual-style="material"]) .toolbar { min-height: 52px; gap: 8px; padding: 9px 11px; }
    :host([visual-style="material"]) button { border-radius: 6px; padding: 6px 10px; }
    :host([visual-style="material"]) .search-control input { min-height: 32px; border-radius: 6px; }
    :host([visual-style="material"]) .task-bar, :host([visual-style="material"]) .task-span { border-radius: 5px; }
    :host([visual-style="material"]) .task-segment { border-radius: 4px; }
    :host([visual-style="material"]) .task-column, :host([visual-style="material"]) .resource-cell.header { letter-spacing: .015em; }
    :host([visual-style="material"][theme="dark"]) .toolbar { background: #37305f; }
    :host([visual-style="material"][theme="dark"]) .task-header, :host([visual-style="material"][theme="dark"]) .timeline-header { background: #2a2550; }

    :host([visual-style="fluent"]) {
      font-family: "Segoe UI", SegoeUI, Arial, sans-serif;
      font-size: 12px;
    }
    :host([visual-style="fluent"]) .shell { border-radius: 0; box-shadow: none; }
    :host([visual-style="fluent"]) .toolbar { min-height: 40px; gap: 4px; padding: 5px 8px; }
    :host([visual-style="fluent"]) button { border-radius: 2px; padding: 5px 8px; }
    :host([visual-style="fluent"]) .search-control input { min-height: 28px; border-radius: 2px; }
    :host([visual-style="fluent"]) .task-bar, :host([visual-style="fluent"]) .task-span, :host([visual-style="fluent"]) .task-segment { border-radius: 1px; }

    :host([visual-style="dark-operations"]) .shell { border-radius: 6px; box-shadow: 0 8px 24px rgb(0 0 0 / 24%); }
    :host([visual-style="dark-operations"]) .toolbar { min-height: 46px; gap: 6px; padding: 7px 9px; }
    :host([visual-style="dark-operations"]) button { border-radius: 4px; }

    *, *::before, *::after { box-sizing: border-box; }

    .shell {
      display: flex;
      flex-direction: column;
      height: 100%;
      min-height: 0;
      overflow: hidden;
      border: 1px solid var(--gantt-border);
      border-radius: var(--gantt-corner-radius, 10px);
      background: var(--gantt-surface);
      box-shadow: var(--gantt-elevation, 0 4px 20px rgb(15 23 42 / 5%));
    }

    .toolbar { 
      flex: 0 0 auto;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--gantt-toolbar-gap, 7px);
      min-height: var(--gantt-toolbar-min-height, 48px);
      padding: var(--gantt-toolbar-padding, 8px 10px);
      border-bottom: 1px solid var(--gantt-border);
      background: var(--gantt-surface);
      position: relative;
    }

    button {
      border: 1px solid var(--gantt-control-border);
      border-radius: var(--gantt-control-radius, 6px);
      background: var(--gantt-control-background);
      color: inherit;
      cursor: pointer;
      font: inherit;
      font-size: var(--gantt-control-font-size, 12px);
      padding: var(--gantt-control-padding, 6px 9px);
    }

    button:hover { background: var(--gantt-control-hover); }
    button:focus-visible, [tabindex="0"]:focus-visible { outline: 2px solid #60a5fa; outline-offset: 2px; }
    button.primary { border-color: var(--gantt-blue); background: var(--gantt-blue); color: #fff; }
    button.danger { color: #b4232e; }

    .toolbar-separator { width: 1px; height: 22px; margin: 0 2px; background: var(--gantt-border); }
    .search-control { display: flex; align-items: center; gap: 4px; min-width: 0; }
    .search-control input { width: min(210px, 23vw); min-height: var(--gantt-search-height, 30px); border: 1px solid var(--gantt-control-border); border-radius: var(--gantt-control-radius, 6px); background: var(--gantt-input-background); color: inherit; font: inherit; font-size: var(--gantt-control-font-size, 12px); padding: 4px 7px; }
    .search-control output { min-width: 32px; color: var(--gantt-muted); font-size: 11px; text-align: center; }
    .zoom { display: flex; align-items: center; gap: 5px; margin-left: auto; color: var(--gantt-muted); font-size: 12px; }
    .status { flex-basis: 100%; min-height: 16px; color: var(--gantt-muted); font-size: 11px; }
    .status.error { color: #b4232e; }
    .status.success { color: #16805c; }

    .split-viewport { display: flex; flex: 1 1 auto; flex-direction: column; min-width: 0; min-height: 0; position: relative; }
    /* Le Gantt possède son défilement vertical. Les deux panneaux ci-dessous
       conservent chacun leur propre défilement horizontal. */
    /* Both panes share the available component height. The planning grid can shrink
       on compact viewports so the selected task's resources always retain a usable row. */
    .gantt-panel { display: flex; flex: 0 1 var(--gantt-panel-height, 440px); flex-direction: column; min-width: 0; min-height: 140px; overflow: hidden; }
    .gantt-viewport { flex: 1 1 auto; min-height: 0; overflow-x: hidden; overflow-y: auto; position: relative; overscroll-behavior: contain; }
    .resources-viewport { flex: 1 1 var(--resources-panel-height, 260px); height: auto; min-height: 132px; overflow: hidden; position: relative; overscroll-behavior: contain; }

    .gantt-layout {
      position: relative;
      display: grid;
      grid-template-columns: var(--header-width) minmax(var(--min-timeline-width, 160px), 1fr);
      grid-template-rows: var(--timeline-header-height, ${HEADER_HEIGHT}px) auto;
      width: 100%;
      min-width: 0;
      min-height: 100%;
      box-sizing: border-box;
      padding-bottom: 18px;
      align-items: start;
    }

    .task-pane { grid-column: 1; grid-row: 2; min-width: 0; overflow-x: auto; overflow-y: clip; scrollbar-width: none; }
    .task-content { position: relative; width: 100%; min-width: var(--task-columns-width); }
    .timeline-pane { grid-column: 2; grid-row: 2; min-width: 0; position: relative; overflow: hidden; }
    .timeline-scroll { width: 100%; overflow-x: auto; overflow-y: clip; scrollbar-width: none; }
    .timeline-scroll.pan-enabled { cursor: grab; touch-action: none; }
    .timeline-scroll.panning { cursor: grabbing; user-select: none; }
    .timeline-content { position: relative; min-height: 100%; min-width: 100%; }
    .task-pane::-webkit-scrollbar, .timeline-scroll::-webkit-scrollbar { height: 0; width: 0; }

    /* This reserved rail is outside the scrollable area, so the resources splitter
       cannot overlap the Gantt horizontal scrollbar when the panel is compact. */
    .gantt-scrollbar-dock {
      flex: 0 0 18px;
      display: grid;
      grid-template-columns: var(--header-width) minmax(var(--min-timeline-width, 160px), 1fr);
      width: 100%;
      height: 18px;
      background: var(--gantt-header);
      border-top: 1px solid var(--gantt-border);
    }
    .gantt-horizontal-scroll { min-width: 0; overflow-x: auto; overflow-y: hidden; }
    .gantt-horizontal-scroll + .gantt-horizontal-scroll { border-left: 1px solid var(--gantt-border); }
    .gantt-scroll-spacer { height: 1px; width: 100%; min-width: var(--task-columns-width); }
    .gantt-scroll-spacer.timeline { min-width: var(--timeline-width); }

    .gantt-grid {
      position: relative;
      display: grid;
      grid-template-columns: var(--header-width) var(--timeline-width);
      width: calc(var(--header-width) + var(--timeline-width));
      min-width: 100%;
    }

    .task-header, .timeline-header {
      position: sticky;
      top: 0;
      z-index: 30;
      height: var(--timeline-header-height, ${HEADER_HEIGHT}px);
      border-bottom: 1px solid var(--gantt-border);
      background: var(--gantt-header);
    }

    .task-header {
      grid-column: 1;
      grid-row: 1;
      left: 0;
      overflow: hidden;
      border-right: 1px solid var(--gantt-border);
    }

    .task-columns, .task-cells { display: flex; width: max-content; min-width: 100%; }
    .task-columns { height: 100%; align-items: end; padding-bottom: 8px; }
    .task-column, .task-cell { flex: 0 0 auto; overflow: hidden; border-right: 1px solid var(--gantt-grid-line); }
    .task-column { position: relative; display: flex; align-items: center; gap: 3px; padding: 0 5px; color: var(--gantt-muted); font-size: 10px; font-weight: 700; }
    .task-column-label { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .column-drag-handle { display: inline-flex; flex: 0 0 auto; align-items: center; justify-content: center; width: 15px; height: 20px; margin-left: -3px; border-radius: 3px; color: var(--gantt-muted); cursor: grab; opacity: 0; pointer-events: none; transition: opacity 160ms ease, color 160ms ease, background-color 160ms ease; }
    .task-column:hover .column-drag-handle, .task-column:focus-within .column-drag-handle, .resource-column-header:hover .column-drag-handle, .resource-column-header:focus-within .column-drag-handle { opacity: .82; pointer-events: auto; }
    .column-drag-handle:hover, .column-drag-handle:focus-visible { background: var(--gantt-control-hover); color: var(--gantt-blue); opacity: 1; outline: 1px solid var(--gantt-control-border); outline-offset: 1px; }
    .column-drag-handle:active { cursor: grabbing; }
    .column-drag-handle svg { width: 10px; height: 14px; fill: currentColor; }
    .task-column-resizer { position: absolute; top: -8px; right: -3px; z-index: 3; width: 6px; height: 36px; cursor: col-resize; touch-action: none; }
    .task-column-resizer:hover, .task-column-resizer:focus-visible { background: rgb(52 120 212 / 22%); outline: 0; }
    .column-menu-wrapper { position: relative; }
    .column-menu { position: absolute; top: calc(100% + 6px); left: 0; z-index: 80; width: 292px; max-height: min(440px, 70vh); overflow: auto; padding: 8px; border: 1px solid var(--gantt-control-border); border-radius: 8px; background: var(--gantt-surface); box-shadow: 0 8px 24px rgb(15 23 42 / 18%); }
    .column-menu strong { display: block; margin: 2px 3px 7px; color: inherit; font-size: 12px; }
    .column-menu-section + .column-menu-section { margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--gantt-border); }
    .column-menu-section > span { display: block; margin: 0 3px 4px; color: var(--gantt-muted); font-size: 10px; font-weight: 700; text-transform: uppercase; }
    .column-menu label { display: flex; align-items: center; gap: 7px; min-height: 27px; padding: 2px 3px; color: inherit; font-size: 12px; }
    .column-menu label.required { color: var(--gantt-muted); }
    .column-menu small { margin-left: auto; color: var(--gantt-muted); font-size: 10px; }
    .column-menu label > span { min-width: 0; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .column-menu label button { min-width: 24px; min-height: 23px; padding: 0 5px; }
    .column-menu-range { display: grid; grid-template-columns: 1fr auto; align-items: center; gap: 5px 8px; padding: 3px; }
    .column-menu-range label { grid-column: 1 / -1; min-height: auto; padding: 0; font-weight: 600; }
    .column-menu-range input { width: 100%; }
    .column-menu-range output { min-width: 38px; color: var(--gantt-muted); font-size: 11px; font-variant-numeric: tabular-nums; text-align: right; }
    .column-menu-actions { display: flex; justify-content: flex-end; margin-top: 7px; padding-top: 7px; border-top: 1px solid var(--gantt-border); }

    .timeline-header { grid-column: 2; grid-row: 1; left: 0; overflow: hidden; }
    .timeline-header .weeks, .timeline-header .months, .timeline-header .days { display: flex; width: 100%; min-width: var(--timeline-width); }
    .timeline-header .weeks { height: 20px; border-bottom: 2px solid var(--gantt-border); }
    .timeline-header .months { height: 29px; border-bottom: 1px solid var(--gantt-border); }
    .timeline-header .days { height: 29px; }
    .timeline-header.with-weeks .months, .timeline-header.with-weeks .days { height: 28px; }
    .week, .month, .day { flex: 0 0 auto; overflow: hidden; border-right: 1px solid var(--gantt-grid-line); color: var(--gantt-muted); text-align: center; }
    /* The 2px divider is painted after the seven day cells, not inside their width. */
    .week { position: relative; overflow: visible; padding: 4px 4px 0; border-right: 0; background: color-mix(in srgb, var(--gantt-header) 76%, var(--gantt-border)); font-size: 10px; font-weight: 700; }
    .week::after { position: absolute; top: 0; right: -2px; bottom: 0; z-index: 1; width: 2px; content: ''; background: var(--gantt-border); }
    .month { padding: 7px 4px 4px; font-size: 11px; font-weight: 700; text-transform: capitalize; }
    .day { box-sizing: border-box; padding: 7px 1px 0; font-size: 10px; white-space: nowrap; }
    .day.weekend { background: var(--gantt-non-working-day); }
    .day.non-working-start { border-left: 2px solid var(--gantt-border); }
    /* The first day of a week uses the same strong delimiter as the week header. */
    .day.week-start { border-left: 2px solid var(--gantt-border); }

    .task-row, .timeline-row {
      position: absolute;
      left: 0;
      height: var(--task-row-height, ${ROW_HEIGHT}px);
      border-bottom: 1px solid var(--gantt-grid-line);
      background-color: var(--gantt-row);
    }

    .task-row { z-index: 5; width: 100%; overflow: hidden; border-right: 1px solid var(--gantt-border); cursor: pointer; }
    .task-row.read-only { cursor: default; }
    .task-row.alt, .timeline-row.alt { background-color: var(--gantt-row-alt); }
    .task-row:hover, .task-row.selected { background-color: var(--gantt-selection); color: var(--gantt-selection-foreground); }
    .task-row.drop-inside { box-shadow: inset 0 0 0 2px #60a5fa; }
    .task-row.drop-outdent { box-shadow: inset 4px 0 0 #60a5fa, inset 0 0 0 1px #60a5fa; }
    .task-row.drop-before::before, .task-row.drop-after::after { position: absolute; right: 0; left: 0; z-index: 6; height: 2px; content: ''; background: #60a5fa; pointer-events: none; }
    .task-row.drop-before::before { top: -1px; }
    .task-row.drop-after::after { bottom: -1px; }
    .task-row.search-match, .timeline-row.search-match { background-color: var(--gantt-search-match); color: var(--gantt-search-match-foreground); }
    .task-row.search-current { box-shadow: inset 3px 0 0 #d99714; }
    .task-cells { height: 100%; align-items: center; }
    .task-cell { display: flex; align-items: center; height: 100%; padding: 0 5px; color: inherit; font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
    .task-cell.name { position: relative; }
    .task-cell.number { justify-content: flex-end; text-align: right; }
    .task-cell.parent { font-weight: 700; }
    .task-cell.tone-positive { color: var(--gantt-green); font-weight: 700; }
    .task-cell.tone-negative { color: var(--gantt-red); font-weight: 700; }
    .task-row .toggle { position: absolute; left: 2px; top: 0; z-index: 2; display: flex; align-items: center; justify-content: center; width: 19px; height: 100%; padding: 0; border: 0; background: transparent; color: var(--gantt-muted); font-size: 11px; }
    .task-row .toggle:disabled { cursor: default; }
    .task-cell.name .task-name { display: block; flex: 1 1 auto; min-width: 0; overflow: hidden; padding-right: 24px; padding-left: 19px; text-overflow: ellipsis; white-space: nowrap; }
    .task-focus { position: absolute; top: 50%; right: 3px; display: flex; align-items: center; justify-content: center; width: 21px; height: 21px; padding: 0; border: 1px solid transparent; border-radius: 4px; background: transparent; color: var(--gantt-muted); transform: translateY(-50%); }
    .task-focus:hover, .task-focus:focus-visible { border-color: var(--gantt-control-border); background: var(--gantt-control-hover); color: var(--gantt-blue); outline: 0; }
    .task-focus svg { width: 13px; height: 13px; fill: none; stroke: currentColor; stroke-width: 1.7; }
    .timeline-row { width: 100%; overflow: hidden; background-image: repeating-linear-gradient(to right, transparent 0, transparent calc(var(--day-width) - 1px), var(--gantt-grid-line) calc(var(--day-width) - 1px), var(--gantt-grid-line) var(--day-width)); }

    /* The marker lives inside .timeline-content, below the sticky header. */
    .today-line { position: absolute; top: 0; bottom: 0; z-index: 3; width: 2px; background: var(--today-color, var(--gantt-red)); opacity: .75; pointer-events: none; }
    .today-label { position: absolute; top: 4px; left: 5px; color: var(--today-color, var(--gantt-red)); font-size: 10px; font-weight: 700; white-space: nowrap; }
    .task-bar { position: absolute; top: 50%; z-index: 4; height: var(--task-bar-height); border-radius: var(--gantt-bar-radius, 5px); background: var(--bar-color); box-shadow: inset 0 -2px rgb(0 0 0 / 10%); color: #fff; cursor: grab; font-size: 11px; line-height: var(--task-bar-height); overflow: hidden; padding: 0 7px; text-overflow: ellipsis; transform: translateY(-50%); white-space: nowrap; }
    .task-bar:active { cursor: grabbing; }
    .task-bar.read-only, .task-work.read-only, .summary-bar.read-only { cursor: default; }
    .task-bar.selected { outline: 2px solid #1d65c1; outline-offset: 1px; }
    .task-bar.milestone { width: var(--task-milestone-size) !important; height: var(--task-milestone-size); top: 50%; transform: translateY(-50%) rotate(45deg); border-radius: 2px; padding: 0; }
    .milestone-template { position: absolute; top: 50%; z-index: 4; max-width: min(240px, calc(100% - 24px)); overflow: hidden; color: var(--milestone-color); font-size: 11px; font-weight: 700; line-height: 18px; pointer-events: none; transform: translateY(-50%); text-overflow: ellipsis; white-space: nowrap; }
    .task-work { position: absolute; top: 50%; z-index: 4; height: var(--task-bar-height); color: #fff; cursor: grab; font-size: 11px; line-height: var(--task-bar-height); transform: translateY(-50%); }
    .task-work:active { cursor: grabbing; }
    .task-work.selected { outline: 2px solid #1d65c1; outline-offset: 1px; }
    .task-work-label { position: absolute; top: 0; right: 7px; left: 7px; z-index: 5; min-width: 0; overflow: hidden; color: #fff; pointer-events: none; text-overflow: ellipsis; text-shadow: 0 1px 1px rgb(15 23 42 / 65%); white-space: nowrap; }
    .task-span { position: absolute; inset: 0; border: 1px dashed var(--bar-color); border-radius: var(--gantt-bar-radius, 5px); background: color-mix(in srgb, var(--bar-color) 18%, transparent); }
    .task-segment { position: absolute; top: 0; height: 100%; overflow: hidden; border-radius: var(--gantt-bar-radius, 4px); background: var(--bar-color); box-shadow: inset 0 -2px rgb(0 0 0 / 10%); padding: 0 7px; white-space: nowrap; }
    .task-segment-progress { position: absolute; inset: 0 auto 0 0; width: var(--segment-progress); background: rgb(0 0 0 / 22%); pointer-events: none; }
    .summary-bar { position: absolute; top: 50%; z-index: 4; height: 15px; border-top: 2px solid var(--summary-color, var(--gantt-summary)); color: var(--summary-color, var(--gantt-summary)); cursor: grab; overflow: visible; transform: translateY(-50%); }
    .summary-cap { position: absolute; top: -2px; width: 2px; height: 9px; background: var(--summary-color, var(--gantt-summary)); }
    .summary-cap.start { left: 0; }
    .summary-cap.end { right: 0; }
    .summary-label { position: absolute; top: 3px; left: 4px; display: block; max-width: calc(100% - 8px); overflow: hidden; background: var(--gantt-surface); color: inherit; font-size: 10px; font-weight: 700; line-height: 12px; padding: 0 2px; text-overflow: ellipsis; white-space: nowrap; }
    .progress-fill { position: absolute; inset: 0 auto 0 0; width: var(--progress); background: rgb(0 0 0 / 20%); pointer-events: none; }
    .bar-label { position: relative; z-index: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .task-bar-template, .summary-template { position: relative; z-index: 1; display: inline; min-width: 0; overflow: hidden; white-space: nowrap; }
    .task-bar-template::before, .summary-template::before { content: ' · '; opacity: .78; }
    .resize-handle { position: absolute; top: 0; bottom: 0; z-index: 8; width: 10px; cursor: ew-resize; }
    .resize-handle::after { position: absolute; top: 5px; bottom: 5px; width: 2px; content: ''; border-radius: 2px; background: rgb(255 255 255 / 80%); box-shadow: 0 0 0 1px rgb(15 23 42 / 18%); }
    .resize-handle.start::after { left: 3px; }
    .resize-handle.end::after { right: 3px; }
    .resize-handle.start { left: 0; }
    .resize-handle.end { right: 0; }
    .task-tooltip { position: fixed; z-index: 95; box-sizing: border-box; max-width: min(330px, calc(100vw - 16px)); padding: 10px 12px; border: 1px solid var(--gantt-tooltip-border); border-radius: 8px; background: var(--gantt-tooltip-background); color: var(--gantt-tooltip-color); box-shadow: var(--gantt-tooltip-shadow); font-size: 12px; line-height: 1.35; pointer-events: none; }
    .task-tooltip-title { display: flex; align-items: center; gap: 8px; min-width: 0; font-weight: 700; }
    .task-tooltip-title > span:last-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .task-tooltip-accent { flex: 0 0 auto; width: 8px; height: 8px; border-radius: 50%; background: var(--tooltip-color); box-shadow: 0 0 0 2px color-mix(in srgb, var(--tooltip-color) 22%, transparent); }
    .task-tooltip-details { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 4px 14px; margin-top: 9px; color: var(--gantt-muted); font-size: 11px; }
    .task-tooltip-details strong { color: inherit; font-weight: 700; text-align: right; }
    .task-tooltip-resources { display: flex; gap: 6px; margin-top: 9px; padding-top: 8px; border-top: 1px solid var(--gantt-border); color: var(--gantt-muted); font-size: 11px; }
    .task-tooltip-resources strong { flex: 0 0 auto; color: inherit; }
    .task-tooltip-resources span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

    .non-working-day-band { position: absolute; top: 0; bottom: 0; z-index: 2; border-left: 1px solid rgb(148 163 184 / 20%); background: var(--gantt-non-working-day); pointer-events: none; }
    .non-working-day-band.non-working-start { border-left: 2px solid var(--gantt-border); }
    /* Week boundaries continue through the grid, including after the weekend band. */
    .week-divider { position: absolute; top: 0; bottom: 0; z-index: 3; width: 0; border-left: 2px solid var(--gantt-border); pointer-events: none; }
    .dependency-layer { position: absolute; inset: 0 auto auto 0; z-index: 20; width: var(--timeline-width); height: var(--rows-height); pointer-events: none; overflow: visible; }
    .dependency-connector, .dependency-line, .dependency-dot, .dependency-arrow { position: absolute; }
    .dependency-connector { inset: 0; }
    .dependency-line.horizontal { height: 0; border-top: 2px var(--dependency-line-style, solid) var(--dependency-color, #3b82c4); }
    .dependency-line.vertical { width: 0; border-left: 2px var(--dependency-line-style, solid) var(--dependency-color, #3b82c4); }
    .dependency-dot { width: 7px; height: 7px; border: 2px solid var(--dependency-color, #3b82c4); border-radius: 50%; background: var(--gantt-surface); transform: translate(-3.5px, -3.5px); }
    .dependency-arrow { width: 0; height: 0; border-top: 6px solid transparent; border-bottom: 6px solid transparent; transform: translateY(-5px); }
    .dependency-arrow.right { border-left: 8px solid var(--dependency-color, #3b82c4); }
    .column-resizer { position: absolute; top: 0; bottom: 0; left: calc(var(--header-width) - 3px); z-index: 35; width: 6px; cursor: col-resize; touch-action: none; }
    .column-resizer::before, .resource-grid-splitter::before { position: absolute; top: 0; bottom: 0; left: 2px; width: 2px; content: ''; background: var(--gantt-control-border); opacity: .72; }
    .column-resizer::after, .resource-grid-splitter::after { position: absolute; top: 50%; left: 1px; width: 4px; height: 46px; border-radius: 2px; background: var(--gantt-control-border); box-shadow: 0 0 0 1px var(--gantt-surface); content: ''; opacity: .88; transform: translateY(-50%); }
    .column-resizer:hover, .column-resizer:focus-visible, .resource-grid-splitter:hover, .resource-grid-splitter:focus-visible { background: rgb(52 120 212 / 18%); outline: 0; }
    .column-resizer:hover::before, .column-resizer:focus-visible::before, .resource-grid-splitter:hover::before, .resource-grid-splitter:focus-visible::before { background: var(--gantt-blue); opacity: 1; }
    .column-resizer:hover::after, .column-resizer:focus-visible::after, .resource-grid-splitter:hover::after, .resource-grid-splitter:focus-visible::after { background: var(--gantt-blue); opacity: 1; }
    .empty { position: relative; z-index: 6; min-height: 100%; padding: 40px; background: var(--gantt-empty-background); color: var(--gantt-empty-color); text-align: center; }

    .resources-panel { display: grid; grid-template-columns: var(--header-width) minmax(var(--min-timeline-width, 160px), 1fr); grid-template-rows: auto minmax(0, 1fr) 18px; width: 100%; min-width: 0; height: 100%; border-top: 2px solid var(--gantt-border); background: var(--gantt-surface); }
    .resources-title { grid-column: 1 / -1; padding: 9px 12px; border-bottom: 1px solid var(--gantt-border); color: inherit; font-size: 12px; font-weight: 700; }
    .resource-resizer { flex: 0 0 8px; width: 100%; min-width: 280px; height: 8px; border-top: 1px solid var(--gantt-control-border); border-bottom: 1px solid var(--gantt-border); background: var(--gantt-header); cursor: row-resize; touch-action: none; }
    .resource-resizer:hover, .resource-resizer:focus-visible { background: #dbeafe; outline: 0; }
    .resource-context-backdrop { position: fixed; inset: 0; z-index: 90; pointer-events: none; }
    .resource-context-menu { position: fixed; z-index: 91; min-width: 190px; padding: 5px; border: 1px solid var(--gantt-control-border); border-radius: 6px; background: var(--gantt-surface); box-shadow: 0 8px 24px rgb(15 23 42 / 18%); }
    .resource-context-menu button { width: 100%; border: 0; text-align: left; }
    .task-context-menu { position: fixed; z-index: 91; box-sizing: border-box; width: var(--gantt-context-menu-width, 160px); min-width: 0; max-width: min(320px, calc(100vw - 16px)); padding: 5px; border: 1px solid var(--gantt-control-border); border-radius: 6px; background: var(--gantt-surface); box-shadow: 0 8px 24px rgb(15 23 42 / 18%); overflow: visible; }
    .task-context-menu > button, .gantt-context-submenu-trigger { width: 100%; min-width: 0; overflow-wrap: anywhere; border: 0; text-align: left; white-space: normal; }
    .gantt-context-submenu { position: relative; }
    .gantt-context-submenu-trigger { display: flex; justify-content: space-between; gap: 16px; }
    .gantt-context-submenu-panel { position: absolute; top: -5px; left: 100%; display: none; box-sizing: border-box; width: var(--gantt-context-submenu-width, 160px); padding: 5px; border: 1px solid var(--gantt-control-border); border-radius: 6px; background: var(--gantt-surface); box-shadow: 0 8px 24px rgb(15 23 42 / 18%); }
    .gantt-context-submenu-panel button { width: 100%; overflow-wrap: anywhere; border: 0; text-align: left; white-space: normal; }
    .gantt-context-submenu:hover .gantt-context-submenu-panel, .gantt-context-submenu:focus-within .gantt-context-submenu-panel, .gantt-context-submenu.open .gantt-context-submenu-panel { display: block; }
    .task-editor-backdrop { position: fixed; inset: 0; z-index: 100; background: rgb(15 23 42 / 28%); }
    .task-editor-dialog { position: fixed; top: 50%; left: 50%; z-index: 101; display: flex; flex-direction: column; width: min(760px, calc(100vw - 32px)); max-height: min(690px, calc(100vh - 32px)); overflow: hidden; border: 1px solid var(--gantt-control-border); border-radius: 10px; background: var(--gantt-surface); box-shadow: 0 20px 50px rgb(15 23 42 / 28%); transform: translate(-50%, -50%); }
    .resource-picker-backdrop { position: fixed; inset: 0; z-index: 102; background: rgb(15 23 42 / 28%); }
    .resource-picker-dialog { position: fixed; top: 50%; left: 50%; z-index: 103; display: flex; flex-direction: column; width: min(580px, calc(100vw - 32px)); max-height: min(620px, calc(100vh - 32px)); overflow: hidden; border: 1px solid var(--gantt-control-border); border-radius: 10px; background: var(--gantt-surface); box-shadow: 0 20px 50px rgb(15 23 42 / 28%); transform: translate(-50%, -50%); }
    .resource-picker-body { display: grid; gap: 12px; min-height: 0; overflow: auto; padding: 16px; }
    .task-editor-header { display: flex; align-items: center; gap: 12px; padding: 13px 16px; border-bottom: 1px solid var(--gantt-border); }
    .task-editor-header strong { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .task-editor-header button { margin-left: auto; }
    .task-editor-tabs { display: flex; gap: 2px; padding: 7px 12px 0; border-bottom: 1px solid var(--gantt-border); background: var(--gantt-header); }
    .task-editor-tab { border: 0; border-radius: 6px 6px 0 0; background: transparent; color: var(--gantt-muted); font-size: 12px; font-weight: 700; }
    .task-editor-tab.active { color: var(--gantt-blue); background: var(--gantt-surface); box-shadow: inset 0 2px var(--gantt-blue); }
    .task-editor-body { min-height: 0; overflow: auto; padding: 16px; }
    .task-editor-form { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
    .task-editor-form label, .reference-search label { display: flex; flex-direction: column; gap: 4px; color: var(--gantt-muted); font-size: 11px; font-weight: 700; }
    .task-editor-form input, .task-editor-form select, .reference-search input, .link-add select { min-height: 31px; border: 1px solid var(--gantt-control-border); border-radius: 5px; background: var(--gantt-input-background); color: inherit; font: inherit; font-size: 12px; padding: 4px 7px; }
    .task-editor-template { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
    .task-editor-template label { display: flex; flex-direction: column; gap: 4px; color: var(--gantt-muted); font-size: 11px; font-weight: 700; }
    .task-editor-template input, .task-editor-template select { min-height: 31px; border: 1px solid var(--gantt-control-border); border-radius: 5px; background: var(--gantt-input-background); color: inherit; font: inherit; font-size: 12px; padding: 4px 7px; }
    .task-editor-template-actions { grid-column: 1 / -1; display: flex; justify-content: flex-end; gap: 8px; }
    .editor-section { display: flex; flex-direction: column; gap: 10px; }
    .editor-actions { display: flex; align-items: center; gap: 8px; }
    .editor-resource-list, .editor-link-list, .reference-results { display: flex; flex-direction: column; gap: 5px; }
    .editor-resource-row, .editor-link-row, .reference-result { display: flex; align-items: center; gap: 8px; min-height: 34px; padding: 6px 8px; border: 1px solid #e2e8f0; border-radius: 6px; }
    .editor-resource-row span, .editor-link-row span, .reference-result span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .editor-resource-row small, .editor-link-row small, .reference-result small { margin-left: auto; color: var(--gantt-muted); }
    .editor-resource-row button, .editor-link-row button, .reference-result button { margin-left: auto; }
    .link-add { display: grid; grid-template-columns: minmax(0, 1fr) 180px; gap: 8px; }
    .editor-empty { padding: 14px; color: var(--gantt-muted); font-size: 12px; text-align: center; }
    .resources-scroll { grid-column: 1 / -1; grid-row: 2; min-height: 0; overflow-x: hidden; overflow-y: auto; overscroll-behavior: contain; position: relative; }
    .resources-body { position: relative; display: grid; grid-template-columns: var(--header-width) minmax(var(--min-timeline-width, 160px), 1fr); grid-template-rows: var(--resource-header-height, 32px) minmax(0, 1fr); width: 100%; min-width: 0; min-height: 100%; }
    .resource-left-header { grid-column: 1; grid-row: 1; position: sticky; top: 0; z-index: 4; overflow: hidden; border-right: 1px solid var(--gantt-border); background: var(--gantt-header); }
    .resources-left { grid-column: 1; grid-row: 2; min-width: 0; min-height: 0; overflow-x: auto; overflow-y: clip; border-right: 1px solid var(--gantt-border); scrollbar-width: none; }
    .resources-grid { display: grid; grid-template-columns: var(--resource-columns-template); min-width: var(--resource-columns-width); }
    .resource-timeline { grid-column: 2; grid-row: 2; width: 100%; min-width: 0; min-height: 0; overflow-x: auto; overflow-y: clip; scrollbar-width: none; }
    .resources-left::-webkit-scrollbar, .resource-timeline::-webkit-scrollbar { height: 0; width: 0; }
    /* Référence de positionnement des jours grisés : ils restent dans la zone des dates. */
    .resource-timeline-content { position: relative; isolation: isolate; width: var(--timeline-width); min-width: 100%; min-height: 100%; }
    .resource-day-header { grid-column: 2; grid-row: 1; position: sticky; top: 0; z-index: 4; width: 100%; min-width: 0; height: 32px; overflow: hidden; border-bottom: 1px solid var(--gantt-border); background: var(--gantt-header); }
    .resource-day-header-content, .resource-day-row { position: relative; width: var(--timeline-width); min-width: 100%; height: 100%; }
    .resource-day-window { position: absolute; top: 0; z-index: 4; display: flex; height: 100%; }
    .resource-day, .resource-day-input { flex: 0 0 var(--day-width); width: var(--day-width); border-right: 1px solid var(--gantt-grid-line); }
    .resource-day { box-sizing: border-box; padding: 8px 1px 0; color: var(--gantt-muted); font-size: 10px; text-align: center; white-space: nowrap; }
    .resource-day.week-date { flex: 0 0 auto; }
    .resource-day.weekend { background: var(--gantt-non-working-day); }
    .resource-day.non-working-start { border-left: 2px solid var(--gantt-border); }
    .resource-day.week-start { border-left: 2px solid var(--gantt-border); }
    .resource-day-row { height: 32px; border-bottom: 1px solid var(--gantt-grid-line); }
    .resource-day-row:nth-child(even) { background-color: var(--gantt-row-alt); }
    .resource-calendar-closed { position: absolute; top: 0; bottom: 0; z-index: 3; border-left: 1px solid rgb(148 163 184 / 20%); background: var(--gantt-non-working-day); pointer-events: none; }
    .resource-calendar-closed.non-working-start { border-left: 2px solid var(--gantt-border); }
    .resource-week-divider { position: absolute; top: 0; bottom: 0; z-index: 5; width: 0; border-left: 2px solid var(--gantt-border); pointer-events: none; }
    .resource-day-input { min-width: 0; padding: 2px 1px; appearance: textfield; border-top: 0; border-bottom: 0; border-left: 0; background: transparent; color: inherit; font: inherit; font-size: 12px; line-height: 24px; text-align: center; }
    .resource-day-input::-webkit-inner-spin-button, .resource-day-input::-webkit-outer-spin-button { margin: 0; appearance: none; }
    .resource-day-input:disabled:not(.calendar-closed) { background: var(--gantt-header); }
    .resource-day-input.calendar-closed { background: transparent; color: var(--gantt-muted); cursor: not-allowed; opacity: 1; }
    .resource-day-input:focus { outline: 2px solid #60a5fa; outline-offset: -2px; background: var(--gantt-input-background); }
    .resource-cell { box-sizing: border-box; height: 32px; min-height: 32px; padding: 4px 8px; border-right: 1px solid var(--gantt-grid-line); border-bottom: 1px solid var(--gantt-grid-line); font-size: 11px; }
    .resource-cell.header { background: var(--gantt-header); color: var(--gantt-muted); font-size: 10px; font-weight: 700; }
    .resource-column-header { position: relative; display: flex; align-items: center; gap: 3px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .resource-column-header .column-drag-handle { height: 21px; }
    .resource-column-resizer { position: absolute; top: 0; right: -3px; z-index: 3; width: 6px; height: 100%; cursor: col-resize; touch-action: none; }
    .resource-column-resizer:hover, .resource-column-resizer:focus-visible { background: rgb(52 120 212 / 22%); outline: 0; }
    .resource-grid-splitter { position: absolute; top: 0; bottom: 0; left: calc(var(--header-width) - 3px); z-index: 35; width: 6px; cursor: col-resize; touch-action: none; }
    .resource-cell.resource-action { display: flex; align-items: center; justify-content: center; padding-inline: 4px; }
    .resources-scrollbar-dock { grid-column: 1 / -1; grid-row: 3; display: grid; grid-template-columns: var(--header-width) minmax(var(--min-timeline-width, 160px), 1fr); min-width: 0; height: 18px; border-top: 1px solid var(--gantt-border); background: var(--gantt-header); }
    .resource-horizontal-scroll { min-width: 0; overflow-x: auto; overflow-y: hidden; }
    .resource-horizontal-scroll + .resource-horizontal-scroll { border-left: 1px solid var(--gantt-border); }
    .resource-scroll-spacer { height: 1px; width: 100%; min-width: var(--resource-columns-width); }
    .resource-scroll-spacer.timeline { min-width: var(--timeline-width); }
    .resource-cell input, .resource-cell select { width: 100%; min-height: 21px; border: 1px solid var(--gantt-control-border); border-radius: 3px; background: var(--gantt-input-background); color: inherit; font: inherit; font-size: 11px; padding: 2px 4px; }
    /* Native number steppers reserve width even for decimal fields configured with
       step="any". Hide them in the dense resource grid; typing and keyboard arrows
       still honour each column's configured min/step. */
    .resource-cell input[type="number"] { appearance: textfield; }
    .resource-cell input[type="number"]::-webkit-inner-spin-button, .resource-cell input[type="number"]::-webkit-outer-spin-button { margin: 0; appearance: none; }
    .resource-cell.numeric { text-align: right; }
    .resource-cell.total input { text-align: right; }
    .resource-add { margin: 8px 10px; }

    .task-editor { grid-column: 1 / -1; display: grid; grid-template-columns: repeat(7, minmax(130px, 1fr)); gap: 8px; padding: 8px 10px; border-bottom: 1px solid var(--gantt-border); }
    .task-editor label { display: flex; flex-direction: column; gap: 3px; color: var(--gantt-muted); font-size: 10px; font-weight: 700; }
    .task-editor input, .task-editor select { min-height: 25px; border: 1px solid #cbd5e1; border-radius: 4px; background: #fff; font: inherit; font-size: 11px; padding: 3px 5px; }
    .task-links { grid-column: 1 / -1; display: flex; flex-wrap: wrap; align-items: center; gap: 6px; padding: 7px 10px; border-bottom: 1px solid var(--gantt-border); color: var(--gantt-muted); font-size: 11px; }
    .task-links select { min-height: 25px; max-width: 280px; border: 1px solid #cbd5e1; border-radius: 4px; background: #fff; font: inherit; font-size: 11px; padding: 3px 5px; }
    .link-chip { display: inline-flex; align-items: center; gap: 4px; padding: 3px 6px; border: 1px solid #c9d9ee; border-radius: 10px; background: #eff6ff; color: #23558b; }
    .link-chip button { border: 0; padding: 0 2px; background: transparent; color: #23558b; font-size: 12px; }

    @media (max-width: 720px) {
      .zoom { margin-left: 0; }
      .toolbar-separator { display: none; }
      .task-editor-form, .link-add { grid-template-columns: 1fr; }
    }
  `;

  declare data: string;
  declare taskColors: string;
  declare projectId: string;
  declare autoSave: boolean;
  declare theme: GanttTheme;
  declare visualStyle: string;

  projectFileAdapter?: ProjectFileAdapter;
  persistenceAdapter?: GanttPersistenceAdapter;
  saveHook?: GanttSaveHook;
  /** Connect this provider to a resource-catalogue API when one is available. */
  resourceProvider?: GanttResourceProvider;
  private _options: GanttOptions = {};

  get options(): GanttOptions { return this._options; }
  set options(value: GanttOptions) {
    const historyWasEnabled = this.isHistoryEnabled();
    this._options = value || {};
    this.numberFormatter = undefined;
    if (!this.isHistoryEnabled()) this.clearHistory();
    else if (!historyWasEnabled) this.resetHistory();
    else this.history.trim(this.getHistoryLimit());
    this.requestUpdate();
    this.emitProjectSummary();
  }

  private tasks: GanttTask[] = [];
  private dependencies: GanttDependency[] = [];
  private calendars: GanttCalendar[] = [];
  private projectName?: string;
  private projectMetadata?: Record<string, unknown>;
  private selectedTaskId: string | null = null;
  private readonly history = new GanttHistory<GanttData>(data => structuredClone(data), data => JSON.stringify(data));
  private historyRestoring = false;
  private zoom = 1;
  private revision = 0;
  private statusMessage = '';
  private statusKind: 'info' | 'success' | 'error' = 'info';
  private resourceContextMenu?: { taskId: string; x: number; y: number };
  private ganttContextMenu?: { x: number; y: number; date: string };
  private taskContextMenu?: { taskId: string; x: number; y: number };
  private taskContextSubmenuOpen = false;
  private taskTooltip?: { taskId: string; color: string; kind: GanttTaskBarKind; x: number; y: number };
  private taskEditorId?: string;
  private taskEditorTab: 'general' | 'resources' | 'links' = 'general';
  private taskEditorLinkType: GanttDependency['type'] = 'finish-to-start';
  private resourcePickerTaskId?: string;
  private resourceReferenceQuery = '';
  private resourceReferenceResults: GanttResourceReference[] = [];
  private resourceReferenceLoading = false;
  private resourceReferenceRequest = 0;
  private headerWidthOverride?: number;
  private taskRowHeightOverride?: number;
  private readonly taskDeletionRequests = new Set<string>();
  private readonly taskColumnVisibilityOverrides = new Map<string, boolean>();
  private readonly taskColumnWidthOverrides = new Map<string, number>();
  private readonly resourceColumnVisibilityOverrides = new Map<string, boolean>();
  private readonly resourceColumnWidthOverrides = new Map<string, number>();
  private taskColumnOrder: string[] = [];
  private resourceColumnOrder: string[] = [];
  private draggedColumn?: { scope: 'task' | 'resource'; key: string };
  private columnMenuOpen = false;
  private searchQuery = '';
  private searchResultIndex = -1;
  private ganttPanelHeight = 440;
  private resourcePanelHeight = 260;
  private splitUserResized = false;
  private draggedTaskId: string | null = null;
  private taskDropTarget?: { taskId: string; position: 'before' | 'inside' | 'after' | 'outdent' };
  private renderTaskIndex = new Map<string, GanttTask>();
  private renderTaskDepths = new Map<string, number>();
  private renderTaskCodes = new Map<string, string>();
  private renderTaskCosts = new Map<string, number>();
  private numberFormatter?: Intl.NumberFormat;
  private numberFormatterLocale = '';
  private readonly dateFormatterCache = new GanttDateFormatterCache();
  private resourceTimelineViewport = { scrollLeft: 0, width: 0 };
  private resourceTimelineDayWidth = 24;
  private ganttViewport = { scrollTop: 0, height: 0 };
  private ganttViewportFrame?: number;
  private timelineSynchronizationFrame?: number;
  private pendingTimelineSynchronization?: { scrollLeft: number; source?: HTMLElement };
  private ganttViewportResizeObserver?: ResizeObserver;
  private resourceTimelineResizeObserver?: ResizeObserver;
  private barDrag?: {
    taskId: string;
    mode: 'move' | 'resize-start' | 'resize-end';
    startX: number;
    originalStart: string;
    originalEnd: string;
    currentStart: string;
    currentEnd: string;
    baseTasks: GanttTask[];
    changed: boolean;
    initialScrollLeft: number;
    pointerX?: number;
    pendingX?: number;
    frame?: number;
    autoScrollFrame?: number;
  };
  private ganttPan?: {
    pointerId: number;
    startX: number;
    startY: number;
    timelineScrollLeft: number;
    viewportScrollTop: number;
    axis: 'horizontal' | 'both';
  };

  connectedCallback(): void {
    super.connectedCallback();
    document.addEventListener('keydown', this.handleKeyDown);
  }

  disconnectedCallback(): void {
    document.removeEventListener('keydown', this.handleKeyDown);
    this.finishBarDrag();
    this.finishGanttPan();
    if (this.ganttViewportFrame !== undefined) window.cancelAnimationFrame(this.ganttViewportFrame);
    if (this.timelineSynchronizationFrame !== undefined) window.cancelAnimationFrame(this.timelineSynchronizationFrame);
    this.ganttViewportResizeObserver?.disconnect();
    this.resourceTimelineResizeObserver?.disconnect();
    super.disconnectedCallback();
  }

  firstUpdated(): void {
    const viewport = this.renderRoot.querySelector<HTMLElement>('.gantt-viewport');
    if (viewport) {
      this.ganttViewportResizeObserver = new ResizeObserver(() => this.updateGanttViewport());
      this.ganttViewportResizeObserver.observe(viewport);
    }
    const resourceTimeline = this.renderRoot.querySelector<HTMLElement>('.resource-timeline');
    if (resourceTimeline) {
      this.resourceTimelineResizeObserver = new ResizeObserver(() => {
        this.updateResourceTimelineViewport(resourceTimeline.scrollLeft, resourceTimeline.clientWidth);
      });
      this.resourceTimelineResizeObserver.observe(resourceTimeline);
    }
  }

  updated(changed: Map<string, unknown>): void {
    if (changed.has('data') && this.data) {
      try {
        this.applyData(parseJson(this.data), 'set-data', false);
      } catch (error) {
        this.setStatus(error instanceof Error ? error.message : this.t('invalidJson'), 'error');
      }
    }
    if (changed.has('taskColors')) this.applyColors();
    if (this.taskContextMenu && this.taskContextSubmenuOpen) {
      this.renderRoot.querySelector<HTMLElement>('.gantt-context-submenu')?.classList.add('open');
    }
  }

  render() {
    const flatTasks = this.getFlatTasks();
    this.prepareRenderCaches(flatTasks);
    const visibleTasks = getVisibleTasks(this.tasks);
    const virtualRows = this.getVirtualTaskRows(visibleTasks);
    const selectedTask = this.selectedTaskId ? this.renderTaskIndex.get(this.selectedTaskId) || null : null;
    const range = this.alignRangeToWeeks(getDateRange(flatTasks));
    const totalDays = Math.max(31, diffDays(range.start, range.end) + 1);
    const dayWidth = this.getDayWidth();
    const taskRowHeight = this.getTaskRowHeight();
    const timelineWidth = totalDays * dayWidth;
    const taskColumnsWidth = this.getColumns().reduce((width, column) => width + this.getColumnWidth(column), 0);
    const taskGridSizing = this.getTaskGridSizing();
    const colors = this.getColors();
    const dependencyColor = this.options.dependencyColor || colors.dependency || 'var(--gantt-dependency)';
    const searchResultIds = this.getSearchResultIds();
    const searchMatches = new Set(searchResultIds);
    const currentSearchId = searchResultIds[this.searchResultIndex];

    return html`
      <div class="shell" @click=${this.closeOpenContextMenus} @contextmenu=${this.preventNativeContextMenu} style="--header-width:${this.getHeaderWidth(taskGridSizing)}px; --min-timeline-width:${taskGridSizing.minTimelineWidth}px; --task-columns-width:${taskColumnsWidth}px; --timeline-width:${timelineWidth}px; --day-width:${dayWidth}px; --task-row-height:${taskRowHeight}px; --task-bar-height:clamp(18px, calc(${taskRowHeight}px - 18px), 78px); --task-milestone-size:clamp(13px, calc(${taskRowHeight}px - 25px), 36px); --rows-height:${Math.max(1, visibleTasks.length) * taskRowHeight}px; --timeline-header-height:${this.getTimelineHeaderHeight()}px; --dependency-color:${dependencyColor}; --dependency-line-style:${this.options.dependencyLineStyle || 'solid'}; --gantt-panel-height:${this.getGanttPanelHeight()}; --resources-panel-height:${this.getResourcesPanelHeight()}">
        <div class="toolbar">
          <button class="primary" @click=${() => this.chooseImport('.json,.xml,.mpp')}>${this.t('import')}</button>
          <button @click=${() => this.download('json')}>${this.t('exportJson')}</button>
          <button @click=${() => this.download('mspxml')}>${this.t('exportMspxml')}</button>
          <button @click=${() => this.download('mpp')} ?disabled=${!this.projectFileAdapter} title=${this.projectFileAdapter ? this.t('exportMpp') : this.t('exportMppUnavailable')}>${this.t('exportMpp')}</button>
          <span class="toolbar-separator"></span>
          <button @click=${this.saveLocal}>💾 ${this.t('saveLocal')}</button>
          <button @click=${this.loadLocal}>↶ ${this.t('loadLocal')}</button>
          ${this.shouldShowHistoryControls() ? html`
            <button @click=${this.undo} ?disabled=${!this.canUndo}>${this.t('undo')}</button>
            <button @click=${this.redo} ?disabled=${!this.canRedo}>${this.t('redo')}</button>
          ` : nothing}
          <span class="toolbar-separator"></span>
          <button @click=${() => this.addChildTask('')}>＋ ${this.t('addTask')}</button>
          <button class="danger" @click=${this.deleteSelected} ?disabled=${!this.selectedTaskId || !this.isTaskDeletionEnabled() || this.taskDeletionRequests.has(this.selectedTaskId || '')}>${this.t('delete')}</button>
          <button @click=${this.expandAllParents}>${this.t('expandAll')}</button>
          <button @click=${this.collapseAllParents}>${this.t('collapseAll')}</button>
          ${this.isColumnSettingsEnabled() ? html`<span class="column-menu-wrapper">
            <button @click=${this.toggleColumnMenu} aria-expanded=${this.columnMenuOpen ? 'true' : 'false'}>${this.t('columns')}</button>
            ${this.renderColumnMenu()}
          </span>` : nothing}
          <span class="search-control" role="search">
            <input type="search" placeholder=${this.t('search')} .value=${this.searchQuery} @input=${this.onSearchInput} @keydown=${this.handleSearchKeydown} aria-label=${this.t('search')} />
            <button aria-label=${this.t('previousResult')} title=${this.t('previousResult')} @click=${() => this.focusSearchResult(-1)} ?disabled=${!searchResultIds.length}>←</button>
            <output aria-live="polite">${searchResultIds.length ? `${Math.max(0, this.searchResultIndex + 1)}/${searchResultIds.length}` : '0/0'}</output>
            <button aria-label=${this.t('nextResult')} title=${this.t('nextResult')} @click=${() => this.focusSearchResult(1)} ?disabled=${!searchResultIds.length}>→</button>
          </span>
          <button title=${this.t('fitTask')} @click=${() => this.fitTaskToView()} ?disabled=${!this.selectedTaskId}>${this.t('fitTask')}</button>
          <button title=${this.t('fitGantt')} @click=${this.fitGanttToView}>${this.t('fitGantt')}</button>
          <span class="zoom">
            <button aria-label=${this.t('zoomOut')} @click=${() => this.changeZoom(-.1)}>−</button>
            ${Math.round(this.zoom * 100)}%
            <button aria-label=${this.t('zoomIn')} @click=${() => this.changeZoom(.1)}>＋</button>
          </span>
            ${this.statusMessage ? html`<span class="status ${this.statusKind}">${this.statusMessage}</span>` : nothing}
          </div>
        <div class="split-viewport" @wheel=${this.handleWheel}>
          <div class="gantt-panel">
            <div class="gantt-viewport" @scroll=${this.handleGanttViewportScroll}>
            <div class="gantt-layout">
              <div class="task-header"><div class="task-columns">${this.getColumns().map(column => html`<div class="task-column" style="width:${this.getColumnWidth(column)}px" @dragover=${(event: DragEvent) => this.allowColumnDrop(event, 'task')} @drop=${(event: DragEvent) => this.dropColumn(event, 'task', column.key)}>${this.renderColumnDragHandle('task', column.key, column.label)}<span class="task-column-label">${column.label}</span>${this.canResizeColumns() ? html`<span class="task-column-resizer" role="separator" tabindex="0" aria-label=${this.tFormat('resizeColumn', { column: column.label })} @pointerdown=${(event: PointerEvent) => this.startTaskColumnResize(event, column)}></span>` : nothing}</div>`)}</div></div>
              ${this.renderTimelineHeader(range.start, totalDays, dayWidth)}
              <div class="task-pane" @scroll=${this.syncTaskHeaderScroll}>
                <div class="task-content" style="height:${Math.max(1, visibleTasks.length) * taskRowHeight}px">
                  ${visibleTasks.length ? virtualRows.rows.map(({ task, index }) => this.renderTaskRow(task, index, searchMatches, currentSearchId)) : html`<div class="empty">${this.t('noTasks')}</div>`}
                </div>
              </div>
              <div class="timeline-pane">
                <div class="timeline-scroll ${this.isGanttPanEnabled() ? 'pan-enabled' : ''}" @scroll=${this.syncTimelineHeaderScroll} @pointerdown=${this.startGanttPan}>
                  <div class="timeline-content" style="width:${timelineWidth}px; height:${Math.max(1, visibleTasks.length) * taskRowHeight}px" @contextmenu=${this.openTimelineContextMenu}>
                    ${this.renderNonWorkingDayBands(range.start, totalDays, dayWidth)}
                    ${this.renderWeekDividers(range.start, totalDays, dayWidth)}
                    ${visibleTasks.length ? virtualRows.rows.map(({ task, index }) => this.renderTimelineRow(task, index, range.start, dayWidth, searchMatches)) : html`<div class="empty">${this.t('noPlanningData')}</div>`}
                    ${this.renderDependencies(visibleTasks, this.renderTaskIndex, range.start, dayWidth, virtualRows.start, virtualRows.end)}
                    ${this.renderTodayMarker(range.start, dayWidth, totalDays)}
                  </div>
                </div>
              </div>
              ${this.options.taskGridSplitter?.enabled !== false ? html`<div class="column-resizer" role="separator" tabindex="0" aria-label=${this.t('resizeTaskGrid')} @pointerdown=${this.startColumnResize}></div>` : nothing}
            </div>
            </div>
            <div class="gantt-scrollbar-dock" aria-label=${this.t('ganttHorizontalScroll')}>
              <div class="gantt-horizontal-scroll" @scroll=${this.syncTaskGridScroll}><div class="gantt-scroll-spacer"></div></div>
              <div class="gantt-horizontal-scroll" @scroll=${this.syncTimelineGridScroll}><div class="gantt-scroll-spacer timeline"></div></div>
            </div>
          </div>
          ${selectedTask ? html`<div class="resource-resizer" role="separator" tabindex="0" aria-label=${this.t('resizeResourceGrid')} @pointerdown=${this.startResourceResize}></div>` : nothing}
          ${selectedTask ? html`<div class="resources-viewport">${this.renderResourcePanel(selectedTask, range.start, totalDays, dayWidth)}</div>` : nothing}
        </div>
        ${this.renderResourceContextMenu()}
        ${this.renderGanttContextMenu()}
        ${this.renderTaskContextMenu()}
        ${this.renderTaskTooltip()}
        ${this.renderTaskEditor()}
        ${this.renderResourcePicker()}
      </div>
    `;
  }

  setData(data: GanttData): void {
    this.applyData(data, 'set-data', true);
  }

  /** True when at least one completed local action can be undone. */
  get canUndo(): boolean { return this.isHistoryEnabled() && this.history.canUndo; }

  /** True when an undone action can be restored. */
  get canRedo(): boolean { return this.isHistoryEnabled() && this.history.canRedo; }

  /** Restores the state before the latest completed local action. */
  undo = (): boolean => {
    if (!this.canUndo) return false;
    const previous = this.history.undo();
    if (!previous) return false;
    this.restoreHistory(previous, 'history-undo');
    return true;
  };

  /** Reapplies the latest undone action. */
  redo = (): boolean => {
    if (!this.canRedo) return false;
    const next = this.history.redo(this.getHistoryLimit());
    if (!next) return false;
    this.restoreHistory(next, 'history-redo');
    return true;
  };

  /** Discards previous and future actions while keeping the current project as the new baseline. */
  clearHistory = (): void => { this.resetHistory(); };

  /** Applies view and integration options and immediately refreshes the component. */
  setOptions(options: GanttOptions): void {
    this.options = options;
  }

  /** Sets the effective task-row height (28–96 px) and persists it through columnSettings.onChange. */
  setTaskRowHeight(height: number): void {
    this.updateTaskRowHeight(height, true);
  }

  /** Fits the selected task (or an explicit task) horizontally and centres it in the Gantt. */
  fitTaskToView(taskId = this.selectedTaskId): void {
    const task = taskId ? this.findTask(taskId) : undefined;
    if (!task) return;
    this.fitDateRangeToView(task.start, task.end, task.id);
  }

  /** Fits the complete project date range into the visible timeline. */
  fitGanttToView = (): void => {
    const tasks = this.getFlatTasks();
    if (!tasks.length) return;
    const range = this.alignRangeToWeeks(getDateRange(tasks));
    this.fitDateRangeToView(formatDate(range.start), formatDate(range.end));
  };

  getData(): GanttData {
    return {
      name: this.projectName,
      tasks: this.getFlatTasks(),
      dependencies: this.dependencies.map(dependency => ({ ...dependency })),
      calendars: this.calendars.map(calendar => ({ ...calendar, workingDays: calendar.workingDays ? [...calendar.workingDays] : undefined, hours: calendar.hours ? { ...calendar.hours } : undefined, exceptions: calendar.exceptions ? { ...calendar.exceptions } : undefined })),
      metadata: this.projectMetadata ? { ...this.projectMetadata } : undefined,
    };
  }

  /** Returns the compact information emitted through `gantt-summary-changed`. */
  getProjectSummary(): GanttProjectSummary {
    const tasks = this.getFlatTasks();
    const referenceDate = this.getSummaryReferenceDate();
    return calculateProjectSummary(tasks, { referenceDate, isWorkingDay: date => !this.isNonWorkingDay(date) });
  }

  toJSON(): string { return stringifyJson(this.getData()); }
  toMSProjectXML(): string { return stringifyMspXml(this.getData()); }

  async importFile(file: File): Promise<GanttData> {
    const imported = await importProjectFile(file, this.projectFileAdapter);
    this.applyData(imported, 'imported', true);
    this.setStatus(this.tFormat('projectImported', { file: file.name }), 'success');
    return imported;
  }

  async exportFile(format: ProjectFileFormat): Promise<Blob> {
    return exportProjectFile(this.getData(), format, this.projectFileAdapter);
  }

  async loadFromPersistence(): Promise<boolean> {
    if (!this.persistenceAdapter?.load || !this.projectId) return false;
    const data = await this.persistenceAdapter.load(this.projectId);
    if (!data) return false;
    this.applyData(data, 'set-data', false);
    this.setStatus(this.t('projectLoadedFromPersistence'), 'success');
    return true;
  }

  async saveToPersistence(): Promise<void> {
    const change = this.createChange('set-data');
    const saves: Promise<void>[] = [];
    if (this.persistenceAdapter) saves.push(this.persistenceAdapter.save(change));
    if (this.saveHook) saves.push(Promise.resolve(this.saveHook(change)));
    if (!saves.length) throw new Error('No persistenceAdapter or saveHook is configured.');
    await Promise.all(saves);
    this.setStatus(this.t('projectSaved'), 'success');
  }

  saveToLocalStorage(key = this.getLocalStorageKey()): void {
    if (typeof window === 'undefined' || !window.localStorage) throw new Error('localStorage is unavailable in this environment.');
    window.localStorage.setItem(key, this.toJSON());
    this.setStatus(this.t('projectSavedLocal'), 'success');
  }

  loadFromLocalStorage(key = this.getLocalStorageKey()): boolean {
    if (typeof window === 'undefined' || !window.localStorage) throw new Error('localStorage is unavailable in this environment.');
    const raw = window.localStorage.getItem(key);
    if (!raw) return false;
    this.applyData(parseJson(raw), 'set-data', false);
    this.setStatus(this.t('projectLoadedLocal'), 'success');
    return true;
  }

  selectTask(taskId: string): void {
    const task = this.findTask(taskId);
    if (!task) return;
    this.selectedTaskId = taskId;
    this.dispatch('task-selected', { id: taskId, task });
    this.options.onTaskSelect?.(taskId, task);
    this.requestUpdate();
  }

  /** Selects a row from the left grid and brings its bar to the centre of the timeline. */
  private focusTaskFromGrid(taskId: string): void {
    this.selectTask(taskId);
    void this.updateComplete.then(() => this.scrollTaskIntoView(taskId));
  }

  toggleTask(taskId: string): void {
    this.tasks = toggleTaskCollapsed(this.tasks, taskId);
    this.requestUpdate();
  }

  private setAllParentsCollapsed(collapsed: boolean): void {
    this.tasks = setParentTasksCollapsed(this.tasks, collapsed);
    this.requestUpdate();
  }

  private expandAllParents = (): void => this.setAllParentsCollapsed(false);
  private collapseAllParents = (): void => this.setAllParentsCollapsed(true);

  private getSearchResultIds(): string[] {
    const locale = this.getLocale();
    const query = this.searchQuery.trim().toLocaleLowerCase(locale);
    if (!query) return [];
    return this.getFlatTasks().filter(task => {
      const resourceText = (task.resources || []).flatMap(resource => [resource.name, resource.type, resource.unit || '']);
      return [task.id, task.code || '', task.name, task.mode || '', ...resourceText]
        .join(' ')
        .toLocaleLowerCase(locale)
        .includes(query);
    }).map(task => task.id);
  }

  private onSearchInput = (event: Event): void => {
    this.searchQuery = (event.target as HTMLInputElement).value;
    this.searchResultIndex = -1;
    if (this.searchQuery.trim()) this.focusSearchResult(1);
    else this.requestUpdate();
  };

  private handleSearchKeydown = (event: KeyboardEvent): void => {
    if (event.key === 'Enter' || event.key === 'ArrowDown') {
      event.preventDefault();
      this.focusSearchResult(1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.focusSearchResult(-1);
    }
  };

  private focusSearchResult(offset: number): void {
    const resultIds = this.getSearchResultIds();
    if (!resultIds.length) { this.searchResultIndex = -1; this.requestUpdate(); return; }
    const initial = this.searchResultIndex < 0 ? (offset < 0 ? resultIds.length : -1) : this.searchResultIndex;
    this.searchResultIndex = (initial + offset + resultIds.length) % resultIds.length;
    const taskId = resultIds[this.searchResultIndex];
    this.expandAncestors(taskId);
    this.selectTask(taskId);
    void this.updateComplete.then(() => this.scrollTaskIntoView(taskId));
  }

  private expandAncestors(taskId: string): void {
    this.tasks = expandTaskAncestors(this.tasks, taskId);
  }

  private scrollTaskIntoView(taskId: string): void {
    const viewport = this.renderRoot.querySelector<HTMLElement>('.gantt-viewport');
    const rowIndex = getVisibleTasks(this.tasks).findIndex(task => task.id === taskId);
    if (!viewport || rowIndex < 0) return;
    const rowHeight = this.getTaskRowHeight();
    const top = this.getTimelineHeaderHeight() + rowIndex * rowHeight - (viewport.clientHeight - rowHeight) / 2;
    viewport.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });

    const task = this.findTask(taskId);
    const timeline = this.renderRoot.querySelector<HTMLElement>('.timeline-scroll');
    if (!task || !timeline) return;
    const dayWidth = this.getDayWidth();
    const range = this.alignRangeToWeeks(getDateRange(this.getFlatTasks()));
    const taskCenterX = this.dateToX(task.start, range.start, dayWidth) + (diffDays(task.start, task.end) + 1) * dayWidth / 2;
    this.scrollTimelinesTo(Math.max(0, taskCenterX - timeline.clientWidth / 2));
  }

  private fitDateRangeToView(start: string, end: string, focusTaskId?: string): void {
    const timeline = this.renderRoot.querySelector<HTMLElement>('.timeline-scroll');
    if (!timeline?.clientWidth) {
      void this.updateComplete.then(() => this.fitDateRangeToView(start, end, focusTaskId));
      return;
    }
    const dayCount = Math.max(1, diffDays(start, end) + 1);
    const horizontalPadding = 48;
    const baseDayWidth = this.options.dayWidth ?? 24;
    const targetZoom = Math.max(.05, (timeline.clientWidth - horizontalPadding) / (dayCount * baseDayWidth));
    const maxZoom = this.options.maxZoom ?? 3;
    // A fit action intentionally may go below the regular interactive minimum zoom.
    this.zoom = Math.min(maxZoom, targetZoom);
    this.requestUpdate();

    void this.updateComplete.then(() => {
      const refreshedTimeline = this.renderRoot.querySelector<HTMLElement>('.timeline-scroll');
      if (!refreshedTimeline) return;
      const range = this.alignRangeToWeeks(getDateRange(this.getFlatTasks()));
      const dayWidth = this.getDayWidth();
      const startX = this.dateToX(start, range.start, dayWidth);
      const endX = this.dateToX(end, range.start, dayWidth) + dayWidth;
      this.scrollTimelinesTo(Math.max(0, (startX + endX) / 2 - refreshedTimeline.clientWidth / 2));
      if (focusTaskId) this.scrollTaskIntoView(focusTaskId);
    });
  }

  /** Moves the planning and resource timelines together so identical dates stay vertically aligned. */
  private scrollTimelinesTo(left: number): void {
    const timeline = this.renderRoot.querySelector<HTMLElement>('.timeline-scroll');
    const resourceTimeline = this.renderRoot.querySelector<HTMLElement>('.resource-timeline');
    timeline?.scrollTo({ left, behavior: 'smooth' });
    resourceTimeline?.scrollTo({ left, behavior: 'smooth' });
  }

  /** Keeps only the rows around the viewport in the DOM while preserving the full scroll height. */
  private getVirtualTaskRows(tasks: GanttTask[]): {
    start: number;
    end: number;
    rows: Array<{ task: GanttTask; index: number }>;
  } {
    const overscan = 8;
    // Before the first ResizeObserver callback, render a conservative initial window.
    const rowHeight = this.getTaskRowHeight();
    const viewportHeight = this.ganttViewport.height || rowHeight * 12;
    const start = Math.max(0, Math.floor(this.ganttViewport.scrollTop / rowHeight) - overscan);
    const end = Math.min(tasks.length, Math.ceil((this.ganttViewport.scrollTop + viewportHeight) / rowHeight) + overscan);
    return {
      start,
      end,
      rows: tasks.slice(start, end).map((task, offset) => ({ task, index: start + offset })),
    };
  }

  private handleGanttViewportScroll = (event: Event): void => {
    const viewport = event.currentTarget as HTMLElement;
    if (this.ganttViewportFrame !== undefined) return;
    this.ganttViewportFrame = window.requestAnimationFrame(() => {
      this.ganttViewportFrame = undefined;
      this.updateGanttViewport(viewport.scrollTop, viewport.clientHeight);
    });
  };

  private updateGanttViewport(scrollTop?: number, height?: number): void {
    const viewport = this.renderRoot.querySelector<HTMLElement>('.gantt-viewport');
    const nextScrollTop = scrollTop ?? viewport?.scrollTop ?? 0;
    const nextHeight = height ?? viewport?.clientHeight ?? 0;
    if (nextScrollTop === this.ganttViewport.scrollTop && nextHeight === this.ganttViewport.height) return;
    this.ganttViewport = { scrollTop: nextScrollTop, height: nextHeight };
    this.requestUpdate();
  }

  updateTask(taskId: string, patch: Partial<GanttTask>): void {
    const current = this.findTask(taskId);
    if (!current || !this.isTaskEditable(current)) return;
    const changesDates = patch.start !== undefined || patch.end !== undefined;
    const base = this.getFlatTasks();
    let updated = changesDates
      ? scheduleTaskDates(base, this.dependencies, taskId, patch.start || current.start, patch.end || current.end, patch.start !== undefined && patch.end !== undefined ? 'move' : patch.start !== undefined ? 'resize-start' : 'resize-end', (resource, date) => this.isResourceWorkingDay(resource, date))
      : base;
    updated = updated.map(task => task.id === taskId ? { ...task, ...patch, start: task.start, end: task.end, id: task.id } : task);
    this.replaceFlatTasks(updated, 'task-updated', taskId);
  }

  /** Locks a task against every built-in editing interaction. Returns false when the task is unknown. */
  lockTask(taskId: string): boolean {
    return this.setTaskLocked(taskId, true);
  }

  /** Unlocks a task for built-in editing interactions. Returns false when the task is unknown. */
  unlockTask(taskId: string): boolean {
    return this.setTaskLocked(taskId, false);
  }

  /** Sets the persisted lock state without requiring the task to already be editable. */
  setTaskLocked(taskId: string, locked: boolean): boolean {
    if (!this.findTask(taskId)) return false;
    const updated = this.getFlatTasks().map(task => task.id === taskId ? { ...task, editable: !locked } : task);
    this.replaceFlatTasks(updated, 'task-updated', taskId);
    return true;
  }

  addChildTask(parentId: string, newTask: Partial<GanttTask> = {}): GanttTask {
    const today = formatDate(new Date());
    const taskId = newTask.id || this.createId();
    const type = newTask.type || 'task';
    const task: GanttTask = {
      ...newTask,
      id: taskId,
      name: newTask.name || this.t('newTask'),
      start: newTask.start || today,
      end: newTask.end || this.addDays(today, 7),
      progress: newTask.progress ?? 0,
      parentId: parentId || newTask.parentId || null,
      type,
      color: newTask.color || this.getDefaultTaskColor(type),
    };
    const next = [...this.getFlatTasks(), task];
    this.replaceFlatTasks(next, 'task-created', task.id);
    this.selectTask(task.id);
    if (this.options.openTaskEditorOnCreate) this.openTaskEditor(task.id);
    if (this.options.focusTaskOnCreate) this.fitTaskToView(task.id);
    return task;
  }

  /** Requests deletion through the configured host confirmation hook before changing the plan. */
  async deleteTask(taskId: string, source: GanttTaskDeleteSource = 'api'): Promise<boolean> {
    if (!this.isTaskDeletionEnabled() || this.taskDeletionRequests.has(taskId)) return false;
    const task = this.findTask(taskId);
    if (!task || !this.isTaskEditable(task)) return false;
    const descendants = this.getTaskSubtreeTasks(taskId);
    const context: GanttTaskDeleteContext = { task, descendants, source };
    const allowedByEvent = this.dispatchEvent(new CustomEvent<GanttTaskDeleteContext>('task-delete-requested', {
      detail: context,
      cancelable: true,
      bubbles: true,
      composed: true,
    }));
    if (!allowedByEvent) return false;

    this.taskDeletionRequests.add(taskId);
    this.requestUpdate();
    try {
      const confirmed = await this.options.taskDeletion?.confirm?.(context);
      if (confirmed === false) return false;
      this.deleteTaskNow(taskId, descendants);
      return true;
    } catch (error) {
      this.setStatus(error instanceof Error ? error.message : this.t('saveFailed'), 'error');
      return false;
    } finally {
      this.taskDeletionRequests.delete(taskId);
      this.requestUpdate();
    }
  }

  private deleteTaskNow(taskId: string, descendants: GanttTask[]): void {
    const result = removeTaskBranch(this.getFlatTasks(), this.dependencies, taskId);
    const descendantIds = new Set(descendants.map(task => task.id));
    this.dependencies = result.dependencies;
    this.replaceFlatTasks(result.tasks, 'task-deleted', taskId);
    if (this.selectedTaskId && descendantIds.has(this.selectedTaskId)) this.selectedTaskId = null;
  }

  moveTask(taskId: string, parentId: string | null): void {
    if (!this.isTaskEditable(this.findTask(taskId)) || taskId === parentId || this.isDescendant(parentId, taskId)) return;
    const next = moveTaskParent(this.getFlatTasks(), taskId, parentId);
    this.replaceFlatTasks(next, 'task-moved', taskId);
  }

  /** Reorders a task (and its descendants) before or after a sibling target. */
  reorderTask(taskId: string, targetTaskId: string, position: 'before' | 'after'): void {
    if (!this.isTaskEditable(this.findTask(taskId)) || taskId === targetTaskId || this.isDescendant(targetTaskId, taskId)) return;
    const flatTasks = this.getFlatTasks();
    const reorderedTasks = reorderTaskBranch(flatTasks, taskId, targetTaskId, position);
    if (!reorderedTasks) return;
    this.replaceFlatTasks(reorderedTasks, 'task-moved', taskId);
  }

  /** Moves a task branch one level out of its current parent. */
  private outdentTask(taskId: string): void {
    if (!this.isTaskEditable(this.findTask(taskId))) return;
    const outdentedTasks = outdentTaskBranch(this.getFlatTasks(), taskId);
    if (!outdentedTasks) return;
    this.replaceFlatTasks(outdentedTasks, 'task-moved', taskId);
  }

  addDependency(from: string, to: string, type: GanttDependency['type'] = 'finish-to-start'): void {
    if (!from || !to || from === to || !this.findTask(from) || !this.findTask(to)) return;
    if (this.dependencies.some(dependency => dependency.from === from && dependency.to === to)) return;
    this.dependencies = [...this.dependencies, { from, to, type }];
    this.requestUpdate();
    this.commit('dependency-updated', to);
  }

  removeDependency(from: string, to: string): void {
    const next = this.dependencies.filter(dependency => dependency.from !== from || dependency.to !== to);
    if (next.length === this.dependencies.length) return;
    this.dependencies = next;
    this.requestUpdate();
    this.commit('dependency-updated', to);
  }

  private renderTaskRow(task: GanttTask, index: number, searchMatches: Set<string>, currentSearchId?: string) {
    const children = task.children || [];
    const depth = this.getDepth(task);
    const selected = task.id === this.selectedTaskId;
    const editable = this.isTaskEditable(task);
    const dropPosition = this.taskDropTarget?.taskId === task.id ? this.taskDropTarget.position : '';
    return html`
      <div class="task-row ${editable ? '' : 'read-only'} ${selected ? 'selected' : ''} ${index % 2 ? 'alt' : ''} ${searchMatches.has(task.id) ? 'search-match' : ''} ${task.id === currentSearchId ? 'search-current' : ''} ${dropPosition ? `drop-${dropPosition}` : ''}" style="top:${index * this.getTaskRowHeight()}px" data-task-id=${task.id}
           draggable=${editable ? 'true' : 'false'}
           aria-readonly=${editable ? 'false' : 'true'}
           @click=${() => this.focusTaskFromGrid(task.id)}
           @dragstart=${(event: DragEvent) => this.handleDragStart(event, task.id)}
           @dragend=${this.clearTaskDropTarget}
           @dragover=${(event: DragEvent) => this.handleDragOver(event, task.id)}
           @drop=${(event: DragEvent) => this.handleDrop(event, task.id)}
           @contextmenu=${(event: MouseEvent) => this.openTaskContextMenu(task.id, event)}
           @dblclick=${() => this.handleTaskGridDoubleClick(task)}>
        <div class="task-cells">${this.getColumns().map(column => this.renderTaskCell(task, column, depth, children.length > 0))}</div>
      </div>
    `;
  }

  private renderTaskCell(task: GanttTask, column: GanttColumn, depth: number, hasChildren: boolean) {
    const value = this.getColumnValue(task, column);
    const isName = column.key === 'name';
    const isNumber = this.isNumericColumn(column) || ['unitCost', 'quantity', 'quantityPerDay', 'duration', 'costTotal', 'actualCost', 'plannedCost'].includes(column.key);
    const isPhase = task.type === 'parent';
    const tone = column.tone?.(value, task);
    const formattedValue = this.formatColumnValue(value, column, task);
    const context = { task, value, formattedValue };
    const tooltip = this.getTaskColumnTooltip(column, context);
    const customStyle = !isName ? column.cellStyle?.(context)?.trim() : '';
    const cellStyle = `width:${this.getColumnWidth(column)}px${customStyle ? `;${customStyle}` : ''}`;
    return html`
      <div class="task-cell ${isName ? 'name' : ''} ${isNumber ? 'number' : ''} ${hasChildren || isPhase ? 'parent' : ''} ${tone ? `tone-${tone}` : ''}" style=${cellStyle} title=${ifDefined(tooltip)}>
        ${isName ? html`
          <button class="toggle" style="left:${2 + depth * 16}px" ?disabled=${!hasChildren} @click=${(event: Event) => { event.stopPropagation(); this.toggleTask(task.id); }} aria-label=${this.t('toggleTask')} aria-expanded=${ifDefined(hasChildren ? (task.collapsed ? 'false' : 'true') : undefined)}>
            ${hasChildren ? task.collapsed ? '▶' : '▼' : '·'}
          </button>
          <span class="task-name" style="padding-left:${19 + depth * 16}px">${value}</span>
          <button class="task-focus" aria-label=${this.t('focusTask')} title=${this.t('focusTask')} @click=${(event: Event) => { event.stopPropagation(); this.focusTaskFromGrid(task.id); }} @dblclick=${(event: Event) => event.stopPropagation()}>
            <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="4.5"></circle><path d="M8 1.5v3M8 11.5v3M1.5 8h3M11.5 8h3"></path></svg>
          </button>
        ` : column.cellTemplate ? column.cellTemplate(context) : formattedValue}
      </div>
    `;
  }

  private renderResourcePanel(task: GanttTask, start: Date, totalDays: number, dayWidth: number) {
    const taskEditable = this.isTaskEditable(task);
    const resources = task.resources || [];
    const resourceHeader = this.getResourceHeaderSettings();
    const resourceColumns = this.getResourceColumns();
    const resourceColumnsWidth = resourceColumns.reduce((width, column) => width + this.getResourceColumnWidth(column), 0) + 36;
    const resourceColumnsTemplate = [...resourceColumns.map(column => `${this.getResourceColumnWidth(column)}px`), 'minmax(36px, 1fr)'].join(' ');
    this.resourceTimelineDayWidth = dayWidth;
    const dateWindow = this.getResourceDateWindow(totalDays, dayWidth);
    const visibleDates = Array.from({ length: dateWindow.end - dateWindow.start }, (_, index) => {
      const date = new Date(start.getTime());
      date.setUTCDate(date.getUTCDate() + dateWindow.start + index);
      return date;
    });
    const windowOffset = dateWindow.start * dayWidth;
    const resourceHeaderWeeks = resourceHeader.dayGrouping === 'week' ? this.groupHeaderDatesByWeek(visibleDates) : [];
    return html`
      <section class="resources-panel" aria-label="${this.t('resources')} — ${task.name}" style="--resource-columns-width:${resourceColumnsWidth}px; --resource-columns-template:${resourceColumnsTemplate}; --resource-header-height:${resourceHeader.visible ? 32 : 0}px">
        <div class="resources-title">${this.t('resources')} — ${task.name}</div>
        <div class="resources-scroll" @contextmenu=${(event: MouseEvent) => this.openResourceContextMenu(task.id, event)}>
          <div class="resources-body">
            ${resourceHeader.visible ? html`<div class="resource-left-header">
              <div class="resources-grid">
                ${resourceColumns.map(column => html`<div class="resource-cell header resource-column-header ${this.isNumericColumn(column) ? 'numeric' : ''}" title=${column.label} @dragover=${(event: DragEvent) => this.allowColumnDrop(event, 'resource')} @drop=${(event: DragEvent) => this.dropColumn(event, 'resource', column.key)}>${this.renderColumnDragHandle('resource', column.key, column.label)}<span class="task-column-label">${column.label}</span>${this.canResizeColumns() ? html`<span class="resource-column-resizer" role="separator" tabindex="0" aria-label=${this.tFormat('resizeResourceColumn', { column: column.label })} @pointerdown=${(event: PointerEvent) => this.startResourceColumnResize(event, column)}></span>` : nothing}</div>`)}
                <div class="resource-cell header resource-action"></div>
              </div>
            </div>` : nothing}
            ${resourceHeader.visible ? html`<div class="resource-day-header"><div class="resource-day-header-content"><div class="resource-day-window" style="left:${windowOffset}px">${resourceHeader.dayGrouping === 'week'
              ? resourceHeaderWeeks.map((week, index) => { const weekNumber = this.getWeekNumber(week.start); return html`<div class="resource-day week-date" style="width:${week.dayCount * dayWidth}px" title=${this.formatDayTitle(week.start)}>${resourceHeader.weekDateTemplate ? resourceHeader.weekDateTemplate({ start: week.start, weekNumber, number: weekNumber, index, dayCount: week.dayCount }) : this.renderDateHeaderCell(week.start, 'resources', index, resourceHeader.dayTemplate)}</div>`; })
              : visibleDates.map((date, index) => html`<div class="resource-day ${this.isNonWorkingDay(date) ? 'weekend' : ''} ${this.isNonWorkingBlockStart(date) ? 'non-working-start' : ''} ${this.isWeekStart(date) ? 'week-start' : ''}" title=${this.formatDayTitle(date)}>${this.renderDateHeaderCell(date, 'resources', index, resourceHeader.dayTemplate)}</div>`)
            }</div></div></div>` : nothing}
            <div class="resources-left" @scroll=${this.syncResourceLeftHeaderScroll}>
              <div class="resources-grid">
            ${resources.map(resource => html`
              ${resourceColumns.map(column => this.renderResourceCell(task, resource, column))}
              <div class="resource-cell resource-action">${taskEditable ? html`<button class="danger" aria-label="${this.t('delete')} ${resource.name}" @click=${() => this.removeResource(task.id, resource.id)}>×</button>` : nothing}</div>
            `)}
          </div>
            </div>
            <div class="resource-timeline" @scroll=${this.syncResourceTimelineHeaderScroll}>
              <div class="resource-timeline-content" style="--day-width:${dayWidth}px">
          ${resources.map(resource => html`<div class="resource-day-row">
            ${this.renderResourceCalendarBands(resource, visibleDates, windowOffset, dayWidth)}
            ${this.renderResourceWeekDividers(visibleDates, windowOffset, dayWidth)}
            <div class="resource-day-window" style="left:${windowOffset}px">${visibleDates.map(date => {
            const dateKey = formatDate(date);
            const active = dateKey >= task.start && dateKey <= task.end;
            const working = this.isResourceWorkingDay(resource, date);
            const value = resource.quantityByDate?.[dateKey];
            const unavailable = !working;
            const title = unavailable ? `${this.getResourceCalendarLabel(resource)} — ${this.t('nonWorkingDay')}` : this.formatDayTitle(date);
            return html`<input class="resource-day-input ${unavailable ? 'calendar-closed' : ''}" type="number" min="0" step="1" ?disabled=${!taskEditable || !active || unavailable} value=${value === undefined ? '' : value} title=${title} aria-label="${resource.name} ${dateKey}" @change=${(event: Event) => this.updateResourceQuantity(task.id, resource.id, dateKey, (event.target as HTMLInputElement).value)} />`;
          })}</div></div>`)}
              </div>
            </div>
            ${this.options.taskGridSplitter?.enabled !== false ? html`<div class="resource-grid-splitter" role="separator" tabindex="0" aria-label=${this.t('resizeTaskGrid')} @pointerdown=${this.startColumnResize}></div>` : nothing}
          </div>
        </div>
        <div class="resources-scrollbar-dock" aria-label="${this.t('resources')}">
          <div class="resource-horizontal-scroll" @scroll=${this.syncResourceLeftGridScroll}><div class="resource-scroll-spacer"></div></div>
          <div class="resource-horizontal-scroll" @scroll=${this.syncResourceTimelineGridScroll}><div class="resource-scroll-spacer timeline"></div></div>
        </div>
      </section>
    `;
  }

  private renderResourceCell(task: GanttTask, resource: GanttResource, column: GanttResourceColumn) {
    const taskEditable = this.isTaskEditable(task);
    const value = this.getResourceColumnValue(task, resource, column);
    const numeric = this.isNumericColumn(column);
    const formattedValue = this.formatResourceColumnValue(value, column, resource, task);
    const context: GanttResourceColumnRenderContext = { resource, task, value, formattedValue };
    const tooltip = this.getResourceColumnTooltip(column, context);
    if (column.key === 'quantity' || column.key === 'totalQuantity') {
      return html`<div class="resource-cell total"><input type="number" min=${ifDefined(this.getResourceColumnMin(column))} .step=${this.getResourceColumnStepProperty(column)} ?disabled=${!taskEditable} value=${value ?? 0} title=${ifDefined(tooltip)} aria-label="${this.t('quantity')} ${resource.name}" @change=${(event: Event) => this.distributeResourceTotal(task.id, resource.id, (event.target as HTMLInputElement).value)} /></div>`;
    }
    if (column.key === 'calendarId' && column.editable) {
      return html`<div class="resource-cell"><select .value=${resource.calendarId || ''} ?disabled=${!taskEditable} title=${ifDefined(tooltip)} aria-label=${this.tFormat('resourceCalendarFor', { name: resource.name })} @change=${(event: Event) => this.updateResource(task.id, resource.id, 'calendarId', (event.target as HTMLSelectElement).value || undefined)}><option value="">${this.t('resource')}</option>${this.calendars.map(calendar => html`<option value=${calendar.id}>${calendar.name}</option>`)}</select></div>`;
    }
    if (column.editable && ['name', 'type', 'unitCost', 'quantity'].includes(column.key)) {
      return html`<div class="resource-cell ${numeric ? 'numeric' : ''}"><input type=${numeric ? 'number' : 'text'} min=${ifDefined(this.getResourceColumnMin(column))} .step=${this.getResourceColumnStepProperty(column)} ?disabled=${!taskEditable} .value=${String(value ?? '')} title=${ifDefined(tooltip)} @change=${(event: Event) => this.updateResourceColumn(task, resource, column, (event.target as HTMLInputElement).value)} /></div>`;
    }
    if (column.editable) {
      return html`<div class="resource-cell ${numeric ? 'numeric' : ''}"><input type=${numeric ? 'number' : 'text'} min=${ifDefined(this.getResourceColumnMin(column))} .step=${this.getResourceColumnStepProperty(column)} ?disabled=${!taskEditable} .value=${String(value ?? '')} title=${ifDefined(tooltip)} @change=${(event: Event) => this.updateResourceColumn(task, resource, column, (event.target as HTMLInputElement).value)} /></div>`;
    }
    return html`<div class="resource-cell ${numeric ? 'numeric' : ''}" title=${ifDefined(tooltip)}>${formattedValue}</div>`;
  }

  private getResourceColumnValue(task: GanttTask, resource: GanttResource, column: GanttResourceColumn): unknown {
    if (column.value) return column.value(resource, task);
    switch (column.key) {
      case 'name': return resource.name;
      case 'type': return resource.type;
      case 'unitCost': return resource.unitCost;
      case 'quantity': return this.getResourceTotalQuantity(resource);
      case 'calendarId': return this.getResourceCalendarLabel(resource);
      case 'maxUnits': return resource.maxUnits;
      case 'totalQuantity': return this.getResourceTotalQuantity(resource);
      case 'cost': return this.getResourceCost(resource);
      default: return resource.metadata?.[column.key] ?? '';
    }
  }

  private formatResourceColumnValue(value: unknown, column: GanttResourceColumn, resource: GanttResource, task: GanttTask): string {
    if (value === null || value === undefined || value === '') return '';
    if (column.format) return column.format(value, resource, task);
    if (this.isNumericColumn(column) && typeof value === 'number') return `${this.formatNumber(value)}${column.key === 'cost' ? ' €' : ''}`;
    return String(value);
  }

  private getTaskColumnTooltip(column: GanttColumn, context: { task: GanttTask; value: unknown; formattedValue: string }): string | undefined {
    if (column.tooltip === false) return undefined;
    return column.tooltip ? column.tooltip(context) : context.formattedValue;
  }

  private getResourceColumnTooltip(column: GanttResourceColumn, context: GanttResourceColumnRenderContext): string | undefined {
    if (column.tooltip === false) return undefined;
    return column.tooltip ? column.tooltip(context) : context.formattedValue;
  }

  private isNumericColumn(column: { type?: string }): boolean {
    return column.type === 'number' || column.type === 'integer' || column.type === 'decimal';
  }

  private getResourceColumnMin(column: GanttResourceColumn): number | undefined {
    if (!this.isNumericColumn(column) && column.key !== 'totalQuantity') return undefined;
    if (column.min !== undefined) return column.min;
    return ['unitCost', 'quantity', 'totalQuantity'].includes(column.key) ? 0 : undefined;
  }

  private getResourceColumnStep(column: GanttResourceColumn): number | 'any' | undefined {
    if (!this.isNumericColumn(column) && column.key !== 'totalQuantity') return undefined;
    if (column.step !== undefined) return column.step;
    if (column.type === 'decimal') return 'any';
    if (column.type === 'integer' || ['quantity', 'totalQuantity'].includes(column.key)) return 1;
    return column.key === 'unitCost' ? 0.01 : 'any';
  }

  /** HTMLInputElement.step is a string property; an empty value restores the browser default. */
  private getResourceColumnStepProperty(column: GanttResourceColumn): string {
    const step = this.getResourceColumnStep(column);
    return step === undefined ? '' : String(step);
  }

  private normalizeResourceColumnValue(column: GanttResourceColumn, value: string): number | string {
    if (!this.isNumericColumn(column)) return value;
    let numberValue = Number(value);
    if (!Number.isFinite(numberValue)) numberValue = 0;
    if (column.type === 'integer') numberValue = Math.trunc(numberValue);
    if (column.min !== undefined) numberValue = Math.max(column.min, numberValue);
    return numberValue;
  }

  private updateResourceColumn(task: GanttTask, resource: GanttResource, column: GanttResourceColumn, value: string): void {
    if (column.setValue) {
      const patch = column.setValue(value, resource, task);
      if (patch) this.updateResourcePatch(task.id, resource.id, patch);
      return;
    }
    const nextValue = this.normalizeResourceColumnValue(column, value);
    if (['name', 'type', 'unitCost', 'quantity', 'maxUnits'].includes(column.key)) {
      this.updateResource(task.id, resource.id, column.key as keyof GanttResource, nextValue);
      return;
    }
    this.updateResourcePatch(task.id, resource.id, { metadata: { ...resource.metadata, [column.key]: nextValue } });
  }

  private renderResourceContextMenu() {
    const menu = this.resourceContextMenu;
    if (!menu) return nothing;
    return html`
      <div class="resource-context-backdrop" @click=${this.closeResourceContextMenu}></div>
      <div class="resource-context-menu" style="left:${menu.x}px; top:${menu.y}px" @click=${(event: Event) => event.stopPropagation()}>
        <button @click=${this.addResourceFromContext}>＋ ${this.t('addResource')}</button>
      </div>
    `;
  }

  private renderTaskContextMenu() {
    const menu = this.taskContextMenu;
    if (!menu) return nothing;
    const task = this.findTask(menu.taskId);
    if (!task) return nothing;
    const editable = this.isTaskEditable(task);
    const template = this.options.taskContextMenuTemplate;
    return html`
      <div class="resource-context-backdrop" @click=${this.closeTaskContextMenu}></div>
      <div class="task-context-menu" role="menu" style="left:${menu.x}px; top:${menu.y}px" @mouseover=${this.positionTaskContextSubmenu} @focusin=${this.positionTaskContextSubmenu} @click=${this.handleTaskContextMenuClick}>
        ${template ? template(this.getTaskContextMenuTemplateContext(task)) : editable ? html`
          <button @click=${() => this.openTaskEditor(menu.taskId)}>✎ ${this.t('editTask')}</button>
          <button @click=${this.addTaskAfterContext}>＋ ${this.t('addTaskAfter')}</button>
        ` : html`
          <button @click=${() => { this.fitTaskToView(task.id); this.closeTaskContextMenu(); }}>${this.t('fitTask')}</button>
        `}
      </div>
    `;
  }

  private renderTaskTooltip() {
    const tooltip = this.taskTooltip;
    if (!tooltip) return nothing;
    const task = this.findTask(tooltip.taskId);
    if (!task) return nothing;
    const context = {
      task,
      color: tooltip.color,
      durationDays: this.getTaskDurationDays(task),
      kind: tooltip.kind,
      resources: task.resources || [],
    };
    const content = this.options.taskTooltipTemplate?.(context) ?? html`
      <div class="task-tooltip-title"><span class="task-tooltip-accent" style="--tooltip-color:${tooltip.color}"></span><span>${task.name}</span></div>
      <div class="task-tooltip-details">
        <span>${this.t('start')}</span><strong>${task.start}</strong>
        <span>${this.t('finish')}</span><strong>${task.end}</strong>
        <span>${this.t('duration')}</span><strong>${context.durationDays}</strong>
        <span>${this.t('progress')}</span><strong>${task.progress}%</strong>
      </div>
      ${context.resources.length ? html`<div class="task-tooltip-resources"><strong>${this.t('resources')}</strong><span>${context.resources.map(resource => resource.name).join(', ')}</span></div>` : nothing}
    `;
    return html`<div class="task-tooltip" role="tooltip" style="left:${tooltip.x + 14}px; top:${tooltip.y + 14}px">${content}</div>`;
  }

  private openTaskTooltip(event: PointerEvent, task: GanttTask, color: string, kind: GanttTaskBarKind): void {
    if (this.options.showTaskTooltips === false || event.pointerType === 'touch') return;
    this.taskTooltip = { taskId: task.id, color, kind, x: event.clientX, y: event.clientY };
    this.requestUpdate();
    void this.updateComplete.then(() => this.positionTaskTooltip());
  }

  private moveTaskTooltip = (event: PointerEvent): void => {
    if (!this.taskTooltip || event.pointerType === 'touch') return;
    this.taskTooltip.x = event.clientX;
    this.taskTooltip.y = event.clientY;
    this.positionTaskTooltip();
  };

  private closeTaskTooltip = (): void => {
    if (!this.taskTooltip) return;
    this.taskTooltip = undefined;
    this.requestUpdate();
  };

  private positionTaskTooltip(): void {
    const tooltipState = this.taskTooltip;
    const tooltip = this.renderRoot.querySelector<HTMLElement>('.task-tooltip');
    if (!tooltipState || !tooltip) return;
    const offset = 14;
    const margin = 8;
    const bounds = tooltip.getBoundingClientRect();
    const left = Math.max(margin, Math.min(tooltipState.x + offset, window.innerWidth - bounds.width - margin));
    const top = Math.max(margin, Math.min(tooltipState.y + offset, window.innerHeight - bounds.height - margin));
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
  }

  private renderGanttContextMenu() {
    const menu = this.ganttContextMenu;
    if (!menu) return nothing;
    const template = this.options.ganttContextMenuTemplate;
    return html`
      <div class="resource-context-backdrop" @click=${this.closeGanttContextMenu}></div>
      <div class="resource-context-menu gantt-context-menu" role="menu" style="left:${menu.x}px; top:${menu.y}px" @click=${(event: Event) => event.stopPropagation()}>
        ${template ? template({ close: this.closeGanttContextMenu, fitToView: this.fitGanttFromContext, date: menu.date, addTask: () => this.addTimelineItemFromContext('task'), addPhase: () => this.addTimelineItemFromContext('parent') }) : html`
          <button @click=${() => this.addTimelineItemFromContext('task')}>＋ ${this.t('addTask')}</button>
          <button @click=${() => this.addTimelineItemFromContext('parent')}>＋ ${this.t('addPhase')}</button>
          <button @click=${this.fitGanttFromContext}>${this.t('fitGantt')}</button>
        `}
      </div>
    `;
  }

  private getTaskContextMenuTemplateContext(task: GanttTask) {
    const editable = this.isTaskEditable(task);
    return {
      gantt: this,
      task,
      editable,
      close: this.closeTaskContextMenu,
      edit: () => { if (editable) this.openTaskEditor(task.id); },
      addTaskAfter: () => { if (editable) this.addTaskAfter(task.id); },
      deleteTask: () => {
        if (!editable) return Promise.resolve(false);
        this.closeTaskContextMenu();
        return this.deleteTask(task.id, 'context-menu');
      },
      updateTask: (patch: Partial<GanttTask>) => { if (editable) this.updateTask(task.id, patch); },
      fitToView: () => this.fitTaskToView(task.id),
    };
  }

  private renderTaskEditor() {
    const task = this.findTask(this.taskEditorId || null);
    if (!task) return nothing;
    const tab = this.taskEditorTab;
    const template = this.options.taskEditorTemplate;
    return html`
      <div class="task-editor-backdrop" @click=${this.closeTaskEditor}></div>
      <section class="task-editor-dialog" role="dialog" aria-modal="true" aria-label="${this.t('editTask')} ${task.name}">
        <header class="task-editor-header"><strong>${this.t('editTask')} — ${task.name}</strong><button aria-label=${this.t('close')} @click=${this.closeTaskEditor}>×</button></header>
        ${template ? html`
          <div class="task-editor-body"><div class="task-editor-template">${template(this.getTaskEditorTemplateContext(task))}</div></div>
        ` : html`
          <div class="task-editor-tabs" role="tablist">
            ${this.renderTaskEditorTab('general', this.t('general'))}
            ${this.renderTaskEditorTab('resources', this.t('resources'))}
            ${this.renderTaskEditorTab('links', this.t('links'))}
          </div>
          <div class="task-editor-body">
            ${tab === 'general' ? this.renderTaskGeneralTab(task) : nothing}
            ${tab === 'resources' ? this.renderTaskResourcesTab(task) : nothing}
            ${tab === 'links' ? this.renderTaskLinksTab(task) : nothing}
          </div>
        `}
      </section>
    `;
  }

  private getTaskEditorTemplateContext(task: GanttTask) {
    const editable = this.isTaskEditable(task);
    return {
      task,
      editable,
      updateTask: (patch: Partial<GanttTask>) => { if (editable) this.updateTask(task.id, patch); },
      moveTask: (parentId: string | null) => { if (editable) this.moveTask(task.id, parentId); },
      addResource: (resource: Partial<GanttResource> = {}) => editable ? this.addResource(task.id, resource) : null,
      openResourcePicker: () => { if (editable) this.openResourcePicker(task.id); },
      removeResource: (resourceId: string) => { if (editable) this.removeResource(task.id, resourceId); },
      addDependency: (fromTaskId: string, type?: GanttDependency['type']) => { if (editable) this.addDependency(fromTaskId, task.id, type); },
      removeDependency: (fromTaskId: string) => { if (editable) this.removeDependency(fromTaskId, task.id); },
      close: this.closeTaskEditor,
    };
  }

  private renderTaskEditorTab(tab: 'general' | 'resources' | 'links', label: string) {
    return html`<button class="task-editor-tab ${this.taskEditorTab === tab ? 'active' : ''}" role="tab" aria-selected=${this.taskEditorTab === tab} @click=${() => { this.taskEditorTab = tab; this.requestUpdate(); }}>${label}</button>`;
  }

  private renderTaskGeneralTab(task: GanttTask) {
    return html`
      <div class="task-editor-form">
        <label>${this.t('name')}<input value=${task.name} @change=${(event: Event) => this.updateTask(task.id, { name: (event.target as HTMLInputElement).value })} /></label>
        <label>${this.t('code')}<input value=${task.code || ''} @change=${(event: Event) => this.updateTask(task.id, { code: (event.target as HTMLInputElement).value })} /></label>
        <label>${this.t('type')}<select @change=${(event: Event) => this.updateTask(task.id, { type: (event.target as HTMLSelectElement).value as GanttTask['type'] })}>
          <option value="task" ?selected=${task.type === 'task'}>${this.t('task')}</option><option value="parent" ?selected=${task.type === 'parent'}>${this.t('phase')}</option><option value="milestone" ?selected=${task.type === 'milestone'}>${this.t('milestone')}</option>
        </select></label>
        <label>${this.t('color')}<input type="color" .value=${this.getTaskColor(task)} @change=${(event: Event) => this.updateTask(task.id, { color: (event.target as HTMLInputElement).value })} /></label>
        <label>${this.t('progress')}<input type="number" min="0" max="100" step="1" .value=${String(task.progress)} @change=${(event: Event) => this.updateTask(task.id, { progress: Math.min(100, Math.max(0, Number((event.target as HTMLInputElement).value) || 0)) })} /></label>
        <label>${this.t('actualCost')}<input type="number" min="0" step="0.01" .value=${task.actualCost === undefined ? '' : String(task.actualCost)} @change=${(event: Event) => { const value = (event.target as HTMLInputElement).value; this.updateTask(task.id, { actualCost: value === '' ? undefined : Math.max(0, Number(value) || 0) }); }} /></label>
        <label>${this.t('parent')}<select @change=${(event: Event) => this.moveTask(task.id, (event.target as HTMLSelectElement).value || null)}>
          <option value="">${this.t('root')}</option>${this.getParentOptions(task.id).map(parent => html`<option value=${parent.id} ?selected=${task.parentId === parent.id}>${parent.name}</option>`)}
        </select></label>
        <label>${this.t('start')}<input type="date" value=${task.start} @change=${(event: Event) => this.updateTask(task.id, { start: (event.target as HTMLInputElement).value })} /></label>
        <label>${this.t('finish')}<input type="date" value=${task.end} @change=${(event: Event) => this.updateTask(task.id, { end: (event.target as HTMLInputElement).value })} /></label>
      </div>
    `;
  }

  private renderTaskResourcesTab(task: GanttTask) {
    const resources = task.resources || [];
    return html`
      <div class="editor-section">
        <div class="editor-actions"><button class="primary" @click=${() => this.openResourcePicker(task.id)}>＋ ${this.t('addResource')}</button></div>
        ${!this.resourceProvider && !this.options.resourcePicker ? html`<div class="editor-empty">${this.t('resourceProviderLater')}</div>` : nothing}
        ${resources.length ? html`<div class="editor-resource-list">${resources.map(resource => html`<div class="editor-resource-row"><span>${resource.name}</span><small>${resource.type} · ${this.formatNumber(this.getResourceCost(resource))} €</small><button class="danger" @click=${() => this.removeResource(task.id, resource.id)}>×</button></div>`)}</div>` : html`<div class="editor-empty">${this.t('noResourceAssigned')}</div>`}
      </div>
    `;
  }

  private renderResourcePicker() {
    const task = this.findTask(this.resourcePickerTaskId || null);
    if (!task) return nothing;
    return html`
      <div class="resource-picker-backdrop" @click=${this.closeResourcePicker}></div>
      <section class="resource-picker-dialog" role="dialog" aria-modal="true" aria-label="${this.t('resourceCatalogue')} — ${task.name}">
        <header class="task-editor-header"><strong>${this.t('resourceCatalogue')} — ${task.name}</strong><button aria-label=${this.t('close')} @click=${this.closeResourcePicker}>×</button></header>
        <div class="resource-picker-body">
          <div class="reference-search"><label>${this.t('searchResource')}<input autofocus placeholder=${this.t('searchResource')} .value=${this.resourceReferenceQuery} @input=${this.searchResourceReferences} /></label></div>
          ${this.resourceReferenceLoading ? html`<div class="editor-empty">${this.t('searching')}</div>` : nothing}
          ${this.resourceReferenceResults.length ? html`<div class="reference-results">${this.resourceReferenceResults.map(reference => html`<div class="reference-result"><span>${reference.name}</span><small>${reference.type || this.t('resource')}</small><button @click=${() => this.assignPickedResource(reference)}>${this.t('add')}</button></div>`)}</div>` : nothing}
        </div>
      </section>
    `;
  }

  private renderTaskLinksTab(task: GanttTask) {
    const links = this.dependencies.filter(link => link.from === task.id || link.to === task.id);
    const otherTasks = this.getFlatTasks().filter(candidate => candidate.id !== task.id);
    return html`
      <div class="editor-section">
        <div class="link-add">
          <select @change=${(event: Event) => this.addEditorDependency(task.id, event)}><option value="">${this.t('addPredecessor')}</option>${otherTasks.map(candidate => html`<option value=${candidate.id}>${candidate.code || candidate.id} — ${candidate.name}</option>`)}</select>
          <select @change=${(event: Event) => { this.taskEditorLinkType = (event.target as HTMLSelectElement).value as GanttDependency['type']; }}>
            <option value="finish-to-start">${this.t('finishToStart')}</option><option value="start-to-start">${this.t('startToStart')}</option><option value="finish-to-finish">${this.t('finishToFinish')}</option><option value="start-to-finish">${this.t('startToFinish')}</option>
          </select>
        </div>
        ${links.length ? html`<div class="editor-link-list">${links.map(link => { const from = this.findTask(link.from); const to = this.findTask(link.to); return html`<div class="editor-link-row"><span>${from?.name || link.from} → ${to?.name || link.to}</span><small>${this.formatDependencyType(link.type)}</small><button class="danger" @click=${() => this.removeDependency(link.from, link.to)}>×</button></div>`; })}</div>` : html`<div class="editor-empty">${this.t('noLink')}</div>`}
      </div>
    `;
  }

  private renderTimelineRow(task: GanttTask, index: number, start: Date, dayWidth: number, searchMatches: Set<string>) {
    const left = this.dateToX(task.start, start, dayWidth);
    const width = Math.max(dayWidth, (diffDays(task.start, task.end) + 1) * dayWidth);
    const color = this.getTaskColor(task);
    const selected = task.id === this.selectedTaskId;
    return html`
      <div class="timeline-row ${index % 2 ? 'alt' : ''} ${searchMatches.has(task.id) ? 'search-match' : ''}" style="top:${index * this.getTaskRowHeight()}px">
        ${this.renderTaskBar(task, left, width, color, selected, start, dayWidth)}
      </div>
    `;
  }

  private renderTaskBar(task: GanttTask, left: number, width: number, color: string, selected: boolean, timelineStart: Date, dayWidth: number) {
    const milestone = task.type === 'milestone';
    const summary = !milestone && task.type === 'parent';
    const editable = this.isTaskEditable(task);
    if (summary) {
      const template = this.getTaskBarTemplateContent(task, color, width, 'summary');
      return html`
        <div class="summary-bar ${editable ? '' : 'read-only'} ${selected ? 'selected' : ''}" data-task-id=${task.id} style="left:${left}px; width:${Math.max(24, width)}px; --summary-color:${color};"
             aria-label=${task.name}
             @click=${(event: Event) => { event.stopPropagation(); this.selectTask(task.id); }}
             @dblclick=${(event: MouseEvent) => this.openTaskEditorFromBar(task, event)}
             @pointerenter=${(event: PointerEvent) => this.openTaskTooltip(event, task, color, 'summary')}
             @pointermove=${this.moveTaskTooltip}
             @pointerleave=${this.closeTaskTooltip}
             @pointerdown=${(event: PointerEvent) => this.startBarDrag(event, task, 'move')}>
          <span class="summary-cap start"></span><span class="summary-cap end"></span><div class="summary-label"><span>${task.name}</span>${template !== undefined ? html`<span class="summary-template">${template}</span>` : nothing}</div>
        </div>
      `;
    }
    const segments = this.getWorkSegments(task, timelineStart, dayWidth);
    if (segments) {
      let remainingProgressWidth = segments.reduce((total, segment) => total + segment.width, 0) * Math.min(100, Math.max(0, task.progress)) / 100;
      return html`
        <div class="task-work ${editable ? '' : 'read-only'} ${selected ? 'selected' : ''}" data-task-id=${task.id} style="left:${left}px; width:${width}px; --bar-color:${color};"
             aria-label=${task.name}
             @click=${(event: Event) => { event.stopPropagation(); this.selectTask(task.id); }}
             @dblclick=${(event: MouseEvent) => this.openTaskEditorFromBar(task, event)}
             @pointerenter=${(event: PointerEvent) => this.openTaskTooltip(event, task, color, 'task')}
             @pointermove=${this.moveTaskTooltip}
             @pointerleave=${this.closeTaskTooltip}
             @pointerdown=${(event: PointerEvent) => this.startBarDrag(event, task, 'move')}>
          <div class="task-span"></div>
          ${segments.map(segment => {
            const progressWidth = Math.min(segment.width, Math.max(0, remainingProgressWidth));
            remainingProgressWidth -= progressWidth;
            return html`<div class="task-segment" style="left:${segment.left - left}px; width:${segment.width}px"><div class="task-segment-progress" style="--segment-progress:${progressWidth}px"></div></div>`;
          })}
          <div class="task-work-label">${this.renderTaskBarContent(task, color, width)}</div>
          ${editable ? html`<span class="resize-handle start" title=${this.t('resizeStart')} @pointerdown=${(event: PointerEvent) => this.startBarDrag(event, task, 'resize-start')}></span><span class="resize-handle end" title=${this.t('resizeEnd')} @pointerdown=${(event: PointerEvent) => this.startBarDrag(event, task, 'resize-end')}></span>` : nothing}
        </div>
      `;
    }
    const milestoneTemplate = milestone ? this.getTaskBarTemplateContent(task, color, width, 'milestone') : undefined;
    return html`
      <div class="task-bar ${editable ? '' : 'read-only'} ${milestone ? 'milestone' : ''} ${selected ? 'selected' : ''}" data-task-id=${task.id}
           style="left:${left}px; width:${milestone ? 17 : width}px; --bar-color:${color}; --progress:${task.progress}%"
           aria-label=${task.name}
           @click=${(event: Event) => { event.stopPropagation(); this.selectTask(task.id); }}
           @dblclick=${(event: MouseEvent) => this.openTaskEditorFromBar(task, event)}
           @pointerenter=${(event: PointerEvent) => this.openTaskTooltip(event, task, color, 'task')}
           @pointermove=${this.moveTaskTooltip}
           @pointerleave=${this.closeTaskTooltip}
           @pointerdown=${(event: PointerEvent) => this.startBarDrag(event, task, 'move')}>
        ${milestone ? nothing : html`
          <div class="progress-fill"></div>
          ${this.renderTaskBarContent(task, color, width)}
          ${editable ? html`<span class="resize-handle start" @pointerdown=${(event: PointerEvent) => this.startBarDrag(event, task, 'resize-start')}></span><span class="resize-handle end" @pointerdown=${(event: PointerEvent) => this.startBarDrag(event, task, 'resize-end')}></span>` : nothing}
        `}
      </div>
      ${milestoneTemplate !== undefined ? html`<div class="milestone-template" style="left:${left + 23}px; --milestone-color:${color};">${milestoneTemplate}</div>` : nothing}
    `;
  }

  private renderTaskBarContent(task: GanttTask, color: string, width: number) {
    const content = this.getTaskBarTemplateContent(task, color, width, 'task');
    return html`<span class="bar-label">${task.name}</span>${content !== undefined ? html`<span class="task-bar-template">${content}</span>` : nothing}`;
  }

  private getTaskBarTemplateContent(task: GanttTask, color: string, width: number, kind: GanttTaskBarKind): unknown {
    const context = { task, color, width, durationDays: this.getTaskDurationDays(task), kind };
    if (kind === 'milestone') return this.options.milestoneTemplate?.(context);
    if (kind === 'summary') return this.options.phaseTemplate?.(context) ?? this.options.taskBarTemplate?.(context) ?? this.options.summaryTemplate?.(task);
    return this.options.taskTemplate?.(context) ?? this.options.taskBarTemplate?.(context);
  }

  private renderTimelineHeader(start: Date, totalDays: number, dayWidth: number) {
    const header = this.getGanttHeaderSettings();
    const dates = Array.from({ length: totalDays }, (_, index) => {
      const date = new Date(start.getTime());
      date.setUTCDate(date.getUTCDate() + index);
      return date;
    });
    const months: Array<{ date: Date; label: string; count: number }> = [];
    for (const date of dates) {
      const label = this.getMonthLabel(date);
      const current = months[months.length - 1];
      if (current?.label === label) current.count += 1;
      else months.push({ date, label, count: 1 });
    }
    const weeks = Array.from({ length: Math.ceil(dates.length / 7) }, (_, index) => {
      const date = dates[index * 7];
      return { start: date, number: date ? this.getWeekNumber(date) : 0, count: Math.min(7, dates.length - index * 7) };
    });
    return html`
      <div class="timeline-header ${header.showWeeks ? 'with-weeks' : ''}">
        ${header.showMonths ? html`<div class="months">${months.map((month, index) => html`<div class="month" style="width:${month.count * dayWidth}px">${header.monthTemplate ? header.monthTemplate({ date: month.date, label: month.label, index, dayCount: month.count }) : month.label}</div>`)}</div>` : nothing}
        ${header.showWeeks ? html`<div class="weeks">${weeks.map((week, index) => html`<div class="week" style="width:${week.count * dayWidth}px">${header.weekTemplate && week.start ? header.weekTemplate({ start: week.start, weekNumber: week.number, number: week.number, index, dayCount: week.count }) : this.tFormat('weekNumber', { number: week.number })}</div>`)}</div>` : nothing}
        ${header.showDays ? html`<div class="days">${header.dayGrouping === 'week'
          ? weeks.map((week, index) => week.start ? html`<div class="day week-date" style="width:${week.count * dayWidth}px" title=${this.formatDayTitle(week.start)}>${header.weekDateTemplate ? header.weekDateTemplate({ start: week.start, weekNumber: week.number, number: week.number, index, dayCount: week.count }) : this.renderDateHeaderCell(week.start, 'gantt', index, header.dayTemplate)}</div>` : nothing)
          : dates.map((date, index) => html`<div class="day ${this.isNonWorkingDay(date) ? 'weekend' : ''} ${this.isNonWorkingBlockStart(date) ? 'non-working-start' : ''} ${this.isWeekStart(date) ? 'week-start' : ''}" style="width:${dayWidth}px" title=${this.formatDayTitle(date)}>${this.renderDateHeaderCell(date, 'gantt', index, header.dayTemplate)}</div>`)
        }</div>` : nothing}
      </div>
    `;
  }

  private getGanttHeaderSettings() {
    const configured = this.options.ganttHeader;
    const level = configured?.zoomLevels?.find(candidate =>
      (candidate.minZoom === undefined || this.zoom >= candidate.minZoom)
      && (candidate.maxZoom === undefined || this.zoom <= candidate.maxZoom));
    return {
      showMonths: (level?.showMonths ?? configured?.showMonths) !== false,
      showWeeks: level?.showWeeks ?? configured?.showWeeks ?? this.options.showWeekNumbers === true,
      showDays: (level?.showDays ?? configured?.showDays) !== false,
      dayGrouping: level?.dayGrouping ?? 'day',
      monthTemplate: level?.monthTemplate ?? configured?.monthTemplate,
      weekTemplate: level?.weekTemplate ?? configured?.weekTemplate,
      dayTemplate: level?.dayTemplate ?? configured?.dayTemplate,
      weekDateTemplate: level?.weekDateTemplate,
    };
  }

  private getResourceHeaderSettings() {
    const configured = this.options.resourceHeader;
    const level = configured?.zoomLevels?.find(candidate =>
      (candidate.minZoom === undefined || this.zoom >= candidate.minZoom)
      && (candidate.maxZoom === undefined || this.zoom <= candidate.maxZoom));
    return {
      visible: (level?.visible ?? configured?.visible) !== false,
      dayGrouping: level?.dayGrouping ?? 'day',
      dayTemplate: level?.dayTemplate ?? configured?.dayTemplate,
      weekDateTemplate: level?.weekDateTemplate,
    };
  }

  /** Groups a rendered resource-date window without assuming that its first visible day is a week boundary. */
  private groupHeaderDatesByWeek(dates: Date[]): Array<{ start: Date; dayCount: number }> {
    const groups: Array<{ start: Date; dayCount: number }> = [];
    for (const date of dates) {
      const current = groups[groups.length - 1];
      if (!current || this.isWeekStart(date)) groups.push({ start: this.getWeekStartDate(date), dayCount: 1 });
      else current.dayCount += 1;
    }
    return groups;
  }

  private renderDateHeaderCell(date: Date, area: 'gantt' | 'resources', index: number, template?: GanttDateHeaderTemplate) {
    if (!template) return date.getUTCDate();
    const labels = this.getDateHeaderLabels(date);
    return template({
      date,
      area,
      index,
      day: date.getUTCDate(),
      weekNumber: this.getWeekNumber(date),
      weekday: labels.weekday,
      weekdayNarrow: labels.weekdayNarrow,
      title: labels.title,
    });
  }

  private renderTodayMarker(start: Date, dayWidth: number, totalDays: number) {
    if (this.options.showToday === false) return nothing;
    const x = this.dateToX(formatDate(new Date()), start, dayWidth);
    if (x < 0 || x > totalDays * dayWidth) return nothing;
    const todayColor = this.getColors().today;
    const configuredLabel = this.options.todayLabel;
    const todayLabel = typeof configuredLabel === 'function' ? configuredLabel() : configuredLabel || this.t('today');
    const style = todayColor ? `left:${x}px;--today-color:${todayColor}` : `left:${x}px`;
    return html`<div class="today-line" style=${style}><span class="today-label">${todayLabel}</span></div>`;
  }

  private renderNonWorkingDayBands(start: Date, totalDays: number, dayWidth: number) {
    if (!this.getNonWorkingDays().length) return nothing;
    return Array.from({ length: totalDays }, (_, index) => {
      const date = new Date(start.getTime());
      date.setUTCDate(date.getUTCDate() + index);
      return this.isNonWorkingDay(date)
        ? html`<div class="non-working-day-band ${this.isNonWorkingBlockStart(date) ? 'non-working-start' : ''}" style="left:${index * dayWidth}px; width:${dayWidth}px"></div>`
        : nothing;
    });
  }

  private renderWeekDividers(start: Date, totalDays: number, dayWidth: number) {
    return Array.from({ length: totalDays }, (_, index) => {
      if (index === 0) return nothing;
      const date = new Date(start.getTime());
      date.setUTCDate(date.getUTCDate() + index);
      return this.isWeekStart(date)
        ? html`<div class="week-divider" style="left:${index * dayWidth}px"></div>`
        : nothing;
    });
  }

  private renderResourceWeekDividers(dates: Date[], offset: number, dayWidth: number) {
    return dates.map((date, index) => this.isWeekStart(date)
      ? html`<div class="resource-week-divider" style="left:${offset + index * dayWidth}px"></div>`
      : nothing);
  }

  private renderResourceCalendarBands(resource: GanttResource, dates: Date[], offset: number, dayWidth: number) {
    return dates.map((date, index) => !this.isResourceWorkingDay(resource, date)
      ? html`<div class="resource-calendar-closed ${this.isResourceNonWorkingBlockStart(resource, date) ? 'non-working-start' : ''}" style="left:${offset + index * dayWidth}px; width:${dayWidth}px"></div>`
      : nothing);
  }

  private renderDependencies(
    visibleTasks: GanttTask[],
    taskById: Map<string, GanttTask>,
    start: Date,
    dayWidth: number,
    firstVisibleRow = 0,
    lastVisibleRow = visibleTasks.length,
  ) {
    if (this.options.showDependencies === false || !this.dependencies.length) return nothing;
    const rows = new Map(visibleTasks.map((task, index) => [task.id, index]));
    const paths = this.dependencies.flatMap(dependency => {
      const from = taskById.get(dependency.from);
      const to = taskById.get(dependency.to);
      const fromRow = rows.get(dependency.from);
      const toRow = rows.get(dependency.to);
      if (!from || !to || fromRow === undefined || toRow === undefined) return [];
      // A connector is relevant when it begins, ends, or passes through the
      // virtual window. Its absolute coordinates still preserve its complete path.
      if (Math.max(fromRow, toRow) < firstVisibleRow || Math.min(fromRow, toRow) >= lastVisibleRow) return [];
      const type = dependency.type || 'finish-to-start';
      const fromX = this.dateToX(type === 'start-to-start' || type === 'start-to-finish' ? from.start : this.addDays(from.end, 1), start, dayWidth);
      const toX = this.dateToX(type === 'finish-to-finish' || type === 'start-to-finish' ? this.addDays(to.end, 1) : to.start, start, dayWidth);
      // Les points d'ancrage suivent le centre visuel des barres de tâche.
      const rowHeight = this.getTaskRowHeight();
      const y1 = fromRow * rowHeight + rowHeight / 2;
      const y2 = toRow * rowHeight + rowHeight / 2;
      const targetBarEdgeX = to.type === 'milestone' ? toX - 4 : toX;
      const targetX = Math.max(0, targetBarEdgeX - 8);
      // Deux coudes séparent visuellement le lien de la barre source et de la cible :
      // il sort à droite, revient vers la gauche à mi-hauteur, puis arrive à droite.
      const sourceElbowX = fromX + 8;
      const targetApproachX = Math.max(0, targetX - 8);
      const middleY = (y1 + y2) / 2;
      return [html`
        <div class="dependency-connector">
          <span class="dependency-line horizontal" style="left:${fromX}px; top:${y1}px; width:${Math.max(1, sourceElbowX - fromX)}px"></span>
          <span class="dependency-line vertical" style="left:${sourceElbowX}px; top:${Math.min(y1, middleY)}px; height:${Math.max(1, Math.abs(middleY - y1))}px"></span>
          <span class="dependency-line horizontal" style="left:${Math.min(sourceElbowX, targetApproachX)}px; top:${middleY}px; width:${Math.max(1, Math.abs(targetApproachX - sourceElbowX))}px"></span>
          <span class="dependency-line vertical" style="left:${targetApproachX}px; top:${Math.min(middleY, y2)}px; height:${Math.max(1, Math.abs(y2 - middleY))}px"></span>
          <span class="dependency-line horizontal" style="left:${targetApproachX}px; top:${y2}px; width:${Math.max(1, targetX - targetApproachX)}px"></span>
          <span class="dependency-dot" style="left:${fromX}px; top:${y1}px"></span>
          <span class="dependency-arrow right" style="left:${targetX}px; top:${y2}px"></span>
        </div>
      `];
    });
    return html`<div class="dependency-layer" aria-hidden="true">${paths}</div>`;
  }

  private applyData(data: GanttData, reason: GanttChangeReason, notify: boolean): void {
    this.dependencies = (data.dependencies || []).map(dependency => ({ ...dependency }));
    this.calendars = (data.calendars || []).map(calendar => ({
      ...calendar,
      workingDays: calendar.workingDays ? [...calendar.workingDays] : undefined,
      hours: calendar.hours ? { ...calendar.hours } : undefined,
      exceptions: calendar.exceptions ? { ...calendar.exceptions } : undefined,
    }));
    const scheduledTasks = this.applyInitialDependencySchedule(data.tasks);
    this.tasks = buildTaskTree(this.withDefaultTaskColors(scheduledTasks));
    this.projectName = data.name;
    this.projectMetadata = data.metadata ? { ...data.metadata } : undefined;
    if (!this.historyRestoring) this.resetHistory();
    this.requestUpdate();
    if (notify) this.commit(reason);
    else this.emitProjectSummary();
  }

  private replaceFlatTasks(tasks: GanttTask[], reason: GanttChangeReason, taskId?: string): void {
    this.tasks = buildTaskTree(this.withDefaultTaskColors(tasks));
    this.requestUpdate();
    this.commit(reason, taskId);
  }

  private commit(reason: GanttChangeReason, taskId?: string): void {
    const change = this.createChange(reason, taskId);
    this.recordHistory(change.data);
    this.dispatch('tasks-changed', change);
    this.emitProjectSummary();
    this.options.onTasksChange?.(change.data);
    if (this.autoSave && (this.persistenceAdapter || this.saveHook)) {
      const saves: Promise<void>[] = [];
      if (this.persistenceAdapter) saves.push(this.persistenceAdapter.save(change));
      if (this.saveHook) saves.push(Promise.resolve(this.saveHook(change)));
      void Promise.all(saves).catch(error => {
        this.dispatch('persistence-error', { error, change });
        this.setStatus(this.t('saveFailed'), 'error');
      });
    }
  }

  private isHistoryEnabled(): boolean { return this._options.history?.enabled === true; }

  private getHistoryLimit(): number {
    const value = this._options.history?.maxActions;
    return Number.isFinite(value) ? Math.max(0, Math.floor(Number(value))) : 50;
  }

  private shouldShowHistoryControls(): boolean { return this.isHistoryEnabled() && this._options.history?.showControls !== false; }

  private resetHistory(data: GanttData = this.getData()): void {
    this.history.reset(this.isHistoryEnabled() ? data : undefined);
  }

  private recordHistory(data: GanttData): void {
    if (!this.isHistoryEnabled() || this.historyRestoring) return;
    this.history.record(data, this.getHistoryLimit());
  }

  private restoreHistory(data: GanttData, reason: 'history-undo' | 'history-redo'): void {
    this.historyRestoring = true;
    try {
      this.applyData(data, reason, true);
    } finally {
      this.historyRestoring = false;
    }
  }

  private createChange(reason: GanttChangeReason, taskId?: string): GanttChange {
    return { projectId: this.projectId || null, revision: ++this.revision, reason, taskId, data: this.getData() };
  }

  private emitProjectSummary(): void { this.dispatch('gantt-summary-changed', this.getProjectSummary()); }

  private renderStatus(message: string, kind: 'info' | 'success' | 'error'): void {
    this.statusMessage = message;
    this.statusKind = kind;
    this.requestUpdate();
  }

  private setStatus(message: string, kind: 'info' | 'success' | 'error'): void {
    this.renderStatus(message, kind);
    window.setTimeout(() => {
      if (this.statusMessage === message) {
        this.statusMessage = '';
        this.requestUpdate();
      }
    }, 3500);
  }

  private async chooseImport(accept: string): Promise<void> {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try { await this.importFile(file); }
      catch (error) { this.setStatus(error instanceof Error ? error.message : this.t('importFailed'), 'error'); this.dispatch('project-file-error', { error }); }
    };
    input.click();
  }

  private async download(format: ProjectFileFormat): Promise<void> {
    try {
      const blob = await this.exportFile(format);
      const extension = format === 'mspxml' ? 'xml' : format;
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `${this.projectName || 'gantt-project'}.${extension}`;
      link.click();
      URL.revokeObjectURL(link.href);
      this.setStatus(this.tFormat('exportComplete', { extension: extension.toUpperCase() }), 'success');
    } catch (error) {
      this.setStatus(error instanceof Error ? error.message : this.t('exportFailed'), 'error');
    }
  }

  private saveLocal = (): void => {
    try {
      this.saveToLocalStorage();
    } catch (error) {
      this.setStatus(error instanceof Error ? error.message : this.t('saveLocalFailed'), 'error');
    }
  };

  private loadLocal = (): void => {
    try {
      if (!this.loadFromLocalStorage()) this.setStatus(this.t('noLocalProject'), 'info');
    } catch (error) {
      this.setStatus(error instanceof Error ? error.message : this.t('loadLocalFailed'), 'error');
    }
  };

  private startColumnResize = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    event.preventDefault();
    const startX = event.clientX;
    const sizing = this.getTaskGridSizing();
    const startWidth = this.getHeaderWidth(sizing);
    const { minWidth: minimum, maxWidth: maximum } = sizing;
    const move = (moveEvent: PointerEvent): void => {
      const width = Math.max(minimum, Math.min(maximum, startWidth + moveEvent.clientX - startX));
      this.headerWidthOverride = width;
      this.requestUpdate();
    };
    const stop = (): void => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', stop);
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', stop, { once: true });
  };

  private startTaskColumnResize(event: PointerEvent, column: GanttColumn): void {
    if (!this.canResizeColumns() || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startWidth = this.getColumnWidth(column);
    const minimum = column.key === 'name' ? 120 : 48;
    let changed = false;
    const move = (moveEvent: PointerEvent): void => {
      this.taskColumnWidthOverrides.set(column.key, Math.max(minimum, Math.min(640, startWidth + moveEvent.clientX - startX)));
      changed = true;
      this.requestUpdate();
    };
    const stop = (): void => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', stop);
      if (changed) this.notifyColumnSettingsChange();
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', stop, { once: true });
  }

  private startResourceColumnResize(event: PointerEvent, column: GanttResourceColumn): void {
    if (!this.canResizeColumns() || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startWidth = this.getResourceColumnWidth(column);
    let changed = false;
    const move = (moveEvent: PointerEvent): void => {
      this.resourceColumnWidthOverrides.set(column.key, Math.max(56, Math.min(480, startWidth + moveEvent.clientX - startX)));
      changed = true;
      this.requestUpdate();
    };
    const stop = (): void => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', stop);
      if (changed) this.notifyColumnSettingsChange();
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', stop, { once: true });
  }

  private startResourceResize = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    event.preventDefault();
    const startY = event.clientY;
    const startGanttHeight = this.ganttPanelHeight;
    const splitViewport = this.renderRoot.querySelector<HTMLElement>('.split-viewport');
    const availableHeight = splitViewport?.clientHeight ?? 0;
    const move = (moveEvent: PointerEvent): void => {
      const delta = moveEvent.clientY - startY;
      this.ganttPanelHeight = clampGanttPanelHeight(startGanttHeight + delta, availableHeight);
      this.splitUserResized = true;
      this.requestUpdate();
    };
    const stop = (): void => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', stop);
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', stop, { once: true });
  };

  private changeZoom(delta: number): void {
    const min = this.options.minZoom ?? .5;
    const max = this.options.maxZoom ?? 3;
    this.zoom = Math.max(min, Math.min(max, this.zoom + delta));
    this.requestUpdate();
  }

  private handleWheel = (event: WheelEvent): void => {
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault();
      this.changeZoom(event.deltaY > 0 ? -.1 : .1);
    }
  };

  private isGanttPanEnabled(): boolean {
    const pan = this.options.pan;
    return pan?.enabled === true && (pan.trigger ?? 'empty-area') === 'empty-area';
  }

  /** Starts panning only from the blank timeline grid; task bars keep their own drag and resize gestures. */
  private startGanttPan = (event: PointerEvent): void => {
    if (!this.isGanttPanEnabled() || event.button !== 0) return;
    const target = event.target as HTMLElement | null;
    if (!target?.closest('.timeline-content') || target.closest('.task-bar, .task-work, .summary-bar, .resize-handle, .dependency-layer, .today-line, .empty')) return;
    const timeline = event.currentTarget as HTMLElement;
    const viewport = this.renderRoot.querySelector<HTMLElement>('.gantt-viewport');
    if (!viewport) return;

    event.preventDefault();
    this.ganttPan = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      timelineScrollLeft: timeline.scrollLeft,
      viewportScrollTop: viewport.scrollTop,
      axis: this.options.pan?.axis === 'both' ? 'both' : 'horizontal',
    };
    timeline.classList.add('panning');
    document.addEventListener('pointermove', this.handleGanttPanMove);
    document.addEventListener('pointerup', this.finishGanttPan, { once: true });
    document.addEventListener('pointercancel', this.finishGanttPan, { once: true });
  };

  private handleGanttPanMove = (event: PointerEvent): void => {
    const pan = this.ganttPan;
    if (!pan || event.pointerId !== pan.pointerId) return;
    const timeline = this.renderRoot.querySelector<HTMLElement>('.timeline-scroll');
    const viewport = this.renderRoot.querySelector<HTMLElement>('.gantt-viewport');
    if (!timeline || !viewport) return;
    timeline.scrollLeft = pan.timelineScrollLeft - (event.clientX - pan.startX);
    if (pan.axis === 'both') viewport.scrollTop = pan.viewportScrollTop - (event.clientY - pan.startY);
  };

  private finishGanttPan = (): void => {
    document.removeEventListener('pointermove', this.handleGanttPanMove);
    document.removeEventListener('pointerup', this.finishGanttPan);
    document.removeEventListener('pointercancel', this.finishGanttPan);
    this.renderRoot.querySelector<HTMLElement>('.timeline-scroll')?.classList.remove('panning');
    this.ganttPan = undefined;
  };

  /** Les en-têtes sont en dehors des zones défilantes verticalement pour rester fixes.
   *  Leur contenu suit uniquement le défilement horizontal de sa grille. */
  private syncTaskHeaderScroll = (event: Event): void => {
    const scrollLeft = (event.currentTarget as HTMLElement).scrollLeft;
    const header = this.renderRoot.querySelector<HTMLElement>('.task-header');
    const [scrollbar] = this.renderRoot.querySelectorAll<HTMLElement>('.gantt-horizontal-scroll');
    this.setScrollLeft(header, scrollLeft);
    this.setScrollLeft(scrollbar, scrollLeft);
  };

  private syncTimelineHeaderScroll = (event: Event): void => {
    const timeline = event.currentTarget as HTMLElement;
    this.scheduleTimelineSynchronization(timeline.scrollLeft, timeline);
  };

  private syncTaskGridScroll = (event: Event): void => {
    const scrollLeft = (event.currentTarget as HTMLElement).scrollLeft;
    const grid = this.renderRoot.querySelector<HTMLElement>('.task-pane');
    const header = this.renderRoot.querySelector<HTMLElement>('.task-header');
    this.setScrollLeft(grid, scrollLeft);
    this.setScrollLeft(header, scrollLeft);
  };

  private syncTimelineGridScroll = (event: Event): void => {
    const scrollbar = event.currentTarget as HTMLElement;
    this.scheduleTimelineSynchronization(scrollbar.scrollLeft, scrollbar);
  };

  private syncResourceLeftHeaderScroll = (event: Event): void => {
    const scrollLeft = (event.currentTarget as HTMLElement).scrollLeft;
    const header = this.renderRoot.querySelector<HTMLElement>('.resource-left-header');
    const [scrollbar] = this.renderRoot.querySelectorAll<HTMLElement>('.resource-horizontal-scroll');
    this.setScrollLeft(header, scrollLeft);
    this.setScrollLeft(scrollbar, scrollLeft);
  };

  private syncResourceTimelineHeaderScroll = (event: Event): void => {
    const timeline = event.currentTarget as HTMLElement;
    this.scheduleTimelineSynchronization(timeline.scrollLeft, timeline);
  };

  private syncResourceLeftGridScroll = (event: Event): void => {
    const scrollLeft = (event.currentTarget as HTMLElement).scrollLeft;
    const grid = this.renderRoot.querySelector<HTMLElement>('.resources-left');
    const header = this.renderRoot.querySelector<HTMLElement>('.resource-left-header');
    this.setScrollLeft(grid, scrollLeft);
    this.setScrollLeft(header, scrollLeft);
  };

  private syncResourceTimelineGridScroll = (event: Event): void => {
    const scrollbar = event.currentTarget as HTMLElement;
    this.scheduleTimelineSynchronization(scrollbar.scrollLeft, scrollbar);
  };

  /** Regroupe les événements de défilement jumeaux à une synchronisation par image. */
  private scheduleTimelineSynchronization(scrollLeft: number, source?: HTMLElement): void {
    this.pendingTimelineSynchronization = { scrollLeft, source };
    if (this.timelineSynchronizationFrame !== undefined) return;
    this.timelineSynchronizationFrame = window.requestAnimationFrame(() => {
      this.timelineSynchronizationFrame = undefined;
      const pending = this.pendingTimelineSynchronization;
      this.pendingTimelineSynchronization = undefined;
      if (pending) this.synchronizeTimelineScroll(pending.scrollLeft, pending.source);
    });
  }

  /** Évite les écritures de scroll inutiles qui relanceraient un événement de synchronisation. */
  private setScrollLeft(target: HTMLElement | null | undefined, scrollLeft: number): void {
    if (target && Math.abs(target.scrollLeft - scrollLeft) > .5) target.scrollLeft = scrollLeft;
  }

  /** Synchronises headers, scrollbars and both date grids from either timeline. */
  private synchronizeTimelineScroll(scrollLeft: number, source?: HTMLElement): void {
    const timeline = this.renderRoot.querySelector<HTMLElement>('.timeline-scroll');
    const resourceTimeline = this.renderRoot.querySelector<HTMLElement>('.resource-timeline');
    for (const target of [timeline, resourceTimeline]) {
      if (target !== source) this.setScrollLeft(target, scrollLeft);
    }
    const timelineHeader = this.renderRoot.querySelector<HTMLElement>('.timeline-header');
    const resourceHeader = this.renderRoot.querySelector<HTMLElement>('.resource-day-header');
    const [, ganttScrollbar] = this.renderRoot.querySelectorAll<HTMLElement>('.gantt-horizontal-scroll');
    const [, resourceScrollbar] = this.renderRoot.querySelectorAll<HTMLElement>('.resource-horizontal-scroll');
    this.setScrollLeft(timelineHeader, scrollLeft);
    this.setScrollLeft(resourceHeader, scrollLeft);
    this.setScrollLeft(ganttScrollbar, scrollLeft);
    this.setScrollLeft(resourceScrollbar, scrollLeft);
    if (resourceTimeline) this.updateResourceTimelineViewport(resourceTimeline.scrollLeft, resourceTimeline.clientWidth);
  }

  /** Fenêtre horizontale rendue dans la grille Ressources (avec marge de sécurité). */
  private getResourceDateWindow(totalDays: number, dayWidth: number): { start: number; end: number } {
    return calculateResourceDateWindow(totalDays, dayWidth, this.resourceTimelineViewport);
  }

  private updateResourceTimelineViewport(scrollLeft: number, width: number): void {
    const previous = this.resourceTimelineViewport;
    const dayWidth = this.resourceTimelineDayWidth;
    const previousDay = Math.floor(previous.scrollLeft / dayWidth);
    const currentDay = Math.floor(scrollLeft / dayWidth);
    if (previous.width === width && previousDay === currentDay) return;
    this.resourceTimelineViewport = { scrollLeft, width };
    this.requestUpdate();
  }

  private handleKeyDown = (event: KeyboardEvent): void => {
    if (this.isEditableKeyboardTarget(event.target)) return;
    if (event.key === 'Escape') {
      const hasOverlay = Boolean(this.resourceContextMenu || this.ganttContextMenu || this.taskContextMenu || this.taskEditorId || this.resourcePickerTaskId);
      this.closeOpenContextMenus();
      this.closeTaskEditor();
      if (hasOverlay) event.preventDefault();
      return;
    }
    if (this.matchesHistoryShortcut(event, this.options.history?.undoShortcut ?? ['Ctrl+z', 'Meta+z'])) {
      if (this.undo()) event.preventDefault();
      return;
    }
    if (this.matchesHistoryShortcut(event, this.options.history?.redoShortcut ?? ['Ctrl+y', 'Ctrl+Shift+z', 'Meta+y', 'Meta+Shift+z'])) {
      if (this.redo()) event.preventDefault();
      return;
    }
    if (event.key === 'Delete' && this.selectedTaskId && this.options.taskDeletion?.keyboardShortcut !== false) {
      event.preventDefault();
      void this.deleteTask(this.selectedTaskId, 'keyboard');
    }
  };

  private isEditableKeyboardTarget(target: EventTarget | null): boolean {
    const element = target as HTMLElement | null;
    return Boolean(element?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(element?.tagName || ''));
  }

  private matchesHistoryShortcut(event: KeyboardEvent, shortcut: string | string[] | false): boolean {
    if (!this.isHistoryEnabled() || shortcut === false) return false;
    const candidates = Array.isArray(shortcut) ? shortcut : [shortcut];
    return candidates.some(candidate => {
      const parts = candidate.toLowerCase().split('+').map(part => part.trim()).filter(Boolean);
      const key = parts.pop();
      if (!key) return false;
      const needsCtrl = parts.includes('ctrl') || parts.includes('control');
      const needsMeta = parts.includes('meta') || parts.includes('cmd') || parts.includes('command');
      const needsShift = parts.includes('shift');
      const needsAlt = parts.includes('alt') || parts.includes('option');
      const normalizedKey = key === 'space' ? ' ' : key;
      return event.key.toLowerCase() === normalizedKey
        && event.ctrlKey === needsCtrl
        && event.metaKey === needsMeta
        && event.shiftKey === needsShift
        && event.altKey === needsAlt;
    });
  }

  private handleDragStart(event: DragEvent, taskId: string): void {
    if (!this.isTaskEditable(this.findTask(taskId))) {
      event.preventDefault();
      return;
    }
    this.draggedTaskId = taskId;
    this.clearTaskDropTarget();
    event.dataTransfer?.setData('text/plain', taskId);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
  }

  /** The left gutter is an explicit, easy-to-hit drop target for one-level outdenting. */
  private isTaskOutdentDrop(event: DragEvent, row: HTMLElement, taskId: string): boolean {
    if (!this.findTask(taskId)?.parentId) return false;
    const nameCell = row.querySelector<HTMLElement>('.task-cell.name');
    const bounds = (nameCell || row).getBoundingClientRect();
    const gutterWidth = Math.min(44, Math.max(28, bounds.width * 0.15));
    return event.clientX <= bounds.left + gutterWidth;
  }

  private handleDragOver(event: DragEvent, targetTaskId: string): void {
    const taskId = this.draggedTaskId;
    if (!taskId || !this.isTaskEditable(this.findTask(taskId)) || this.isDescendant(targetTaskId, taskId)) return;
    const target = this.findTask(targetTaskId);
    if (!target) return;
    const row = event.currentTarget as HTMLElement;
    const outdent = this.isTaskOutdentDrop(event, row, taskId);
    if (taskId === targetTaskId && !outdent) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    const bounds = row.getBoundingClientRect();
    const offset = Math.max(0, Math.min(bounds.height, event.clientY - bounds.top));
    const position = outdent ? 'outdent' : target.type === 'parent'
      ? (offset < bounds.height * 0.25 ? 'before' : offset > bounds.height * 0.75 ? 'after' : 'inside')
      : this.getRelativeTaskDropPosition(taskId, targetTaskId);
    if (this.taskDropTarget?.taskId !== targetTaskId || this.taskDropTarget.position !== position) {
      this.taskDropTarget = { taskId: targetTaskId, position };
      this.requestUpdate();
    }
  }

  private handleDrop(event: DragEvent, targetTaskId: string): void {
    event.preventDefault();
    const taskId = this.draggedTaskId || event.dataTransfer?.getData('text/plain');
    const target = this.findTask(targetTaskId);
    const fallbackPosition = target?.type === 'parent' ? 'inside' : taskId ? this.getRelativeTaskDropPosition(taskId, targetTaskId) : 'after';
    const position = this.taskDropTarget?.taskId === targetTaskId ? this.taskDropTarget.position : fallbackPosition;
    this.draggedTaskId = null;
    this.clearTaskDropTarget();
    if (!taskId || !this.isTaskEditable(this.findTask(taskId))) return;
    if (position === 'outdent') this.outdentTask(taskId);
    else if (position === 'inside') this.moveTask(taskId, targetTaskId);
    else this.reorderTask(taskId, targetTaskId, position);
  }

  private clearTaskDropTarget = (): void => {
    if (!this.taskDropTarget) return;
    this.taskDropTarget = undefined;
    this.requestUpdate();
  };

  /** A regular task accepts siblings only: moving upward means before, downward means after. */
  private getRelativeTaskDropPosition(taskId: string, targetTaskId: string): 'before' | 'after' {
    const tasks = this.getFlatTasks();
    return tasks.findIndex(task => task.id === taskId) < tasks.findIndex(task => task.id === targetTaskId) ? 'after' : 'before';
  }

  private startBarDrag(event: PointerEvent, task: GanttTask, mode: 'move' | 'resize-start' | 'resize-end'): void {
    if (event.button !== 0 || !this.isTaskEditable(task)) return;
    this.closeTaskTooltip();
    event.preventDefault();
    event.stopPropagation();
    this.selectTask(task.id);
    const timeline = this.renderRoot.querySelector<HTMLElement>('.timeline-scroll');
    this.barDrag = { taskId: task.id, mode, startX: event.clientX, originalStart: task.start, originalEnd: task.end, currentStart: task.start, currentEnd: task.end, baseTasks: this.getFlatTasks(), changed: false, initialScrollLeft: timeline?.scrollLeft || 0, pointerX: event.clientX };
    document.addEventListener('pointermove', this.handleBarDragMove);
    document.addEventListener('pointerup', this.finishBarDrag, { once: true });
    this.barDrag.autoScrollFrame = window.requestAnimationFrame(this.handleBarDragAutoScroll);
  }

  private handleBarDragMove = (event: PointerEvent): void => {
    const drag = this.barDrag;
    if (!drag) return;
    drag.pointerX = event.clientX;
    drag.pendingX = event.clientX;
    if (drag.frame !== undefined) return;
    drag.frame = window.requestAnimationFrame(() => {
      const activeDrag = this.barDrag;
      if (!activeDrag) return;
      activeDrag.frame = undefined;
      this.applyBarDragPosition(activeDrag.pendingX ?? activeDrag.startX);
    });
  };

  /** Scrolls the timeline while a bar is held near either horizontal edge. */
  private handleBarDragAutoScroll = (): void => {
    const drag = this.barDrag;
    if (!drag) return;
    const timeline = this.renderRoot.querySelector<HTMLElement>('.timeline-scroll');
    if (timeline && drag.pointerX !== undefined) {
      const bounds = timeline.getBoundingClientRect();
      const edgeSize = Math.min(84, Math.max(36, bounds.width * .16));
      let direction = 0;
      let intensity = 0;
      if (drag.pointerX < bounds.left + edgeSize) {
        direction = -1;
        intensity = 1 - Math.max(0, drag.pointerX - bounds.left) / edgeSize;
      } else if (drag.pointerX > bounds.right - edgeSize) {
        direction = 1;
        intensity = 1 - Math.max(0, bounds.right - drag.pointerX) / edgeSize;
      }
      if (direction) {
        const maximum = Math.max(0, timeline.scrollWidth - timeline.clientWidth);
        const nextScrollLeft = Math.max(0, Math.min(maximum, timeline.scrollLeft + direction * Math.max(2, Math.ceil(intensity * 18))));
        if (nextScrollLeft !== timeline.scrollLeft) {
          timeline.scrollLeft = nextScrollLeft;
          this.applyBarDragPosition(drag.pointerX);
        }
      }
    }
    if (this.barDrag) this.barDrag.autoScrollFrame = window.requestAnimationFrame(this.handleBarDragAutoScroll);
  };

  /** Limite les rendus pendant un glisser-déposer à une mise à jour par image. */
  private applyBarDragPosition(clientX: number): void {
    const drag = this.barDrag;
    if (!drag) return;
    const timeline = this.renderRoot.querySelector<HTMLElement>('.timeline-scroll');
    const scrollDelta = (timeline?.scrollLeft || 0) - drag.initialScrollLeft;
    const delta = Math.round((clientX - drag.startX + scrollDelta) / this.getDayWidth());
    let start = drag.originalStart;
    let end = drag.originalEnd;
    if (drag.mode === 'move') { start = this.addDays(start, delta); end = this.addDays(end, delta); }
    if (drag.mode === 'resize-start') start = this.addDays(start, Math.min(delta, diffDays(start, end)));
    if (drag.mode === 'resize-end') end = this.addDays(end, Math.max(delta, -diffDays(start, end)));
    if (start === drag.currentStart && end === drag.currentEnd) return;
    drag.currentStart = start;
    drag.currentEnd = end;
    drag.changed = start !== drag.originalStart || end !== drag.originalEnd;
    this.updateTaskDates(drag.taskId, start, end, drag.mode, drag.baseTasks);
  }

  private finishBarDrag = (): void => {
    document.removeEventListener('pointermove', this.handleBarDragMove);
    const drag = this.barDrag;
    if (!drag) return;
    if (drag.autoScrollFrame !== undefined) window.cancelAnimationFrame(drag.autoScrollFrame);
    if (drag.frame !== undefined) {
      window.cancelAnimationFrame(drag.frame);
      drag.frame = undefined;
      this.applyBarDragPosition(drag.pendingX ?? drag.startX);
    }
    const { taskId, changed } = drag;
    this.barDrag = undefined;
    if (changed) this.commit('task-updated', taskId);
  };

  private updateTaskDates(
    taskId: string,
    start: string,
    end: string,
    mode: 'move' | 'resize-start' | 'resize-end' = 'move',
    baseTasks: GanttTask[] = this.getFlatTasks(),
  ): void {
    if (!this.isTaskEditable(this.findTask(taskId))) return;
    const next = scheduleTaskDates(baseTasks, this.dependencies, taskId, start, end, mode, (resource, date) => this.isResourceWorkingDay(resource, date));
    this.tasks = buildTaskTree(next);
    this.requestUpdate();
  }

  /** Met le planning en cohérence avant le premier rendu : un lien Fin → Début
   * ne peut pas pointer vers une tâche qui commence avant la fin de sa source. */
  private applyInitialDependencySchedule(tasks: GanttTask[]): GanttTask[] {
    if (this.options.autoSchedule === false || !this.dependencies.length) return tasks;
    return scheduleInitialDependencies(tasks, this.dependencies);
  }

  private editTaskName(task: GanttTask): void {
    if (!this.isTaskEditable(task)) return;
    const value = window.prompt(this.t('name'), task.name);
    if (value !== null && value.trim() && value.trim() !== task.name) this.updateTask(task.id, { name: value.trim() });
  }

  /** Keeps the grid gesture independent from the timeline-bar double-click action. */
  private handleTaskGridDoubleClick(task: GanttTask): void {
    switch (this.options.taskGridDoubleClickAction ?? 'rename') {
      case 'edit':
        this.openTaskEditor(task.id);
        break;
      case 'rename':
        this.editTaskName(task);
        break;
      default:
        break;
    }
  }

  /** Opens the editor from a timeline bar without changing the grid double-click behaviour. */
  private openTaskEditorFromBar(task: GanttTask, event: MouseEvent): void {
    event.stopPropagation();
    if (this.options.openTaskEditorOnDoubleClick && this.isTaskEditable(task)) this.openTaskEditor(task.id);
  }

  private deleteSelected = (): void => { if (this.selectedTaskId) void this.deleteTask(this.selectedTaskId, 'toolbar'); };

  private isTaskDeletionEnabled(): boolean { return this.options.taskDeletion?.enabled !== false; }

  private getFlatTasks(): GanttTask[] {
    return flattenTaskTree(this.tasks);
  }

  /** Returns the contiguous tree branch to preserve when a row is repositioned. */
  private getTaskSubtreeIds(rootId: string, tasks: GanttTask[]): Set<string> {
    return getTaskSubtreeIds(rootId, tasks);
  }

  private getTaskSubtreeTasks(rootId: string): GanttTask[] {
    const tasks = this.getFlatTasks();
    const ids = this.getTaskSubtreeIds(rootId, tasks);
    return tasks.filter(task => ids.has(task.id));
  }

  /** Prépare les index nécessaires au rendu, une seule fois par mise à jour. */
  private prepareRenderCaches(flatTasks: GanttTask[]): void {
    this.renderTaskIndex = new Map(flatTasks.map(task => [task.id, task]));
    this.renderTaskDepths = getTaskDepths(flatTasks);
    this.renderTaskCodes = getTaskOutlineCodes(this.tasks);

    this.renderTaskCosts = calculateTaskCosts(this.tasks, resource => this.getResourceCost(resource));
  }

  private findTask(taskId: string | null): GanttTask | null {
    if (!taskId) return null;
    return this.getFlatTasks().find(task => task.id === taskId) || null;
  }

  /** Centralises task-level locks for every built-in editing interaction. */
  private isTaskEditable(task: GanttTask | null): boolean {
    if (!task) return false;
    return task.editable !== false && this.options.isTaskEditable?.(task) !== false;
  }

  private getDepth(task: GanttTask): number {
    const cached = this.renderTaskDepths.get(task.id);
    if (cached !== undefined) return cached;
    let depth = 0;
    let parentId = task.parentId;
    const all = this.getFlatTasks();
    while (parentId) { depth += 1; parentId = all.find(candidate => candidate.id === parentId)?.parentId || null; if (depth > 100) break; }
    return depth;
  }

  private getColumns(): GanttColumn[] {
    return this.orderColumns('task', this.getConfiguredColumns()).filter(column => this.isColumnVisible(column));
  }

  private getResourceColumns(): GanttResourceColumn[] {
    return this.orderColumns('resource', this.getConfiguredResourceColumns()).filter(column => this.isResourceColumnVisible(column));
  }

  private getResourceColumnWidth(column: GanttResourceColumn): number {
    return this.resourceColumnWidthOverrides.get(column.key) ?? Math.max(56, Math.min(480, column.width));
  }

  private getConfiguredColumns(): GanttColumn[] {
    if (this.options.taskColumns?.length) return this.options.taskColumns;
    return DEFAULT_TASK_COLUMNS.map(({ labelKey, ...column }) => ({ ...column, label: this.t(labelKey) }));
  }

  private getConfiguredResourceColumns(): GanttResourceColumn[] {
    if (this.options.resourceColumns?.length) return this.options.resourceColumns;
    return DEFAULT_RESOURCE_COLUMNS.map(({ labelKey, ...column }) => ({ ...column, label: this.t(labelKey) }));
  }

  private getColumnWidth(column: GanttColumn): number {
    return this.taskColumnWidthOverrides.get(column.key) ?? column.width;
  }

  private isColumnRequired(column: GanttColumn): boolean {
    return column.key === 'name' || Boolean(column.required);
  }

  private isColumnVisible(column: GanttColumn): boolean {
    if (this.isColumnRequired(column)) return true;
    return this.taskColumnVisibilityOverrides.get(column.key) ?? column.visible !== false;
  }

  private isResourceColumnRequired(column: GanttResourceColumn): boolean { return Boolean(column.required); }

  private isResourceColumnVisible(column: GanttResourceColumn): boolean {
    if (this.isResourceColumnRequired(column)) return true;
    return this.resourceColumnVisibilityOverrides.get(column.key) ?? column.visible !== false;
  }

  private isColumnSettingsEnabled(): boolean { return this.options.columnSettings?.enabled !== false; }
  private canResizeColumns(): boolean { return this.isColumnSettingsEnabled() && this.options.columnSettings?.allowResize !== false; }
  private canReorderColumns(): boolean { return this.isColumnSettingsEnabled() && this.options.columnSettings?.allowReorder !== false; }
  private canToggleColumnVisibility(): boolean { return this.isColumnSettingsEnabled() && this.options.columnSettings?.allowVisibility !== false; }
  private canChangeTaskRowHeight(): boolean { return this.isColumnSettingsEnabled() && this.options.columnSettings?.allowTaskRowHeight !== false; }

  private getTaskRowHeight(): number {
    const value = Number(this.taskRowHeightOverride ?? this.options.taskRowHeight ?? ROW_HEIGHT);
    return Number.isFinite(value) ? Math.max(28, Math.min(96, Math.round(value))) : ROW_HEIGHT;
  }

  private updateTaskRowHeight(height: number, notify: boolean): void {
    const value = Number(height);
    if (!Number.isFinite(value)) return;
    const next = Math.max(28, Math.min(96, Math.round(value)));
    if (this.taskRowHeightOverride === next) {
      if (notify) this.notifyColumnSettingsChange();
      return;
    }
    this.taskRowHeightOverride = next;
    this.requestUpdate();
    if (notify) this.notifyColumnSettingsChange();
  }

  private orderColumns<T extends { key: string }>(scope: 'task' | 'resource', columns: T[]): T[] {
    const order = scope === 'task' ? this.taskColumnOrder : this.resourceColumnOrder;
    const positions = new Map(order.map((key, index) => [key, index]));
    return [...columns].sort((left, right) => {
      const leftPosition = positions.get(left.key) ?? columns.findIndex(column => column.key === left.key);
      const rightPosition = positions.get(right.key) ?? columns.findIndex(column => column.key === right.key);
      return leftPosition - rightPosition;
    });
  }

  private toggleColumnMenu = (): void => {
    this.columnMenuOpen = !this.columnMenuOpen;
    this.requestUpdate();
  };

  private setColumnVisibility(scope: 'task' | 'resource', column: GanttColumn | GanttResourceColumn, event: Event): void {
    if (!this.canToggleColumnVisibility()) return;
    const required = scope === 'task'
      ? this.isColumnRequired(column as GanttColumn)
      : this.isResourceColumnRequired(column as GanttResourceColumn);
    if (required) return;
    const overrides = scope === 'task' ? this.taskColumnVisibilityOverrides : this.resourceColumnVisibilityOverrides;
    overrides.set(column.key, (event.target as HTMLInputElement).checked);
    this.requestUpdate();
    this.notifyColumnSettingsChange();
  }

  /** Returns the effective, serializable layout of both left-hand grids. */
  getColumnSettings(): GanttColumnSettings {
    const taskColumns = this.orderColumns('task', this.getConfiguredColumns()).map((column, order): GanttColumnSetting => ({
      key: column.key,
      order,
      width: this.getColumnWidth(column),
      visible: this.isColumnVisible(column),
    }));
    const resourceColumns = this.orderColumns('resource', this.getConfiguredResourceColumns()).map((column, order): GanttColumnSetting => ({
      key: column.key,
      order,
      width: this.getResourceColumnWidth(column),
      visible: this.isResourceColumnVisible(column),
    }));
    return {
      taskColumns,
      resourceColumns,
      taskRowHeight: this.getTaskRowHeight(),
    };
  }

  /** Applies a layout obtained from a host API or a previous getColumnSettings() call. */
  setColumnSettings(settings: Partial<GanttColumnSettings>): void {
    this.applyColumnSettings('task', settings.taskColumns, this.getConfiguredColumns());
    this.applyColumnSettings('resource', settings.resourceColumns, this.getConfiguredResourceColumns());
    if (settings.taskRowHeight !== undefined) this.updateTaskRowHeight(settings.taskRowHeight, false);
    this.requestUpdate();
  }

  /** Restores configured widths, visibility and order, then calls the optional host reset hook. */
  resetColumnSettings = (): void => {
    this.taskColumnVisibilityOverrides.clear();
    this.taskColumnWidthOverrides.clear();
    this.resourceColumnVisibilityOverrides.clear();
    this.resourceColumnWidthOverrides.clear();
    this.taskColumnOrder = [];
    this.resourceColumnOrder = [];
    this.taskRowHeightOverride = undefined;
    this.requestUpdate();
    const settings = this.getColumnSettings();
    this.dispatchEvent(new CustomEvent<GanttColumnSettings>('column-settings-reset', { detail: settings, bubbles: true, composed: true }));
    this.callColumnSettingsHook(this.options.columnSettings?.onReset, settings);
  };

  private applyColumnSettings<T extends { key: string; width: number; visible?: boolean }>(scope: 'task' | 'resource', settings: GanttColumnSetting[] | undefined, columns: T[]): void {
    if (!settings) return;
    const configuredKeys = new Set(columns.map(column => column.key));
    const ordered = [...settings]
      .filter(setting => configuredKeys.has(setting.key))
      .sort((left, right) => left.order - right.order)
      .map(setting => setting.key);
    const remaining = columns.map(column => column.key).filter(key => !ordered.includes(key));
    const visibility = scope === 'task' ? this.taskColumnVisibilityOverrides : this.resourceColumnVisibilityOverrides;
    const widths = scope === 'task' ? this.taskColumnWidthOverrides : this.resourceColumnWidthOverrides;
    for (const setting of settings) {
      if (!configuredKeys.has(setting.key)) continue;
      visibility.set(setting.key, setting.visible);
      widths.set(setting.key, Math.max(scope === 'task' && setting.key === 'name' ? 120 : scope === 'resource' ? 56 : 48, Math.min(scope === 'resource' ? 480 : 640, setting.width)));
    }
    if (scope === 'task') this.taskColumnOrder = [...ordered, ...remaining];
    else this.resourceColumnOrder = [...ordered, ...remaining];
  }

  private notifyColumnSettingsChange(): void {
    const settings = this.getColumnSettings();
    this.dispatchEvent(new CustomEvent<GanttColumnSettings>('column-settings-changed', { detail: settings, bubbles: true, composed: true }));
    this.callColumnSettingsHook(this.options.columnSettings?.onChange, settings);
  }

  private callColumnSettingsHook(hook: ((settings: GanttColumnSettings) => void | Promise<void>) | undefined, settings: GanttColumnSettings): void {
    if (!hook) return;
    try { void Promise.resolve(hook(settings)).catch(error => console.error('Unable to save Gantt column settings.', error)); }
    catch (error) { console.error('Unable to save Gantt column settings.', error); }
  }

  private renderColumnDragHandle(scope: 'task' | 'resource', key: string, label: string) {
    if (!this.canReorderColumns()) return nothing;
    return html`<span class="column-drag-handle" draggable="true" aria-hidden="true" title=${this.tFormat('reorderColumn', { column: label })} @dragstart=${(event: DragEvent) => this.startColumnDrag(event, scope, key)} @dragend=${() => { this.draggedColumn = undefined; }}>
      <svg viewBox="0 0 10 14" aria-hidden="true"><circle cx="3" cy="2" r="1.15"></circle><circle cx="7" cy="2" r="1.15"></circle><circle cx="3" cy="7" r="1.15"></circle><circle cx="7" cy="7" r="1.15"></circle><circle cx="3" cy="12" r="1.15"></circle><circle cx="7" cy="12" r="1.15"></circle></svg>
    </span>`;
  }

  private startColumnDrag(event: DragEvent, scope: 'task' | 'resource', key: string): void {
    if (!this.canReorderColumns()) return;
    this.draggedColumn = { scope, key };
    event.dataTransfer?.setData('text/plain', `${scope}:${key}`);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
  }

  private allowColumnDrop(event: DragEvent, scope: 'task' | 'resource'): void {
    if (!this.canReorderColumns() || !this.draggedColumn || this.draggedColumn.scope !== scope) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
  }

  private dropColumn(event: DragEvent, scope: 'task' | 'resource', targetKey: string): void {
    if (!this.canReorderColumns()) return;
    event.preventDefault();
    const dragged = this.draggedColumn;
    this.draggedColumn = undefined;
    if (!dragged || dragged.scope !== scope || dragged.key === targetKey) return;
    const order = scope === 'task'
      ? this.orderColumns('task', this.getConfiguredColumns()).map(column => column.key)
      : this.orderColumns('resource', this.getConfiguredResourceColumns()).map(column => column.key);
    const from = order.indexOf(dragged.key);
    const to = order.indexOf(targetKey);
    if (from < 0 || to < 0) return;
    order.splice(from, 1);
    order.splice(to, 0, dragged.key);
    if (scope === 'task') this.taskColumnOrder = order;
    else this.resourceColumnOrder = order;
    this.requestUpdate();
    this.notifyColumnSettingsChange();
  }

  private moveColumn(scope: 'task' | 'resource', key: string, direction: -1 | 1): void {
    if (!this.canReorderColumns()) return;
    const order = scope === 'task'
      ? this.orderColumns('task', this.getConfiguredColumns()).map(column => column.key)
      : this.orderColumns('resource', this.getConfiguredResourceColumns()).map(column => column.key);
    const current = order.indexOf(key);
    const target = current + direction;
    if (current < 0 || target < 0 || target >= order.length) return;
    [order[current], order[target]] = [order[target], order[current]];
    if (scope === 'task') this.taskColumnOrder = order;
    else this.resourceColumnOrder = order;
    this.requestUpdate();
    this.notifyColumnSettingsChange();
  }

  private renderColumnMenu() {
    if (!this.columnMenuOpen) return nothing;
    return html`<div class="column-menu" @click=${(event: Event) => event.stopPropagation()}>
      <strong>${this.t('columnMenuTitle')}</strong>
      ${this.canChangeTaskRowHeight() ? html`<section class="column-menu-section column-menu-range">
        <label for="task-row-height">${this.t('taskRowHeight')}</label>
        <input id="task-row-height" type="range" min="28" max="96" step="1" .value=${String(this.getTaskRowHeight())} @input=${(event: Event) => this.updateTaskRowHeight(Number((event.target as HTMLInputElement).value), false)} @change=${(event: Event) => this.updateTaskRowHeight(Number((event.target as HTMLInputElement).value), true)} />
        <output>${this.getTaskRowHeight()} px</output>
      </section>` : nothing}
      ${this.renderColumnSettingsGroup('task', this.t('taskColumns'), this.getConfiguredColumns())}
      ${this.renderColumnSettingsGroup('resource', this.t('resourceColumns'), this.getConfiguredResourceColumns())}
      <div class="column-menu-actions"><button @click=${this.resetColumnSettings}>${this.t('reset')}</button></div>
    </div>`;
  }

  private renderColumnSettingsGroup(scope: 'task' | 'resource', title: string, columns: Array<GanttColumn | GanttResourceColumn>) {
    const ordered = this.orderColumns(scope, columns);
    return html`<section class="column-menu-section"><span>${title}</span>
      ${ordered.map((column, index) => {
        const required = scope === 'task' ? this.isColumnRequired(column as GanttColumn) : this.isResourceColumnRequired(column as GanttResourceColumn);
        const visible = scope === 'task' ? this.isColumnVisible(column as GanttColumn) : this.isResourceColumnVisible(column as GanttResourceColumn);
        return html`<label class=${required ? 'required' : ''}>
          <input type="checkbox" ?checked=${visible} ?disabled=${required || !this.canToggleColumnVisibility()} @change=${(event: Event) => this.setColumnVisibility(scope, column, event)} />
          <span>${column.label}</span>${required ? html`<small>${this.t('required')}</small>` : nothing}
          <button aria-label=${this.tFormat('moveColumnEarlier', { column: column.label })} ?disabled=${!this.canReorderColumns() || index === 0} @click=${() => this.moveColumn(scope, column.key, -1)}>←</button>
          <button aria-label=${this.tFormat('moveColumnLater', { column: column.label })} ?disabled=${!this.canReorderColumns() || index === ordered.length - 1} @click=${() => this.moveColumn(scope, column.key, 1)}>→</button>
        </label>`;
      })}
    </section>`;
  }

  private getColumnValue(task: GanttTask, column: GanttColumn): unknown {
    if (column.value) return column.value(task);
    switch (column.key) {
      case 'mode': return task.mode || (task.type === 'milestone' ? this.t('milestone') : task.type === 'parent' ? this.t('automatic') : this.t('manual'));
      case 'code': return this.renderTaskCodes.get(task.id) || task.code || task.id;
      case 'name': return task.name;
      case 'duration': return this.getTaskDurationDays(task);
      case 'start': return task.start;
      case 'end': return task.end;
      case 'costTotal': return this.getTaskCost(task);
      case 'plannedCost': return task.plannedCost ?? task.metadata?.plannedCost ?? this.getTaskCost(task);
      case 'actualCost': return task.actualCost ?? task.metadata?.actualCost ?? '';
      case 'unit': return task.unit || '';
      case 'unitCost': return task.unitCost ?? task.metadata?.unitCost ?? '';
      case 'quantity': return task.quantity ?? task.metadata?.quantity ?? '';
      case 'quantityPerDay': return task.quantityPerDay ?? task.metadata?.quantityPerDay ?? '';
      default: return task.fields?.[column.key] ?? task.metadata?.[column.key] ?? '';
    }
  }

  private getTaskDurationDays(task: GanttTask): number {
    const configuredDuration = Number(task.metadata?.duration);
    return Number.isFinite(configuredDuration) ? configuredDuration : diffDays(task.start, task.end);
  }

  private formatColumnValue(value: unknown, column: GanttColumn, task: GanttTask): string {
    if (value === null || value === undefined || value === '') return '';
    if (column.format) return column.format(value, task);
    if (this.isNumericColumn(column) && typeof value === 'number') return this.formatNumber(value);
    return String(value);
  }

  private formatNumber(value: number): string {
    const locale = this.getLocale();
    if (!this.numberFormatter || this.numberFormatterLocale !== locale) {
      this.numberFormatter = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
      this.numberFormatterLocale = locale;
    }
    return this.numberFormatter.format(Number(value) || 0);
  }

  private getTaskCost(task: GanttTask): number {
    const cached = this.renderTaskCosts.get(task.id);
    if (cached !== undefined) return cached;
    const ownResources = (task.resources || []).reduce((total, resource) => total + this.getResourceCost(resource), 0);
    const ownCost = ownResources || Number(task.unitCost || task.metadata?.unitCost || 0) * Number(task.quantity || task.metadata?.quantity || 0);
    const childrenCost = (task.children || []).reduce((total, child) => total + this.getTaskCost(child), 0);
    const total = ownCost + childrenCost;
    this.renderTaskCosts.set(task.id, total);
    return total;
  }

  private getResourceTotalQuantity(resource: GanttResource): number {
    return calculateResourceTotalQuantity(resource);
  }

  /** Quantities are stored to two decimals; normalize sums to avoid binary floating-point artefacts. */
  private roundQuantity(value: number): number {
    return roundResourceQuantity(value);
  }

  private createDistributedQuantities(start: string, end: string, requestedTotal: number, resource?: GanttResource): Record<string, number> | undefined {
    return distributeResourceQuantity(start, end, requestedTotal, resource, (item, date) => this.isResourceWorkingDay(item, date));
  }

  private getResourceCost(resource: GanttResource): number {
    return calculateResourceCost(resource);
  }

  private getWorkSegments(task: GanttTask, timelineStart: Date, dayWidth: number): Array<{ left: number; width: number }> | null {
    const daily = this.getTaskDailyQuantities(task);
    if (!daily) return null;
    const days = Math.max(1, diffDays(task.start, task.end) + 1);
    const segments: Array<{ left: number; width: number }> = [];
    let segmentStart: string | null = null;
    let previousDate: string | null = null;
    for (let index = 0; index < days; index += 1) {
      const date = this.addDays(task.start, index);
      const hasWork = (daily[date] || 0) > 0;
      if (hasWork && !segmentStart) segmentStart = date;
      if (!hasWork && segmentStart) {
        const segmentEnd = previousDate || date;
        segments.push({ left: this.dateToX(segmentStart, timelineStart, dayWidth), width: Math.max(dayWidth, (diffDays(segmentStart, segmentEnd) + 1) * dayWidth) });
        segmentStart = null;
      }
      if (hasWork) previousDate = date;
    }
    if (segmentStart) {
      const segmentEnd = previousDate || segmentStart;
      segments.push({ left: this.dateToX(segmentStart, timelineStart, dayWidth), width: Math.max(dayWidth, (diffDays(segmentStart, segmentEnd) + 1) * dayWidth) });
    }
    return segments;
  }

  private getTaskDailyQuantities(task: GanttTask): Record<string, number> | null {
    const resources = task.resources || [];
    if (!resources.some(resource => resource.quantityByDate)) return null;
    return resources.reduce<Record<string, number>>((daily, resource) => {
      Object.entries(resource.quantityByDate || {}).forEach(([date, value]) => { daily[date] = this.roundQuantity((daily[date] || 0) + (Number(value) || 0)); });
      return daily;
    }, {});
  }

  private getParentOptions(taskId: string): GanttTask[] {
    return this.getFlatTasks().filter(task => task.id !== taskId && !this.isDescendant(task.id, taskId));
  }

  private getLinkOptions(taskId: string): GanttTask[] {
    const linked = new Set(this.dependencies.filter(dependency => dependency.to === taskId).map(dependency => dependency.from));
    return this.getFlatTasks().filter(task => task.id !== taskId && !linked.has(task.id));
  }

  private addDependencyFromSelect(taskId: string, event: Event): void {
    const select = event.target as HTMLSelectElement;
    if (!select.value) return;
    this.addDependency(select.value, taskId);
    select.value = '';
  }

  addResource(taskId: string, resource: Partial<GanttResource> = {}): GanttResource | null {
    const task = this.findTask(taskId);
    if (!task || !this.isTaskEditable(task)) return null;
    const totalQuantity = resource.totalQuantity ?? resource.quantity ?? 1;
    const created: GanttResource = {
      id: resource.id || this.createId(),
      resourceId: resource.resourceId,
      name: resource.name || this.t('newResource'),
      type: resource.type || 'work',
      unit: resource.unit || 'U',
      unitCost: resource.unitCost ?? 0,
      quantity: resource.quantity ?? 1,
      calendarId: resource.calendarId || this.calendars[0]?.id,
      maxUnits: resource.maxUnits,
      totalQuantity: resource.totalQuantity,
      cost: resource.cost,
      metadata: resource.metadata,
    };
    // Initialize the daily distribution when a resource is added. Without
    // this, the total is visible but the daily inputs remain empty until the
    // user edits Total quantity manually.
    created.quantityByDate = resource.quantityByDate
      ?? this.createDistributedQuantities(task.start, task.end, totalQuantity, created);
    const next = this.getFlatTasks().map(item => item.id === taskId ? { ...item, resources: [...(item.resources || []), created] } : item);
    this.replaceFlatTasks(next, 'task-updated', taskId);
    return created;
  }

  private updateResource(taskId: string, resourceId: string, field: keyof GanttResource, value: unknown): void {
    if (!this.isTaskEditable(this.findTask(taskId))) return;
    const next = this.getFlatTasks().map(task => {
      if (task.id !== taskId) return task;
      const resources = (task.resources || []).map(resource => {
        if (resource.id !== resourceId) return resource;
        const updated = { ...resource, [field]: value };
        if (field === 'calendarId') {
          const total = this.getResourceTotalQuantity(resource);
          return { ...updated, quantity: total, quantityByDate: this.createDistributedQuantities(task.start, task.end, total, updated), totalQuantity: undefined, cost: undefined };
        }
        const cost = field === 'unitCost' || field === 'quantity'
          ? Number(field === 'unitCost' ? value : resource.unitCost) * Number(field === 'quantity' ? value : resource.quantity)
          : resource.cost;
        return { ...updated, cost };
      });
      return { ...task, resources };
    });
    this.replaceFlatTasks(next, 'task-updated', taskId);
  }

  private updateResourcePatch(taskId: string, resourceId: string, patch: Partial<GanttResource>): void {
    if (!this.isTaskEditable(this.findTask(taskId))) return;
    const next = this.getFlatTasks().map(task => task.id === taskId
      ? { ...task, resources: (task.resources || []).map(resource => resource.id === resourceId ? { ...resource, ...patch } : resource) }
      : task);
    this.replaceFlatTasks(next, 'task-updated', taskId);
  }

  /** Répartit une quantité totale sur tous les jours inclus dans la tâche.
   *  Les deux décimales sont conservées et le dernier jour absorbe l'éventuel écart d'arrondi. */
  private distributeResourceTotal(taskId: string, resourceId: string, rawValue: string): void {
    if (!this.isTaskEditable(this.findTask(taskId))) return;
    const requestedTotal = Number(rawValue);
    const total = Number.isFinite(requestedTotal) && requestedTotal > 0 ? this.roundQuantity(requestedTotal) : 0;
    const next = this.getFlatTasks().map(task => {
      if (task.id !== taskId) return task;
      const resources = (task.resources || []).map(resource => resource.id === resourceId
        ? { ...resource, quantity: total, quantityByDate: this.createDistributedQuantities(task.start, task.end, total, resource), totalQuantity: undefined, cost: undefined }
        : resource);
      return { ...task, resources };
    });
    this.replaceFlatTasks(next, 'task-updated', taskId);
  }

  private updateResourceQuantity(taskId: string, resourceId: string, date: string, rawValue: string): void {
    if (!this.isTaskEditable(this.findTask(taskId))) return;
    const value = Number(rawValue);
    const next = this.getFlatTasks().map(task => {
      if (task.id !== taskId) return task;
      const resources = (task.resources || []).map(resource => {
        if (resource.id !== resourceId) return resource;
        if (!this.isResourceWorkingDay(resource, parseDateOnly(date))) return resource;
        const quantityByDate = { ...(resource.quantityByDate || {}) };
        if (!rawValue || !Number.isFinite(value) || value === 0) delete quantityByDate[date];
        else quantityByDate[date] = value;
        return { ...resource, quantityByDate, totalQuantity: undefined, cost: undefined };
      });
      return { ...task, resources };
    });
    this.replaceFlatTasks(next, 'task-updated', taskId);
  }

  private openResourceContextMenu(taskId: string, event: MouseEvent): void {
    event.preventDefault();
    if (!this.isTaskEditable(this.findTask(taskId))) return;
    const menuWidth = 220;
    const menuHeight = 48;
    this.taskTooltip = undefined;
    this.resourceContextMenu = {
      taskId,
      x: Math.min(event.clientX, Math.max(8, window.innerWidth - menuWidth)),
      y: Math.min(event.clientY, Math.max(8, window.innerHeight - menuHeight)),
    };
    this.requestUpdate();
  }

  private closeResourceContextMenu = (): void => {
    if (!this.resourceContextMenu) return;
    this.resourceContextMenu = undefined;
    this.requestUpdate();
  };

  private addResourceFromContext = (): void => {
    const taskId = this.resourceContextMenu?.taskId;
    if (taskId) this.openResourcePicker(taskId);
    this.closeResourceContextMenu();
  };

  /** Opens the task menu on a bar, otherwise the global Gantt menu on an empty grid area. */
  private openTimelineContextMenu = (event: MouseEvent): void => {
    const target = event.target as HTMLElement | null;
    const taskId = target?.closest<HTMLElement>('.task-bar, .task-work, .summary-bar')?.dataset.taskId;
    if (taskId) {
      this.openTaskContextMenu(taskId, event);
      return;
    }
    this.openGanttContextMenu(event);
  };

  private openGanttContextMenu(event: MouseEvent): void {
    const margin = 8;
    this.taskTooltip = undefined;
    this.resourceContextMenu = undefined;
    this.taskContextMenu = undefined;
    this.taskContextSubmenuOpen = false;
    this.ganttContextMenu = {
      x: Math.max(margin, Math.min(event.clientX, window.innerWidth - margin)),
      y: Math.max(margin, Math.min(event.clientY, window.innerHeight - margin)),
      date: this.getTimelineDateAtClientX(event.clientX),
    };
    event.preventDefault();
    this.requestUpdate();
    void this.updateComplete.then(() => this.positionContextMenuInViewport('.gantt-context-menu'));
  }

  private closeGanttContextMenu = (): void => {
    if (!this.ganttContextMenu) return;
    this.ganttContextMenu = undefined;
    this.taskContextSubmenuOpen = false;
    this.requestUpdate();
  };

  private fitGanttFromContext = (): void => {
    this.closeGanttContextMenu();
    this.fitGanttToView();
  };

  private addTimelineItemFromContext(type: 'task' | 'parent'): void {
    const start = this.ganttContextMenu?.date || formatDate(new Date());
    this.ganttContextMenu = undefined;
    const task = this.addChildTask('', { type, start, end: this.addDays(start, type === 'parent' ? 14 : 7) });
    if (!this.options.openTaskEditorOnCreate) this.openTaskEditor(task.id);
  }

  /** Resolves the date represented by an empty timeline cell for contextual creation. */
  private getTimelineDateAtClientX(clientX: number): string {
    const timeline = this.renderRoot.querySelector<HTMLElement>('.timeline-scroll');
    if (!timeline) return formatDate(new Date());
    const range = this.alignRangeToWeeks(getDateRange(this.getFlatTasks()));
    const x = Math.max(0, clientX - timeline.getBoundingClientRect().left + timeline.scrollLeft);
    return this.addDays(formatDate(range.start), Math.floor(x / this.getDayWidth()));
  }

  private openTaskContextMenu(taskId: string, event: MouseEvent): void {
    const margin = 8;
    this.taskTooltip = undefined;
    this.resourceContextMenu = undefined;
    this.ganttContextMenu = undefined;
    this.taskContextSubmenuOpen = false;
    this.taskContextMenu = {
      taskId,
      x: Math.max(margin, Math.min(event.clientX, window.innerWidth - margin)),
      y: Math.max(margin, Math.min(event.clientY, window.innerHeight - margin)),
    };
    event.preventDefault();
    this.selectTask(taskId);
    this.requestUpdate();
    void this.updateComplete.then(() => this.positionContextMenuInViewport('.task-context-menu'));
  }

  /** Keeps a context menu fully visible using its real rendered dimensions. */
  private positionContextMenuInViewport(selector: string): void {
    const menu = this.renderRoot.querySelector<HTMLElement>(selector);
    if (!menu) return;
    const margin = 8;
    const bounds = menu.getBoundingClientRect();
    const left = Math.max(margin, Math.min(bounds.left, window.innerWidth - margin - bounds.width));
    const top = Math.max(margin, Math.min(bounds.top, window.innerHeight - margin - bounds.height));
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
  }

  /** Positions a nested context-menu panel beside its trigger without leaving the viewport. */
  private positionTaskContextSubmenu = (event: Event): void => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const submenu = target.closest<HTMLElement>('.gantt-context-submenu');
    if (!submenu) return;
    const panel = submenu.querySelector<HTMLElement>('.gantt-context-submenu-panel');
    if (!panel) return;

    panel.style.visibility = 'hidden';
    panel.style.display = 'block';
    const margin = 8;
    const triggerBounds = submenu.getBoundingClientRect();
    const panelBounds = panel.getBoundingClientRect();
    let left = triggerBounds.right;
    if (left + panelBounds.width > window.innerWidth - margin) {
      left = triggerBounds.left - panelBounds.width;
    }
    left = Math.max(margin, Math.min(left, window.innerWidth - margin - panelBounds.width));
    let top = triggerBounds.top - 5;
    if (top + panelBounds.height > window.innerHeight - margin) {
      top = window.innerHeight - margin - panelBounds.height;
    }
    top = Math.max(margin, top);
    panel.style.left = `${left - triggerBounds.left}px`;
    panel.style.top = `${top - triggerBounds.top}px`;
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
    panel.style.visibility = '';
    panel.style.display = '';
  };

  /** Keeps a custom submenu open after its trigger is clicked. */
  private handleTaskContextMenuClick = (event: Event): void => {
    event.stopPropagation();
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const trigger = target.closest<HTMLElement>('.gantt-context-submenu-trigger');
    if (!trigger) return;
    const submenu = trigger.closest<HTMLElement>('.gantt-context-submenu');
    if (!submenu) return;

    const willOpen = !submenu.classList.contains('open');
    this.renderRoot.querySelectorAll<HTMLElement>('.gantt-context-submenu.open').forEach(openSubmenu => {
      openSubmenu.classList.remove('open');
    });
    this.taskContextSubmenuOpen = willOpen;
    submenu.classList.toggle('open', willOpen);
    if (willOpen) this.positionTaskContextSubmenu(event);
  };

  private preventNativeContextMenu = (event: MouseEvent): void => {
    event.preventDefault();
  };

  /** Closes any open context menu when the user clicks outside its interactive panel. */
  private closeOpenContextMenus = (): void => {
    if (!this.resourceContextMenu && !this.ganttContextMenu && !this.taskContextMenu) return;
    this.resourceContextMenu = undefined;
    this.ganttContextMenu = undefined;
    this.taskContextMenu = undefined;
    this.taskContextSubmenuOpen = false;
    this.requestUpdate();
  };

  private closeTaskContextMenu = (): void => {
    if (!this.taskContextMenu) return;
    this.taskContextMenu = undefined;
    this.taskContextSubmenuOpen = false;
    this.requestUpdate();
  };

  private addTaskAfterContext = (): void => {
    const taskId = this.taskContextMenu?.taskId;
    if (!taskId) return;
    this.addTaskAfter(taskId);
  };

  private addTaskAfter(taskId: string): void {
    const current = this.findTask(taskId);
    if (!current || !this.isTaskEditable(current)) return;
    const flatTasks = this.getFlatTasks();
    const index = flatTasks.findIndex(task => task.id === taskId);
    const start = this.addDays(current.end, 1);
    const created: GanttTask = {
      id: this.createId(),
      name: this.t('newTask'),
      start,
      end: this.addDays(start, 6),
      progress: 0,
      parentId: (current.children || []).length ? current.id : current.parentId,
      type: 'task',
      color: this.getDefaultTaskColor('task'),
    };
    flatTasks.splice(index < 0 ? flatTasks.length : index + 1, 0, created);
    this.taskContextMenu = undefined;
    this.replaceFlatTasks(flatTasks, 'task-created', created.id);
    this.selectTask(created.id);
    this.openTaskEditor(created.id);
    if (this.options.focusTaskOnCreate) this.fitTaskToView(created.id);
  }

  private openTaskEditor(taskId: string, tab: 'general' | 'resources' | 'links' = 'general'): void {
    const task = this.findTask(taskId);
    if (!task || !this.isTaskEditable(task)) return;
    this.taskContextMenu = undefined;
    this.options.onTaskEdit?.(task);
    if (this.options.taskEditorMode === 'external') {
      this.requestUpdate();
      return;
    }
    this.taskEditorId = taskId;
    this.taskEditorTab = tab;
    this.requestUpdate();
  }

  private closeTaskEditor = (): void => {
    this.taskEditorId = undefined;
    this.closeResourcePicker();
  };

  private openResourcePicker(taskId: string): void {
    const task = this.findTask(taskId);
    if (!task || !this.isTaskEditable(task)) return;
    const hostPicker = this.options.resourcePicker;
    if (hostPicker) {
      try {
        void Promise.resolve(hostPicker({
          task,
          assignReference: reference => this.addResourceFromReference(task.id, reference),
          addResource: (resource = {}) => this.addResource(task.id, resource),
        })).catch(error => this.setStatus(error instanceof Error ? error.message : this.t('resourcePickerUnavailable'), 'error'));
      } catch (error) {
      this.setStatus(error instanceof Error ? error.message : this.t('resourcePickerUnavailable'), 'error');
      }
      return;
    }
    if (!this.resourceProvider) {
      this.addResource(task.id);
      return;
    }
    this.resourcePickerTaskId = task.id;
    this.resourceReferenceQuery = '';
    this.resourceReferenceResults = [];
    this.requestUpdate();
    void this.loadResourceReferences('');
  }

  private closeResourcePicker = (): void => {
    this.resourcePickerTaskId = undefined;
    this.resourceReferenceRequest += 1;
    this.resourceReferenceQuery = '';
    this.resourceReferenceResults = [];
    this.resourceReferenceLoading = false;
    this.requestUpdate();
  };

  private assignPickedResource = (reference: GanttResourceReference): void => {
    const taskId = this.resourcePickerTaskId;
    if (!taskId) return;
    this.addResourceFromReference(taskId, reference);
    this.closeResourcePicker();
  };

  private searchResourceReferences = (event: Event): void => {
    void this.loadResourceReferences((event.target as HTMLInputElement).value);
  };

  private async loadResourceReferences(query: string): Promise<void> {
    this.resourceReferenceQuery = query;
    const provider = this.resourceProvider;
    if (!provider) { this.resourceReferenceResults = []; this.requestUpdate(); return; }
    const request = ++this.resourceReferenceRequest;
    this.resourceReferenceLoading = true;
    this.requestUpdate();
    try {
      const results = await provider.search(query);
      if (request !== this.resourceReferenceRequest) return;
      this.resourceReferenceResults = results;
    } catch (error) {
      if (request !== this.resourceReferenceRequest) return;
      this.resourceReferenceResults = [];
      this.setStatus(error instanceof Error ? error.message : this.t('resourceCatalogueUnavailable'), 'error');
    } finally {
      if (request === this.resourceReferenceRequest) {
        this.resourceReferenceLoading = false;
        this.requestUpdate();
      }
    }
  }

  private addResourceFromReference(taskId: string, reference: GanttResourceReference): void {
    const task = this.findTask(taskId);
    if (task?.resources?.some(resource => resource.resourceId === reference.id)) {
      this.setStatus(this.tFormat('resourceAlreadyAssigned', { name: reference.name }), 'info');
      return;
    }
    this.addResource(taskId, {
      resourceId: reference.id,
      name: reference.name,
      type: reference.type || 'work',
      unit: reference.unit || 'U',
      unitCost: reference.unitCost ?? 0,
      quantity: reference.quantity ?? 1,
      calendarId: reference.calendarId,
      maxUnits: reference.maxUnits,
      // catalogId remains for backward compatibility with earlier integrations.
      metadata: { ...reference.metadata, catalogId: reference.id },
    });
  }

  private addEditorDependency(taskId: string, event: Event): void {
    const select = event.target as HTMLSelectElement;
    if (!select.value) return;
    this.addDependency(select.value, taskId, this.taskEditorLinkType);
    select.value = '';
  }

  private formatDependencyType(type: GanttDependency['type']): string {
    switch (type || 'finish-to-start') {
      case 'start-to-start': return this.t('startToStart');
      case 'finish-to-finish': return this.t('finishToFinish');
      case 'start-to-finish': return this.t('startToFinish');
      default: return this.t('finishToStart');
    }
  }

  private removeResource(taskId: string, resourceId: string): void {
    if (!this.isTaskEditable(this.findTask(taskId))) return;
    const next = this.getFlatTasks().map(task => task.id === taskId ? { ...task, resources: (task.resources || []).filter(resource => resource.id !== resourceId) } : task);
    this.replaceFlatTasks(next, 'task-updated', taskId);
  }

  private isDescendant(taskId: string | null, possibleAncestor: string): boolean {
    if (!taskId) return false;
    const task = this.findTask(taskId);
    return Boolean(task && (task.parentId === possibleAncestor || this.isDescendant(task.parentId, possibleAncestor)));
  }

  private dateToX(value: string, start: Date, dayWidth: number): number {
    return diffDays(start, value) * dayWidth;
  }

  private addDays(value: string, days: number): string {
    const date = parseDateOnly(value);
    date.setUTCDate(date.getUTCDate() + days);
    return formatDate(date);
  }

  private getDayWidth(): number { return (this.options.dayWidth ?? 24) * this.zoom; }
  private getHeaderWidth(sizing = this.getTaskGridSizing()): number {
    const naturalWidth = this.headerWidthOverride ?? Math.max(this.options.headerWidth ?? 0, this.getColumns().reduce((total, column) => total + this.getColumnWidth(column), 0));
    return Math.max(sizing.minWidth, Math.min(sizing.maxWidth, naturalWidth));
  }
  private getTaskGridSizing(): { minWidth: number; maxWidth: number; minTimelineWidth: number } {
    const splitter = this.options.taskGridSplitter || {};
    const availableWidth = this.renderRoot.querySelector<HTMLElement>('.gantt-layout')?.clientWidth || this.clientWidth;
    return calculateTaskGridSizing(splitter, availableWidth, window.innerWidth);
  }
  private getGanttPanelHeight(): string {
    const configured = this.options.maxHeight;
    if (!this.splitUserResized && configured !== undefined) return typeof configured === 'number' ? `${configured}px` : configured;
    return `${this.ganttPanelHeight}px`;
  }
  private getTimelineHeaderHeight(): number {
    const header = this.getGanttHeaderSettings();
    return (header.showMonths ? header.showWeeks ? 28 : 29 : 0) + (header.showWeeks ? 20 : 0) + (header.showDays ? header.showWeeks ? 28 : 29 : 0);
  }
  private getResourcesPanelHeight(): string {
    const configured = this.options.resourcesMaxHeight;
    if (!this.splitUserResized && configured !== undefined) return typeof configured === 'number' ? `${configured}px` : configured;
    return `${this.resourcePanelHeight}px`;
  }
  private getLocalStorageKey(): string { return 'gantt:' + (this.projectId || 'default'); }
  private getColors(): TaskColors { try { return this.taskColors ? JSON.parse(this.taskColors) as TaskColors : this.options.taskColors || {}; } catch { return this.options.taskColors || {}; } }
  private getDefaultTaskColor(type: GanttTask['type']): string {
    const colors = this.getColors();
    return colors[type] || (type === 'parent' ? '#3478d4' : type === 'milestone' ? '#dc5b65' : '#26966f');
  }
  private getTaskColor(task: GanttTask): string { return task.color || this.getDefaultTaskColor(task.type); }
  private withDefaultTaskColors(tasks: GanttTask[]): GanttTask[] {
    return tasks.map(task => ({ ...task, color: task.color || this.getDefaultTaskColor(task.type) }));
  }
  private applyColors(): void { const colors = this.getColors(); const styles = this.style; if (colors.headerBackground) styles.setProperty('--gantt-header', colors.headerBackground); if (colors.rowBackground) styles.setProperty('--gantt-row', colors.rowBackground); if (colors.rowAltBackground) styles.setProperty('--gantt-row-alt', colors.rowAltBackground); }
  private createId(): string { return globalThis.crypto?.randomUUID?.() || `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`; }
  private getLocale(): string {
    const locale = this.options.locale || 'en-US';
    try { Intl.getCanonicalLocales(locale); return locale; } catch { return 'en-US'; }
  }

  private getMonthLabel(date: Date): string { return this.dateFormatterCache.formatMonth(date, this.getLocale()); }

  private getDateHeaderLabels(date: Date): { weekday: string; weekdayNarrow: string; title: string } {
    return this.dateFormatterCache.formatHeaderLabels(date, this.getLocale());
  }

  private t(key: keyof GanttTranslations): string {
    const defaults = getBuiltInTranslations(this.getLocale());
    return this.options.translations?.[key] || defaults[key];
  }
  private tFormat(key: keyof GanttTranslations, values: Record<string, string | number>): string {
    return this.t(key).replace(/\{(\w+)\}/g, (_match, name: string) => String(values[name] ?? `{${name}}`));
  }

  private getFirstDayOfWeek(): number {
    return normalizeFirstDayOfWeek(this.options.firstDayOfWeek);
  }

  private isWeekStart(date: Date): boolean { return calculateWeekStart(date, this.getFirstDayOfWeek()); }

  private getWeekStartDate(date: Date): Date {
    return calculateWeekStartDate(date, this.getFirstDayOfWeek());
  }

  private getWeekNumber(date: Date): number {
    return calculateWeekNumber(date, this.getFirstDayOfWeek(), this.options.weekNumbering);
  }

  private alignRangeToWeeks(range: { start: Date; end: Date }): { start: Date; end: Date } {
    return alignCalendarRangeToWeeks(range, this.getFirstDayOfWeek());
  }

  private formatDayTitle(date: Date): string { return this.getDateHeaderLabels(date).title; }

  private getSummaryReferenceDate(): string {
    const configured = typeof this.options.summaryReferenceDate === 'function'
      ? this.options.summaryReferenceDate()
      : this.options.summaryReferenceDate;
    return configured && /^\d{4}-\d{2}-\d{2}$/.test(configured) ? configured : formatDate(new Date());
  }

  private getNonWorkingDays(): number[] { return this.options.nonWorkingDays === undefined ? [0, 6] : this.options.nonWorkingDays.filter(day => Number.isInteger(day) && day >= 0 && day <= 6); }
  private isNonWorkingDay(date: Date): boolean { return calculateNonWorkingDay(date, this.getNonWorkingDays()); }
  private isNonWorkingBlockStart(date: Date): boolean { return calculateNonWorkingBlockStart(date, this.getNonWorkingDays()); }
  private getResourceCalendar(resource: GanttResource): GanttCalendar | undefined { return this.calendars.find(calendar => calendar.id === resource.calendarId); }
  private getResourceCalendarLabel(resource: GanttResource): string { return this.getResourceCalendar(resource)?.name || this.t('resource'); }
  private isResourceWorkingDay(resource: GanttResource, date: Date): boolean {
    const calendar = this.getResourceCalendar(resource);
    return calculateResourceWorkingDay(resource, calendar, date, this.getNonWorkingDays());
  }
  private isResourceNonWorkingBlockStart(resource: GanttResource, date: Date): boolean {
    if (this.isResourceWorkingDay(resource, date)) return false;
    const previous = new Date(date.getTime());
    previous.setUTCDate(previous.getUTCDate() - 1);
    return this.isResourceWorkingDay(resource, previous);
  }

  private dispatch(name: string, detail: unknown): void {
    this.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true }));
  }
}

if (!customElements.get('gantt-chart')) customElements.define('gantt-chart', GanttChart);

export default GanttChart;
