import type { GanttTaskGridSplitterOptions } from './types';

/** Resolved dimensions for the draggable task-grid / timeline separator. */
export interface GanttTaskGridSizing {
  minWidth: number;
  maxWidth: number;
  minTimelineWidth: number;
}

/** Horizontal viewport state used to virtualise the resource date grid. */
export interface ResourceTimelineViewport {
  scrollLeft: number;
  width: number;
}

export interface ResourceDateWindow {
  start: number;
  end: number;
}

export const MIN_GANTT_PANEL_HEIGHT = 140;
export const MIN_RESOURCES_PANEL_HEIGHT = 132;
export const PANEL_SPLITTER_HEIGHT = 8;

/** Resolves a pixel, viewport-width or percentage layout value to pixels. */
export function resolveLayoutLength(value: number | string | undefined, availableWidth: number, viewportWidth: number, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, value);
  if (typeof value !== 'string') return fallback;
  const match = /^([0-9]+(?:\.[0-9]+)?)\s*(px|vw|%)$/i.exec(value.trim());
  if (!match) return fallback;
  const amount = Number(match[1]);
  if (match[2].toLowerCase() === 'px') return amount;
  if (match[2].toLowerCase() === 'vw') return viewportWidth * amount / 100;
  return availableWidth * amount / 100;
}

/** Calculates safe bounds for the left task grid while preserving the timeline. */
export function calculateTaskGridSizing(splitter: GanttTaskGridSplitterOptions = {}, availableWidth: number, viewportWidth: number): GanttTaskGridSizing {
  const minWidth = resolveLayoutLength(splitter.minWidth, availableWidth, viewportWidth, 220);
  const minTimelineWidth = resolveLayoutLength(splitter.minTimelineWidth, availableWidth, viewportWidth, 160);
  const availableMaximum = availableWidth > 0 ? Math.max(minWidth, availableWidth - minTimelineWidth) : Number.POSITIVE_INFINITY;
  const configuredMaximum = resolveLayoutLength(splitter.maxWidth, availableWidth, viewportWidth, availableMaximum);
  return { minWidth, minTimelineWidth, maxWidth: Math.max(minWidth, Math.min(availableMaximum, configuredMaximum)) };
}

/** Returns the small buffered date range currently needed by the resource timeline. */
export function calculateResourceDateWindow(totalDays: number, dayWidth: number, viewport: ResourceTimelineViewport, bufferDays = 8): ResourceDateWindow {
  const safeDayWidth = Math.max(1, dayWidth);
  const viewportWidth = viewport.width || Math.min(totalDays * safeDayWidth, 960);
  const firstVisible = Math.floor(viewport.scrollLeft / safeDayWidth);
  const start = Math.max(0, firstVisible - bufferDays);
  const end = Math.min(totalDays, Math.ceil((viewport.scrollLeft + viewportWidth) / safeDayWidth) + bufferDays);
  return { start, end: Math.max(start + 1, end) };
}

/** Caps the draggable Gantt panel height so the resource panel always remains visible. */
export function calculateMaximumGanttPanelHeight(availableHeight: number, fallbackMaximum = 900): number {
  if (availableHeight <= 0) return fallbackMaximum;
  return Math.max(MIN_GANTT_PANEL_HEIGHT, availableHeight - MIN_RESOURCES_PANEL_HEIGHT - PANEL_SPLITTER_HEIGHT);
}

export function clampGanttPanelHeight(value: number, availableHeight: number, fallbackMaximum = 900): number {
  return Math.max(MIN_GANTT_PANEL_HEIGHT, Math.min(fallbackMaximum, calculateMaximumGanttPanelHeight(availableHeight, fallbackMaximum), value));
}
