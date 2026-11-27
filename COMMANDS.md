# Host commands and continuous entry (1.8.0)

Version 1.9.0 additionally supports hiding the main toolbar and controlling its actions externally. See the [external toolbar and menus reference](README.md#external-toolbar-and-menus-190) and [working example](examples/external-toolbar.html). Command and persistence contracts below remain compatible.

The host owns persistence, authorization, catalogue APIs, speech recognition and natural-language interpretation. The component accepts typed commands. It does not resolve task names, relative dates or business terminology. Identical names, Unicode and translated labels have no effect on targeting.

The requested 1.6.0 already exists locally, alongside 1.6.1 and 1.7.0. This feature ships as **1.8.0**. Earlier archives are retained. The public npm registry could not be queried in the build environment; no remote publication is claimed.

## Enable and persist

Both command support and draft rows are disabled by default. A complete simulated integration is in [examples/structured-commands.ts](examples/structured-commands.ts). Run `pnpm build`, then `pnpm dev` and open `/examples/structured-commands.html` to try asynchronous saves, catalogue searches, failures, preview/cancel/confirm, server undo/redo, French, English and an Arabic RTL configuration. This example imports the built public package, so rebuild it after library changes.

```ts
import 'gantt-lit-component';
import type { GanttChart, GanttCommand } from 'gantt-lit-component';

const gantt = document.querySelector('gantt-chart') as GanttChart;
gantt.options = {
  ...gantt.options,
  commands: {
    enabled: true,
    mode: 'controlled',
    validate: request => businessRules(request), // optional, returns stable issues
    // Optional: return a complete server simulation (no local guarantee).
    simulate: request => planningApi.simulate(request),
    // Return the complete canonical plan. An atomic batch requires a server transaction.
    persist: request => planningApi.execute(request), // { data, undoToken? }
    history: request => planningApi.history(request), // { data, undoToken? }
  },
};

const command: GanttCommand = {
  id: crypto.randomUUID(),
  expectedRevision: gantt.commandRevision,
  operation: {
    type: 'task.schedule', taskId: 'task-42', change: { shift: 2 },
    policy: {
      calendarId: 'project-calendar', unit: 'working-day',
      dependencies: 'preserve', descendants: 'reject',
    },
  },
};
const validation = await gantt.validateCommand(command);
const preview = await gantt.previewCommand(command);
// Present preview.values in a host preview view, clearly identified as a proposal.
const result = await gantt.commitCommandPreview();
// Or: await gantt.executeCommand(command), without a preview.
```

`mode` defaults to `local`: commands update only component data and existing auto-save hooks may observe the confirmed change. `controlled` requires `persist` for mutations. It never confirms the proposed plan before persistence succeeds, never applies initial dependency scheduling to a server response, and suppresses the additional legacy auto-save request for that commit. Set `autoSave = false` when all persistence belongs to the host.

`readOnly` is a global option, covering edits, creation and command mutations; selection/reveal remains available. `inlineCreation.readOnly` only disables draft rows. Existing `editable: false`, `isTaskEditable`, inline `canCreate`, and `commands.canExecute` also apply. Host authorization must be checked again on the server.

## Operations

Every operation is in `command.operation`; `command.id` is the correlation/idempotency key. Allocate task/assignment IDs in the host before submission (for example UUIDs, or reserved server IDs). Canonical responses must retain creation IDs. Server ID remapping is not supported by this contract.

| `type` | Additional properties and meaning |
| --- | --- |
| `task.create` | Complete `task` and `placement`. Use `task.type: 'parent'` for a phase. Create descendants in separate operations, including within an atomic batch. `task.parentId` must equal `placement.parentId`. |
| `task.move` | `taskId`, `placement`. Moves the complete branch; rejects cycles and locked descendants. |
| `task.update` | `taskId`, `patch`. Changes labels, progress, metadata or other ordinary fields. Identity, hierarchy, dates, resources, lock state and collapse state use their dedicated APIs. |
| `task.schedule` | `taskId`, one `change` (`{start}`, `{end}`, `{duration}` or `{shift}`) and mandatory `policy`. |
| `assignment.add` | `taskId`, complete `assignment` including its stable assignment `id`. An optional `resourceId` is the external catalogue identity. |
| `assignment.update` | `taskId`, `assignmentId`, `patch` (cannot change assignment ID). Values are typed canonical values; no catalogue is written. |
| `assignment.remove` | `taskId`, `assignmentId`. |
| `dependency.add` | Complete `dependency` (`from`, `to`, optional `type`, optional integer `lagDays`). |
| `dependency.update` | Stable endpoint pair `from`, `to`, and `patch` containing `type` and/or `lagDays`. |
| `dependency.remove` | Stable endpoint pair `from`, `to`. |
| `task.select` | `taskId`, optional `reveal` (default true). Expands ancestors and scrolls the internal viewport/timeline, including virtualized rows. |
| `batch` | `atomic: boolean`, `operations: GanttOperation[]`. No nested batches. |
| `plan.replace` | Adapter for existing manual editors: `source: 'manual'`, complete proposed `data`, stable `reason`, optional `taskId`. The host receives both previous and proposed plans, including explicit calculated consequences. |

`placement` always specifies `parentId` (string or `null`), independently of optional `position: {before: taskId}` or `{after: taskId}`. Anchors must be siblings under that parent. Omitted position appends among the parent's children. Position never adds a dependency. Adding a dependency never reorders/reparents/reschedules tasks. The branch remains contiguous in the flattened public data.

Dependencies are identified by their unique ordered endpoint pair. Self-links, missing endpoints, duplicate links, ancestor/descendant links and graph cycles are rejected.

## Time semantics

Dates are valid civil `YYYY-MM-DD` strings with no time of day. Numbers must be finite numbers, never localized strings. Duration and offsets use integers. No timezone conversion is performed; an hour-based/timezone-aware schedule must be calculated by the host before returning canonical civil dates.

All `task.schedule` operations require:

| Policy | Meaning |
| --- | --- |
| `calendarId` | Existing entry in `GanttData.calendars`, explicit even for calendar days. |
| `unit: 'calendar-day'` | Every day counts. |
| `unit: 'working-day'` | Uses the supplied calendar's weekly rule and date exceptions, including worked weekends. Missing weekly rules use Monday–Friday. |
| `dependencies: 'preserve'` | Keeps links and other tasks' dates unchanged; links can become unsatisfied. |
| `dependencies: 'reject'` | Rejects a proposal with unsatisfied dependency constraints; lags use the existing calendar-day semantics. |
| `dependencies: 'host'` | Requires `simulate`. Only the host resolves dependency consequences. |
| `descendants: 'reject'` | Rejects date changes on a phase with children. |
| `descendants: 'include'` | For a phase, shift its descendants or set its start by shifting the branch. Phase end/duration resizing requires explicit descendant operations or a host-generated batch. |

Durations are inclusive: one day has the same start and end. `{start}` and `{end}` change that boundary; `{duration}` computes the end from the current start; `{shift}` preserves duration in the requested unit. Working-day shifts preserve the number of worked dates and can change the civil-date span. A zero shift preserves all dates. A phase's displayed dates roll up from its children. Every affected descendant must be editable.

Calendar-day shifts move daily resource quantities by the same date offset. Other schedule changes redistribute existing daily totals using the explicitly selected calendar; there is no automatic resource leveling. Server responses can replace these local proposals with authoritative allocation. Existing derived phase dates are recalculated consistently for grid, bars and summaries.

Local calculations are bounded: at most 36,500 days per offset/duration, with a 366,000-day search horizon. Closed calendars are rejected. Hour/minute units and business dependency scheduling belong to the host.

## Manual edits and creation rows

With commands enabled, `captureManualEdits` defaults to true. Existing grid/editor/resource/dependency mutations become a `plan.replace` command, pass through the shared structural/permission checks and `commands.validate`, then optional simulation and persistence. Unconfirmed data is restored synchronously before rendering. Date dragging uses the existing separate preview layer in this mode. The detached resource panel forwards edits to the same owner/controller. The legacy synchronous methods queue their operation and retain their historical return types; observe `command-result` for confirmation. Use `executeCommand` to await a result directly.

`setData`, imports and calendar/lock administration remain host data-loading/administration APIs rather than queued user edits. Keep concurrent refreshes revision-aware. Set `captureManualEdits: false` only if the host deliberately owns legacy editing separately. The old behavior is preserved when commands are disabled.

For continuous entry, configure `inlineCreation.tasks` and `resources` as described in the README. Supply **either `command` or `save`** per enabled section; `command` takes precedence:

```ts
inlineCreation: {
  tasks: {
    enabled: true,
    defaults: { start: '2026-12-01', end: '2026-12-01', progress: 0, type: 'task' },
    requiredFields: ['name', 'start', 'end'],
    command: (draft, context) => ({
      id: context.correlationId!,
      operation: {
        type: 'task.create',
        task: { ...draft, id: `task-${context.correlationId}`, parentId: context.parentId } as GanttTask,
        placement: { parentId: context.parentId }, // map context.index to a sibling anchor if needed
      },
    }),
  },
  resources: {
    enabled: true, modes: ['catalogue', 'free'], selectionChange: 'retain',
    search: (query, context) => catalogueApi.search(query),
    command: (draft, context) => ({
      id: context.correlationId!,
      operation: {
        type: 'assignment.add', taskId: context.task.id,
        assignment: { name: '', type: 'work', quantity: 1, unitCost: 0, ...draft,
          id: `assignment-${context.correlationId}` },
      },
    }),
  },
}
```

The complete typed example fills every required task field without an assertion. Draft context supplies a stable `correlationId`, reused during retries and replaced for the next draft. The factory must create exactly one task or assignment, respect the original task/parent, and preserve the chosen catalogue identity. It never persists by itself.

Put shared business invariants in `commands.validate` or `canExecute`. Inline `validate` is an additional form validator and can provide localized text. Legacy `save` callbacks are already persistence boundaries: they insert their returned canonical record without invoking `commands.persist` a second time. Migrate to `command` for a common host validation/simulation/persistence pipeline.

Both resource modes are independent. When both are enabled, a translated native selector explicitly chooses catalogue or free entry. Catalogue is initially selected. No search result, an error or an unselected suggestion ever implies free mode. With only `['free']`, host configuration explicitly enables direct free entry. A free assignment removes catalogue IDs and never creates a catalogue entry. Selection copies catalogue defaults and keeps the external identity even when permitted fields are edited. Search replies are ignored after a newer query, mode change, cancellation or save. Loading, no-results and error messages are exposed to assistive technology.

`selectionChange: 'retain'` keeps a separate draft per task (default); `'discard'` resets unsaved drafts when leaving the task. A pending save always retains its original target and cannot be cancelled by Escape. Embedded and detached views share drafts, modes, search requests and pending saves. Successful creation produces a fresh row and restores focus unless the user moved elsewhere. Failure preserves entered values and displays an error. Tab/Shift+Tab use native order; Enter confirms except in multiline/select/popup controls; Escape resets; composition events and key code 229 do not confirm. A custom popup consumes Enter/Escape with `preventDefault()`.

Drafts never enter calculations, bars, links, history, data or exports. Required fields and editable columns are host-configurable. Native number/date controls use browser input conventions (`lang` follows `locale`); commands always carry typed numbers and ISO dates. Host resource templates can implement additional localized formats, normalizing their outgoing values. No parsing of translated business labels occurs.

## Preview, results and concurrency

`validateCommand` constructs and validates a proposal without applying it. `previewCommand` returns `status: 'preview'`, `values` and `previewSource: 'local' | 'host'`. It stores a separate snapshot, available through `getCommandPreview`. The normal chart, exports and summaries remain confirmed-only. The host renders the preview, for example in a second chart or a comparison panel. `cancelCommandPreview` removes it, including invalidating outstanding simulations. Latest preview wins.

`commitCommandPreview` validates permissions/current revision again and forwards the approved simulated data to persistence. A host simulation can put a simulation token/version in proposed metadata for server enforcement. It is a proposal, never a guarantee of future server results. Atomic previews are retained as a group; non-atomic execution evaluates each operation against the latest confirmed data.

`GanttCommandResult` includes:

| Property | Contract |
| --- | --- |
| `id` | Correlation/idempotency key. |
| `status` | `valid`, `preview`, `committed`, `partial`, `failed` or `cancelled`. |
| `revision` | Component revision after the result; use `expectedRevision` for optimistic concurrency. |
| `affectedIds` | Stable affected task IDs, including relevant dependency endpoints. |
| `affectedAssignments` | Explicit task/assignment ID pairs for assignment operations. |
| `values` | Final/proposed complete plan when available. Always treat `status` as authoritative. |
| `issues` | Stable `{code, params?}` objects; translate codes/parameters in the host. |
| `results` | Ordered child results for non-atomic batches, IDs `${batchId}/${index}`. |
| `persisted` | Persistence returned successfully. A failed result with `persisted: true` requires reconciliation. |
| `hiddenIds` | Task IDs hidden by the host filter, as reported by `commands.isTaskVisible(id)`. |

An in-flight duplicate with the same ID/payload shares the pending operation; a confirmed duplicate replays its receipt. Reusing an ID with a different payload returns `DUPLICATE_ID`. Receipts live for the lifetime of the component. Other simultaneous commands return `BUSY`. Failed submissions that did not persist may be retried using the same key. A persisted conflict/invalid response is retained as a receipt and must be reconciled, rather than persisted again automatically.

Fingerprint/revision checks detect data reloads or edits during validation, simulation and persistence, even if the changed field is unrelated to the command. Collapse/expand is presentation state and does not cause a conflict. If persistence succeeded but local data changed, the result is `REVISION_CONFLICT`, with `persisted: true` and canonical `values` when available. No stale snapshot overwrites the local plan. Refresh/reconcile explicitly with the host. Server revision checking and durable idempotency must also be implemented by the host (for example `data.metadata.serverRevision` plus the correlation ID).

An atomic batch validates all operations first, calls `persist` once, and applies/emits a single confirmed change only after success. The host promises the transaction. A non-atomic batch commits each successful child, continues after failures, and exposes `partial` plus every child result. A repeated partial batch replays its receipt; submit a new command ID for a deliberate correction of failed children. Non-atomic child server requests use derived IDs for durable idempotency.

`undoCommand(id, expectedRevision?)` and `redoCommand(...)` invoke `commands.history` using host-returned `undoToken`s. The host must persist inverse/replay operations with conflict detection before returning canonical data. Conflict leaves the token on its stack. A newly committed mutation clears redo. In controlled mode the old local history buttons/shortcuts are disabled: they cannot silently undo persisted operations. Tokens/history are scoped to this component instance; the host owns durable, cross-session history.

## Events and errors

| Event | Detail |
| --- | --- |
| `command-preview` | `GanttCommandResult`, unconfirmed preview. |
| `command-preview-cancelled` | Cancelled preview result. |
| `command-result` | Result of an execution/history request that entered the execution pipeline (including failures). Immediate `BUSY`/validation/deduplication returns are available directly from the Promise. |
| `inline-creation-result` | `{kind: 'task' | 'resource', taskId?, result}` for confirmation/cancellation/validation failures; legacy save callbacks also provide structured outcomes. |
| `mutation-rejected` | `{code, params?}` for structural rejection before a manual mutation is queued. |
| `tasks-changed` | Existing `GanttChange`, reason `command`, once per canonical commit. |
| `task-updated` | Existing focused event, `full-refresh` for affected canonical tasks. |
| `resource-assignment-updated` | Existing event for changed assignment IDs, including removals. |

Selection continues to use `task-selected`. Project summaries and detached resources update after confirmation. Early validation/preview does not emit `tasks-changed`.

| Error codes | Meaning / host action |
| --- | --- |
| `DISABLED`, `READ_ONLY`, `FORBIDDEN` | Feature/permission denied. |
| `NOT_FOUND`, `DUPLICATE_ID` | Missing target or duplicate identity/correlation payload. |
| `INVALID_COMMAND`, `INVALID_DATA`, `INVALID_DATE`, `INVALID_NUMBER` | Invalid structure, required value, civil date or typed number. `params` can contain `field`, `id` or `date`. |
| `HIERARCHY_CYCLE`, `INVALID_POSITION` | Invalid parent/anchor or cycle. |
| `INVALID_DEPENDENCY`, `DEPENDENCY_CYCLE`, `DEPENDENCY_CONFLICT` | Invalid link graph or rejected temporal constraints. |
| `CALENDAR_NOT_FOUND`, `NO_WORKING_DAY`, `PHASE_POLICY_REQUIRED` | Calendar/scope cannot support the requested calculation. |
| `HOST_REQUIRED` | Missing persistence/simulation/history integration. |
| `REVISION_CONFLICT`, `BUSY` | Refresh/reconcile, or wait for the current operation. |
| `VALIDATION_FAILED`, `SIMULATION_FAILED`, `PERSIST_FAILED` | Host callback failed. Throw exported `GanttCommandError(code, params)` to provide a more specific stable issue. |
| `INVALID_RESPONSE` | Host returned invalid/incomplete canonical data. Reconcile before retrying if `persisted` is true. |
| `CANCELLED` | Preview superseded/cancelled. |

## Language, visibility and remaining boundaries

All new visible/accessibility strings use `GanttTranslations`; built-in French/English remain available. Other languages use host `translations` overrides with English fallback. The runnable example supplies Arabic creation labels. Set `dir="rtl"` on the component or an ancestor. Grid/text/keyboard order follows that direction; date axes intentionally remain chronological left-to-right, so bar positions, headers, scrolling and drag calculations stay aligned. The detached panel copies direction. Long names wrap in feedback/suggestions and retain native cell tooltips.

Collapsed/offscreen/virtualized tasks remain addressable by ID. `task.select` with reveal expands ancestors and scrolls internal viewports. The built-in search highlights matches rather than hiding rows. External filters belong to the host: report visibility via `isTaskVisible`, then consume `hiddenIds` to notify the user or change the filter explicitly. A task excluded entirely from `GanttData` is an unknown target and must first be loaded by the host.

Legacy built-in editors keep their existing business transformations (including configured scheduling); their explicit complete proposal reaches the host as `plan.replace`. Structured operations have the stricter semantics documented above. Individual legacy field editors may close after rejection; the new continuous rows retain their drafts. Keyboard sequence and layout have been checked in a real browser; unit/integration tests cover IME guards, selection races, stale searches, retries, duplicate saves, locks, batches, calendars and multiple locales. Full assistive-technology certification, durable server transactions, network-outcome reconciliation, authorization, resource leveling and arbitrary client business rules remain integration responsibilities.
