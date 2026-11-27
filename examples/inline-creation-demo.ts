import '../src/gantt-chart';
import type { GanttChart } from '../src/gantt-chart';
import type { GanttTask } from '../src/types';
import { configureInlineCreation } from './inline-creation';

const gantt = document.querySelector<GanttChart>('gantt-chart')!;
const phase: GanttTask = { id: 'phase', name: 'Phase de préparation', type: 'parent', start: '2026-11-02', end: '2026-11-03', progress: 0, parentId: null };
const task: GanttTask = { ...phase, id: 'task', name: 'Études', type: 'task', parentId: 'phase', resources: [] };
const catalogue = [{ id: 'engineer', code: 'ENG', name: 'Ingénieur', type: 'work', unit: 'h', unitCost: 80, quantity: 1 }];

async function simulatedSave() {
  await new Promise(resolve => setTimeout(resolve, 600));
  const fail = document.querySelector<HTMLInputElement>('#fail')!;
  if (fail.checked) {
    fail.checked = false;
    throw new Error('Connexion interrompue. Vos valeurs sont conservées : réessayez.');
  }
}

configureInlineCreation(gantt, {
  async searchResources(query) {
    await new Promise(resolve => setTimeout(resolve, 200));
    return catalogue.filter(item => `${item.code} ${item.name}`.toLocaleLowerCase('fr').includes(query.toLocaleLowerCase('fr')));
  },
  async createTask(draft, context) {
    await simulatedSave();
    return { ...task, ...draft, id: crypto.randomUUID(), name: draft.name!.trim(), parentId: context.parentId, resources: [] };
  },
  async createAssignment(draft, context) {
    await simulatedSave();
    return { name: '', type: 'work', quantity: 1, unitCost: 0, ...draft, id: crypto.randomUUID(), resourceId: context.reference?.id };
  },
}, { readOnly: false, addTasks: true, addResources: true, catalogue: true, freeResources: true });
gantt.setData({ tasks: [phase, task] });
gantt.selectTask('task');
gantt.addEventListener('tasks-changed', () => {
  document.querySelector('#result')!.textContent = JSON.stringify(gantt.getData(), null, 2);
});
