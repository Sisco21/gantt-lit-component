import { describe, expect, it } from 'vitest';
import { buildTaskTree, diffDays, flattenTasks, parseDateOnly } from '../src/utils';
import type { GanttTask } from '../src/types';

const task = (id: string, parentId: string | null, start: string, end: string): GanttTask => ({
  id,
  name: id,
  parentId,
  start,
  end,
  progress: 0,
  type: 'task',
});

describe('date utilities', () => {
  it('preserves the calendar date portion in UTC without timezone drift', () => {
    expect(parseDateOnly('2026-01-04T23:30:00-05:00').toISOString()).toBe('2026-01-04T00:00:00.000Z');
    expect(diffDays('2026-01-01', '2026-01-04')).toBe(3);
  });
});

describe('task tree', () => {
  it('builds the hierarchy and derives a phase range from its children', () => {
    const tree = buildTaskTree([
      { ...task('phase', null, '2026-01-10', '2026-01-11'), type: 'parent' },
      task('late-child', 'phase', '2026-02-10', '2026-02-12'),
      task('early-child', 'phase', '2026-01-05', '2026-01-08'),
    ]);

    expect(tree).toHaveLength(1);
    expect(tree[0]).toMatchObject({ id: 'phase', start: '2026-01-05', end: '2026-02-12' });
    expect(tree[0].children?.map(child => child.id)).toEqual(['late-child', 'early-child']);
    expect(flattenTasks(tree).map(item => item.id)).toEqual(['phase', 'late-child', 'early-child']);
  });

  it('rejects a branch with no root because of a parent cycle', () => {
    expect(() => buildTaskTree([
      task('a', 'b', '2026-01-01', '2026-01-02'),
      task('b', 'a', '2026-01-01', '2026-01-02'),
    ])).toThrow('Hierarchy cycle detected');
  });
});
