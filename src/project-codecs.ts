import {
  DependencyType,
  GanttData,
  GanttTask,
  ProjectFileAdapter,
  ProjectFileFormat,
} from './types';
import { buildTaskTree, clampProgress, diffDays, flattenTasks, formatDate, parseDateOnly } from './utils';

const XML_TYPE_TO_DEPENDENCY: Record<string, DependencyType> = {
  '0': 'finish-to-finish',
  '1': 'finish-to-start',
  '2': 'start-to-start',
  '3': 'start-to-finish',
};

const DEPENDENCY_TO_XML_TYPE: Record<DependencyType, string> = {
  'finish-to-finish': '0',
  'finish-to-start': '1',
  'start-to-start': '2',
  'start-to-finish': '3',
};

export function parseJson(value: string): GanttData {
  return normalizeProject(JSON.parse(value) as GanttData);
}

export function stringifyJson(data: GanttData): string {
  return JSON.stringify(normalizeProject(data), null, 2);
}

export function parseMspXml(xml: string): GanttData {
  if (typeof DOMParser === 'undefined') throw new Error('DOMParser est indisponible dans cet environnement.');
  const document = new DOMParser().parseFromString(xml, 'application/xml');
  const parserError = document.querySelector('parsererror');
  if (parserError) throw new Error(`XML Microsoft Project invalide: ${parserError.textContent || 'erreur inconnue'}`);

  const taskElements = Array.from(document.getElementsByTagNameNS('*', 'Task'));
  const tasks: GanttTask[] = [];
  const dependencies: GanttData['dependencies'] = [];
  const outlineStack: string[] = [];

  for (const element of taskElements) {
    const uid = childText(element, 'UID');
    const id = uid || childText(element, 'ID');
    if (!id) continue;

    const outlineLevel = Math.max(1, Number(childText(element, 'OutlineLevel') || '1'));
    outlineStack.length = Math.min(outlineStack.length, outlineLevel - 1);
    const parentId = outlineLevel > 1 ? outlineStack[outlineLevel - 2] || null : null;
    const start = toDateOnly(childText(element, 'Start')) || formatDate(new Date());
    const end = toDateOnly(childText(element, 'Finish')) || start;
    const milestone = childText(element, 'Milestone') === '1' || start === end;
    const summary = childText(element, 'Summary') === '1';

    tasks.push({
      id,
      name: childText(element, 'Name') || `Tâche ${id}`,
      start,
      end,
      progress: clampProgress(Number(childText(element, 'PercentComplete') || '0')),
      parentId,
      type: milestone ? 'milestone' : summary ? 'parent' : 'task',
    });

    outlineStack[outlineLevel - 1] = id;

    for (const link of Array.from(element.getElementsByTagNameNS('*', 'PredecessorLink'))) {
      const predecessor = childText(link, 'PredecessorUID');
      if (!predecessor) continue;
      dependencies.push({
        from: predecessor,
        to: id,
        type: XML_TYPE_TO_DEPENDENCY[childText(link, 'Type') || '1'] || 'finish-to-start',
        lagDays: parseLagDays(childText(link, 'LinkLag'), childText(link, 'LagFormat')),
      });
    }
  }

  return normalizeProject({
    name: childText(document.documentElement, 'Name') || undefined,
    tasks,
    dependencies,
  });
}

