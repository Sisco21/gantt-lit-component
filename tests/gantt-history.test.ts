import { describe, expect, it } from 'vitest';
import { GanttHistory } from '../src/gantt-history';

describe('GanttHistory', () => {
  it('undoes and redoes immutable snapshots', () => {
    const history = new GanttHistory<number[]>(value => [...value], value => JSON.stringify(value));
    history.reset([1]);
    history.record([1, 2], 10);

    expect(history.undo()).toEqual([1]);
    expect(history.redo(10)).toEqual([1, 2]);
  });

  it('discards the oldest snapshots at the configured limit', () => {
    const history = new GanttHistory<number>(value => value, value => String(value));
    history.reset(0);
    history.record(1, 1);
    history.record(2, 1);

    expect(history.undo()).toBe(1);
    expect(history.undo()).toBeUndefined();
  });
});
