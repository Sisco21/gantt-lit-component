import { html, nothing } from 'lit';
import '../src/gantt-chart';
import type { GanttChart } from '../src/gantt-chart';
import { GanttColumnType } from '../src/types';
import type { GanttColumnRenderContext, GanttColumnSettings, GanttData, GanttOptions, GanttProjectSummary, GanttResource, GanttResourceProvider, GanttResourceReference, GanttTask, GanttTaskDeleteContext } from '../src/types';
import { formatDate } from '../src/utils';
import sampleData from './data.json' with { type: 'json' };

// JSON module imports widen literal values (for example, `type`) to `string`.
// The bundled fixture is the component's canonical GanttData sample.
const sampleProject = sampleData as GanttData;

type DemoLanguage = 'en' | 'fr';

const DEMO_UI = {
  en: {
    locale: 'en-US', language: 'Language', ganttTitle: 'Gantt Chart Component', ganttSubtitle: 'Reusable Lit Component with parent tasks, drag & drop, and custom colors', importJson: '📥 Import JSON', importProject: '📥 Import MS Project', loadSample: '📋 Load sample', largeSample: 'Large sample · 1,550 tasks', reset: '🔄 Reset',
    style: 'Style', demoVisualStyle: 'Demo visual style', darkOperations: 'Dark operations', switchToDark: 'Switch to dark theme', switchToLight: 'Switch to light theme', weekStarts: 'Week starts', monday: 'Monday', sunday: 'Sunday', weekNumbering: 'Week numbering', firstFullWeek: 'First full week', taskRowHeight: 'Task row height',
    start: 'Start', finish: 'Finish', duration: 'Duration', progress: 'Progress', workItems: 'Work items', schedule: 'Schedule', costs: 'Costs', resources: 'Resources', planningSummary: 'Planning summary',
    loadingSchedule: 'Loading schedule', preparingSample: 'Preparing sample data…', loadingInProgress: 'Loading in progress',
    calendarDays: 'calendar days', workingDays: 'working days', tasks: 'Tasks', phases: 'Phases', milestones: 'Milestones', overdue: 'overdue', next: 'Next', total: 'Total', actual: 'Actual', load: 'Load', capacity: 'Capacity',
    weekUpdated: 'Week: {weekStart} — {weekNumbering}', jsonLoaded: 'JSON file loaded: {name}', projectLoaded: 'Project loaded: {name}', invalidJson: 'Invalid JSON file', invalidProject: 'Invalid project file', sampleLoaded: 'Sample data loaded', generatingLarge: 'Generating {count} tasks and their dependencies…', largeLoaded: 'Large sample loaded: {count} tasks in {elapsed} ms', ganttReset: 'Gantt reset', componentReady: 'Gantt component ready', styleApplied: '{style} style applied', deleteConfirm: 'Delete “{name}”?', deleteChildren: 'This will also delete {count} child task{suffix}.',
    addTaskOn: '＋ Add task on {date}', addPhaseOn: '＋ Add phase on {date}', fitSchedule: 'Fit schedule {date}', close: 'Close', editPhase: '✎ Edit phase', fitPhase: 'Fit phase', addPhaseTask: '＋ Add phase task', deletePhase: 'Delete phase', editTask: '✎ Edit task', setProgress0: 'Set progress to 0%', setProgress50: 'Set progress to 50%', markComplete: 'Mark as complete', fitTask: 'Fit {name}', addTaskAfter: '＋ Add task after', logTask: 'Log task', deleteTask: 'Delete task',
    daysShort: 'd', days: 'days', cost: 'Cost', actualCost: 'Actual cost', totalCost: 'Total cost', costCoefficient: 'Cost × coefficient', delta: 'Delta', taskName: 'Task name', code: 'Code', name: 'Name', type: 'Type', calendar: 'Calendar', unitPrice: 'PU', quantity: 'Q', totalQuantity: 'Total quantity', coefficient: 'Coefficient', actualCostVariance: 'Actual cost variance',
  },
  fr: {
    locale: 'fr-FR', language: 'Langue', ganttTitle: 'Composant de diagramme de Gantt', ganttSubtitle: 'Composant Lit réutilisable avec tâches parentes, glisser-déposer et couleurs personnalisées', importJson: '📥 Importer JSON', importProject: '📥 Importer MS Project', loadSample: '📋 Charger exemple', largeSample: 'Grand exemple · 1 550 tâches', reset: '🔄 Réinitialiser',
    style: 'Style', demoVisualStyle: 'Style visuel de la démo', darkOperations: 'Opérations sombres', switchToDark: 'Passer au thème sombre', switchToLight: 'Passer au thème clair', weekStarts: 'Début de semaine', monday: 'Lundi', sunday: 'Dimanche', weekNumbering: 'Numérotation des semaines', firstFullWeek: 'Première semaine complète', taskRowHeight: 'Hauteur des lignes',
    start: 'Début', finish: 'Fin', duration: 'Durée', progress: 'Avancement', workItems: 'Éléments', schedule: 'Planning', costs: 'Coûts', resources: 'Ressources', planningSummary: 'Récapitulatif du planning',
    loadingSchedule: 'Chargement du planning', preparingSample: 'Préparation des données exemple…', loadingInProgress: 'Chargement en cours',
    calendarDays: 'jours calendaires', workingDays: 'jours travaillés', tasks: 'Tâches', phases: 'Phases', milestones: 'Jalons', overdue: 'en retard', next: 'Prochaine', total: 'Total', actual: 'Réel', load: 'Charge', capacity: 'Capacité',
    weekUpdated: 'Semaine : {weekStart} — {weekNumbering}', jsonLoaded: 'Fichier JSON chargé : {name}', projectLoaded: 'Projet chargé : {name}', invalidJson: 'Fichier JSON invalide', invalidProject: 'Fichier projet invalide', sampleLoaded: 'Exemple chargé', generatingLarge: 'Génération de {count} tâches et de leurs dépendances…', largeLoaded: 'Grand exemple chargé : {count} tâches en {elapsed} ms', ganttReset: 'Gantt réinitialisé', componentReady: 'Composant Gantt prêt', styleApplied: 'Style {style} appliqué', deleteConfirm: 'Supprimer « {name} » ?', deleteChildren: 'Cette action supprimera aussi {count} tâche{suffix} enfant.',
    addTaskOn: '＋ Ajouter une tâche le {date}', addPhaseOn: '＋ Ajouter une phase le {date}', fitSchedule: 'Ajuster le planning {date}', close: 'Fermer', editPhase: '✎ Modifier la phase', fitPhase: 'Ajuster la phase', addPhaseTask: '＋ Ajouter une tâche de phase', deletePhase: 'Supprimer la phase', editTask: '✎ Modifier la tâche', setProgress0: 'Mettre l’avancement à 0 %', setProgress50: 'Mettre l’avancement à 50 %', markComplete: 'Marquer comme terminée', fitTask: 'Ajuster {name}', addTaskAfter: '＋ Ajouter une tâche après', logTask: 'Journaliser la tâche', deleteTask: 'Supprimer la tâche',
    daysShort: 'j', days: 'jours', cost: 'Coût', actualCost: 'Coût réel', totalCost: 'Coût total', costCoefficient: 'Coût × coefficient', delta: 'Écart', taskName: 'Nom de la tâche', code: 'Code', name: 'Nom', type: 'Type', calendar: 'Calendrier', unitPrice: 'PU', quantity: 'Q', totalQuantity: 'Quantité totale', coefficient: 'Coefficient', actualCostVariance: 'Écart de coût réel',
  },
} as const;

