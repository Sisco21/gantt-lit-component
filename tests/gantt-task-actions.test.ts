import { describe, expect, it } from 'vitest';
import { expandTaskAncestors, removeTaskBranch, reorderTaskBranch, setParentTasksCollapsed, toggleTaskCollapsed } from '../src/gantt-task-actions';
import type { GanttTask } from '../src/types';

const task = (id: string, parentId: string | null, children?: GanttTask[]): GanttTask => ({ id, name: id, start: '2026-01-01', end: '2026-01-01', progress: 0, parentId, type: parentId ? 'task' : 'parent', children });
const tree = () => [task('phase', null, [task('research', 'phase'), task('design', 'phase', [task('brief', 'design')])])];

describe('Gantt task actions', () => {
  it('collapses parent tasks and expands only the ancestors of a focused task', () => {
    const collapsed = setParentTasksCollapsed(tree(), true);
    const expanded = expandTaskAncestors(collapsed, 'brief');

    expect(collapsed[0].collapsed).toBe(true);
    expect(expanded[0].collapsed).toBe(false);
    expect(expanded[0].children?.[1].collapsed).toBe(false);
    expect(toggleTaskCollapsed(expanded, 'design')[0].children?.[1].collapsed).toBe(true);
  });

  it('removes a task branch and its related dependencies', () => {
    const flat = [task('phase', null), task('research', 'phase'), task('design', 'phase'), task('brief', 'design')];
    const result = removeTaskBranch(flat, [{ from: 'research', to: 'brief' }, { from: 'phase', to: 'research' }], 'design');

    expect(result.tasks.map(item => item.id)).toEqual(['phase', 'research']);
    expect(result.dependencies).toEqual([{ from: 'phase', to: 'research' }]);
    expect(result.descendants.map(item => item.id)).toEqual(['design', 'brief']);
  });

  it('moves a contiguous branch before or after a sibling target', () => {
    const flat = [task('phase', null), task('research', 'phase'), task('design', 'phase'), task('brief', 'design'), task('release', 'phase')];

    expect(reorderTaskBranch(flat, 'design', 'research', 'before')?.map(item => item.id)).toEqual(['phase', 'design', 'brief', 'research', 'release']);
    expect(reorderTaskBranch(flat, 'research', 'design', 'after')?.map(item => item.id)).toEqual(['phase', 'design', 'brief', 'research', 'release']);
  });
});
