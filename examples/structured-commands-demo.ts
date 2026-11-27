import 'gantt-lit-component';
import 'gantt-lit-component/style.css';
import type { GanttChart, GanttCommandResult } from 'gantt-lit-component';
import { assistantCommands, configureCommandExample } from './structured-commands';

const gantt = document.querySelector<GanttChart>('gantt-chart')!;
configureCommandExample(gantt, () => {
  const input = document.querySelector<HTMLInputElement>('#failure')!;
  const fail = input.checked; input.checked = false; return fail;
});
let step = 0;
function show(result: GanttCommandResult) { document.querySelector('#result')!.textContent = JSON.stringify(result, null, 2); }
document.querySelector('#preview')!.addEventListener('click', async () => {
  if (step >= assistantCommands.length) { document.querySelector('#result')!.textContent = 'Scénario terminé. Rechargez la page pour recommencer.'; return; }
  const command = assistantCommands[step];
  show(await gantt.previewCommand({ ...command, expectedRevision: gantt.commandRevision }));
});
document.querySelector('#commit')!.addEventListener('click', async () => { const result = await gantt.commitCommandPreview(); show(result); if (result.status === 'committed') step++; });
document.querySelector('#cancel')!.addEventListener('click', () => { gantt.cancelCommandPreview(); document.querySelector('#result')!.textContent = 'Prévisualisation annulée.'; });
document.querySelector('#undo')!.addEventListener('click', async () => show(await gantt.undoCommand(crypto.randomUUID())));
document.querySelector('#redo')!.addEventListener('click', async () => show(await gantt.redoCommand(crypto.randomUUID())));
document.querySelector('#readonly')!.addEventListener('change', event => { gantt.options = { ...gantt.options, readOnly: (event.target as HTMLInputElement).checked }; });
document.querySelector('#locale')!.addEventListener('change', event => {
  const locale = (event.target as HTMLSelectElement).value;
  gantt.dir = locale === 'ar' ? 'rtl' : 'ltr';
  gantt.options = { ...gantt.options, locale, translations: locale === 'ar' ? {
    newTask: 'مهمة جديدة', newResource: 'مورد جديد', inlineResourceMode: 'طريقة الإنشاء', inlineFreeResource: 'مورد حر',
    resourceCatalogue: 'دليل الموارد', searching: 'جار البحث…', inlineNoResults: 'لم يتم العثور على موارد.', inlineSaving: 'جار الحفظ…',
  } : undefined };
});
gantt.addEventListener('inline-creation-result', event => show((event as CustomEvent<{ result: GanttCommandResult }>).detail.result));