export function stringifyMspXml(data: GanttData): string {
  const flatTasks = flattenTasks(buildTaskTree(data.tasks));
  const idMap = new Map(flatTasks.map((task, index) => [task.id, numericUid(task.id, index + 1)]));
  const taskIndex = new Map(flatTasks.map((task, index) => [task.id, index + 1]));
  const outlineLevels = new Map<string, number>();
  for (const task of flatTasks) outlineLevels.set(task.id, getOutlineLevel(task, flatTasks));

  const taskXml = flatTasks.map(task => {
    const outlineLevel = outlineLevels.get(task.id) || 1;
    const durationDays = Math.max(0, diffDays(task.start, task.end));
    const isSummary = task.type === 'parent' || flatTasks.some(candidate => candidate.parentId === task.id);
    const predecessorXml = (data.dependencies || [])
      .filter(dependency => dependency.to === task.id && idMap.has(dependency.from))
      .map(dependency => `
      <PredecessorLink>
        <PredecessorUID>${idMap.get(dependency.from)}</PredecessorUID>
        <Type>${DEPENDENCY_TO_XML_TYPE[dependency.type || 'finish-to-start']}</Type>
        <LinkLag>${Math.round((dependency.lagDays || 0) * 4800)}</LinkLag>
        <LagFormat>7</LagFormat>
      </PredecessorLink>`)
      .join('');

    return `
    <Task>
      <UID>${idMap.get(task.id)}</UID>
      <ID>${taskIndex.get(task.id)}</ID>
      <Name>${escapeXml(task.name)}</Name>
      <Start>${toMspDate(task.start)}</Start>
      <Finish>${toMspDate(task.end)}</Finish>
      <Duration>PT${durationDays * 8}H0M0S</Duration>
      <PercentComplete>${clampProgress(task.progress)}</PercentComplete>
      <Summary>${isSummary ? 1 : 0}</Summary>
      <Milestone>${task.type === 'milestone' ? 1 : 0}</Milestone>
      <OutlineLevel>${outlineLevel}</OutlineLevel>${predecessorXml}
    </Task>`;
  }).join('');

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Project xmlns="http://schemas.microsoft.com/project">
  <Name>${escapeXml(data.name || 'Projet Gantt')}</Name>
  <CalendarUID>1</CalendarUID>
  <Tasks>${taskXml}
  </Tasks>
</Project>`;
}

export async function importProjectFile(file: File, adapter?: ProjectFileAdapter): Promise<GanttData> {
  const extension = file.name.toLowerCase().split('.').pop();
  if (extension === 'json') return parseJson(await file.text());
  if (extension === 'xml') return parseMspXml(await file.text());
  if (extension === 'mpp') {
    if (!adapter) throw new Error('Le format .mpp binaire nécessite un ProjectFileAdapter côté serveur.');
    return normalizeProject(await adapter.importMpp(file));
  }
  throw new Error('Format de fichier non supporté. Utilisez .json, .xml ou .mpp.');
}

export async function exportProjectFile(
  data: GanttData,
  format: ProjectFileFormat,
  adapter?: ProjectFileAdapter,
): Promise<Blob> {
  if (format === 'json') return new Blob([stringifyJson(data)], { type: 'application/json' });
  if (format === 'mspxml') return new Blob([stringifyMspXml(data)], { type: 'application/xml' });
  if (!adapter) throw new Error('L’export .mpp binaire nécessite un ProjectFileAdapter côté serveur.');
  const result = await adapter.exportMpp(data);
  return result instanceof Blob ? result : new Blob([result], { type: 'application/octet-stream' });
}

export function normalizeProject(data: GanttData): GanttData {
  if (!data || !Array.isArray(data.tasks)) throw new Error('Le projet doit contenir un tableau tasks.');
  return {
    name: data.name,
    tasks: flattenTasks(buildTaskTree(data.tasks)),
    dependencies: (data.dependencies || []).map(dependency => ({ ...dependency })),
    metadata: data.metadata ? { ...data.metadata } : undefined,
  };
}

function childText(element: Element, localName: string): string {
  return Array.from(element.children).find(child => child.localName === localName)?.textContent?.trim() || '';
}

function toDateOnly(value: string): string | null {
  if (!value) return null;
  try {
    return formatDate(parseDateOnly(value));
  } catch {
    return null;
  }
}

function toMspDate(value: string): string {
  return `${formatDate(value)}T08:00:00`;
}

function parseLagDays(value: string, format: string): number | undefined {
  if (!value) return undefined;
  const raw = Number(value);
  if (!Number.isFinite(raw)) return undefined;
  if (format === '7') return raw / 4800;
  return raw;
}

function numericUid(id: string, fallback: number): number {
  const value = Number(id);
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

function getOutlineLevel(task: GanttTask, tasks: GanttTask[]): number {
  let level = 1;
  let parentId = task.parentId;
  const seen = new Set<string>();
  while (parentId && !seen.has(parentId)) {
    seen.add(parentId);
    level += 1;
    parentId = tasks.find(candidate => candidate.id === parentId)?.parentId || null;
  }
  return level;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
