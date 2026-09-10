import { describe, expect, it } from 'vitest';
import { flattenTaskTree, getTaskDepths, getTaskOutlineCodes, getTaskSubtreeIds } from '../src/gantt-task-tree';
import type { GanttTask } from '../src/types';

const task = (id: string, parentId: string | null, children?: GanttTask[]): GanttTask => ({
  id,
  name: id,
  start: '2026-01-01',
  end: '2026-01-01',
  progress: 0,
  parentId,
  type: parentId ? 'task' : 'parent',
  children,
});

describe('Gantt task tree helpers', () => {
  const tree = [task('phase', null, [task('research', 'phase'), task('design', 'phase', [task('brief', 'design')])])];

  it('flattens a nested tree without changing its source', () => {
    const flat = flattenTaskTree(tree);

    expect(flat.map(item => item.id)).toEqual(['phase', 'research', 'design', 'brief']);
    expect(flat[0].children).toBeUndefined();
    expect(tree[0].children).toHaveLength(2);
  });

  it('finds a contiguous task branch in flat pre-order rows', () => {
    const flat = flattenTaskTree(tree);

    expect([...getTaskSubtreeIds('design', flat)]).toEqual(['design', 'brief']);
  });

  it('calculates display codes and depths', () => {
    const flat = flattenTaskTree(tree);

    expect(Object.fromEntries(getTaskOutlineCodes(tree))).toEqual({ phase: '1', research: '1.1', design: '1.2', brief: '1.2.1' });
    expect(Object.fromEntries(getTaskDepths(flat))).toEqual({ phase: 0, research: 1, design: 1, brief: 2 });
  });
});
