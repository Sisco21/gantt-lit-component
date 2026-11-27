import type {
  GanttChart,
  GanttResource,
  GanttResourceAssignmentPatch,
  GanttTask,
} from 'gantt-lit-component';

/** Host integration example for the 1.4 incremental API. */
export function configureIncrementalGantt(gantt: GanttChart): void {
  gantt.options = {
    incrementalUpdates: true,
    recalculateOnMoveEnd: true,
    preserveScroll: true,
    resourcePanel: { detachable: true },
  };

  gantt.addEventListener('task-updated', event => {
    const { taskId, reason, revision } = (event as CustomEvent).detail;
    console.info('task updated', { taskId, reason, revision });
  });
  gantt.addEventListener('resource-assignment-updated', event => {
    const { taskId, assignmentId, revision } = (event as CustomEvent).detail;
    console.info('assignment updated', { taskId, assignmentId, revision });
  });
}

export function loadInitialPlanning(gantt: GanttChart, planning: Parameters<GanttChart['setData']>[0]): void {
  gantt.data = planning;
}

/** Apply the canonical task returned by the API, including recalculated occurrences. */
export function applySavedTask(gantt: GanttChart, task: GanttTask): void {
  gantt.updateTask(task.id, {
    start: task.start,
    end: task.end,
    name: task.name,
    resources: task.resources,
  });
}

export function replaceTaskAssignments(gantt: GanttChart, taskId: string, resources: GanttResource[]): void {
  gantt.updateTaskResources(taskId, resources);
}

export function applySavedAssignment(gantt: GanttChart, taskId: string, assignment: GanttResourceAssignmentPatch): void {
  gantt.updateResourceAssignment(taskId, assignment);
}

export function showDetachedResourcesAndApplyResponse(gantt: GanttChart, taskId: string, resources: GanttResource[]): void {
  // The selected task, active editor tab and both scroll axes are preserved.
  gantt.selectTask(taskId);
  gantt.undockResources();
  gantt.updateTaskResources(taskId, resources);
}
