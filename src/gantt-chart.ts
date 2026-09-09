import '@fontsource/roboto/latin-400.css';
import '@fontsource/roboto/latin-500.css';
import '@fontsource/roboto/latin-700.css';
import { LitElement, css, html, nothing } from 'lit';
import {
  GanttChange,
  GanttChangeReason,
  GanttCalendar,
  GanttColumn,
  GanttData,
  GanttDependency,
  GanttOptions,
  GanttPersistenceAdapter,
  GanttResource,
  GanttResourceColumn,
  GanttResourceProvider,
  GanttResourceReference,
  GanttSaveHook,
  GanttTask,
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
  getMonthLabel,
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

const ROW_HEIGHT = 42;
const HEADER_HEIGHT = 58;

type DefaultTaskColumn = Omit<GanttColumn, 'label'> & { labelKey: keyof GanttTranslations };

const DEFAULT_TASK_COLUMNS: DefaultTaskColumn[] = [
  { key: 'mode', labelKey: 'mode', width: 38 },
  { key: 'code', labelKey: 'code', width: 42 },
  { key: 'name', labelKey: 'name', width: 170, editable: true, required: true },
  { key: 'duration', labelKey: 'duration', width: 58, type: 'number' },
  { key: 'start', labelKey: 'start', width: 82, type: 'date' },
  { key: 'end', labelKey: 'finish', width: 82, type: 'date' },
  { key: 'costTotal', labelKey: 'totalCost', width: 78, type: 'number' },
];

const DEFAULT_RESOURCE_COLUMNS: GanttResourceColumn[] = [
  { key: 'name', label: 'Name', width: 150, editable: true },
  { key: 'type', label: 'Type', width: 105, editable: true },
  { key: 'unitCost', label: 'PU', width: 75, type: 'number', editable: true },
  { key: 'quantity', label: 'Q', width: 65, type: 'number', editable: true },
  { key: 'totalQuantity', label: 'Total quantity', width: 85, type: 'number', editable: true },
  { key: 'cost', label: 'Cost', width: 78, type: 'number' },
];

/**
 * Reusable Gantt Web Component.
 *
 * The component owns the visual/editor state. File formats and persistence
 * are deliberately adapters so applications can choose where the data lives.
 */
export class GanttChart extends LitElement {
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
      color-scheme: dark;
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
    .gantt-viewport { flex: 0 0 var(--gantt-panel-height, 440px); height: var(--gantt-panel-height, 440px); min-height: 260px; overflow-x: hidden; overflow-y: auto; position: relative; overscroll-behavior: contain; scrollbar-gutter: stable; }
    /* La partie Ressources absorbe tout l'espace restant sous le Gantt. */
    .resources-viewport { flex: 1 1 0; height: auto; min-height: 180px; overflow: hidden; position: relative; overscroll-behavior: contain; }

    .gantt-layout {
      position: relative;
      display: grid;
      grid-template-columns: var(--header-width) minmax(160px, 1fr);
      grid-template-rows: var(--timeline-header-height, ${HEADER_HEIGHT}px) auto;
      width: 100%;
      min-width: 0;
      box-sizing: border-box;
      padding-bottom: 18px;
      align-items: start;
    }

    .task-pane { grid-column: 1; grid-row: 2; min-width: 0; overflow-x: auto; overflow-y: clip; scrollbar-gutter: stable; scrollbar-width: none; }
    .task-content { position: relative; width: 100%; min-width: var(--task-columns-width); }
    .timeline-pane { grid-column: 2; grid-row: 2; min-width: 0; position: relative; overflow: hidden; }
    .timeline-scroll { width: 100%; overflow-x: auto; overflow-y: clip; scrollbar-gutter: stable; scrollbar-width: none; }
    .timeline-scroll.pan-enabled { cursor: grab; touch-action: none; }
    .timeline-scroll.panning { cursor: grabbing; user-select: none; }
    .timeline-content { position: relative; min-height: 100%; min-width: 100%; }
    .task-pane::-webkit-scrollbar, .timeline-scroll::-webkit-scrollbar { height: 0; width: 0; }

    .gantt-scrollbar-dock {
      position: sticky;
      top: calc(var(--gantt-panel-height) - 18px);
      z-index: 40;
      display: grid;
      grid-template-columns: var(--header-width) minmax(160px, 1fr);
      width: 100%;
      height: 18px;
      margin-bottom: -18px;
      background: var(--gantt-header);
      border-top: 1px solid var(--gantt-border);
    }
    .gantt-horizontal-scroll { min-width: 0; overflow-x: auto; overflow-y: hidden; scrollbar-gutter: stable; }
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
    .task-column { position: relative; padding: 0 5px; color: var(--gantt-muted); font-size: 10px; font-weight: 700; text-overflow: ellipsis; white-space: nowrap; }
    .task-column-resizer { position: absolute; top: -8px; right: -3px; z-index: 3; width: 6px; height: 36px; cursor: col-resize; touch-action: none; }
    .task-column-resizer:hover, .task-column-resizer:focus-visible { background: rgb(52 120 212 / 22%); outline: 0; }
    .column-menu-wrapper { position: relative; }
    .column-menu { position: absolute; top: calc(100% + 6px); left: 0; z-index: 80; width: 230px; padding: 8px; border: 1px solid var(--gantt-control-border); border-radius: 8px; background: var(--gantt-surface); box-shadow: 0 8px 24px rgb(15 23 42 / 18%); }
    .column-menu strong { display: block; margin: 2px 3px 7px; color: inherit; font-size: 12px; }
    .column-menu label { display: flex; align-items: center; gap: 7px; min-height: 27px; padding: 2px 3px; color: inherit; font-size: 12px; }
    .column-menu label.required { color: var(--gantt-muted); }
    .column-menu small { margin-left: auto; color: var(--gantt-muted); font-size: 10px; }
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
    .day { padding: 7px 1px 0; font-size: 10px; }
    .day.weekend { background: var(--gantt-non-working-day); }
    .day.non-working-start { border-left: 2px solid var(--gantt-border); }
    /* The first day of a week uses the same strong delimiter as the week header. */
    .day.week-start { border-left: 2px solid var(--gantt-border); }

    .task-row, .timeline-row {
      position: absolute;
      left: 0;
      height: ${ROW_HEIGHT}px;
      border-bottom: 1px solid var(--gantt-grid-line);
      background-color: var(--gantt-row);
    }

    .task-row { z-index: 5; width: 100%; overflow: hidden; border-right: 1px solid var(--gantt-border); cursor: pointer; }
    .task-row.alt, .timeline-row.alt { background-color: var(--gantt-row-alt); }
    .task-row:hover, .task-row.selected { background-color: var(--gantt-selection); color: var(--gantt-selection-foreground); }
    .task-row.drop-target { box-shadow: inset 0 0 0 2px #60a5fa; }
    .task-row.search-match, .timeline-row.search-match { background-color: var(--gantt-search-match); color: var(--gantt-search-match-foreground); }
    .task-row.search-current { box-shadow: inset 3px 0 0 #d99714; }
    .task-cells { height: 100%; align-items: center; }
    .task-cell { display: flex; align-items: center; height: 100%; padding: 0 5px; color: inherit; font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
    .task-cell.name { position: relative; }
    .task-cell.number { justify-content: flex-end; text-align: right; }
    .task-cell.parent { font-weight: 700; }
    .task-row .toggle { position: absolute; left: 2px; top: 0; z-index: 2; display: flex; align-items: center; justify-content: center; width: 19px; height: 100%; padding: 0; border: 0; background: transparent; color: var(--gantt-muted); font-size: 11px; }
    .task-row .toggle:disabled { cursor: default; }
    .task-cell.name .task-name { display: block; flex: 1 1 auto; min-width: 0; overflow: hidden; padding-right: 24px; padding-left: 19px; text-overflow: ellipsis; white-space: nowrap; }
    .task-focus { position: absolute; top: 50%; right: 3px; display: flex; align-items: center; justify-content: center; width: 21px; height: 21px; padding: 0; border: 1px solid transparent; border-radius: 4px; background: transparent; color: var(--gantt-muted); transform: translateY(-50%); }
    .task-focus:hover, .task-focus:focus-visible { border-color: var(--gantt-control-border); background: var(--gantt-control-hover); color: var(--gantt-blue); outline: 0; }
    .task-focus svg { width: 13px; height: 13px; fill: none; stroke: currentColor; stroke-width: 1.7; }
    .timeline-row { width: 100%; overflow: hidden; background-image: repeating-linear-gradient(to right, transparent 0, transparent calc(var(--day-width) - 1px), var(--gantt-grid-line) calc(var(--day-width) - 1px), var(--gantt-grid-line) var(--day-width)); }

    .today-line { position: absolute; top: var(--timeline-header-height, ${HEADER_HEIGHT}px); bottom: 0; z-index: 3; width: 2px; background: var(--gantt-red); opacity: .75; pointer-events: none; }
    .today-label { position: absolute; top: 4px; left: 5px; color: var(--gantt-red); font-size: 10px; font-weight: 700; white-space: nowrap; }
    .task-bar { position: absolute; top: 9px; z-index: 4; height: 24px; border-radius: var(--gantt-bar-radius, 5px); background: var(--bar-color); box-shadow: inset 0 -2px rgb(0 0 0 / 10%); color: #fff; cursor: grab; font-size: 11px; line-height: 24px; overflow: hidden; padding: 0 7px; text-overflow: ellipsis; white-space: nowrap; }
    .task-bar:active { cursor: grabbing; }
    .task-bar.selected { outline: 2px solid #1d65c1; outline-offset: 1px; }
    .task-bar.milestone { width: 17px !important; height: 17px; top: 12px; transform: rotate(45deg); border-radius: 2px; padding: 0; }
    .task-work { position: absolute; top: 9px; z-index: 4; height: 24px; color: #fff; cursor: grab; font-size: 11px; line-height: 24px; }
    .task-work:active { cursor: grabbing; }
    .task-work.selected { outline: 2px solid #1d65c1; outline-offset: 1px; }
    .task-span { position: absolute; inset: 0; border: 1px dashed var(--bar-color); border-radius: var(--gantt-bar-radius, 5px); background: color-mix(in srgb, var(--bar-color) 18%, transparent); }
    .task-segment { position: absolute; top: 0; height: 24px; overflow: hidden; border-radius: var(--gantt-bar-radius, 4px); background: var(--bar-color); box-shadow: inset 0 -2px rgb(0 0 0 / 10%); padding: 0 7px; white-space: nowrap; }
    .task-segment-progress { position: absolute; inset: 0 auto 0 0; width: var(--segment-progress); background: rgb(0 0 0 / 22%); pointer-events: none; }
    .summary-bar { position: absolute; top: 10px; z-index: 4; height: 15px; border-top: 2px solid var(--summary-color, var(--gantt-summary)); color: var(--summary-color, var(--gantt-summary)); cursor: grab; overflow: visible; }
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
    .column-resizer:hover, .column-resizer:focus-visible { background: rgb(52 120 212 / 18%); outline: 0; }
    .empty { position: relative; z-index: 6; min-height: 100%; padding: 40px; background: var(--gantt-empty-background); color: var(--gantt-empty-color); text-align: center; }

    .resources-panel { display: grid; grid-template-columns: var(--header-width) minmax(160px, 1fr); grid-template-rows: auto minmax(0, 1fr) 18px; width: 100%; min-width: 0; height: 100%; border-top: 2px solid var(--gantt-border); background: var(--gantt-surface); }
    .resources-title { grid-column: 1 / -1; padding: 9px 12px; border-bottom: 1px solid var(--gantt-border); color: inherit; font-size: 12px; font-weight: 700; }
    .resource-resizer { flex: 0 0 8px; width: 100%; min-width: 280px; height: 8px; border-top: 1px solid var(--gantt-control-border); border-bottom: 1px solid var(--gantt-border); background: var(--gantt-header); cursor: row-resize; touch-action: none; }
    .resource-resizer:hover, .resource-resizer:focus-visible { background: #dbeafe; outline: 0; }
    .resource-context-backdrop { position: fixed; inset: 0; z-index: 90; }
    .resource-context-menu { position: fixed; z-index: 91; min-width: 190px; padding: 5px; border: 1px solid var(--gantt-control-border); border-radius: 6px; background: var(--gantt-surface); box-shadow: 0 8px 24px rgb(15 23 42 / 18%); }
    .resource-context-menu button { width: 100%; border: 0; text-align: left; }
    .task-context-menu { position: fixed; z-index: 91; min-width: 180px; padding: 5px; border: 1px solid var(--gantt-control-border); border-radius: 6px; background: var(--gantt-surface); box-shadow: 0 8px 24px rgb(15 23 42 / 18%); }
    .task-context-menu button { width: 100%; border: 0; text-align: left; }
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
    .resources-scroll { grid-column: 1 / -1; grid-row: 2; min-height: 0; overflow-x: hidden; overflow-y: auto; overscroll-behavior: contain; position: relative; scrollbar-gutter: stable; }
    .resources-body { display: grid; grid-template-columns: var(--header-width) minmax(160px, 1fr); grid-template-rows: 32px minmax(0, 1fr); width: 100%; min-width: 0; min-height: 100%; }
    .resource-left-header { grid-column: 1; grid-row: 1; position: sticky; top: 0; z-index: 4; overflow: hidden; border-right: 1px solid var(--gantt-border); background: var(--gantt-header); }
    .resources-left { grid-column: 1; grid-row: 2; min-width: 0; min-height: 0; overflow-x: auto; overflow-y: clip; border-right: 1px solid var(--gantt-border); scrollbar-width: none; background: repeating-linear-gradient(to bottom, transparent 0, transparent 31px, var(--gantt-grid-line) 31px, var(--gantt-grid-line) 32px); }
    .resources-grid { display: grid; grid-template-columns: var(--resource-columns-template); min-width: var(--resource-columns-width); }
    .resource-timeline { grid-column: 2; grid-row: 2; width: 100%; min-width: 0; min-height: 0; overflow-x: auto; overflow-y: clip; scrollbar-width: none; background-image: repeating-linear-gradient(to right, transparent 0, transparent calc(var(--day-width) - 1px), var(--gantt-grid-line) calc(var(--day-width) - 1px), var(--gantt-grid-line) var(--day-width)), repeating-linear-gradient(to bottom, transparent 0, transparent 31px, var(--gantt-grid-line) 31px, var(--gantt-grid-line) 32px); }
    .resources-left::-webkit-scrollbar, .resource-timeline::-webkit-scrollbar { height: 0; width: 0; }
    /* Référence de positionnement des jours grisés : ils restent dans la zone des dates. */
    .resource-timeline-content { position: relative; isolation: isolate; width: var(--timeline-width); min-width: 100%; min-height: 100%; }
    .resource-day-header { grid-column: 2; grid-row: 1; position: sticky; top: 0; z-index: 4; width: 100%; min-width: 0; height: 32px; overflow: hidden; border-bottom: 1px solid var(--gantt-border); background: var(--gantt-header); }
    .resource-day-header-content, .resource-day-row { position: relative; width: var(--timeline-width); min-width: 100%; height: 100%; }
    .resource-day-window { position: absolute; top: 0; z-index: 4; display: flex; height: 100%; }
    .resource-day, .resource-day-input { flex: 0 0 var(--day-width); width: var(--day-width); border-right: 1px solid var(--gantt-grid-line); }
    .resource-day { padding: 8px 1px 0; color: var(--gantt-muted); font-size: 10px; text-align: center; }
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
    .resource-cell.resource-action { display: flex; align-items: center; justify-content: center; padding-inline: 4px; }
    .resources-scrollbar-dock { grid-column: 1 / -1; grid-row: 3; display: grid; grid-template-columns: var(--header-width) minmax(160px, 1fr); min-width: 0; height: 18px; border-top: 1px solid var(--gantt-border); background: var(--gantt-header); }
    .resource-horizontal-scroll { min-width: 0; overflow-x: auto; overflow-y: hidden; scrollbar-gutter: stable; }
    .resource-horizontal-scroll + .resource-horizontal-scroll { border-left: 1px solid var(--gantt-border); }
    .resource-scroll-spacer { height: 1px; width: 100%; min-width: var(--resource-columns-width); }
    .resource-scroll-spacer.timeline { min-width: var(--timeline-width); }
    .resource-cell input, .resource-cell select { width: 100%; min-height: 21px; border: 1px solid var(--gantt-control-border); border-radius: 3px; background: var(--gantt-input-background); color: inherit; font: inherit; font-size: 11px; padding: 2px 4px; }
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
  /** Connectez ce fournisseur à votre API de référentiel lorsque celle-ci sera disponible. */
  resourceProvider?: GanttResourceProvider;
  private _options: GanttOptions = {};

  get options(): GanttOptions { return this._options; }
  set options(value: GanttOptions) {
    this._options = value || {};
    this.numberFormatter = undefined;
    this.requestUpdate();
  }

  private tasks: GanttTask[] = [];
  private dependencies: GanttDependency[] = [];
  private calendars: GanttCalendar[] = [];
  private projectName?: string;
  private projectMetadata?: Record<string, unknown>;
  private selectedTaskId: string | null = null;
  private zoom = 1;
  private revision = 0;
  private statusMessage = '';
  private statusKind: 'info' | 'success' | 'error' = 'info';
  private resourceContextMenu?: { taskId: string; x: number; y: number };
  private taskContextMenu?: { taskId: string; x: number; y: number };
  private taskEditorId?: string;
  private taskEditorTab: 'general' | 'resources' | 'links' = 'general';
  private taskEditorLinkType: GanttDependency['type'] = 'finish-to-start';
  private resourcePickerTaskId?: string;
  private resourceReferenceQuery = '';
  private resourceReferenceResults: GanttResourceReference[] = [];
  private resourceReferenceLoading = false;
  private resourceReferenceRequest = 0;
  private headerWidthOverride?: number;
  private readonly columnVisibilityOverrides = new Map<string, boolean>();
  private readonly columnWidthOverrides = new Map<string, number>();
  private columnMenuOpen = false;
  private searchQuery = '';
  private searchResultIndex = -1;
  private ganttPanelHeight = 440;
  private resourcePanelHeight = 260;
  private splitUserResized = false;
  private draggedTaskId: string | null = null;
  private renderTaskIndex = new Map<string, GanttTask>();
  private renderTaskDepths = new Map<string, number>();
  private renderTaskCodes = new Map<string, string>();
  private renderTaskCosts = new Map<string, number>();
  private numberFormatter?: Intl.NumberFormat;
  private numberFormatterLocale = '';
  private resourceTimelineViewport = { scrollLeft: 0, width: 0 };
  private resourceTimelineDayWidth = 24;
  private ganttViewport = { scrollTop: 0, height: 0 };
  private ganttViewportFrame?: number;
  private ganttViewportResizeObserver?: ResizeObserver;
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
    pendingX?: number;
    frame?: number;
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
    this.ganttViewportResizeObserver?.disconnect();
    super.disconnectedCallback();
  }

  firstUpdated(): void {
    const viewport = this.renderRoot.querySelector<HTMLElement>('.gantt-viewport');
    if (!viewport) return;
    this.ganttViewportResizeObserver = new ResizeObserver(() => this.updateGanttViewport());
    this.ganttViewportResizeObserver.observe(viewport);
    this.updateGanttViewport(viewport.scrollTop, viewport.clientHeight);
  }

  updated(changed: Map<string, unknown>): void {
    if (changed.has('data') && this.data) {
      try {
        this.applyData(parseJson(this.data), 'set-data', false);
      } catch (error) {
        this.setStatus(error instanceof Error ? error.message : 'Données JSON invalides', 'error');
      }
    }
    if (changed.has('taskColors')) this.applyColors();
    const resourceTimeline = this.renderRoot.querySelector<HTMLElement>('.resource-timeline');
    if (resourceTimeline) this.updateResourceTimelineViewport(resourceTimeline.scrollLeft, resourceTimeline.clientWidth);
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
    const timelineWidth = totalDays * dayWidth;
    const taskColumnsWidth = this.getColumns().reduce((width, column) => width + this.getColumnWidth(column), 0);
    const colors = this.getColors();
    const dependencyColor = this.options.dependencyColor || colors.dependency || 'var(--gantt-dependency)';
    const searchResultIds = this.getSearchResultIds();
    const searchMatches = new Set(searchResultIds);
    const currentSearchId = searchResultIds[this.searchResultIndex];

    return html`
      <div class="shell" style="--header-width:${this.getHeaderWidth()}px; --task-columns-width:${taskColumnsWidth}px; --timeline-width:${timelineWidth}px; --day-width:${dayWidth}px; --rows-height:${Math.max(1, visibleTasks.length) * ROW_HEIGHT}px; --timeline-header-height:${this.getTimelineHeaderHeight()}px; --dependency-color:${dependencyColor}; --dependency-line-style:${this.options.dependencyLineStyle || 'solid'}; --gantt-panel-height:${this.getGanttPanelHeight()}; --resources-panel-height:${this.getResourcesPanelHeight()}">
        <div class="toolbar">
          <button class="primary" @click=${() => this.chooseImport('.json,.xml,.mpp')}>${this.t('import')}</button>
          <button @click=${() => this.download('json')}>${this.t('exportJson')}</button>
          <button @click=${() => this.download('mspxml')}>${this.t('exportMspxml')}</button>
          <button @click=${() => this.download('mpp')} ?disabled=${!this.projectFileAdapter} title=${this.projectFileAdapter ? this.t('exportMpp') : this.t('exportMppUnavailable')}>${this.t('exportMpp')}</button>
          <span class="toolbar-separator"></span>
          <button @click=${this.saveLocal}>💾 ${this.t('saveLocal')}</button>
          <button @click=${this.loadLocal}>↶ ${this.t('loadLocal')}</button>
          <span class="toolbar-separator"></span>
          <button @click=${() => this.addChildTask('')}>＋ ${this.t('addTask')}</button>
          <button class="danger" @click=${this.deleteSelected} ?disabled=${!this.selectedTaskId}>${this.t('delete')}</button>
          <button @click=${this.expandAllParents}>${this.t('expandAll')}</button>
          <button @click=${this.collapseAllParents}>${this.t('collapseAll')}</button>
          <span class="column-menu-wrapper">
            <button @click=${this.toggleColumnMenu} aria-expanded=${this.columnMenuOpen}>${this.t('columns')}</button>
            ${this.renderColumnMenu()}
          </span>
          <span class="search-control" role="search">
            <input type="search" placeholder=${this.t('search')} .value=${this.searchQuery} @input=${this.onSearchInput} @keydown=${this.handleSearchKeydown} aria-label=${this.t('search')} />
            <button aria-label=${this.t('previousResult')} title=${this.t('previousResult')} @click=${() => this.focusSearchResult(-1)} ?disabled=${!searchResultIds.length}>←</button>
            <output aria-live="polite">${searchResultIds.length ? `${Math.max(0, this.searchResultIndex + 1)}/${searchResultIds.length}` : '0/0'}</output>
            <button aria-label=${this.t('nextResult')} title=${this.t('nextResult')} @click=${() => this.focusSearchResult(1)} ?disabled=${!searchResultIds.length}>→</button>
          </span>
          <span class="zoom">
            <button aria-label=${this.t('zoomOut')} @click=${() => this.changeZoom(-.1)}>−</button>
            ${Math.round(this.zoom * 100)}%
            <button aria-label=${this.t('zoomIn')} @click=${() => this.changeZoom(.1)}>＋</button>
          </span>
            ${this.statusMessage ? html`<span class="status ${this.statusKind}">${this.statusMessage}</span>` : nothing}
          </div>
        <div class="split-viewport" @wheel=${this.handleWheel}>
          <div class="gantt-viewport" @scroll=${this.handleGanttViewportScroll}>
            <div class="gantt-scrollbar-dock" aria-label="Défilement horizontal du Gantt">
              <div class="gantt-horizontal-scroll" @scroll=${this.syncTaskGridScroll}><div class="gantt-scroll-spacer"></div></div>
              <div class="gantt-horizontal-scroll" @scroll=${this.syncTimelineGridScroll}><div class="gantt-scroll-spacer timeline"></div></div>
            </div>
            <div class="gantt-layout">
              <div class="task-header"><div class="task-columns">${this.getColumns().map(column => html`<div class="task-column" style="width:${this.getColumnWidth(column)}px">${column.label}<span class="task-column-resizer" role="separator" tabindex="0" aria-label="Redimensionner ${column.label}" @pointerdown=${(event: PointerEvent) => this.startTaskColumnResize(event, column)}></span></div>`)}</div></div>
              ${this.renderTimelineHeader(range.start, totalDays, dayWidth)}
              <div class="task-pane" @scroll=${this.syncTaskHeaderScroll}>
                <div class="task-content" style="height:${Math.max(1, visibleTasks.length) * ROW_HEIGHT}px">
                  ${visibleTasks.length ? virtualRows.rows.map(({ task, index }) => this.renderTaskRow(task, index, searchMatches, currentSearchId)) : html`<div class="empty">${this.t('noTasks')}</div>`}
                </div>
              </div>
              <div class="timeline-pane">
                <div class="timeline-scroll ${this.isGanttPanEnabled() ? 'pan-enabled' : ''}" @scroll=${this.syncTimelineHeaderScroll} @pointerdown=${this.startGanttPan}>
                  <div class="timeline-content" style="width:${timelineWidth}px; height:${Math.max(1, visibleTasks.length) * ROW_HEIGHT}px">
                    ${this.renderNonWorkingDayBands(range.start, totalDays, dayWidth)}
                    ${this.renderWeekDividers(range.start, totalDays, dayWidth)}
                    ${visibleTasks.length ? virtualRows.rows.map(({ task, index }) => this.renderTimelineRow(task, index, range.start, dayWidth, searchMatches)) : html`<div class="empty">${this.t('noPlanningData')}</div>`}
                    ${this.renderDependencies(visibleTasks, this.renderTaskIndex, range.start, dayWidth, virtualRows.start, virtualRows.end)}
                    ${this.renderTodayMarker(range.start, dayWidth, totalDays)}
                  </div>
                </div>
              </div>
              <div class="column-resizer" role="separator" tabindex="0" aria-label="Redimensionner la grille des tâches" @pointerdown=${this.startColumnResize}></div>
            </div>
          </div>
          ${selectedTask ? html`<div class="resource-resizer" role="separator" tabindex="0" aria-label="Redimensionner la grille des ressources" @pointerdown=${this.startResourceResize}></div>` : nothing}
          ${selectedTask ? html`<div class="resources-viewport">${this.renderResourcePanel(selectedTask, range.start, totalDays, dayWidth)}</div>` : nothing}
        </div>
        ${this.renderResourceContextMenu()}
        ${this.renderTaskContextMenu()}
        ${this.renderTaskEditor()}
        ${this.renderResourcePicker()}
      </div>
    `;
  }

  setData(data: GanttData): void {
    this.applyData(data, 'set-data', true);
  }

  /** Applies view and integration options and immediately refreshes the component. */
  setOptions(options: GanttOptions): void {
    this.options = options;
  }

  getData(): GanttData {
    return {
      name: this.projectName,
      tasks: this.getFlatTasks(),
      dependencies: this.dependencies.map(dependency => ({ ...dependency })),
      calendars: this.calendars.map(calendar => ({ ...calendar, workingDays: calendar.workingDays ? [...calendar.workingDays] : undefined, hours: calendar.hours ? { ...calendar.hours } : undefined, exceptions: calendar.exceptions ? { ...calendar.exceptions } : undefined })),
      metadata: this.projectMetadata ? { ...this.projectMetadata } : undefined,
    };
  }

  toJSON(): string { return stringifyJson(this.getData()); }
  toMSProjectXML(): string { return stringifyMspXml(this.getData()); }

  async importFile(file: File): Promise<GanttData> {
    const imported = await importProjectFile(file, this.projectFileAdapter);
    this.applyData(imported, 'imported', true);
    this.setStatus(`Projet importé : ${file.name}`, 'success');
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
    this.setStatus('Projet chargé depuis la persistance', 'success');
    return true;
  }

  async saveToPersistence(): Promise<void> {
    const change = this.createChange('set-data');
    const saves: Promise<void>[] = [];
    if (this.persistenceAdapter) saves.push(this.persistenceAdapter.save(change));
    if (this.saveHook) saves.push(Promise.resolve(this.saveHook(change)));
    if (!saves.length) throw new Error('Aucun persistenceAdapter ou saveHook configuré.');
    await Promise.all(saves);
    this.setStatus('Projet sauvegardé', 'success');
  }

  saveToLocalStorage(key = this.getLocalStorageKey()): void {
    if (typeof window === 'undefined' || !window.localStorage) throw new Error('localStorage est indisponible dans cet environnement.');
    window.localStorage.setItem(key, this.toJSON());
    this.setStatus('Projet sauvegardé localement', 'success');
  }

  loadFromLocalStorage(key = this.getLocalStorageKey()): boolean {
    if (typeof window === 'undefined' || !window.localStorage) throw new Error('localStorage est indisponible dans cet environnement.');
    const raw = window.localStorage.getItem(key);
    if (!raw) return false;
    this.applyData(parseJson(raw), 'set-data', false);
    this.setStatus('Projet chargé depuis le stockage local', 'success');
    return true;
  }

  selectTask(taskId: string): void {
    const task = this.findTask(taskId);
    if (!task) return;
    this.selectedTaskId = taskId;
    this.dispatch('task-selected', { id: taskId, task });
    this.options.onTaskSelect?.(taskId);
    this.requestUpdate();
  }

  /** Selects a row from the left grid and brings its bar to the centre of the timeline. */
  private focusTaskFromGrid(taskId: string): void {
    this.selectTask(taskId);
    void this.updateComplete.then(() => this.scrollTaskIntoView(taskId));
  }

  toggleTask(taskId: string): void {
    const toggle = (tasks: GanttTask[]): GanttTask[] => tasks.map(task => {
      if (task.id === taskId) return { ...task, collapsed: !task.collapsed };
      return task.children?.length ? { ...task, children: toggle(task.children) } : task;
    });
    this.tasks = toggle(this.tasks);
    this.requestUpdate();
  }

  private setAllParentsCollapsed(collapsed: boolean): void {
    const update = (tasks: GanttTask[]): GanttTask[] => tasks.map(task => ({
      ...task,
      collapsed: task.children?.length ? collapsed : task.collapsed,
      children: task.children?.length ? update(task.children) : task.children,
    }));
    this.tasks = update(this.tasks);
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
    const ancestors = new Set<string>();
    let parentId = this.findTask(taskId)?.parentId || null;
    while (parentId) {
      ancestors.add(parentId);
      parentId = this.findTask(parentId)?.parentId || null;
    }
    if (!ancestors.size) return;
    const expand = (tasks: GanttTask[]): GanttTask[] => tasks.map(task => ({
      ...task,
      collapsed: ancestors.has(task.id) ? false : task.collapsed,
      children: task.children?.length ? expand(task.children) : task.children,
    }));
    this.tasks = expand(this.tasks);
  }

  private scrollTaskIntoView(taskId: string): void {
    const viewport = this.renderRoot.querySelector<HTMLElement>('.gantt-viewport');
    const rowIndex = getVisibleTasks(this.tasks).findIndex(task => task.id === taskId);
    if (!viewport || rowIndex < 0) return;
    const top = this.getTimelineHeaderHeight() + rowIndex * ROW_HEIGHT - (viewport.clientHeight - ROW_HEIGHT) / 2;
    viewport.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });

    const task = this.findTask(taskId);
    const timeline = this.renderRoot.querySelector<HTMLElement>('.timeline-scroll');
    if (!task || !timeline) return;
    const dayWidth = this.getDayWidth();
    const range = this.alignRangeToWeeks(getDateRange(this.getFlatTasks()));
    const taskCenterX = this.dateToX(task.start, range.start, dayWidth) + (diffDays(task.start, task.end) + 1) * dayWidth / 2;
    timeline.scrollTo({ left: Math.max(0, taskCenterX - timeline.clientWidth / 2), behavior: 'smooth' });
  }

  /** Keeps only the rows around the viewport in the DOM while preserving the full scroll height. */
  private getVirtualTaskRows(tasks: GanttTask[]): {
    start: number;
    end: number;
    rows: Array<{ task: GanttTask; index: number }>;
  } {
    const overscan = 8;
    // Before the first ResizeObserver callback, render a conservative initial window.
    const viewportHeight = this.ganttViewport.height || ROW_HEIGHT * 12;
    const start = Math.max(0, Math.floor(this.ganttViewport.scrollTop / ROW_HEIGHT) - overscan);
    const end = Math.min(tasks.length, Math.ceil((this.ganttViewport.scrollTop + viewportHeight) / ROW_HEIGHT) + overscan);
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
    if (!current) return;
    const changesDates = patch.start !== undefined || patch.end !== undefined;
    const base = this.getFlatTasks();
    let updated = changesDates
      ? this.applyScheduledDates(base, taskId, patch.start || current.start, patch.end || current.end, patch.start !== undefined && patch.end !== undefined ? 'move' : patch.start !== undefined ? 'resize-start' : 'resize-end')
      : base;
    updated = updated.map(task => task.id === taskId ? { ...task, ...patch, start: task.start, end: task.end, id: task.id } : task);
    this.replaceFlatTasks(updated, 'task-updated', taskId);
  }

  addChildTask(parentId: string, newTask: Partial<GanttTask> = {}): GanttTask {
    const today = formatDate(new Date());
    const taskId = newTask.id || this.createId();
    const type = newTask.type || (parentId ? 'task' : 'parent');
    const task: GanttTask = {
      ...newTask,
      id: taskId,
      name: newTask.name || 'Nouvelle tâche',
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
    return task;
  }

  deleteTask(taskId: string): void {
    const descendants = new Set<string>();
    const collect = (parentId: string) => {
      for (const task of this.getFlatTasks()) {
        if (task.parentId === parentId && !descendants.has(task.id)) {
          descendants.add(task.id);
          collect(task.id);
        }
      }
    };
    descendants.add(taskId);
    collect(taskId);
    const next = this.getFlatTasks().filter(task => !descendants.has(task.id));
    this.dependencies = this.dependencies.filter(dependency => !descendants.has(dependency.from) && !descendants.has(dependency.to));
    this.replaceFlatTasks(next, 'task-deleted', taskId);
    if (this.selectedTaskId && descendants.has(this.selectedTaskId)) this.selectedTaskId = null;
  }

  moveTask(taskId: string, parentId: string | null): void {
    if (taskId === parentId || this.isDescendant(parentId, taskId)) return;
    const next = this.getFlatTasks().map(task => task.id === taskId ? { ...task, parentId } : task);
    this.replaceFlatTasks(next, 'task-moved', taskId);
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
    return html`
      <div class="task-row ${selected ? 'selected' : ''} ${index % 2 ? 'alt' : ''} ${searchMatches.has(task.id) ? 'search-match' : ''} ${task.id === currentSearchId ? 'search-current' : ''}" style="top:${index * ROW_HEIGHT}px" data-task-id=${task.id}
           draggable="true"
           @click=${() => this.focusTaskFromGrid(task.id)}
           @dragstart=${(event: DragEvent) => this.handleDragStart(event, task.id)}
           @dragover=${(event: DragEvent) => this.handleDragOver(event)}
           @drop=${(event: DragEvent) => this.handleDrop(event, task.id)}
           @contextmenu=${(event: MouseEvent) => this.openTaskContextMenu(task.id, event)}
           @dblclick=${() => this.editTaskName(task)}>
        <div class="task-cells">${this.getColumns().map(column => this.renderTaskCell(task, column, depth, children.length > 0))}</div>
      </div>
    `;
  }

  private renderTaskCell(task: GanttTask, column: GanttColumn, depth: number, hasChildren: boolean) {
    const value = this.getColumnValue(task, column);
    const isName = column.key === 'name';
    const isNumber = column.type === 'number' || ['unitCost', 'quantity', 'quantityPerDay', 'duration', 'costTotal'].includes(column.key);
    return html`
      <div class="task-cell ${isName ? 'name' : ''} ${isNumber ? 'number' : ''} ${hasChildren ? 'parent' : ''}" style="width:${this.getColumnWidth(column)}px" title=${value === null || value === undefined ? '' : String(value)}>
        ${isName ? html`
          <button class="toggle" style="left:${2 + depth * 16}px" ?disabled=${!hasChildren} @click=${(event: Event) => { event.stopPropagation(); this.toggleTask(task.id); }} aria-label="Déplier ou replier" aria-expanded=${hasChildren ? String(!task.collapsed) : nothing}>
            ${hasChildren ? task.collapsed ? '▶' : '▼' : '·'}
          </button>
          <span class="task-name" style="padding-left:${19 + depth * 16}px">${value}</span>
          <button class="task-focus" aria-label="Centrer la tâche dans le Gantt" title="Centrer dans le Gantt" @click=${(event: Event) => { event.stopPropagation(); this.focusTaskFromGrid(task.id); }} @dblclick=${(event: Event) => event.stopPropagation()}>
            <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="4.5"></circle><path d="M8 1.5v3M8 11.5v3M1.5 8h3M11.5 8h3"></path></svg>
          </button>
        ` : this.formatColumnValue(value, column, task)}
      </div>
    `;
  }

  private renderResourcePanel(task: GanttTask, start: Date, totalDays: number, dayWidth: number) {
    const resources = task.resources || [];
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
    return html`
      <section class="resources-panel" aria-label="${this.t('resources')} — ${task.name}" style="--resource-columns-width:${resourceColumnsWidth}px; --resource-columns-template:${resourceColumnsTemplate}">
        <div class="resources-title">${this.t('resources')} — ${task.name}</div>
        <div class="resources-scroll" @contextmenu=${(event: MouseEvent) => this.openResourceContextMenu(task.id, event)}>
          <div class="resources-body">
            <div class="resource-left-header">
              <div class="resources-grid">
                ${resourceColumns.map(column => html`<div class="resource-cell header ${column.type === 'number' ? 'numeric' : ''}" title=${column.label}>${column.label}</div>`)}
                <div class="resource-cell header resource-action"></div>
              </div>
            </div>
            <div class="resource-day-header"><div class="resource-day-header-content"><div class="resource-day-window" style="left:${windowOffset}px">${visibleDates.map(date => html`<div class="resource-day ${this.isNonWorkingDay(date) ? 'weekend' : ''} ${this.isNonWorkingBlockStart(date) ? 'non-working-start' : ''} ${this.isWeekStart(date) ? 'week-start' : ''}" title=${this.formatDayTitle(date)}>${date.getUTCDate()}</div>`)}</div></div></div>
            <div class="resources-left" @scroll=${this.syncResourceLeftHeaderScroll}>
              <div class="resources-grid">
            ${resources.map(resource => html`
              ${resourceColumns.map(column => this.renderResourceCell(task, resource, column))}
              <div class="resource-cell resource-action"><button class="danger" aria-label="${this.t('delete')} ${resource.name}" @click=${() => this.removeResource(task.id, resource.id)}>×</button></div>
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
            const title = unavailable ? `${this.getResourceCalendarLabel(resource)} — jour non travaillé` : this.formatDayTitle(date);
            return html`<input class="resource-day-input ${unavailable ? 'calendar-closed' : ''}" type="number" min="0" step="1" ?disabled=${!active || unavailable} value=${value === undefined ? '' : value} title=${title} aria-label="${resource.name} ${dateKey}" @change=${(event: Event) => this.updateResourceQuantity(task.id, resource.id, dateKey, (event.target as HTMLInputElement).value)} />`;
          })}</div></div>`)}
              </div>
            </div>
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
    const value = this.getResourceColumnValue(task, resource, column);
    const numeric = column.type === 'number';
    if (column.key === 'totalQuantity') {
      return html`<div class="resource-cell total"><input type="number" min="0" step="1" value=${value ?? 0} title=${this.t('totalQuantity')} aria-label="${this.t('totalQuantity')} ${resource.name}" @change=${(event: Event) => this.distributeResourceTotal(task.id, resource.id, (event.target as HTMLInputElement).value)} /></div>`;
    }
    if (column.key === 'calendarId' && column.editable) {
      return html`<div class="resource-cell"><select .value=${resource.calendarId || ''} aria-label="Calendrier ${resource.name}" @change=${(event: Event) => this.updateResource(task.id, resource.id, 'calendarId', (event.target as HTMLSelectElement).value || undefined)}><option value="">${this.t('resource')}</option>${this.calendars.map(calendar => html`<option value=${calendar.id}>${calendar.name}</option>`)}</select></div>`;
    }
    if (column.editable && ['name', 'type', 'unitCost', 'quantity'].includes(column.key)) {
      return html`<div class="resource-cell ${numeric ? 'numeric' : ''}"><input type=${numeric ? 'number' : 'text'} min=${numeric ? '0' : nothing} step=${numeric ? column.key === 'unitCost' ? '0.01' : '1' : nothing} .value=${String(value ?? '')} @change=${(event: Event) => this.updateResourceColumn(task, resource, column, (event.target as HTMLInputElement).value)} /></div>`;
    }
    if (column.editable) {
      return html`<div class="resource-cell ${numeric ? 'numeric' : ''}"><input type=${numeric ? 'number' : 'text'} step=${numeric ? 'any' : nothing} .value=${String(value ?? '')} @change=${(event: Event) => this.updateResourceColumn(task, resource, column, (event.target as HTMLInputElement).value)} /></div>`;
    }
    return html`<div class="resource-cell ${numeric ? 'numeric' : ''}">${this.formatResourceColumnValue(value, column, resource, task)}</div>`;
  }

  private getResourceColumnValue(task: GanttTask, resource: GanttResource, column: GanttResourceColumn): unknown {
    if (column.value) return column.value(resource, task);
    switch (column.key) {
      case 'name': return resource.name;
      case 'type': return resource.type;
      case 'unitCost': return resource.unitCost;
      case 'quantity': return resource.quantity;
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
    if (column.type === 'number' && typeof value === 'number') return `${this.formatNumber(value)}${column.key === 'cost' ? ' €' : ''}`;
    return String(value);
  }

  private updateResourceColumn(task: GanttTask, resource: GanttResource, column: GanttResourceColumn, value: string): void {
    if (column.setValue) {
      const patch = column.setValue(value, resource, task);
      if (patch) this.updateResourcePatch(task.id, resource.id, patch);
      return;
    }
    const nextValue = column.type === 'number' ? Number(value) || 0 : value;
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
    return html`
      <div class="resource-context-backdrop" @click=${this.closeTaskContextMenu}></div>
      <div class="task-context-menu" style="left:${menu.x}px; top:${menu.y}px" @click=${(event: Event) => event.stopPropagation()}>
        <button @click=${() => this.openTaskEditor(menu.taskId)}>✎ ${this.t('editTask')}</button>
        <button @click=${this.addTaskAfterContext}>＋ ${this.t('addTaskAfter')}</button>
      </div>
    `;
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
    return {
      task,
      updateTask: (patch: Partial<GanttTask>) => this.updateTask(task.id, patch),
      moveTask: (parentId: string | null) => this.moveTask(task.id, parentId),
      addResource: (resource: Partial<GanttResource> = {}) => this.addResource(task.id, resource),
      openResourcePicker: () => this.openResourcePicker(task.id),
      removeResource: (resourceId: string) => this.removeResource(task.id, resourceId),
      addDependency: (fromTaskId: string, type?: GanttDependency['type']) => this.addDependency(fromTaskId, task.id, type),
      removeDependency: (fromTaskId: string) => this.removeDependency(fromTaskId, task.id),
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
        ${!this.resourceProvider && !this.options.resourcePicker ? html`<div class="editor-empty">Le référentiel peut être connecté plus tard avec <code>resourceProvider</code>.</div>` : nothing}
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
            <option value="finish-to-start">Fin → Début</option><option value="start-to-start">Début → Début</option><option value="finish-to-finish">Fin → Fin</option><option value="start-to-finish">Début → Fin</option>
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
      <div class="timeline-row ${index % 2 ? 'alt' : ''} ${searchMatches.has(task.id) ? 'search-match' : ''}" style="top:${index * ROW_HEIGHT}px" @contextmenu=${(event: MouseEvent) => this.openTaskContextMenu(task.id, event)}>
        ${this.renderTaskBar(task, left, width, color, selected, start, dayWidth)}
      </div>
    `;
  }

  private renderTaskBar(task: GanttTask, left: number, width: number, color: string, selected: boolean, timelineStart: Date, dayWidth: number) {
    const milestone = task.type === 'milestone';
    const summary = !milestone && (task.type === 'parent' || Boolean(task.children?.length));
    if (summary) {
      const template = this.options.taskBarTemplate?.({ task, color, width, durationDays: this.getTaskDurationDays(task), kind: 'summary' }) ?? this.options.summaryTemplate?.(task);
      return html`
        <div class="summary-bar ${selected ? 'selected' : ''}" style="left:${left}px; width:${Math.max(24, width)}px; --summary-color:${color};"
             title="${task.name} · ${task.start} → ${task.end}"
             @click=${(event: Event) => { event.stopPropagation(); this.selectTask(task.id); }}
             @pointerdown=${(event: PointerEvent) => this.startBarDrag(event, task, 'move')}>
          <span class="summary-cap start"></span><span class="summary-cap end"></span><div class="summary-label"><span>${task.name}</span>${template !== undefined ? html`<span class="summary-template">${template}</span>` : nothing}</div>
        </div>
      `;
    }
    const segments = this.getWorkSegments(task, timelineStart, dayWidth);
    if (segments) {
      let remainingProgressWidth = segments.reduce((total, segment) => total + segment.width, 0) * Math.min(100, Math.max(0, task.progress)) / 100;
      return html`
        <div class="task-work ${selected ? 'selected' : ''}" style="left:${left}px; width:${width}px; --bar-color:${color};"
             title="${task.name} · ${task.start} → ${task.end}"
             @click=${(event: Event) => { event.stopPropagation(); this.selectTask(task.id); }}
             @pointerdown=${(event: PointerEvent) => this.startBarDrag(event, task, 'move')}>
          <div class="task-span"></div>
          ${segments.map((segment, index) => {
            const progressWidth = Math.min(segment.width, Math.max(0, remainingProgressWidth));
            remainingProgressWidth -= progressWidth;
            return html`<div class="task-segment" style="left:${segment.left - left}px; width:${segment.width}px"><div class="task-segment-progress" style="--segment-progress:${progressWidth}px"></div>${index === 0 ? this.renderTaskBarContent(task, color, segment.width) : nothing}</div>`;
          })}
          <span class="resize-handle start" title="Réduire ou allonger au début" @pointerdown=${(event: PointerEvent) => this.startBarDrag(event, task, 'resize-start')}></span>
          <span class="resize-handle end" title="Réduire ou allonger à la fin" @pointerdown=${(event: PointerEvent) => this.startBarDrag(event, task, 'resize-end')}></span>
        </div>
      `;
    }
    return html`
      <div class="task-bar ${milestone ? 'milestone' : ''} ${selected ? 'selected' : ''}"
           style="left:${left}px; width:${milestone ? 17 : width}px; --bar-color:${color}; --progress:${task.progress}%"
           title="${task.name} · ${task.start} → ${task.end}"
           @click=${(event: Event) => { event.stopPropagation(); this.selectTask(task.id); }}
           @pointerdown=${(event: PointerEvent) => this.startBarDrag(event, task, 'move')}>
        ${milestone ? nothing : html`
          <div class="progress-fill"></div>
          ${this.renderTaskBarContent(task, color, width)}
          <span class="resize-handle start" @pointerdown=${(event: PointerEvent) => this.startBarDrag(event, task, 'resize-start')}></span>
          <span class="resize-handle end" @pointerdown=${(event: PointerEvent) => this.startBarDrag(event, task, 'resize-end')}></span>
        `}
      </div>
    `;
  }

  private renderTaskBarContent(task: GanttTask, color: string, width: number) {
    const content = this.options.taskBarTemplate?.({ task, color, width, durationDays: this.getTaskDurationDays(task), kind: 'task' });
    return html`<span class="bar-label">${task.name}</span>${content !== undefined ? html`<span class="task-bar-template">${content}</span>` : nothing}`;
  }

  private renderTimelineHeader(start: Date, totalDays: number, dayWidth: number) {
    const dates = Array.from({ length: totalDays }, (_, index) => {
      const date = new Date(start.getTime());
      date.setUTCDate(date.getUTCDate() + index);
      return date;
    });
    const months: Array<{ label: string; count: number }> = [];
    for (const date of dates) {
      const label = getMonthLabel(date, this.getLocale());
      const current = months[months.length - 1];
      if (current?.label === label) current.count += 1;
      else months.push({ label, count: 1 });
    }
    const weeks = Array.from({ length: Math.ceil(dates.length / 7) }, (_, index) => {
      const date = dates[index * 7];
      return { number: date ? this.getWeekNumber(date) : 0, count: Math.min(7, dates.length - index * 7) };
    });
    return html`
      <div class="timeline-header ${this.options.showWeekNumbers ? 'with-weeks' : ''}">
        <div class="months">${months.map(month => html`<div class="month" style="width:${month.count * dayWidth}px">${month.label}</div>`)}</div>
        ${this.options.showWeekNumbers ? html`<div class="weeks">${weeks.map(week => html`<div class="week" style="width:${week.count * dayWidth}px">W ${week.number}</div>`)}</div>` : nothing}
        <div class="days">${dates.map(date => html`<div class="day ${this.isNonWorkingDay(date) ? 'weekend' : ''} ${this.isNonWorkingBlockStart(date) ? 'non-working-start' : ''} ${this.isWeekStart(date) ? 'week-start' : ''}" style="width:${dayWidth}px" title=${this.formatDayTitle(date)}>${date.getUTCDate()}</div>`)}</div>
      </div>
    `;
  }

  private renderTodayMarker(start: Date, dayWidth: number, totalDays: number) {
    if (this.options.showToday === false) return nothing;
    const x = this.dateToX(formatDate(new Date()), start, dayWidth);
    if (x < 0 || x > totalDays * dayWidth) return nothing;
    return html`<div class="today-line" style="left:${x}px"><span class="today-label">${this.t('today')}</span></div>`;
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
      const y1 = fromRow * ROW_HEIGHT + ROW_HEIGHT / 2;
      const y2 = toRow * ROW_HEIGHT + ROW_HEIGHT / 2;
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
    this.requestUpdate();
    if (notify) this.commit(reason);
  }

  private replaceFlatTasks(tasks: GanttTask[], reason: GanttChangeReason, taskId?: string): void {
    this.tasks = buildTaskTree(this.withDefaultTaskColors(tasks));
    this.requestUpdate();
    this.commit(reason, taskId);
  }

  private commit(reason: GanttChangeReason, taskId?: string): void {
    const change = this.createChange(reason, taskId);
    this.dispatch('tasks-changed', change);
    this.options.onTasksChange?.(change.data);
    if (this.autoSave && (this.persistenceAdapter || this.saveHook)) {
      const saves: Promise<void>[] = [];
      if (this.persistenceAdapter) saves.push(this.persistenceAdapter.save(change));
      if (this.saveHook) saves.push(Promise.resolve(this.saveHook(change)));
      void Promise.all(saves).catch(error => {
        this.dispatch('persistence-error', { error, change });
        this.setStatus('Échec de sauvegarde', 'error');
      });
    }
  }

  private createChange(reason: GanttChangeReason, taskId?: string): GanttChange {
    return { projectId: this.projectId || null, revision: ++this.revision, reason, taskId, data: this.getData() };
  }

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
      catch (error) { this.setStatus(error instanceof Error ? error.message : 'Import impossible', 'error'); this.dispatch('project-file-error', { error }); }
    };
    input.click();
  }

  private async download(format: ProjectFileFormat): Promise<void> {
    try {
      const blob = await this.exportFile(format);
      const extension = format === 'mspxml' ? 'xml' : format;
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `${this.projectName || 'projet-gantt'}.${extension}`;
      link.click();
      URL.revokeObjectURL(link.href);
      this.setStatus(`Export ${extension.toUpperCase()} terminé`, 'success');
    } catch (error) {
      this.setStatus(error instanceof Error ? error.message : 'Export impossible', 'error');
    }
  }

  private saveLocal = (): void => {
    try {
      this.saveToLocalStorage();
    } catch (error) {
      this.setStatus(error instanceof Error ? error.message : 'Sauvegarde locale impossible', 'error');
    }
  };

  private loadLocal = (): void => {
    try {
      if (!this.loadFromLocalStorage()) this.setStatus('Aucun projet local trouvé', 'info');
    } catch (error) {
      this.setStatus(error instanceof Error ? error.message : 'Chargement local impossible', 'error');
    }
  };

  private startColumnResize = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = this.getHeaderWidth();
    const minimum = 220;
    const maximum = Math.max(minimum + 120, 900);
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
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startWidth = this.getColumnWidth(column);
    const minimum = column.key === 'name' ? 120 : 48;
    const move = (moveEvent: PointerEvent): void => {
      this.columnWidthOverrides.set(column.key, Math.max(minimum, Math.min(640, startWidth + moveEvent.clientX - startX)));
      this.requestUpdate();
    };
    const stop = (): void => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', stop);
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', stop, { once: true });
  }

  private startResourceResize = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    event.preventDefault();
    const startY = event.clientY;
    const startGanttHeight = this.ganttPanelHeight;
    const move = (moveEvent: PointerEvent): void => {
      const delta = moveEvent.clientY - startY;
      this.ganttPanelHeight = Math.max(260, Math.min(900, startGanttHeight + delta));
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
    if (header) header.scrollLeft = scrollLeft;
    if (scrollbar) scrollbar.scrollLeft = scrollLeft;
  };

  private syncTimelineHeaderScroll = (event: Event): void => {
    const scrollLeft = (event.currentTarget as HTMLElement).scrollLeft;
    const header = this.renderRoot.querySelector<HTMLElement>('.timeline-header');
    const [, scrollbar] = this.renderRoot.querySelectorAll<HTMLElement>('.gantt-horizontal-scroll');
    if (header) header.scrollLeft = scrollLeft;
    if (scrollbar) scrollbar.scrollLeft = scrollLeft;
  };

  private syncTaskGridScroll = (event: Event): void => {
    const scrollLeft = (event.currentTarget as HTMLElement).scrollLeft;
    const grid = this.renderRoot.querySelector<HTMLElement>('.task-pane');
    const header = this.renderRoot.querySelector<HTMLElement>('.task-header');
    if (grid) grid.scrollLeft = scrollLeft;
    if (header) header.scrollLeft = scrollLeft;
  };

  private syncTimelineGridScroll = (event: Event): void => {
    const scrollLeft = (event.currentTarget as HTMLElement).scrollLeft;
    const grid = this.renderRoot.querySelector<HTMLElement>('.timeline-scroll');
    const header = this.renderRoot.querySelector<HTMLElement>('.timeline-header');
    if (grid) grid.scrollLeft = scrollLeft;
    if (header) header.scrollLeft = scrollLeft;
  };

  private syncResourceLeftHeaderScroll = (event: Event): void => {
    const scrollLeft = (event.currentTarget as HTMLElement).scrollLeft;
    const header = this.renderRoot.querySelector<HTMLElement>('.resource-left-header');
    const [scrollbar] = this.renderRoot.querySelectorAll<HTMLElement>('.resource-horizontal-scroll');
    if (header) header.scrollLeft = scrollLeft;
    if (scrollbar) scrollbar.scrollLeft = scrollLeft;
  };

  private syncResourceTimelineHeaderScroll = (event: Event): void => {
    const timeline = event.currentTarget as HTMLElement;
    const scrollLeft = timeline.scrollLeft;
    const header = this.renderRoot.querySelector<HTMLElement>('.resource-day-header');
    const [, scrollbar] = this.renderRoot.querySelectorAll<HTMLElement>('.resource-horizontal-scroll');
    if (header) header.scrollLeft = scrollLeft;
    if (scrollbar) scrollbar.scrollLeft = scrollLeft;
    this.updateResourceTimelineViewport(scrollLeft, timeline.clientWidth);
  };

  private syncResourceLeftGridScroll = (event: Event): void => {
    const scrollLeft = (event.currentTarget as HTMLElement).scrollLeft;
    const grid = this.renderRoot.querySelector<HTMLElement>('.resources-left');
    const header = this.renderRoot.querySelector<HTMLElement>('.resource-left-header');
    if (grid) grid.scrollLeft = scrollLeft;
    if (header) header.scrollLeft = scrollLeft;
  };

  private syncResourceTimelineGridScroll = (event: Event): void => {
    const scrollLeft = (event.currentTarget as HTMLElement).scrollLeft;
    const grid = this.renderRoot.querySelector<HTMLElement>('.resource-timeline');
    const header = this.renderRoot.querySelector<HTMLElement>('.resource-day-header');
    if (grid) grid.scrollLeft = scrollLeft;
    if (header) header.scrollLeft = scrollLeft;
    if (grid) this.updateResourceTimelineViewport(grid.scrollLeft, grid.clientWidth);
  };

  /** Fenêtre horizontale rendue dans la grille Ressources (avec marge de sécurité). */
  private getResourceDateWindow(totalDays: number, dayWidth: number): { start: number; end: number } {
    const viewportWidth = this.resourceTimelineViewport.width || Math.min(totalDays * dayWidth, 960);
    const firstVisible = Math.floor(this.resourceTimelineViewport.scrollLeft / dayWidth);
    const start = Math.max(0, firstVisible - 8);
    const end = Math.min(totalDays, Math.ceil((this.resourceTimelineViewport.scrollLeft + viewportWidth) / dayWidth) + 8);
    return { start, end: Math.max(start + 1, end) };
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
    if (event.key === 'Delete' && this.selectedTaskId && !['INPUT', 'TEXTAREA'].includes((event.target as HTMLElement)?.tagName)) this.deleteTask(this.selectedTaskId);
  };

  private handleDragStart(event: DragEvent, taskId: string): void {
    this.draggedTaskId = taskId;
    event.dataTransfer?.setData('text/plain', taskId);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
  }

  private handleDragOver(event: DragEvent): void {
    if (this.draggedTaskId) { event.preventDefault(); if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'; }
  }

  private handleDrop(event: DragEvent, parentId: string): void {
    event.preventDefault();
    const taskId = this.draggedTaskId || event.dataTransfer?.getData('text/plain');
    this.draggedTaskId = null;
    if (taskId) this.moveTask(taskId, parentId);
  }

  private startBarDrag(event: PointerEvent, task: GanttTask, mode: 'move' | 'resize-start' | 'resize-end'): void {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    this.selectTask(task.id);
    this.barDrag = { taskId: task.id, mode, startX: event.clientX, originalStart: task.start, originalEnd: task.end, currentStart: task.start, currentEnd: task.end, baseTasks: this.getFlatTasks(), changed: false };
    document.addEventListener('pointermove', this.handleBarDragMove);
    document.addEventListener('pointerup', this.finishBarDrag, { once: true });
  }

  private handleBarDragMove = (event: PointerEvent): void => {
    const drag = this.barDrag;
    if (!drag) return;
    drag.pendingX = event.clientX;
    if (drag.frame !== undefined) return;
    drag.frame = window.requestAnimationFrame(() => {
      const activeDrag = this.barDrag;
      if (!activeDrag) return;
      activeDrag.frame = undefined;
      this.applyBarDragPosition(activeDrag.pendingX ?? activeDrag.startX);
    });
  };

  /** Limite les rendus pendant un glisser-déposer à une mise à jour par image. */
  private applyBarDragPosition(clientX: number): void {
    const drag = this.barDrag;
    if (!drag) return;
    const delta = Math.round((clientX - drag.startX) / this.getDayWidth());
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
    const next = this.applyScheduledDates(baseTasks, taskId, start, end, mode);
    this.tasks = buildTaskTree(next);
    this.requestUpdate();
  }

  private applyScheduledDates(
    baseTasks: GanttTask[],
    taskId: string,
    requestedStart: string,
    requestedEnd: string,
    mode: 'move' | 'resize-start' | 'resize-end',
  ): GanttTask[] {
    const next = baseTasks.map(task => ({ ...task }));
    const byId = new Map(next.map(task => [task.id, task]));
    const childrenByParent = new Map<string, string[]>();
    const outgoingBySource = new Map<string, GanttDependency[]>();
    next.forEach(task => {
      if (!task.parentId) return;
      const children = childrenByParent.get(task.parentId) || [];
      children.push(task.id);
      childrenByParent.set(task.parentId, children);
    });
    this.dependencies.forEach(dependency => {
      const dependencies = outgoingBySource.get(dependency.from) || [];
      dependencies.push(dependency);
      outgoingBySource.set(dependency.from, dependencies);
    });
    const root = byId.get(taskId);
    if (!root) return next;

    const shiftResourceDates = (task: GanttTask, days: number): void => {
      if (!days || !task.resources?.length) return;
      task.resources = task.resources.map(resource => {
        if (!resource.quantityByDate) return resource;
        const quantityByDate = Object.entries(resource.quantityByDate).reduce<Record<string, number>>((shifted, [date, quantity]) => {
          shifted[this.addDays(date, days)] = quantity;
          return shifted;
        }, {});
        return { ...resource, quantityByDate, totalQuantity: undefined, cost: undefined };
      });
    };

    const redistributeResourceDates = (task: GanttTask): void => {
      if (!task.resources?.length) return;
      task.resources = task.resources.map(resource => {
        if (!resource.quantityByDate) return resource;
        const total = this.getResourceTotalQuantity(resource);
        return { ...resource, quantity: total, quantityByDate: this.createDistributedQuantities(task.start, task.end, total, resource), totalQuantity: undefined, cost: undefined };
      });
    };

    const shiftSubtree = (rootId: string, days: number): void => {
      const task = byId.get(rootId);
      if (!task) return;
      task.start = this.addDays(task.start, days);
      task.end = this.addDays(task.end, days);
      shiftResourceDates(task, days);
      childrenByParent.get(rootId)?.forEach(childId => shiftSubtree(childId, days));
    };

    if (mode === 'move') {
      shiftSubtree(taskId, diffDays(root.start, requestedStart));
    } else {
      root.start = requestedStart;
      root.end = requestedEnd;
      redistributeResourceDates(root);
    }

    const visited = new Set<string>();
    const propagate = (sourceId: string): void => {
      if (visited.has(sourceId)) return;
      visited.add(sourceId);
      const source = byId.get(sourceId);
      if (!source) return;

      for (const dependency of outgoingBySource.get(sourceId) || []) {
        const successor = byId.get(dependency.to);
        if (!successor) continue;
        const lag = dependency.lagDays || 0;
        let requiredStart = successor.start;
        let requiredEnd = successor.end;
        switch (dependency.type || 'finish-to-start') {
          case 'start-to-start': requiredStart = this.addDays(source.start, lag); break;
          case 'finish-to-finish': requiredEnd = this.addDays(source.end, lag); break;
          case 'start-to-finish': requiredEnd = this.addDays(source.start, lag); break;
          default: requiredStart = this.addDays(source.end, lag + 1); break;
        }

        const shift = dependency.type === 'finish-to-finish' || dependency.type === 'start-to-finish'
          ? diffDays(successor.end, requiredEnd)
          : diffDays(successor.start, requiredStart);
        if (shift > 0) shiftSubtree(successor.id, shift);
        propagate(successor.id);
      }
    };

    propagate(taskId);
    return next;
  }

  /** Met le planning en cohérence avant le premier rendu : un lien Fin → Début
   * ne peut pas pointer vers une tâche qui commence avant la fin de sa source. */
  private applyInitialDependencySchedule(tasks: GanttTask[]): GanttTask[] {
    if (this.options.autoSchedule === false || !this.dependencies.length) return tasks;
    const scheduled = tasks.map(task => ({ ...task }));
    const byId = new Map(scheduled.map(task => [task.id, task]));
    const childrenByParent = new Map<string, string[]>();
    const outgoingBySource = new Map<string, GanttDependency[]>();
    const incomingCount = new Map<string, number>();
    const dependencyTaskIds = new Set<string>();

    scheduled.forEach(task => {
      if (!task.parentId) return;
      const children = childrenByParent.get(task.parentId) || [];
      children.push(task.id);
      childrenByParent.set(task.parentId, children);
    });
    this.dependencies.forEach(dependency => {
      if (!byId.has(dependency.from) || !byId.has(dependency.to)) return;
      const dependencies = outgoingBySource.get(dependency.from) || [];
      dependencies.push(dependency);
      outgoingBySource.set(dependency.from, dependencies);
      incomingCount.set(dependency.to, (incomingCount.get(dependency.to) || 0) + 1);
      dependencyTaskIds.add(dependency.from);
      dependencyTaskIds.add(dependency.to);
    });

    const shiftResourceDates = (task: GanttTask, days: number): void => {
      if (!days || !task.resources?.length) return;
      task.resources = task.resources.map(resource => {
        if (!resource.quantityByDate) return resource;
        const quantityByDate = Object.entries(resource.quantityByDate).reduce<Record<string, number>>((shifted, [date, quantity]) => {
          shifted[this.addDays(date, days)] = quantity;
          return shifted;
        }, {});
        return { ...resource, quantityByDate, totalQuantity: undefined, cost: undefined };
      });
    };
    const shiftSubtree = (taskId: string, days: number): void => {
      const task = byId.get(taskId);
      if (!task || !days) return;
      task.start = this.addDays(task.start, days);
      task.end = this.addDays(task.end, days);
      shiftResourceDates(task, days);
      childrenByParent.get(taskId)?.forEach(childId => shiftSubtree(childId, days));
    };

    // Process each acyclic dependency once in topological order. The previous
    // implementation replayed the whole graph for every link, causing a large
    // quadratic cost as soon as an imported schedule had many dependencies.
    const ready = [...dependencyTaskIds].filter(taskId => !incomingCount.get(taskId));
    while (ready.length) {
      const sourceId = ready.shift()!;
      const source = byId.get(sourceId);
      if (!source) continue;
      for (const dependency of outgoingBySource.get(sourceId) || []) {
        const successor = byId.get(dependency.to);
        if (!successor) continue;
        const lag = dependency.lagDays || 0;
        const requiredDate = (dependency.type || 'finish-to-start') === 'start-to-start' || (dependency.type || 'finish-to-start') === 'start-to-finish'
          ? this.addDays(source.start, lag)
          : this.addDays(source.end, (dependency.type || 'finish-to-start') === 'finish-to-start' ? lag + 1 : lag);
        const shift = dependency.type === 'finish-to-finish' || dependency.type === 'start-to-finish'
          ? diffDays(successor.end, requiredDate)
          : diffDays(successor.start, requiredDate);
        if (shift > 0) shiftSubtree(successor.id, shift);
        const remaining = (incomingCount.get(successor.id) || 0) - 1;
        incomingCount.set(successor.id, remaining);
        if (remaining === 0) ready.push(successor.id);
      }
    }
    return scheduled;
  }

  private editTaskName(task: GanttTask): void {
    const value = window.prompt('Nom de la tâche', task.name);
    if (value !== null && value.trim() && value.trim() !== task.name) this.updateTask(task.id, { name: value.trim() });
  }

  private deleteSelected = (): void => { if (this.selectedTaskId) this.deleteTask(this.selectedTaskId); };

  private getFlatTasks(): GanttTask[] {
    const result: GanttTask[] = [];
    const visit = (tasks: GanttTask[]) => tasks.forEach(task => { result.push({ ...task, children: undefined }); if (task.children?.length) visit(task.children); });
    visit(this.tasks);
    return result;
  }

  /** Prépare les index nécessaires au rendu, une seule fois par mise à jour. */
  private prepareRenderCaches(flatTasks: GanttTask[]): void {
    this.renderTaskIndex = new Map(flatTasks.map(task => [task.id, task]));
    this.renderTaskDepths = new Map();
    this.renderTaskCodes = new Map();
    const indexOutline = (tasks: GanttTask[], prefix = ''): void => {
      tasks.forEach((task, index) => {
        const code = prefix ? `${prefix}.${index + 1}` : String(index + 1);
        this.renderTaskCodes.set(task.id, code);
        if (task.children?.length) indexOutline(task.children, code);
      });
    };
    indexOutline(this.tasks);
    const resolveDepth = (taskId: string, visiting = new Set<string>()): number => {
      const cached = this.renderTaskDepths.get(taskId);
      if (cached !== undefined) return cached;
      const task = this.renderTaskIndex.get(taskId);
      if (!task?.parentId || visiting.has(taskId)) {
        this.renderTaskDepths.set(taskId, 0);
        return 0;
      }
      visiting.add(taskId);
      const depth = 1 + resolveDepth(task.parentId, visiting);
      visiting.delete(taskId);
      this.renderTaskDepths.set(taskId, depth);
      return depth;
    };
    flatTasks.forEach(task => resolveDepth(task.id));

    this.renderTaskCosts = new Map();
    const resolveCost = (task: GanttTask): number => {
      const cached = this.renderTaskCosts.get(task.id);
      if (cached !== undefined) return cached;
      const ownResources = (task.resources || []).reduce((total, resource) => total + this.getResourceCost(resource), 0);
      const ownCost = ownResources || Number(task.unitCost || task.metadata?.unitCost || 0) * Number(task.quantity || task.metadata?.quantity || 0);
      const total = ownCost + (task.children || []).reduce((sum, child) => sum + resolveCost(child), 0);
      this.renderTaskCosts.set(task.id, total);
      return total;
    };
    this.tasks.forEach(resolveCost);
  }

  private findTask(taskId: string | null): GanttTask | null {
    if (!taskId) return null;
    return this.getFlatTasks().find(task => task.id === taskId) || null;
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
    return this.getConfiguredColumns().filter(column => this.isColumnVisible(column));
  }

  private getResourceColumns(): GanttResourceColumn[] {
    return this.options.resourceColumns?.length ? this.options.resourceColumns : DEFAULT_RESOURCE_COLUMNS;
  }

  private getResourceColumnWidth(column: GanttResourceColumn): number {
    return Math.max(56, Math.min(480, column.width));
  }

  private getConfiguredColumns(): GanttColumn[] {
    if (this.options.taskColumns?.length) return this.options.taskColumns;
    return DEFAULT_TASK_COLUMNS.map(({ labelKey, ...column }) => ({ ...column, label: this.t(labelKey) }));
  }

  private getColumnWidth(column: GanttColumn): number {
    return this.columnWidthOverrides.get(column.key) ?? column.width;
  }

  private isColumnRequired(column: GanttColumn): boolean {
    return column.key === 'name' || Boolean(column.required);
  }

  private isColumnVisible(column: GanttColumn): boolean {
    if (this.isColumnRequired(column)) return true;
    return this.columnVisibilityOverrides.get(column.key) ?? column.visible !== false;
  }

  private toggleColumnMenu = (): void => {
    this.columnMenuOpen = !this.columnMenuOpen;
    this.requestUpdate();
  };

  private setColumnVisibility(column: GanttColumn, event: Event): void {
    if (this.isColumnRequired(column)) return;
    this.columnVisibilityOverrides.set(column.key, (event.target as HTMLInputElement).checked);
    this.requestUpdate();
  }

  private resetColumns = (): void => {
    this.columnVisibilityOverrides.clear();
    this.columnWidthOverrides.clear();
    this.requestUpdate();
  };

  private renderColumnMenu() {
    if (!this.columnMenuOpen) return nothing;
    return html`<div class="column-menu" @click=${(event: Event) => event.stopPropagation()}>
      <strong>${this.t('columnMenuTitle')}</strong>
      ${this.getConfiguredColumns().map(column => html`<label class=${this.isColumnRequired(column) ? 'required' : ''}>
        <input type="checkbox" ?checked=${this.isColumnVisible(column)} ?disabled=${this.isColumnRequired(column)} @change=${(event: Event) => this.setColumnVisibility(column, event)} />
        <span>${column.label}</span>${this.isColumnRequired(column) ? html`<small>${this.t('required')}</small>` : nothing}
      </label>`)}
      <div class="column-menu-actions"><button @click=${this.resetColumns}>${this.t('reset')}</button></div>
    </div>`;
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
    if (column.type === 'number' && typeof value === 'number') return this.formatNumber(value);
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
    const daily = resource.quantityByDate;
    if (daily && Object.keys(daily).length) return this.roundQuantity(Object.values(daily).reduce((total, value) => total + (Number(value) || 0), 0));
    return this.roundQuantity(Number(resource.totalQuantity ?? resource.quantity) || 0);
  }

  /** Quantities are stored to two decimals; normalize sums to avoid binary floating-point artefacts. */
  private roundQuantity(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  private createDistributedQuantities(start: string, end: string, requestedTotal: number, resource?: GanttResource): Record<string, number> | undefined {
    const total = Number.isFinite(requestedTotal) && requestedTotal > 0 ? this.roundQuantity(requestedTotal) : 0;
    if (!total) return undefined;
    const dates = Array.from({ length: Math.max(1, diffDays(start, end) + 1) }, (_, index) => this.addDays(start, index));
    const workingDates = resource ? dates.filter(date => this.isResourceWorkingDay(resource, parseDateOnly(date))) : dates;
    if (!workingDates.length) return undefined;
    const days = workingDates.length;
    const amountPerDay = this.roundQuantity(total / days);
    const quantityByDate: Record<string, number> = {};
    let allocated = 0;
    for (let index = 0; index < days; index += 1) {
      const value = index === days - 1 ? this.roundQuantity(total - allocated) : amountPerDay;
      if (value > 0) quantityByDate[workingDates[index]] = value;
      allocated = this.roundQuantity(allocated + value);
    }
    return quantityByDate;
  }

  private getResourceCost(resource: GanttResource): number {
    return this.roundQuantity(this.getResourceTotalQuantity(resource) * (Number(resource.unitCost) || 0));
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
    if (!task) return null;
    const totalQuantity = resource.totalQuantity ?? resource.quantity ?? 1;
    const created: GanttResource = {
      id: resource.id || this.createId(),
      name: resource.name || 'Nouvelle ressource',
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
    const next = this.getFlatTasks().map(task => task.id === taskId
      ? { ...task, resources: (task.resources || []).map(resource => resource.id === resourceId ? { ...resource, ...patch } : resource) }
      : task);
    this.replaceFlatTasks(next, 'task-updated', taskId);
  }

  /** Répartit une quantité totale sur tous les jours inclus dans la tâche.
   *  Les deux décimales sont conservées et le dernier jour absorbe l'éventuel écart d'arrondi. */
  private distributeResourceTotal(taskId: string, resourceId: string, rawValue: string): void {
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
    const menuWidth = 220;
    const menuHeight = 48;
    this.resourceContextMenu = {
      taskId,
      x: Math.min(event.clientX, Math.max(8, window.innerWidth - menuWidth)),
      y: Math.min(event.clientY, Math.max(8, window.innerHeight - menuHeight)),
    };
    event.preventDefault();
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

  private openTaskContextMenu(taskId: string, event: MouseEvent): void {
    const menuWidth = 200;
    const menuHeight = 76;
    this.resourceContextMenu = undefined;
    this.taskContextMenu = {
      taskId,
      x: Math.min(event.clientX, Math.max(8, window.innerWidth - menuWidth)),
      y: Math.min(event.clientY, Math.max(8, window.innerHeight - menuHeight)),
    };
    event.preventDefault();
    this.selectTask(taskId);
    this.requestUpdate();
  }

  private closeTaskContextMenu = (): void => {
    if (!this.taskContextMenu) return;
    this.taskContextMenu = undefined;
    this.requestUpdate();
  };

  private addTaskAfterContext = (): void => {
    const taskId = this.taskContextMenu?.taskId;
    if (!taskId) return;
    this.addTaskAfter(taskId);
  };

  private addTaskAfter(taskId: string): void {
    const current = this.findTask(taskId);
    if (!current) return;
    const flatTasks = this.getFlatTasks();
    const index = flatTasks.findIndex(task => task.id === taskId);
    const start = this.addDays(current.end, 1);
    const created: GanttTask = {
      id: this.createId(),
      name: 'Nouvelle tâche',
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
  }

  private openTaskEditor(taskId: string, tab: 'general' | 'resources' | 'links' = 'general'): void {
    const task = this.findTask(taskId);
    if (!task) return;
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
    if (!task) return;
    const hostPicker = this.options.resourcePicker;
    if (hostPicker) {
      try {
        void Promise.resolve(hostPicker({
          task,
          assignReference: reference => this.addResourceFromReference(task.id, reference),
          addResource: (resource = {}) => this.addResource(task.id, resource),
        })).catch(error => this.setStatus(error instanceof Error ? error.message : 'Sélection de ressource indisponible', 'error'));
      } catch (error) {
        this.setStatus(error instanceof Error ? error.message : 'Sélection de ressource indisponible', 'error');
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
      this.setStatus(error instanceof Error ? error.message : 'Référentiel de ressources indisponible', 'error');
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
      this.setStatus(`La ressource ${reference.name} est déjà affectée à cette tâche`, 'info');
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
      case 'start-to-start': return 'Début → Début';
      case 'finish-to-finish': return 'Fin → Fin';
      case 'start-to-finish': return 'Début → Fin';
      default: return 'Fin → Début';
    }
  }

  private removeResource(taskId: string, resourceId: string): void {
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
  private getHeaderWidth(): number {
    if (this.headerWidthOverride !== undefined) return Math.max(220, Math.min(900, this.headerWidthOverride));
    return Math.max(this.options.headerWidth ?? 0, this.getColumns().reduce((total, column) => total + column.width, 0));
  }
  private getGanttPanelHeight(): string {
    const configured = this.options.maxHeight;
    if (!this.splitUserResized && configured !== undefined) return typeof configured === 'number' ? `${configured}px` : configured;
    return `${this.ganttPanelHeight}px`;
  }
  private getTimelineHeaderHeight(): number { return this.options.showWeekNumbers ? 76 : HEADER_HEIGHT; }
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
    const locale = this.options.locale || globalThis.navigator?.language || 'fr-FR';
    try { Intl.getCanonicalLocales(locale); return locale; } catch { return 'fr-FR'; }
  }

  private t(key: keyof GanttTranslations): string {
    const defaults = getBuiltInTranslations(this.getLocale());
    return this.options.translations?.[key] || defaults[key];
  }

  private getFirstDayOfWeek(): number {
    const value = this.options.firstDayOfWeek ?? 1;
    return Number.isInteger(value) && value >= 0 && value <= 6 ? value : 1;
  }

  private isWeekStart(date: Date): boolean { return date.getUTCDay() === this.getFirstDayOfWeek(); }

  private getWeekNumber(date: Date): number {
    if (this.options.weekNumbering === 'iso') return this.getIsoWeekNumber(date);
    const firstFullWeek = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    const firstDay = this.getFirstDayOfWeek();
    firstFullWeek.setUTCDate(firstFullWeek.getUTCDate() + ((firstDay - firstFullWeek.getUTCDay() + 7) % 7));
    if (date < firstFullWeek) return this.getWeekNumber(new Date(Date.UTC(date.getUTCFullYear() - 1, 11, 31)));
    return Math.floor(diffDays(firstFullWeek, date) / 7) + 1;
  }

  private getIsoWeekNumber(date: Date): number {
    const thursday = new Date(date.getTime());
    thursday.setUTCDate(thursday.getUTCDate() + 4 - (thursday.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1));
    return Math.ceil((diffDays(yearStart, thursday) + 1) / 7);
  }

  private alignRangeToWeeks(range: { start: Date; end: Date }): { start: Date; end: Date } {
    const start = new Date(range.start.getTime());
    const end = new Date(range.end.getTime());
    const firstDay = this.getFirstDayOfWeek();
    start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() - firstDay + 7) % 7));
    end.setUTCDate(end.getUTCDate() + ((firstDay + 6 - end.getUTCDay() + 7) % 7));
    return { start, end };
  }

  private formatDayTitle(date: Date): string {
    return new Intl.DateTimeFormat(this.getLocale(), { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(date);
  }

  private getNonWorkingDays(): number[] { return this.options.nonWorkingDays === undefined ? [0, 6] : this.options.nonWorkingDays.filter(day => Number.isInteger(day) && day >= 0 && day <= 6); }
  private isNonWorkingDay(date: Date): boolean { return this.getNonWorkingDays().includes(date.getUTCDay()); }
  private isNonWorkingBlockStart(date: Date): boolean {
    if (!this.isNonWorkingDay(date)) return false;
    const previous = new Date(date.getTime());
    previous.setUTCDate(previous.getUTCDate() - 1);
    return !this.isNonWorkingDay(previous);
  }
  private getResourceCalendar(resource: GanttResource): GanttCalendar | undefined { return this.calendars.find(calendar => calendar.id === resource.calendarId); }
  private getResourceCalendarLabel(resource: GanttResource): string { return this.getResourceCalendar(resource)?.name || this.t('resource'); }
  private isResourceWorkingDay(resource: GanttResource, date: Date): boolean {
    const calendar = this.getResourceCalendar(resource);
    const exception = calendar?.exceptions?.[formatDate(date)];
    if (exception === 'working') return true;
    if (exception === 'non-working') return false;
    const workingDays = calendar?.workingDays;
    return workingDays ? workingDays.includes(date.getUTCDay()) : !this.isNonWorkingDay(date);
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
