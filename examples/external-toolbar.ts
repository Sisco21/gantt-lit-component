import 'gantt-lit-component';
import 'gantt-lit-component/style.css';
import type { GanttChart, GanttContextMenuRequest, GanttViewState } from 'gantt-lit-component';
import { configureCommandExample } from './structured-commands';

const gantt = document.querySelector<GanttChart>('gantt-chart')!;
configureCommandExample(gantt);
let closeMenu = () => {};
async function createTask(date = '2026-12-01') {
  const result = await gantt.executeCommand({ id: crypto.randomUUID(), operation: {
    type: 'task.create', placement: { parentId: null }, task: {
      id: crypto.randomUUID(), parentId: null, type: 'task', name: 'Nouvelle tâche', start: date, end: date, progress: 0,
    },
  } });
  document.querySelector('#result')!.textContent = result.status === 'committed' ? 'Tâche enregistrée.' : result.issues.map(issue => issue.code).join(', ');
}

function openExternalMenu(context: GanttContextMenuRequest) {
  closeMenu();
  const doc = context.ownerDocument;
  let previous = doc.activeElement as HTMLElement | null;
  while (previous?.shadowRoot?.activeElement) previous = previous.shadowRoot.activeElement as HTMLElement;
  const menu = doc.createElement('div');
  menu.setAttribute('role', 'menu'); menu.setAttribute('aria-label', 'Actions du planning');
  menu.style.cssText = `position:fixed;z-index:10000;display:flex;flex-direction:column;gap:4px;max-width:calc(100vw - 16px);padding:8px;border:1px solid #64748b;border-radius:6px;background:white;color:#172b4d;box-shadow:0 8px 24px #172b4d26`;
  const outside = (event: Event) => { if (!menu.contains(event.target as Node)) closeMenu(); };
  closeMenu = () => { menu.remove(); doc.removeEventListener('pointerdown', outside, true); if (previous?.isConnected) previous.focus(); closeMenu = () => {}; };
  const add = (label: string, action: () => void) => {
    const button = doc.createElement('button'); button.type = 'button'; button.textContent = label; button.setAttribute('role', 'menuitem');
    button.style.cssText = 'font:inherit;text-align:start;padding:6px 10px';
    button.addEventListener('click', () => { closeMenu(); action(); }); menu.append(button);
  };
  if (context.taskId) add('Modifier la tâche', () => gantt.openTaskEditor(context.taskId));
  if (context.assignmentId && context.taskId) add('Retirer l’affectation', () => { void gantt.executeCommand({ id: crypto.randomUUID(), operation: { type: 'assignment.remove', taskId: context.taskId!, assignmentId: context.assignmentId! } }); });
  if (context.dependency) add('Retirer la dépendance', () => { void gantt.executeCommand({ id: crypto.randomUUID(), operation: { type: 'dependency.remove', from: context.dependency!.from, to: context.dependency!.to } }); });
  if (context.kind === 'timeline') add('Créer une tâche à cette date', () => { void createTask(context.date); });
  add('Ajuster le planning', () => gantt.fitGanttToView());
  add('Fermer', () => {});
  menu.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); closeMenu(); }
    else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault(); const buttons = Array.from(menu.querySelectorAll('button'));
      const index = buttons.indexOf(doc.activeElement as HTMLButtonElement);
      buttons[(index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length].focus();
    } else if (event.key === 'Tab') closeMenu();
  });
  doc.body.append(menu);
  menu.style.left = `${Math.max(8, Math.min(context.x, (doc.defaultView?.innerWidth || 800) - menu.offsetWidth - 8))}px`;
  menu.style.top = `${Math.max(8, Math.min(context.y, (doc.defaultView?.innerHeight || 600) - menu.offsetHeight - 8))}px`;
  menu.querySelector('button')!.focus(); doc.addEventListener('pointerdown', outside, true);
  return false;
}

gantt.options = { ...gantt.options, showToolbar: false, contextMenus: false, onContextMenuRequested: openExternalMenu };
document.querySelector('#create')!.addEventListener('click', () => { void createTask(); });
document.querySelector('#edit')!.addEventListener('click', () => gantt.openTaskEditor());
document.querySelector('#fit')!.addEventListener('click', () => gantt.fitGanttToView());
document.querySelector('#expand')!.addEventListener('click', () => gantt.expandAll());
document.querySelector('#collapse')!.addEventListener('click', () => gantt.collapseAll());
document.querySelector('#zoom-in')!.addEventListener('click', () => gantt.zoomIn());
document.querySelector('#zoom-out')!.addEventListener('click', () => gantt.zoomOut());
document.querySelector('#search')!.addEventListener('input', event => gantt.searchTasks((event.target as HTMLInputElement).value));
document.querySelector('#previous')!.addEventListener('click', () => gantt.previousSearchResult());
document.querySelector('#next')!.addEventListener('click', () => gantt.nextSearchResult());
document.querySelector('#undo')!.addEventListener('click', () => { void gantt.undoCommand(crypto.randomUUID()); });
document.querySelector('#redo')!.addEventListener('click', () => { void gantt.redoCommand(crypto.randomUUID()); });
document.querySelector('#resources-window')!.addEventListener('click', () => { if (gantt.resourcesUndocked) gantt.dockResources(); else gantt.undockResources(); });
function update(state: GanttViewState) {
  document.querySelector('#zoom')!.textContent = `${Math.round(state.zoom * 100)} %`;
  document.querySelector('#matches')!.textContent = `${state.search.index + 1}/${state.search.taskIds.length}`;
  (document.querySelector('#edit') as HTMLButtonElement).disabled = !state.canEditSelectedTask;
  (document.querySelector('#undo') as HTMLButtonElement).disabled = !state.canUndoCommand;
  (document.querySelector('#redo') as HTMLButtonElement).disabled = !state.canRedoCommand;
  const resourcesWindow = document.querySelector<HTMLButtonElement>('#resources-window')!;
  resourcesWindow.disabled = !state.selectedTaskId;
  resourcesWindow.textContent = state.resourcesUndocked ? 'Réintégrer les ressources' : 'Détacher les ressources';
  for (const id of ['previous', 'next']) (document.getElementById(id) as HTMLButtonElement).disabled = !state.search.taskIds.length;
}
gantt.addEventListener('view-state-changed', event => update((event as CustomEvent<GanttViewState>).detail));
update(gantt.getViewState());
