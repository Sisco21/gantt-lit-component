import { html } from 'lit';
import '../src/gantt-chart';
import type { GanttChart } from '../src/gantt-chart';
import type { GanttData, GanttOptions, GanttResource, GanttTask } from '../src/types';
import sampleData from './data.json' with { type: 'json' };

// JSON module imports widen literal values (for example, `type`) to `string`.
// The bundled fixture is the component's canonical GanttData sample.
const sampleProject = sampleData as GanttData;

function getGantt(): GanttChart | null {
  return document.querySelector('gantt-chart') as GanttChart | null;
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
    name: `Performance sample — ${LARGE_DEMO_TASK_COUNT.toLocaleString('fr-FR')} tasks`,
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

/**
 * Example of host-level configuration. Copy this object into another project
 * and keep only the options that are useful for that integration.
 */
const demoOptions: GanttOptions = {
  locale: navigator.language,
  firstDayOfWeek: 1, // Monday
  showWeekNumbers: true,
  weekNumbering: 'iso', //'first-full-week', // Microsoft Project-like convention
  nonWorkingDays: [0, 6], // Sunday and Saturday
  // Drag from an empty timeline cell to browse the plan without using its scrollbars.
  pan: { enabled: true, axis: 'both', trigger: 'empty-area' },
  autoSchedule: true,
  showToday: true,
  showDependencies: true,
  taskEditorMode: 'built-in',
  taskBarTemplate: ({ task, kind, durationDays }) => kind === 'summary'
    ? html`${new Intl.NumberFormat(navigator.language, { maximumFractionDigits: 2 }).format(summaryCostWithCoefficient(task))} €`
    : html`${durationDays} j ☝ · ${task.progress}%`,
  taskColumns: [
    { key: 'code', label: 'Code1', width: 64 },
    { key: 'name', label: 'Task name', width: 230, required: true },
    { key: 'duration', label: 'Duration', width: 78, type: 'number' },
    { key: 'start', label: 'Start', width: 104, type: 'date' },
    { key: 'end', label: 'Finish', width: 104, type: 'date' },
    { key: 'costTotal', label: 'Total cost', width: 96, type: 'number' },
    {
      key: 'costWithCoefficient',
      label: 'Cost × coefficient',
      width: 138,
      type: 'number',
      value: taskCostWithCoefficient,
      format: value => `${new Intl.NumberFormat(navigator.language, { maximumFractionDigits: 2 }).format(Number(value) || 0)} €`,
    },
  ],
  resourceColumns: [
    { key: 'name', label: 'Name', width: 150, editable: true },
    { key: 'type', label: 'Type', width: 105, editable: true },
    { key: 'calendarId', label: 'Calendar', width: 145, editable: true },
    { key: 'maxUnits', label: 'Capacity', width: 80, type: 'number', editable: true },
    { key: 'unitCost', label: 'PU', width: 75, type: 'number', editable: true },
    { key: 'quantity', label: 'Q', width: 65, type: 'number', editable: true },
    { key: 'totalQuantity', label: 'Total quantity', width: 90, type: 'number', editable: true },
    {
      key: 'coefficient',
      label: 'Coefficient',
      width: 84,
      type: 'number',
      editable: true,
      value: resource => Number(resource.metadata?.coefficient ?? 1),
      setValue: (value, resource) => ({ metadata: { ...resource.metadata, coefficient: Number(value) || 1 } }),
    },
    {
      key: 'costWithCoefficient',
      label: 'Cost × coefficient',
      width: 138,
      type: 'number',
      value: resourceCostWithCoefficient,
      format: value => `${new Intl.NumberFormat(navigator.language, { maximumFractionDigits: 2 }).format(Number(value) || 0)} €`,
    },
  ],
  onTaskSelect: taskId => console.info('Selected task:', taskId),
  onTasksChange: data => console.info('Planning updated:', data),
};

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
  gantt.setOptions(demoOptions);
  const weekStart = document.getElementById('week-start') as HTMLSelectElement | null;
  const weekNumbering = document.getElementById('week-numbering') as HTMLSelectElement | null;
  if (weekStart) weekStart.value = String(demoOptions.firstDayOfWeek ?? 1);
  if (weekNumbering) weekNumbering.value = demoOptions.weekNumbering ?? 'first-full-week';
  gantt.addEventListener('tasks-changed', event => {
    console.info('Gantt change:', (event as CustomEvent).detail);
  });
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
    ...demoOptions,
    taskColors,
    dependencyColor: taskColors.dependency,
    firstDayOfWeek: Number(weekStart.value),
    weekNumbering: weekNumbering.value as NonNullable<GanttOptions['weekNumbering']>,
  });
  showStatus(`Semaine : ${weekStart.selectedOptions[0].text} — ${weekNumbering.selectedOptions[0].text}`, 'success');
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
    .then(() => showStatus(`Fichier JSON chargé : ${file.name}`, 'success'))
    .catch(error => showStatus(error instanceof Error ? error.message : 'Fichier JSON invalide', 'error'));
}

