import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GanttChart } from '../src/gantt-chart';
import type { GanttData } from '../src/types';

const project: GanttData = {
  tasks: [
    { id: 'task', name: 'Task', start: '2026-01-01', end: '2026-03-31', progress: 0, parentId: null, type: 'task' },
  ],
};

describe('GanttChart zoom anchoring', () => {
  let gantt: GanttChart;

  beforeEach(async () => {
    gantt = new GanttChart();
    document.body.append(gantt);
    gantt.setData(project);
    await gantt.updateComplete;
  });

  afterEach(() => gantt.remove());

  it('keeps the date below the pointer fixed while zooming with Ctrl + wheel', async () => {
    const timeline = gantt.shadowRoot?.querySelector<HTMLElement>('.timeline-scroll');
    expect(timeline).not.toBeNull();
    if (!timeline) return;

    Object.defineProperty(timeline, 'clientWidth', { configurable: true, value: 500 });
    Object.defineProperty(timeline, 'scrollWidth', { configurable: true, value: 3_000 });
    vi.spyOn(timeline, 'getBoundingClientRect').mockReturnValue({
      left: 100,
      top: 0,
      right: 600,
      bottom: 200,
      width: 500,
      height: 200,
      x: 100,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);
    timeline.scrollLeft = 400;

    const wheel = new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      clientX: 250,
      deltaY: -100,
    });
    Object.defineProperty(wheel, 'ctrlKey', { configurable: true, value: true });
    Object.defineProperty(wheel, 'clientX', { configurable: true, value: 250 });
    Object.defineProperty(wheel, 'target', { configurable: true, value: timeline });
    const handleWheel = (gantt as unknown as { handleWheel: (event: WheelEvent) => void }).handleWheel;
    handleWheel(wheel);
    await gantt.updateComplete;

    expect(gantt.shadowRoot?.querySelector('.zoom')?.textContent).toContain('110%');
    expect(timeline.scrollLeft).toBeCloseTo(455);
  });
});