type DemoTextKey = keyof typeof DEMO_UI.en;
let demoLanguage: DemoLanguage = 'en';

function demoText(key: DemoTextKey, values: Record<string, string | number> = {}): string {
  return DEMO_UI[demoLanguage][key].replace(/\{(\w+)\}/g, (_match, name: string) => String(values[name] ?? ''));
}

function getDemoLocale(): string {
  return DEMO_UI[demoLanguage].locale;
}

/** Simulates an external resource catalogue. Replace search() with an API call in a real product. */
const demoResourceCatalogue: GanttResourceReference[] = [
  { id: 'catalogue-worker-qualified', name: 'Qualified worker', type: 'work', unit: 'day', unitCost: 400, maxUnits: 8 },
  { id: 'catalogue-site-barrier', name: 'Site barrier', type: 'material', unit: 'unit', unitCost: 50, maxUnits: 250 },
  { id: 'catalogue-surveyor', name: 'Surveyor', type: 'work', unit: 'day', unitCost: 620, maxUnits: 2 },
];

const demoResourceProvider: GanttResourceProvider = {
  async search(query) {
    await new Promise<void>(resolve => window.setTimeout(resolve, 180));
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return demoResourceCatalogue.filter(resource => !normalizedQuery || resource.name.toLocaleLowerCase().includes(normalizedQuery));
  },
};

function getGantt(): GanttChart | null {
  return document.querySelector('gantt-chart') as GanttChart | null;
}

type CostVarianceState = 'favorable' | 'unfavorable' | 'neutral';

interface ProjectFooterOptions {
  costVariance?: Partial<Record<CostVarianceState, { className?: string; icon?: string }>>;
}

/**
 * Host-owned footer styling. Replace these class names with classes from the
 * consuming application; the Gantt component itself does not impose footer CSS.
 */
const demoProjectFooterOptions: ProjectFooterOptions = {
  costVariance: {
    favorable: { className: 'cost-variance--favorable', icon: '😀' },
    unfavorable: { className: 'cost-variance--unfavorable', icon: '🙁' },
    neutral: { className: 'cost-variance--neutral', icon: '•' },
  },
};

function updateProjectFooter(summary: GanttProjectSummary, options: ProjectFooterOptions = demoProjectFooterOptions): void {
  const formatDate = (value: string | null) => value
    ? new Intl.DateTimeFormat(getDemoLocale(), { dateStyle: 'medium' }).format(new Date(`${value}T00:00:00`))
    : '—';
  const formatCost = new Intl.NumberFormat(getDemoLocale(), { maximumFractionDigits: 2 });
  const formatQuantity = new Intl.NumberFormat(getDemoLocale(), { maximumFractionDigits: 2 });
  const formattedCostVariance = `${formatCost.format(summary.costVariance)} €`;
  const varianceState: CostVarianceState = summary.costVariance > 0
    ? 'unfavorable'
    : summary.costVariance < 0
      ? 'favorable'
      : 'neutral';
  const varianceStyle = options.costVariance?.[varianceState];
  const varianceIcon = varianceStyle?.icon ?? '';
  const values: Record<string, string> = {
    'summary-start': formatDate(summary.start),
    'summary-end': formatDate(summary.end),
    'summary-duration': `${summary.durationDays} ${demoText('calendarDays')} · ${summary.workingDurationDays} ${demoText('workingDays')}`,
    'summary-progress': `${formatQuantity.format(summary.progress)}%`,
    'summary-items': `${demoText('tasks')} ${summary.taskCount} · ${demoText('phases')} ${summary.phaseCount} · ${demoText('milestones')} ${summary.milestoneCount}`,
    'summary-schedule': `${summary.overdueTaskCount} ${demoText('overdue')} · ${demoText('next')} ${formatDate(summary.nextDueDate)}`,
    'summary-resources': `${summary.resourceCount} · ${demoText('load')} ${formatQuantity.format(summary.totalResourceQuantity)} / ${demoText('capacity')} ${formatQuantity.format(summary.totalResourceCapacity)}`,
  };
  Object.entries(values).forEach(([id, value]) => {
    const output = document.getElementById(id);
    if (!output) return;
    output.textContent = value;
  });

  const costOutput = document.getElementById('summary-cost');
  if (!costOutput) return;
  costOutput.replaceChildren(document.createTextNode(`${demoText('total')} ${formatCost.format(summary.totalCost)} € · ${demoText('actual')} ${formatCost.format(summary.actualCost)} € · `));
  const varianceOutput = document.createElement('span');
  varianceOutput.className = varianceStyle?.className ?? '';
  varianceOutput.textContent = `${varianceIcon ? `${varianceIcon} ` : ''}${formattedCostVariance}`;
  costOutput.append(varianceOutput);
}

