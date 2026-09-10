import { describe, expect, it } from 'vitest';
import { exportProjectFile, parseMspXml, stringifyJson, stringifyMspXml } from '../src/project-codecs';
import type { GanttData } from '../src/types';

const project: GanttData = {
  name: 'Planning & delivery',
  tasks: [
    { id: 'phase', name: 'Phase <A>', start: '2026-01-01', end: '2026-01-04', progress: 10, parentId: null, type: 'parent' },
    { id: 'task', name: 'Build', start: '2026-01-02', end: '2026-01-04', progress: 20, parentId: 'phase', type: 'task' },
  ],
  dependencies: [{ from: 'phase', to: 'task', type: 'finish-to-start', lagDays: 2 }],
};

describe('project codecs', () => {
  it('serializes normalized JSON', () => {
    const parsed = JSON.parse(stringifyJson(project)) as GanttData;
    expect(parsed.name).toBe(project.name);
    expect(parsed.tasks.map(task => task.id)).toEqual(['phase', 'task']);
  });

  it('round-trips the task hierarchy and dependencies through MSP XML', () => {
    const xml = stringifyMspXml(project);
    expect(xml).toContain('Phase &lt;A&gt;');

    const parsed = parseMspXml(xml);
    expect(parsed.tasks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: '1', name: 'Phase <A>', parentId: null, type: 'parent' }),
      expect.objectContaining({ id: '2', name: 'Build', parentId: '1', type: 'task' }),
    ]));
    expect(parsed.dependencies).toEqual([expect.objectContaining({ from: '1', to: '2', type: 'finish-to-start', lagDays: 2 })]);
  });

  it('requires a server adapter for binary MPP export', async () => {
    await expect(exportProjectFile(project, 'mpp')).rejects.toThrow('ProjectFileAdapter');
  });
});
