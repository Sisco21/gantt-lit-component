// Main export - re-export everything from the component
export { default, GanttChart, GANTT_COMPONENT_VERSION } from './gantt-chart';
export * from './types';
export * from './utils';
export * from './project-codecs';
export * from './persistence';
export * from './translations';
export * from './gantt-command-types';
export { GanttCommandError, proposeGanttOperation, validateCommandData } from './gantt-commands';