function roundQuantity(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function resourceQuantity(resource: GanttResource): number {
  const daily = resource.quantityByDate ? Object.values(resource.quantityByDate).reduce((total, value) => total + Number(value || 0), 0) : 0;
  return roundQuantity(daily || Number(resource.totalQuantity ?? resource.quantity) || 0);
}

function resourceCostWithCoefficient(resource: GanttResource): number {
  const coefficient = Number(resource.metadata?.coefficient ?? 1);
  return roundQuantity(resourceQuantity(resource) * Number(resource.unitCost || 0) * coefficient);
}

const LARGE_DEMO_PHASES = 50;
const LARGE_DEMO_TASKS_PER_PHASE = 30;
const LARGE_DEMO_TASK_COUNT = LARGE_DEMO_PHASES * (LARGE_DEMO_TASKS_PER_PHASE + 1);

function demoDate(offset: number): string {
  const date = new Date(Date.UTC(2026, 0, 5));
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

/** A deterministic, sizeable data set for checking rendering and scrolling performance. */
function createLargeDemoProject(): GanttData {
  const tasks: GanttTask[] = [];
  const dependencies: NonNullable<GanttData['dependencies']> = [];

  for (let phaseIndex = 0; phaseIndex < LARGE_DEMO_PHASES; phaseIndex += 1) {
    const phaseId = `performance-phase-${phaseIndex + 1}`;
    const phaseOffset = phaseIndex * 5;
    tasks.push({
      id: phaseId,
      name: `Phase ${String(phaseIndex + 1).padStart(2, '0')} — Performance sample`,
      code: `${phaseIndex + 1}`,
      start: demoDate(phaseOffset),
      end: demoDate(phaseOffset + 43),
      progress: (phaseIndex * 7) % 101,
      parentId: null,
      type: 'parent',
    });

    let predecessorId: string | undefined;
    for (let taskIndex = 0; taskIndex < LARGE_DEMO_TASKS_PER_PHASE; taskIndex += 1) {
      const id = `performance-${phaseIndex + 1}-${taskIndex + 1}`;
      const startOffset = phaseOffset + (taskIndex % 10) * 4;
      const duration = 2 + taskIndex % 5;
      tasks.push({
        id,
        name: `Work package ${phaseIndex + 1}.${taskIndex + 1}`,
        code: `${phaseIndex + 1}.${taskIndex + 1}`,
        start: demoDate(startOffset),
        end: demoDate(startOffset + duration),
        progress: (phaseIndex * 13 + taskIndex * 9) % 101,
        parentId: phaseId,
        type: 'task',
        resources: taskIndex % 3 === 0 ? [{
          id: `resource-${id}`,
          name: taskIndex % 2 ? 'Installation crew' : 'Site equipment',
          type: 'work',
          unitCost: taskIndex % 2 ? 68 : 115,
          quantity: 1,
          maxUnits: taskIndex % 2 ? 4 : 2,
          calendarId: 'weekday',
        }] : undefined,
      });
      if (predecessorId && taskIndex % 2 === 0) dependencies.push({ from: predecessorId, to: id, type: 'finish-to-start' });
      predecessorId = id;
    }
  }

  return {
    name: `Performance sample — ${LARGE_DEMO_TASK_COUNT.toLocaleString(getDemoLocale())} ${demoText('tasks').toLocaleLowerCase(getDemoLocale())}`,
    tasks,
    dependencies,
    calendars: [{ id: 'weekday', name: 'Weekdays', workingDays: [1, 2, 3, 4, 5] }],
  };
}

function taskCostWithCoefficient(task: GanttTask): number {
  return (task.resources || []).reduce((total, resource) => total + resourceCostWithCoefficient(resource), 0);
}

function summaryCostWithCoefficient(task: GanttTask): number {
  return taskCostWithCoefficient(task) + (task.children || []).reduce((total, child) => total + summaryCostWithCoefficient(child), 0);
}

/** Actual cost minus the read-only Cost × coefficient value shown in the grid. */
function costDelta(task: GanttTask): number {
  return roundQuantity(Number(task.actualCost || 0) - taskCostWithCoefficient(task));
}

function formatSignedCost(value: unknown): string {
  const amount = Number(value) || 0;
  const sign = amount > 0 ? '🙁 −' : amount < 0 ? '😀 +' : '';
  return `${sign}${new Intl.NumberFormat(getDemoLocale(), { maximumFractionDigits: 2 }).format(Math.abs(amount))} €`;
}

function deltaCellStyle({ value }: GanttColumnRenderContext): string {
  const isSaving = Number(value) < 0;
  const color = isSaving ? 'var(--gantt-green)' : 'var(--gantt-red)';
  return `color:${color}; background:color-mix(in srgb, ${color} 14%, transparent); font-weight:700; transition:color 140ms ease, background-color 140ms ease`;
}

function deltaCellTemplate({ formattedValue }: GanttColumnRenderContext) {
  return html`<span style="display:inline-flex; align-items:center; justify-content:flex-end; min-width:0; white-space:nowrap">${formattedValue}</span>`;
}

const DEMO_COLUMN_SETTINGS_KEY = 'gantt-demo:column-settings';

/** In production, replace these two calls with your user-settings API. */
function loadDemoColumnSettings(): GanttColumnSettings | undefined {
  try {
    const stored = localStorage.getItem(DEMO_COLUMN_SETTINGS_KEY);
    return stored ? JSON.parse(stored) as GanttColumnSettings : undefined;
  } catch { return undefined; }
}

function saveDemoColumnSettings(settings: GanttColumnSettings): void {
  try { localStorage.setItem(DEMO_COLUMN_SETTINGS_KEY, JSON.stringify(settings)); }
  catch { /* Demo persistence is optional (for example, unavailable in private browsing). */ }
}

/** A host-owned confirmation dialog. Replace with a product dialog or an API permission check. */
function confirmDemoTaskDeletion({ task, descendants }: GanttTaskDeleteContext): boolean {
  const childCount = descendants.length - 1;
  const children = childCount ? `\n\n${demoText('deleteChildren', { count: childCount, suffix: childCount === 1 ? '' : 's' })}` : '';
  return window.confirm(`${demoText('deleteConfirm', { name: task.name })}${children}`);
}

/**
 * Example of host-level configuration. Copy this object into another project
 * and keep only the options that are useful for that integration.
 */
const demoOptions: GanttOptions = {
  locale: getDemoLocale(),
  dayWidth: 30, // Keeps compact custom labels such as "V 16" on one line.
  taskRowHeight: 42,
  // The left grid stays draggable but never uses more than half the browser width.
  taskGridSplitter: { minWidth: 260, maxWidth: '55vw', minTimelineWidth: 200 },
  columnSettings: {
    // These three permissions can be disabled independently by an integrating application.
    allowResize: true,
    allowReorder: true,
    allowVisibility: true,
    allowTaskRowHeight: true,
    // Called after a resize, visibility or order change in either grid.
    onChange: saveDemoColumnSettings,
    // Called by the Columns > Reset action; a host can delete its saved preferences here.
    onReset: () => { try { localStorage.removeItem(DEMO_COLUMN_SETTINGS_KEY); } catch { /* Optional demo storage. */ } },
  },
  firstDayOfWeek: 1, // Monday
  showWeekNumbers: true,
  weekNumbering: 'iso', //'first-full-week', // Microsoft Project-like convention
  // The same configurable date label is used in the planning and resource headers.
  ganttHeader: {
    monthTemplate: ({ label }) => label,
    weekTemplate: ({ number }) => `W ${number}`,
    dayTemplate: ({ weekdayNarrow, day }) => `${weekdayNarrow.toLocaleUpperCase()} ${day}`,
    // At lower zoom, replace daily labels with one date label per calendar week.
    zoomLevels: [
      { maxZoom: .74, dayGrouping: 'week', weekDateTemplate: ({ start }) => String(start.getUTCDate()).padStart(2, '0') },
      { minZoom: .75, dayGrouping: 'day' },
    ],
  },
  resourceHeader: {
    dayTemplate: ({ weekdayNarrow, day }) => `${weekdayNarrow.toLocaleUpperCase()} ${day}`,
    zoomLevels: [
      { maxZoom: .74, dayGrouping: 'week', weekDateTemplate: ({ weekNumber }) => `W ${weekNumber}` },
      { minZoom: .75, dayGrouping: 'day' },
    ],
  },
  nonWorkingDays: [0, 6], // Sunday and Saturday
  // Re-evaluated whenever the summary is calculated, so overdue status follows the current day.
  summaryReferenceDate: () => formatDate(new Date()),
  // Drag from an empty timeline cell to browse the plan without using its scrollbars.
  pan: { enabled: true, axis: 'both', trigger: 'empty-area' },
  history: {
    enabled: true,
    maxActions: 50,
    undoShortcut: ['Ctrl+z', 'Meta+z'],
    redoShortcut: ['Ctrl+y', 'Ctrl+Shift+z', 'Meta+y', 'Meta+Shift+z'],
  },
  taskDeletion: {
    enabled: true,
    keyboardShortcut: true,
    // This function runs outside the component for the toolbar, Delete key and contextual menus.
    confirm: confirmDemoTaskDeletion,
  },
  autoSchedule: true,
  showToday: true,
  showDependencies: true,
  taskEditorMode: 'built-in',
  ganttContextMenuTemplate: ({ fitToView, close, addTask, addPhase, date }) => html`
    <button @click=${addTask}>${demoText('addTaskOn', { date })}</button>
    <button @click=${addPhase}>${demoText('addPhaseOn', { date })}</button>
    <button @click=${() => { fitToView(); close(); }}>
      ${demoText('fitSchedule', { date: (new Date()).toLocaleString(getDemoLocale()) })}
    </button>
    <button @click=${close}>${demoText('close')}</button>
  `,
  // The menu can branch on any task field: here, parents receive a phase menu,
  // while normal tasks receive progress actions. `task.fields` and `task.metadata`
  // are also available for business-specific menu rules.
  taskContextMenuTemplate: context => {
    const { task, close, edit, addTaskAfter, deleteTask, updateTask, fitToView } = context;
    if (task.type === 'parent') return html`
      <button role="menuitem" @click=${edit}>${demoText('editPhase')}</button>
      <button role="menuitem" @click=${() => { fitToView(); close(); }}>${demoText('fitPhase')}</button>
      <button role="menuitem" @click=${addTaskAfter}>${demoText('addPhaseTask')}</button>
      <button class="danger" role="menuitem" @click=${deleteTask}>${demoText('deletePhase')}</button>
    `;
    return html`
      <button role="menuitem" @click=${edit}>${demoText('editTask')}</button>
      <div class="gantt-context-submenu">
        <button class="gantt-context-submenu-trigger" role="menuitem" aria-haspopup="menu">${demoText('schedule')} <span aria-hidden="true">›</span></button>
        <div class="gantt-context-submenu-panel" role="menu">
          <button role="menuitem" @click=${() => { updateTask({ progress: 0 }); close(); }}>${demoText('setProgress0')}</button>
          <button role="menuitem" @click=${() => { updateTask({ progress: 50 }); close(); }}>${demoText('setProgress50')}</button>
          <button role="menuitem" @click=${() => { updateTask({ progress: 100 }); close(); }}>${demoText('markComplete')}</button>
          <button role="menuitem" @click=${() => { fitToView(); close(); }}>${demoText('fitTask', { name: task.name })}</button>
        </div>
      </div>
      <button role="menuitem" @click=${addTaskAfter}>${demoText('addTaskAfter')}</button>
      <button role="menuitem" @click=${() => { console.info('Context task:', task); close(); }}>${demoText('logTask')}</button>
      <button class="danger" role="menuitem" @click=${deleteTask}>${demoText('deleteTask')}</button>
    `;
  },
  taskTemplate: ({ task, durationDays }) => html`${durationDays} ${demoText('daysShort')} · ${task.progress}%`,
  phaseTemplate: ({ task }) => html`${new Intl.NumberFormat(getDemoLocale(), { maximumFractionDigits: 2 }).format(summaryCostWithCoefficient(task))} €`,
  milestoneTemplate: ({ task }) => html`${task.name}`,
  // The tooltip receives the original task object, its resolved colour and assigned resources.
  taskTooltipTemplate: ({ task, color, durationDays, resources, kind }) => html`
    <div class="task-tooltip-title"><span class="task-tooltip-accent" style="--tooltip-color:${color}"></span><span>${task.name}</span></div>
    <div class="task-tooltip-details">
      <span>${demoText('duration')}</span><strong>${durationDays} ${demoText('days')}</strong>
      <span>${demoText('progress')}</span><strong>${task.progress}%</strong>
      <span>${demoText('cost')}</span><strong>${new Intl.NumberFormat(getDemoLocale(), { maximumFractionDigits: 2 }).format(kind === 'summary' ? summaryCostWithCoefficient(task) : taskCostWithCoefficient(task))} €</strong>
    </div>
    ${resources.length ? html`<div class="task-tooltip-resources"><strong>${demoText('resources')}</strong><span>${resources.map(resource => resource.name).join(', ')}</span></div>` : nothing}
  `,
  taskColumns: [
    { key: 'code', label: demoText('code'), width: 64 },
    { key: 'name', label: demoText('taskName'), width: 230, required: true },
    { key: 'duration', label: demoText('duration'), width: 78, type: GanttColumnType.Integer },
    { key: 'start', label: demoText('start'), width: 104, type: GanttColumnType.Date },
    { key: 'end', label: demoText('finish'), width: 104, type: GanttColumnType.Date },
    { key: 'costTotal', label: demoText('totalCost'), width: 96, type: GanttColumnType.Decimal },
    // Read-only built-in value: the task editor updates task.actualCost.
    {
      key: 'actualCost',
      label: demoText('actualCost'),
      width: 108,
      type: GanttColumnType.Decimal,
      format: value => value === '' ? '—' : `${new Intl.NumberFormat(getDemoLocale(), { maximumFractionDigits: 2 }).format(Number(value) || 0)} €`,
    },
    {
      key: 'costWithCoefficient',
      label: demoText('costCoefficient'),
      width: 138,
      type: GanttColumnType.Decimal,
      value: taskCostWithCoefficient,
      format: value => `${new Intl.NumberFormat(getDemoLocale(), { maximumFractionDigits: 2 }).format(Number(value) || 0)} €`,
    },
    {
      key: 'costDelta',
      label: demoText('delta'),
      width: 120,
      type: GanttColumnType.Decimal,
      value: costDelta,
      format: formatSignedCost,
      tone: value => Number(value) < 0 ? 'positive' : 'negative',
      cellTemplate: deltaCellTemplate,
      cellStyle: deltaCellStyle, 
      tooltip: ({ task, formattedValue }) =>
    `${task.name}\n${demoText('actualCostVariance')}: ${formattedValue}`,
    },
  ],
  resourceColumns: [
    { key: 'name', label: demoText('name'), width: 150, editable: true },
    { key: 'type', label: demoText('type'), width: 105, editable: true },
    { key: 'calendarId', label: demoText('calendar'), width: 145, editable: true },
    { key: 'maxUnits', label: demoText('capacity'), width: 80, type: GanttColumnType.Integer, editable: true },
    { key: 'unitCost', label: demoText('unitPrice'), width: 75, type: GanttColumnType.Decimal, editable: true },
    { key: 'quantity', label: demoText('quantity'), width: 65, type: GanttColumnType.Integer, editable: true },
    { key: 'totalQuantity', label: demoText('totalQuantity'), width: 90, type: GanttColumnType.Integer, editable: true },
    {
      key: 'coefficient',
      label: demoText('coefficient'),
      width: 84,
      type: GanttColumnType.Decimal,
      min: -100,
      step: 0.1,
      editable: true,
      value: resource => Number(resource.metadata?.coefficient ?? 1),
      setValue: (value, resource) => ({ metadata: { ...resource.metadata, coefficient: Number(value) || 1 } }),
    },
    {
      key: 'costWithCoefficient',
      label: demoText('costCoefficient'),
      width: 138,
      type: GanttColumnType.Decimal,
      value: resourceCostWithCoefficient,
      format: value => `${new Intl.NumberFormat(getDemoLocale(), { maximumFractionDigits: 2 }).format(Number(value) || 0)} €`,
    },
  ],
  onTaskSelect: (taskId, task) => console.info('Selected task:', taskId, task),
  onTasksChange: data => console.info('Planning updated:', data),
};

const taskColumnTranslationKeys: Record<string, DemoTextKey> = {
  code: 'code', name: 'taskName', duration: 'duration', start: 'start', end: 'finish', costTotal: 'totalCost', actualCost: 'actualCost', costWithCoefficient: 'costCoefficient', costDelta: 'delta',
};

const resourceColumnTranslationKeys: Record<string, DemoTextKey> = {
  name: 'name', type: 'type', calendarId: 'calendar', maxUnits: 'capacity', unitCost: 'unitPrice', quantity: 'quantity', totalQuantity: 'totalQuantity', coefficient: 'coefficient', costWithCoefficient: 'costCoefficient',
};

function getLocalizedDemoOptions(): GanttOptions {
  const localizeColumns = <T extends { key: string; label: string }>(columns: T[], labels: Record<string, DemoTextKey>): T[] => columns.map(column => ({
    ...column,
    label: labels[column.key] ? demoText(labels[column.key]) : column.label,
  }));
  return {
    ...demoOptions,
    locale: getDemoLocale(),
    taskColumns: localizeColumns(demoOptions.taskColumns || [], taskColumnTranslationKeys),
    resourceColumns: localizeColumns(demoOptions.resourceColumns || [], resourceColumnTranslationKeys),
  };
}

type VisualStyle = 'material' | 'fluent' | 'dark-operations';
type DemoTheme = 'light' | 'dark';

const visualGanttTokens: Record<VisualStyle, Record<string, string>> = {
  material: {
    '--gantt-header': '#f2f1fb',
    '--gantt-border': '#d8d6e8',
    '--gantt-muted': '#5d5b72',
    '--gantt-row': '#ffffff',
    '--gantt-row-alt': '#faf9ff',
    '--gantt-non-working-day': '#eeedf7',
    '--gantt-empty-background': '#ffffff',
    '--gantt-empty-color': '#5d5b72',
    '--gantt-surface': '#ffffff',
    '--gantt-control-background': '#ffffff',
    '--gantt-control-hover': '#efeffa',
    '--gantt-control-border': '#bdbbd1',
    '--gantt-input-background': '#ffffff',
    '--gantt-grid-line': '#e8e7f0',
    '--gantt-selection': '#e8e7ff',
    '--gantt-selection-foreground': '#202124',
    '--gantt-summary': '#343247',
    '--gantt-search-match': '#fff4ce',
    '--gantt-search-match-foreground': '#3d2e00',
  },
  fluent: {
    '--gantt-header': '#f3f2f1',
    '--gantt-border': '#d1d1d1',
    '--gantt-muted': '#605e5c',
    '--gantt-row': '#ffffff',
    '--gantt-row-alt': '#faf9f8',
    '--gantt-non-working-day': '#edebe9',
    '--gantt-empty-background': '#ffffff',
    '--gantt-empty-color': '#605e5c',
    '--gantt-surface': '#ffffff',
    '--gantt-control-background': '#ffffff',
    '--gantt-control-hover': '#f3f9fd',
    '--gantt-control-border': '#a19f9d',
    '--gantt-input-background': '#ffffff',
    '--gantt-grid-line': '#edebe9',
    '--gantt-selection': '#e8f3fc',
    '--gantt-selection-foreground': '#201f1e',
    '--gantt-summary': '#323130',
    '--gantt-search-match': '#fff4ce',
    '--gantt-search-match-foreground': '#3d2e00',
  },
  'dark-operations': {
    '--gantt-header': '#e9eef7',
    '--gantt-border': '#c7d2e2',
    '--gantt-muted': '#52657d',
    '--gantt-row': '#ffffff',
    '--gantt-row-alt': '#f7f9fc',
    '--gantt-non-working-day': '#e8edf5',
    '--gantt-empty-background': '#ffffff',
    '--gantt-empty-color': '#52657d',
    '--gantt-surface': '#ffffff',
    '--gantt-control-background': '#ffffff',
    '--gantt-control-hover': '#edf2f8',
    '--gantt-control-border': '#aebed1',
    '--gantt-input-background': '#ffffff',
    '--gantt-grid-line': '#e1e7f0',
    '--gantt-selection': '#dceafe',
    '--gantt-selection-foreground': '#122033',
    '--gantt-summary': '#263b56',
    '--gantt-search-match': '#fff4ce',
    '--gantt-search-match-foreground': '#3d2e00',
  },
};

const visualDarkGanttTokens: Record<VisualStyle, Record<string, string>> = {
  material: {
    '--gantt-header': '#292842', '--gantt-border': '#55536d', '--gantt-muted': '#c8c4d8', '--gantt-row': '#1d1c30', '--gantt-row-alt': '#24233a', '--gantt-non-working-day': '#312f4a', '--gantt-empty-background': '#1d1c30', '--gantt-empty-color': '#c8c4d8', '--gantt-surface': '#1d1c30', '--gantt-control-background': '#292842', '--gantt-control-hover': '#393752', '--gantt-control-border': '#6a6785', '--gantt-input-background': '#171626', '--gantt-grid-line': '#39374f', '--gantt-selection': '#413d6d', '--gantt-selection-foreground': '#faf8ff', '--gantt-summary': '#d4d0e5', '--gantt-search-match': '#4a3a1a', '--gantt-search-match-foreground': '#fff1c2',
  },
  fluent: {
    '--gantt-header': '#292929', '--gantt-border': '#4a4a4a', '--gantt-muted': '#c8c6c4', '--gantt-row': '#1f1f1f', '--gantt-row-alt': '#262626', '--gantt-non-working-day': '#333333', '--gantt-empty-background': '#1f1f1f', '--gantt-empty-color': '#c8c6c4', '--gantt-surface': '#1f1f1f', '--gantt-control-background': '#292929', '--gantt-control-hover': '#383838', '--gantt-control-border': '#666666', '--gantt-input-background': '#171717', '--gantt-grid-line': '#383838', '--gantt-selection': '#264f78', '--gantt-selection-foreground': '#ffffff', '--gantt-summary': '#e0dfdd', '--gantt-search-match': '#4a3a1a', '--gantt-search-match-foreground': '#fff1c2',
  },
  'dark-operations': {
    '--gantt-header': '#18243a', '--gantt-border': '#394a63', '--gantt-muted': '#b7c5d9', '--gantt-row': '#101a2a', '--gantt-row-alt': '#142035', '--gantt-non-working-day': '#1c2a41', '--gantt-empty-background': '#101a2a', '--gantt-empty-color': '#b7c5d9', '--gantt-surface': '#101a2a', '--gantt-control-background': '#18263a', '--gantt-control-hover': '#243650', '--gantt-control-border': '#4a5d78', '--gantt-input-background': '#0d1522', '--gantt-grid-line': '#27354a', '--gantt-selection': '#273f62', '--gantt-selection-foreground': '#f1f5fb', '--gantt-summary': '#c8d4e6', '--gantt-search-match': '#3d321c', '--gantt-search-match-foreground': '#fef3c7',
  },
};

const visualGanttLayoutTokens: Record<VisualStyle, Record<string, string>> = {
  material: {
    '--gantt-font-family': 'Roboto, Calibri, sans-serif',
    '--gantt-font-size': '13px', '--gantt-corner-radius': '10px', '--gantt-control-radius': '6px', '--gantt-bar-radius': '5px', '--gantt-toolbar-min-height': '50px', '--gantt-toolbar-gap': '8px', '--gantt-toolbar-padding': '8px 10px', '--gantt-control-font-size': '12px', '--gantt-control-padding': '6px 10px', '--gantt-search-height': '32px', '--gantt-elevation': '0 4px 20px rgb(28 39 89 / 10%)',
  },
  fluent: {
    '--gantt-font-family': "'Segoe UI', SegoeUI, Arial, sans-serif",
    '--gantt-font-size': '12px', '--gantt-corner-radius': '2px', '--gantt-control-radius': '2px', '--gantt-bar-radius': '2px', '--gantt-toolbar-min-height': '40px', '--gantt-toolbar-gap': '4px', '--gantt-toolbar-padding': '5px 8px', '--gantt-control-font-size': '12px', '--gantt-control-padding': '5px 8px', '--gantt-search-height': '28px', '--gantt-elevation': 'none',
  },
  'dark-operations': {
    '--gantt-font-family': "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    '--gantt-font-size': '13px', '--gantt-corner-radius': '6px', '--gantt-control-radius': '4px', '--gantt-bar-radius': '4px', '--gantt-toolbar-min-height': '46px', '--gantt-toolbar-gap': '6px', '--gantt-toolbar-padding': '7px 9px', '--gantt-control-font-size': '12px', '--gantt-control-padding': '6px 9px', '--gantt-search-height': '30px', '--gantt-elevation': '0 8px 24px rgb(0 0 0 / 24%)',
  },
};

const visualTaskColors: Record<VisualStyle, NonNullable<GanttOptions['taskColors']>> = {
  material: { parent: '#6750a4', task: '#4f378b', milestone: '#b3261e', dependency: '#6750a4' },
  fluent: { parent: '#0078d4', task: '#0f6cbd', milestone: '#d83b01', dependency: '#0078d4' },
  'dark-operations': { parent: '#79aefa', task: '#48c894', milestone: '#fb7185', dependency: '#c09aff' },
};

const visualDarkTaskColors: Record<VisualStyle, NonNullable<GanttOptions['taskColors']>> = {
  material: { parent: '#d0bcff', task: '#b69df8', milestone: '#f2b8b5', dependency: '#d0bcff' },
  fluent: { parent: '#75beff', task: '#4f9fe8', milestone: '#ffb900', dependency: '#75beff' },
  'dark-operations': { parent: '#79aefa', task: '#48c894', milestone: '#fb7185', dependency: '#c09aff' },
};

function getVisualTaskColors(style: VisualStyle, theme: DemoTheme): NonNullable<GanttOptions['taskColors']> {
  return theme === 'dark' ? visualDarkTaskColors[style] : visualTaskColors[style];
}

const generatedTaskColors = new Set([
  '#3478d4', '#26966f', '#dc5b65',
  ...Object.values(visualTaskColors).flatMap(colors => [colors.parent, colors.task, colors.milestone]),
  ...Object.values(visualDarkTaskColors).flatMap(colors => [colors.parent, colors.task, colors.milestone]),
].filter((color): color is string => Boolean(color)).map(color => color.toLowerCase()));

function applyDemoTaskPalette(data: ReturnType<GanttChart['getData']>, colors: NonNullable<GanttOptions['taskColors']>): ReturnType<GanttChart['getData']> {
  const updateTasks = (tasks: GanttTask[]): GanttTask[] => tasks.map(task => {
    const generatedColor = !task.color || generatedTaskColors.has(task.color.toLowerCase());
    const color = task.type === 'milestone' ? colors.milestone : task.type === 'parent' || task.children?.length ? colors.parent : colors.task;
    return {
      ...task,
      ...(generatedColor && color ? { color } : {}),
      ...(task.children ? { children: updateTasks(task.children) } : {}),
    };
  });
  return { ...data, tasks: updateTasks(data.tasks) };
}

function configureDemo(): void {
  const gantt = getGantt();
  if (!gantt) return;
  gantt.setOptions(getLocalizedDemoOptions());
  const savedColumnSettings = loadDemoColumnSettings();
  if (savedColumnSettings) gantt.setColumnSettings(savedColumnSettings);
  gantt.resourceProvider = demoResourceProvider;
  const weekStart = document.getElementById('week-start') as HTMLSelectElement | null;
  const weekNumbering = document.getElementById('week-numbering') as HTMLSelectElement | null;
  if (weekStart) weekStart.value = String(demoOptions.firstDayOfWeek ?? 1);
  if (weekNumbering) weekNumbering.value = demoOptions.weekNumbering ?? 'first-full-week';
  syncTaskRowHeightControl(gantt.getColumnSettings().taskRowHeight ?? demoOptions.taskRowHeight ?? 42);
  gantt.addEventListener('tasks-changed', event => {
    console.info('Gantt change:', (event as CustomEvent).detail);
  });
  // An external footer can subscribe without reading the full task tree itself.
  gantt.addEventListener('gantt-summary-changed', event => {
    updateProjectFooter((event as CustomEvent<GanttProjectSummary>).detail);
  });
  gantt.addEventListener('column-settings-changed', event => {
    syncTaskRowHeightControl((event as CustomEvent<GanttColumnSettings>).detail.taskRowHeight ?? demoOptions.taskRowHeight ?? 42);
  });
  gantt.addEventListener('column-settings-reset', event => {
    syncTaskRowHeightControl((event as CustomEvent<GanttColumnSettings>).detail.taskRowHeight ?? demoOptions.taskRowHeight ?? 42);
  });
  updateProjectFooter(gantt.getProjectSummary());
}

function syncTaskRowHeightControl(height: number): void {
  const control = document.getElementById('task-row-height') as HTMLInputElement | null;
  const output = document.getElementById('task-row-height-value') as HTMLOutputElement | null;
  const value = Math.max(28, Math.min(96, Math.round(Number(height) || 42)));
  if (control) control.value = String(value);
  if (output) output.textContent = `${value} px`;
}

function applyDemoTaskRowHeight(save: boolean): void {
  const gantt = getGantt();
  const control = document.getElementById('task-row-height') as HTMLInputElement | null;
  if (!gantt || !control) return;
  const height = Number(control.value);
  if (save) gantt.setTaskRowHeight(height);
  else gantt.setColumnSettings({ taskRowHeight: height });
  syncTaskRowHeightControl(height);
}

function applyCalendarOptions(): void {
  const gantt = getGantt();
  const weekStart = document.getElementById('week-start') as HTMLSelectElement | null;
  const weekNumbering = document.getElementById('week-numbering') as HTMLSelectElement | null;
  if (!gantt || !weekStart || !weekNumbering) return;
  const visualStyle = (document.documentElement.dataset.visualStyle || 'material') as VisualStyle;
  const theme = (document.documentElement.dataset.theme || 'light') as DemoTheme;
  const taskColors = getVisualTaskColors(visualStyle, theme);
  gantt.setOptions({
    ...getLocalizedDemoOptions(),
    taskColors,
    dependencyColor: taskColors.dependency,
    firstDayOfWeek: Number(weekStart.value),
    weekNumbering: weekNumbering.value as NonNullable<GanttOptions['weekNumbering']>,
  });
  showStatus(demoText('weekUpdated', { weekStart: weekStart.selectedOptions[0].text, weekNumbering: weekNumbering.selectedOptions[0].text }), 'success');
}

function showStatus(message: string, type: 'info' | 'error' | 'success' = 'info') {
  const status = document.getElementById('status');
  if (!status) return;
  status.textContent = message;
  status.className = `status ${type}`;
  window.setTimeout(() => {
    if (status.textContent === message) {
      status.textContent = '';
      status.className = 'status';
    }
  }, 3500);
}

function loadJson(file: File): void {
  const gantt = getGantt();
  if (!gantt) return;
  void gantt.importFile(file)
    .then(() => showStatus(demoText('jsonLoaded', { name: file.name }), 'success'))
    .catch(error => showStatus(error instanceof Error ? error.message : demoText('invalidJson'), 'error'));
}

function loadProjectFile(file: File): void {
  const gantt = getGantt();
  if (!gantt) return;
  void gantt.importFile(file)
    .then(() => showStatus(demoText('projectLoaded', { name: file.name }), 'success'))
    .catch(error => showStatus(error instanceof Error ? error.message : demoText('invalidProject'), 'error'));
}

document.getElementById('btn-json')?.addEventListener('click', () => {
  (document.getElementById('json-input') as HTMLInputElement).click();
});

document.getElementById('btn-mpp')?.addEventListener('click', () => {
  (document.getElementById('mpp-input') as HTMLInputElement).click();
});

function setLoading(isLoading: boolean, description = demoText('preparingSample')): void {
  const dialog = document.getElementById('loading-dialog') as HTMLDialogElement | null;
  const sampleButton = document.getElementById('btn-sample') as HTMLButtonElement | null;
  const largeSampleButton = document.getElementById('btn-large-sample') as HTMLButtonElement | null;
  if (sampleButton) sampleButton.disabled = isLoading;
  if (largeSampleButton) largeSampleButton.disabled = isLoading;
  const descriptionElement = document.getElementById('loading-description');
  if (descriptionElement) descriptionElement.textContent = description;
  if (!dialog) return;
  if (isLoading && !dialog.open) dialog.showModal();
  if (!isLoading && dialog.open) dialog.close();
}

/** Lets the native dialog reach the screen before synchronous Gantt work begins. */
function waitForLoadingPaint(): Promise<void> {
  return new Promise(resolve => window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve())));
}

