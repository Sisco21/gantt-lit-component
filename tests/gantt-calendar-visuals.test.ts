import { afterEach, describe, expect, it } from 'vitest';
import { GanttChart } from '../src/gantt-chart';
import type { GanttData } from '../src/types';

const calendarProject: GanttData = {
  projectCalendarId: 'budget',
  calendars: [
    {
      id: 'budget',
      name: 'Budget',
      workingDays: [1, 2, 3, 4, 5],
      exceptions: {
        '2026-07-14': 'non-working',
        '2026-07-18': 'working',
      },
      exceptionLabels: { '2026-07-14': 'Fête nationale', '2026-07-18': 'Samedi travaillé' },
    },
    {
      id: 'task-calendar',
      name: 'Task calendar',
      workingDays: [1, 2, 3, 4, 5],
      exceptions: { '2026-07-13': 'non-working' },
      exceptionLabels: { '2026-07-13': 'Arrêt tâche' },
    },
    {
      id: 'resource-calendar',
      name: 'Resource calendar',
      workingDays: [1, 2, 3, 4, 5],
      exceptions: { '2026-07-15': 'non-working' },
      exceptionLabels: { '2026-07-15': 'Formation' },
    },
  ],
  tasks: [{
    id: 'task', name: 'Task', start: '2026-07-13', end: '2026-07-18', progress: 0, parentId: null, type: 'task', calendarId: 'task-calendar',
    resources: [{ id: 'resource', name: 'Crew', type: 'work', unitCost: 10, quantity: 2, calendarId: 'resource-calendar' }],
  }],
};

describe('calendar visual states', () => {
  let gantt: GanttChart | undefined;

  afterEach(() => {
    gantt?.remove();
    gantt = undefined;
  });

  async function mount(data: GanttData = calendarProject): Promise<GanttChart> {
    gantt = new GanttChart();
    document.body.append(gantt);
    gantt.setData(data);
    await gantt.updateComplete;
    return gantt;
  }

  it('colors the budget exception in the planning column and exposes date, label and status', async () => {
    const chart = await mount();
    const header = chart.shadowRoot?.querySelector<HTMLElement>('.timeline-header .day[title*="Fête nationale"]');
    expect(header).toBeTruthy();
    expect(header?.classList.contains('calendar-non-working')).toBe(true);
    expect(header?.getAttribute('aria-label')).toContain('Non-working day');
    expect(chart.shadowRoot?.querySelector('.non-working-day-band.calendar-non-working')).toBeTruthy();
  });

  it('marks a worked weekend exception and keeps the default weekend rendering elsewhere', async () => {
    const chart = await mount({
      ...calendarProject,
      calendars: [calendarProject.calendars![0]],
      tasks: [{ ...calendarProject.tasks[0], calendarId: undefined, resources: [] }],
    });
    expect(chart.shadowRoot?.querySelector('.timeline-header .day.calendar-working[title*="Samedi travaillé"]')).toBeTruthy();
    expect(chart.shadowRoot?.querySelector('.non-working-day-band.calendar-working')).toBeTruthy();
    expect(chart.shadowRoot?.querySelector('.timeline-header .day.weekend')).toBeTruthy();
  });

  it('renders task and resource calendar differences on their own rows', async () => {
    const chart = await mount();
    chart.selectTask('task');
    await chart.updateComplete;
    expect(chart.shadowRoot?.querySelector('.task-calendar-band.calendar-non-working[title*="Arrêt tâche"]')).toBeTruthy();
    expect(chart.shadowRoot?.querySelector('.resource-calendar-closed.calendar-non-working[title*="Formation"]')).toBeTruthy();
    expect(chart.shadowRoot?.querySelector('input.resource-day-input.calendar-closed[title*="Formation"]')).toBeTruthy();
  });

  it('updates only visual calendar state while preserving selection, zoom, scroll and task data', async () => {
    const chart = await mount();
    chart.selectTask('task');
    await chart.updateComplete;
    const viewport = chart.shadowRoot?.querySelector<HTMLElement>('.gantt-viewport');
    const timeline = chart.shadowRoot?.querySelector<HTMLElement>('.timeline-scroll');
    viewport!.scrollTop = 96;
    timeline!.scrollLeft = 144;
    const before = chart.getData().tasks[0];
    chart.setProjectCalendarId('task-calendar');
    chart.updateCalendar({
      ...calendarProject.calendars![0],
      exceptions: { ...calendarProject.calendars![0].exceptions, '2026-07-14': 'working' },
    });
    chart.setProjectCalendarId('budget');
    await chart.updateComplete;
    expect(chart.getData().tasks[0]).toEqual(before);
    expect((chart as unknown as { selectedTaskId: string }).selectedTaskId).toBe('task');
    expect(chart.shadowRoot?.querySelector<HTMLElement>('.gantt-viewport')?.scrollTop).toBe(96);
    expect(chart.shadowRoot?.querySelector<HTMLElement>('.timeline-scroll')?.scrollLeft).toBe(144);
    expect(chart.shadowRoot?.querySelector('.timeline-header .day.calendar-working[title*="Working day"]')).toBeTruthy();
  });

  it('keeps semantic calendar markers available in dark mode and accepts CSS overrides', async () => {
    const chart = await mount();
    chart.theme = 'dark';
    chart.style.setProperty('--gantt-calendar-non-working', '#553322');
    await chart.updateComplete;
    expect(chart.getAttribute('theme')).toBe('dark');
    expect(chart.style.getPropertyValue('--gantt-calendar-non-working')).toBe('#553322');
    expect(chart.shadowRoot?.querySelector('.timeline-header .day.calendar-non-working')).toBeTruthy();
  });
});