function loadProjectFile(file: File): void {
  const gantt = getGantt();
  if (!gantt) return;
  void gantt.importFile(file)
    .then(() => showStatus(`Projet chargé : ${file.name}`, 'success'))
    .catch(error => showStatus(error instanceof Error ? error.message : 'Fichier projet invalide', 'error'));
}

document.getElementById('btn-json')?.addEventListener('click', () => {
  (document.getElementById('json-input') as HTMLInputElement).click();
});

document.getElementById('btn-mpp')?.addEventListener('click', () => {
  (document.getElementById('mpp-input') as HTMLInputElement).click();
});

function setLoading(isLoading: boolean, description = 'Préparation des données exemple…'): void {
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
    showStatus('Données exemple chargées', 'success');
  } finally {
    setLoading(false);
  }
}

document.getElementById('btn-sample')?.addEventListener('click', () => {
  void loadSampleData();
});

async function loadLargeSampleData(): Promise<void> {
  const loadingStartedAt = performance.now();
  setLoading(true, `Génération de ${LARGE_DEMO_TASK_COUNT.toLocaleString('fr-FR')} tâches et de leurs liens…`);
  try {
    await waitForLoadingPaint();
    const startedAt = performance.now();
    const gantt = getGantt();
    gantt?.setData(createLargeDemoProject());
    await gantt?.updateComplete;
    await waitForMinimumLoadingTime(loadingStartedAt);
    const elapsed = Math.round(performance.now() - startedAt);
    showStatus(`Grand exemple chargé : ${LARGE_DEMO_TASK_COUNT.toLocaleString('fr-FR')} tâches en ${elapsed} ms`, 'success');
  } finally {
    setLoading(false);
  }
}

document.getElementById('btn-large-sample')?.addEventListener('click', () => {
  void loadLargeSampleData();
});

document.getElementById('btn-reset')?.addEventListener('click', () => {
  getGantt()?.setData({ tasks: [], dependencies: [] });
  showStatus('Gantt réinitialisé', 'info');
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
    ...demoOptions,
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
    button.textContent = dark ? 'Passer au thème clair' : 'Passer au thème sombre';
    button.setAttribute('aria-pressed', String(dark));
  }
}

function applyVisualStyle(style: VisualStyle): void {
  document.documentElement.dataset.visualStyle = style;
  const currentTheme = (document.documentElement.dataset.theme || (style === 'dark-operations' ? 'dark' : 'light')) as DemoTheme;
  applyTheme(currentTheme);
}

document.getElementById('btn-theme')?.addEventListener('click', () => {
  applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
});

document.getElementById('week-start')?.addEventListener('change', applyCalendarOptions);
document.getElementById('week-numbering')?.addEventListener('change', applyCalendarOptions);
document.getElementById('visual-style')?.addEventListener('change', event => {
  const style = (event.target as HTMLSelectElement).value as VisualStyle;
  applyVisualStyle(style);
  showStatus(`Style ${style === 'dark-operations' ? 'Opérations sombre' : style === 'fluent' ? 'Fluent' : 'Material'} appliqué`, 'success');
});

configureDemo();
applyVisualStyle('material');

document.getElementById('json-input')?.addEventListener('change', event => {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (file) loadJson(file);
});

document.getElementById('mpp-input')?.addEventListener('change', event => {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (file) loadProjectFile(file);
});

showStatus('Composant Gantt prêt', 'success');