function waitForMinimumLoadingTime(startedAt: number, minimumMs = 500): Promise<void> {
  const remaining = minimumMs - (performance.now() - startedAt);
  return remaining > 0 ? new Promise(resolve => window.setTimeout(resolve, remaining)) : Promise.resolve();
}

async function loadSampleData(): Promise<void> {
  const loadingStartedAt = performance.now();
  setLoading(true);
  try {
    await waitForLoadingPaint();
    // Demo-only latency: makes the loading state easy to evaluate in an integration.
    await waitForMinimumLoadingTime(loadingStartedAt);
    getGantt()?.setData(structuredClone(sampleProject));
    showStatus(demoText('sampleLoaded'), 'success');
  } finally {
    setLoading(false);
  }
}

document.getElementById('btn-sample')?.addEventListener('click', () => {
  void loadSampleData();
});

async function loadLargeSampleData(): Promise<void> {
  const loadingStartedAt = performance.now();
  const taskCount = LARGE_DEMO_TASK_COUNT.toLocaleString(getDemoLocale());
  setLoading(true, demoText('generatingLarge', { count: taskCount }));
  try {
    await waitForLoadingPaint();
    const startedAt = performance.now();
    const gantt = getGantt();
    gantt?.setData(createLargeDemoProject());
    await gantt?.updateComplete;
    await waitForMinimumLoadingTime(loadingStartedAt);
    const elapsed = Math.round(performance.now() - startedAt);
    showStatus(demoText('largeLoaded', { count: taskCount, elapsed }), 'success');
  } finally {
    setLoading(false);
  }
}

