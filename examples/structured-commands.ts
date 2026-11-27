import type { GanttChart, GanttCommand, GanttData, GanttTask } from 'gantt-lit-component';
import { GanttCommandError } from 'gantt-lit-component';

/** The host resolves speech, ambiguous names and relative dates before calling this API. */
export const assistantCommands: GanttCommand[] = [
  { id: 'voice-create-phase', operation: { type: 'task.create', task: { id: 'delivery', name: 'Livraison / التسليم', type: 'parent', start: '2026-12-01', end: '2026-12-01', progress: 0, parentId: null }, placement: { parentId: null, position: { after: 'survey' } } } },
  { id: 'voice-create-child', operation: { type: 'task.create', task: { id: 'inspection', name: '検査', type: 'task', start: '2026-12-01', end: '2026-12-02', progress: 0, parentId: 'delivery' }, placement: { parentId: 'delivery' } } },
  { id: 'voice-shift', operation: { type: 'task.schedule', taskId: 'inspection', change: { shift: 2 }, policy: { unit: 'working-day', calendarId: 'weekdays', dependencies: 'preserve', descendants: 'reject' } } },
  { id: 'voice-link', operation: { type: 'dependency.add', dependency: { from: 'survey', to: 'inspection', type: 'finish-to-start', lagDays: 0 } } },
  { id: 'voice-select', operation: { type: 'task.select', taskId: 'inspection', reveal: true } },
];

export function configureCommandExample(gantt: GanttChart, failNext: () => boolean = () => false) {
  const catalogue = [{ id: 'catalogue-engineer', code: 'ENG', name: 'Ingénieur / مهندس', type: 'work', unit: 'h', quantity: 1, unitCost: 80 }];
  const receipts = new Map<string, { data: GanttData; undoToken: string }>();
  const history = new Map<string, { before: GanttData; after: GanttData }>();
  let serverRevision = 0;
  let serverData: GanttData = { tasks: [], calendars: [] };
  const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
  const draftTask = (draft: Partial<GanttTask>, id: string, parentId: string | null): GanttTask => ({
    name: '', start: '2026-12-01', end: '2026-12-01', progress: 0, type: 'task', ...draft, id, parentId,
  });
  gantt.autoSave = false;
  gantt.options = {
    ...gantt.options, autoSchedule: false, locale: 'fr-FR', maxHeight: 480,
    resourcePanel: { detachable: true },
    taskColumns: [
      { key: 'name', label: 'Nom / الاسم', width: 200, editable: true },
      { key: 'start', label: 'Début / البداية', width: 130, type: 'date', editable: true },
      { key: 'end', label: 'Fin / النهاية', width: 130, type: 'date', editable: true },
    ],
    commands: {
      enabled: true, mode: 'controlled',
      // Put common business validation here: both draft-row and external commands use it.
      validate: request => request.proposedData.tasks.some(task => task.name.length > 300)
        ? [{ code: 'INVALID_DATA', params: { field: 'name', maximum: 300 } }] : undefined,
      async persist(request) {
        await delay(500);
        const previousReceipt = receipts.get(request.command.id);
        if (previousReceipt) return structuredClone(previousReceipt);
        if (failNext()) throw new Error('Simulated network failure');
        // Real APIs must check a persisted revision and execute atomic batches in a transaction.
        if (request.data.metadata?.serverRevision !== serverRevision) throw new GanttCommandError('REVISION_CONFLICT');
        const before = structuredClone(serverData);
        serverRevision++;
        serverData = { ...structuredClone(request.proposedData), metadata: { ...request.proposedData.metadata, serverRevision } };
        const undoToken = request.command.id;
        history.set(undoToken, { before, after: structuredClone(serverData) });
        const response = { data: structuredClone(serverData), undoToken };
        receipts.set(request.command.id, response);
        return structuredClone(response);
      },
      async history(request) {
        await delay(300);
        if (request.data.metadata?.serverRevision !== serverRevision) throw new GanttCommandError('REVISION_CONFLICT');
        const entry = history.get(request.token);
        if (!entry) throw new GanttCommandError('NOT_FOUND');
        serverRevision++;
        serverData = structuredClone(request.direction === 'undo' ? entry.before : entry.after);
        serverData.metadata = { ...serverData.metadata, serverRevision };
        return { data: structuredClone(serverData), undoToken: request.token };
      },
    },
    inlineCreation: {
      tasks: {
        enabled: true, requiredFields: ['name', 'start', 'end'],
        defaults: { start: '2026-12-01', end: '2026-12-01' },
        command: (draft, context) => ({ id: context.correlationId!, operation: {
          type: 'task.create', task: draftTask(draft, `task-${context.correlationId}`, context.parentId), placement: { parentId: context.parentId },
        } }),
      },
      resources: {
        enabled: true, modes: ['catalogue', 'free'], selectionChange: 'retain',
        requiredFields: ['name', 'unit', 'quantity', 'unitCost'], catalogueEditableFields: ['quantity', 'unitCost'],
        defaults: { unit: 'h', type: 'work', quantity: 1, unitCost: 0 },
        async search(query) {
          // Deliberately out-of-order responses can be tested by typing quickly.
          await delay(query.length === 1 ? 700 : 150);
          return catalogue.filter(item => `${item.code} ${item.name}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
        },
        command: (draft, context) => ({ id: context.correlationId!, operation: { type: 'assignment.add', taskId: context.task.id,
          assignment: { name: '', type: 'work', quantity: 1, unitCost: 0, ...draft, id: `assignment-${context.correlationId}` },
        } }),
      },
    },
  };
  serverData = { name: 'Commandes structurées', metadata: { serverRevision }, projectCalendarId: 'weekdays',
    calendars: [{ id: 'weekdays', name: 'Lundi–vendredi', workingDays: [1, 2, 3, 4, 5], exceptions: { '2026-12-25': 'non-working' } }],
    tasks: [draftTask({ name: 'Études / دراسة', start: '2026-11-26', end: '2026-11-27' }, 'survey', null)],
  };
  gantt.setData(structuredClone(serverData)); gantt.selectTask('survey');
}
