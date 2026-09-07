import { html } from 'lit';
import '../src/gantt-chart';
import type { GanttChart } from '../src/gantt-chart';
import type { GanttOptions, GanttResource, GanttTask } from '../src/types';
import sampleData from './data.json' assert { type: 'json' };

function getGantt(): GanttChart | null {
  return document.querySelector('gantt-chart') as GanttChart | null;
}

function resourceQuantity(resource: GanttResource): number {
  const daily = resource.quantityByDate ? Object.values(resource.quantityByDate).reduce((total, value) => total + Number(value || 0), 0) : 0;
  return daily || Number(resource.totalQuantity ?? resource.quantity) || 0;
}

function resourceCostWithCoefficient(resource: GanttResource): number {
  const coefficient = Number(resource.metadata?.coefficient ?? 1);
  return resourceQuantity(resource) * Number(resource.unitCost || 0) * coefficient;
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
  autoSchedule: true,
  showToday: true,
  showDependencies: true,
  taskEditorMode: 'built-in',
  summaryTemplate: task => html`${task.name} · ${new Intl.NumberFormat(navigator.language, { maximumFractionDigits: 2 }).format(summaryCostWithCoefficient(task))} €`,
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
  gantt.setOptions({
    ...demoOptions,
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

document.getElementById('btn-sample')?.addEventListener('click', () => {
  getGantt()?.setData(sampleData);
  showStatus('Données exemple chargées', 'success');
});

document.getElementById('btn-reset')?.addEventListener('click', () => {
  getGantt()?.setData({ tasks: [], dependencies: [] });
  showStatus('Gantt réinitialisé', 'info');
});

function applyTheme(theme: 'light' | 'dark'): void {
  const gantt = getGantt();
  const button = document.getElementById('btn-theme') as HTMLButtonElement | null;
  document.documentElement.dataset.theme = theme;
  if (gantt) gantt.theme = theme;
  if (button) {
    const dark = theme === 'dark';
    button.textContent = dark ? '☀ Thème clair' : '☾ Thème sombre';
    button.setAttribute('aria-pressed', String(dark));
  }
}

document.getElementById('btn-theme')?.addEventListener('click', () => {
  applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
});

document.getElementById('week-start')?.addEventListener('change', applyCalendarOptions);
document.getElementById('week-numbering')?.addEventListener('change', applyCalendarOptions);

configureDemo();
applyTheme('light');

document.getElementById('json-input')?.addEventListener('change', event => {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (file) loadJson(file);
});

document.getElementById('mpp-input')?.addEventListener('change', event => {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (file) loadProjectFile(file);
});

showStatus('Composant Gantt prêt', 'success');