document.getElementById('btn-large-sample')?.addEventListener('click', () => {
  void loadLargeSampleData();
});

document.getElementById('btn-reset')?.addEventListener('click', () => {
  getGantt()?.setData({ tasks: [], dependencies: [] });
  showStatus(demoText('ganttReset'), 'info');
});

function applyGanttVisualStyle(style: VisualStyle, theme: DemoTheme): void {
  const gantt = getGantt();
  if (!gantt) return;
  gantt.visualStyle = style;
  Object.entries({ ...visualGanttLayoutTokens[style], ...(theme === 'dark' ? visualDarkGanttTokens[style] : visualGanttTokens[style]) })
    .forEach(([name, value]) => gantt.style.setProperty(name, value));
  const weekStart = document.getElementById('week-start') as HTMLSelectElement | null;
  const weekNumbering = document.getElementById('week-numbering') as HTMLSelectElement | null;
  const taskColors = getVisualTaskColors(style, theme);
  gantt.setOptions({
    ...getLocalizedDemoOptions(),
    taskColors,
    dependencyColor: taskColors.dependency,
    firstDayOfWeek: Number(weekStart?.value ?? demoOptions.firstDayOfWeek ?? 1),
    weekNumbering: (weekNumbering?.value ?? demoOptions.weekNumbering) as NonNullable<GanttOptions['weekNumbering']>,
  });
  const recoloredData = applyDemoTaskPalette(gantt.getData(), taskColors);
  gantt.setData(recoloredData);
}

