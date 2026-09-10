import { describe, expect, it } from 'vitest';
import { calculateMaximumGanttPanelHeight, calculateResourceDateWindow, calculateTaskGridSizing, clampGanttPanelHeight } from '../src/gantt-layout';

describe('Gantt layout helpers', () => {
  it('keeps a minimum timeline width when resolving the task-grid splitter', () => {
    expect(calculateTaskGridSizing({ minWidth: 260, maxWidth: '55vw', minTimelineWidth: 200 }, 800, 1000)).toEqual({ minWidth: 260, maxWidth: 550, minTimelineWidth: 200 });
  });

  it('renders a buffered, bounded window of resource dates', () => {
    expect(calculateResourceDateWindow(100, 20, { scrollLeft: 400, width: 200 })).toEqual({ start: 12, end: 38 });
  });

  it('preserves a resource panel while resizing the Gantt panel', () => {
    expect(calculateMaximumGanttPanelHeight(360)).toBe(220);
    expect(clampGanttPanelHeight(900, 360)).toBe(220);
  });
});
