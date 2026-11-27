import type { GanttData, GanttDependency, GanttResource, GanttTask } from './types';

/** Order and hierarchy are independent: anchors must be siblings of parentId. */
export interface GanttInsertion {
  parentId: string | null;
  position?: { before: string } | { after: string };
}

export interface GanttTimePolicy {
  unit: 'calendar-day' | 'working-day';
  /** Required even for calendar-day operations, to make the scheduling context explicit. */
  calendarId: string;
  dependencies: 'preserve' | 'reject' | 'host';
  descendants: 'include' | 'reject';
}

export type GanttOperation =
  /** Adapter for existing manual editors; the full proposed change is explicit to the host. */
  | { type: 'plan.replace'; source: 'manual'; data: GanttData; reason: import('./types').GanttChangeReason; taskId?: string }
  | { type: 'task.create'; task: GanttTask; placement: GanttInsertion }
  | { type: 'task.move'; taskId: string; placement: GanttInsertion }
  | { type: 'task.update'; taskId: string; patch: Partial<Omit<GanttTask, 'id' | 'children' | 'parentId' | 'start' | 'end' | 'resources' | 'collapsed' | 'editable'>> }
  | { type: 'task.schedule'; taskId: string; change: { start: string } | { end: string } | { duration: number } | { shift: number }; policy: GanttTimePolicy }
  | { type: 'assignment.add'; taskId: string; assignment: GanttResource }
  | { type: 'assignment.update'; taskId: string; assignmentId: string; patch: Partial<Omit<GanttResource, 'id'>> }
  | { type: 'assignment.remove'; taskId: string; assignmentId: string }
  | { type: 'dependency.add'; dependency: GanttDependency }
  | { type: 'dependency.update'; from: string; to: string; patch: Pick<GanttDependency, 'type' | 'lagDays'> }
  | { type: 'dependency.remove'; from: string; to: string }
  | { type: 'task.select'; taskId: string; reveal?: boolean };

export interface GanttCommand {
  /** Host-generated idempotency/correlation key, stable across a retry. */
  id: string;
  expectedRevision?: number;
  operation: GanttOperation | { type: 'batch'; atomic: boolean; operations: GanttOperation[] };
}

export type GanttCommandErrorCode =
  | 'DISABLED' | 'READ_ONLY' | 'FORBIDDEN' | 'NOT_FOUND' | 'DUPLICATE_ID'
  | 'INVALID_COMMAND' | 'INVALID_DATA' | 'INVALID_DATE' | 'INVALID_NUMBER'
  | 'HIERARCHY_CYCLE' | 'INVALID_POSITION' | 'INVALID_DEPENDENCY'
  | 'DEPENDENCY_CYCLE' | 'DEPENDENCY_CONFLICT' | 'CALENDAR_NOT_FOUND'
  | 'NO_WORKING_DAY' | 'PHASE_POLICY_REQUIRED' | 'HOST_REQUIRED'
  | 'REVISION_CONFLICT' | 'BUSY' | 'PERSIST_FAILED' | 'INVALID_RESPONSE' | 'CANCELLED' | 'VALIDATION_FAILED' | 'SIMULATION_FAILED';

export interface GanttCommandIssue {
  code: GanttCommandErrorCode;
  /** Translation parameters; codes and parameters never depend on translated text. */
  params?: Record<string, string | number | boolean>;
}

export interface GanttCommandResult {
  id: string;
  status: 'valid' | 'preview' | 'committed' | 'partial' | 'failed' | 'cancelled';
  revision: number;
  affectedIds: string[];
  issues: GanttCommandIssue[];
  values?: GanttData;
  previewSource?: 'local' | 'host';
  /** True when persistence succeeded but concurrent local changes prevent safe application. */
  persisted?: boolean;
  results?: GanttCommandResult[];
  hiddenIds?: string[];
  affectedAssignments?: Array<{ taskId: string; assignmentId: string }>;
}

export interface GanttCommandRequest {
  command: GanttCommand;
  baseRevision: number;
  data: GanttData;
  proposedData: GanttData;
  source: 'local' | 'host';
}

export interface GanttCommandCommit {
  data: GanttData;
  /** Opaque server revision belongs in data.metadata; this is the component revision. */
  undoToken?: string;
}

export interface GanttCommandOptions {
  enabled?: boolean;
  mode?: 'local' | 'controlled';
  /** Route existing manual editing through commands. Defaults to true when commands are enabled. */
  captureManualEdits?: boolean;
  /** Additional host permission rule shared by validation, preview and execution. */
  canExecute?: (operation: GanttOperation, data: GanttData) => boolean;
  validate?: (request: GanttCommandRequest) => void | GanttCommandIssue[] | Promise<void | GanttCommandIssue[]>;
  simulate?: (request: GanttCommandRequest) => GanttData | Promise<GanttData>;
  /** Atomic batches call this exactly once. Must provide a transaction on the host. */
  persist?: (request: GanttCommandRequest) => GanttCommandCommit | Promise<GanttCommandCommit>;
  /** Persist an inverse/replay on the server with revision checking before returning canonical data. */
  history?: (request: { direction: 'undo' | 'redo'; token: string; baseRevision: number; data: GanttData; id: string }) => GanttCommandCommit | Promise<GanttCommandCommit>;
  /** Reports a host filter that hides a confirmed task. No filter is changed implicitly. */
  isTaskVisible?: (taskId: string) => boolean;
}