function applyTheme(theme: DemoTheme): void {
  const gantt = getGantt();
  const button = document.getElementById('btn-theme') as HTMLButtonElement | null;
  document.documentElement.dataset.theme = theme;
  if (gantt) gantt.theme = theme;
  applyGanttVisualStyle((document.documentElement.dataset.visualStyle || 'material') as VisualStyle, theme);
  if (button) {
    const dark = theme === 'dark';
    button.textContent = dark ? demoText('switchToLight') : demoText('switchToDark');
    button.setAttribute('aria-pressed', String(dark));
  }
}

function applyVisualStyle(style: VisualStyle): void {
  document.documentElement.dataset.visualStyle = style;
  const currentTheme = (document.documentElement.dataset.theme || (style === 'dark-operations' ? 'dark' : 'light')) as DemoTheme;
  applyTheme(currentTheme);
}

function applyDemoLanguage(language: DemoLanguage): void {
  demoLanguage = language;
  document.documentElement.lang = language;
  document.querySelectorAll<HTMLElement>('[data-i18n]').forEach(element => {
    const key = element.dataset.i18n as DemoTextKey | undefined;
    if (key) element.textContent = demoText(key);
  });
  document.querySelectorAll<HTMLElement>('[data-i18n-aria-label]').forEach(element => {
    const key = element.dataset.i18nAriaLabel as DemoTextKey | undefined;
    if (key) element.setAttribute('aria-label', demoText(key));
  });
  const gantt = getGantt();
  if (gantt) {
    const visualStyle = (document.documentElement.dataset.visualStyle || 'material') as VisualStyle;
    const theme = (document.documentElement.dataset.theme || 'light') as DemoTheme;
    const taskColors = getVisualTaskColors(visualStyle, theme);
    gantt.setOptions({ ...getLocalizedDemoOptions(), taskColors, dependencyColor: taskColors.dependency });
    updateProjectFooter(gantt.getProjectSummary());
  }
  applyTheme((document.documentElement.dataset.theme || 'light') as DemoTheme);
}

document.getElementById('btn-theme')?.addEventListener('click', () => {
  applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
});

document.getElementById('demo-language')?.addEventListener('change', event => {
  applyDemoLanguage((event.target as HTMLSelectElement).value as DemoLanguage);
});
document.getElementById('week-start')?.addEventListener('change', applyCalendarOptions);
document.getElementById('week-numbering')?.addEventListener('change', applyCalendarOptions);
document.getElementById('task-row-height')?.addEventListener('input', () => applyDemoTaskRowHeight(false));
document.getElementById('task-row-height')?.addEventListener('change', () => applyDemoTaskRowHeight(true));
document.getElementById('visual-style')?.addEventListener('change', event => {
  const style = (event.target as HTMLSelectElement).value as VisualStyle;
  applyVisualStyle(style);
  showStatus(`${style === 'dark-operations' ? 'Dark operations' : style === 'fluent' ? 'Fluent' : 'Material'} style applied`, 'success');
});

configureDemo();
applyDemoLanguage('en');
applyVisualStyle('material');

document.getElementById('json-input')?.addEventListener('change', event => {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (file) loadJson(file);
});

document.getElementById('mpp-input')?.addEventListener('change', event => {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (file) loadProjectFile(file);
});

showStatus(demoText('componentReady'), 'success');
