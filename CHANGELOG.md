# Changelog

All notable changes to this project are documented in this file.

## [Unreleased]

## [1.9.0] - 2026-11-27

### Added

- `showToolbar: false` to replace the main toolbar with host-owned controls, preserving status/error feedback and all public actions.
- Public zoom, search/navigation, expand/collapse, selection snapshots, task editor and resource picker controls.
- `getViewState()` / `view-state-changed` and persisted undo/redo availability for synchronizing external controls.
- Optional suppression of built-in context menus, cancelable `context-menu-requested` events and `onContextMenuRequested`, including stable task/assignment/dependency IDs, timeline dates and detached-window context.
- A runnable external toolbar and external keyboard-accessible context menu example, using only public APIs.

### Compatibility

- Built-in toolbar and context menus remain enabled by default. The separate detached-resource heading/dock control remains visible.
- Existing archives, including 1.8.0, are preserved.

## [1.8.0] - 2026-11-27

### Added

- Opt-in typed structured command API for tasks/phases, independent insertion position and hierarchy, assignments, dependencies, selection and explicit calendar-based scheduling.
- Separate cancellable local/host previews, asynchronous controlled persistence, canonical commits, revision checks, idempotent receipts, atomic/non-atomic batches and persisted undo/redo hooks.
- Shared host validation/persistence for manual editors (including detached resources), with confirmed data retained until success.
- Inline command factories, stable draft correlation IDs, structured creation outcomes and configurable resource draft retention/discard on task selection changes.
- Public command types/helpers, integration reference and runnable simulated host/assistant example.

### Changed

- When both catalogue and free resource entry are enabled, users now explicitly choose free mode. Empty/failed searches and unselected suggestions never imply free entry.
- RTL grids retain left-to-right date geometry, aligned scrollbars and direction-aware splitters; detached panels inherit direction.
- The package runtime now exports the full public entry point as well as TypeScript declarations.

### Fixed

- Multiline and legacy IME Enter events no longer confirm inline drafts; stale catalogue results and empty-search feedback stay distinct.
- Global read-only checks and shared canonical structural validation protect the opt-in command pipeline.

### Packaging

- Version 1.6.0 was already present and superseded by 1.7.0. This additive release uses 1.8.0 and preserves existing archives. No npm publication was performed.

## [1.7.0] - 2026-11-27

### Added

- Optional detachable Resource panel with a synchronized, resizable secondary window.
- `resourcePanel` configuration, `undockResources()` / `dockResources()` APIs, and localized dock controls.
- Optional inline task and resource creation rows, independently enabled through `inlineCreation` and excluded from planning data until saved.
- Keyboard-only confirmation and cancellation, configurable with `confirmKey` and `cancelKey`, without Add/Cancel buttons or a resource-mode selector.
- Host-controlled defaults, required fields, permissions, asynchronous validation and persistence, preserving input on errors and preventing duplicate submissions.
- Catalogue selection and free resource assignment on confirmation when permitted, with `resources.inputTemplate` for host-owned search inputs.
- Typed integration example, REST adapter and runnable inline creation demo, including shared drafts in embedded and detached resource panels.

### Fixed

- Resource unit values now display and edit the canonical assignment field, retaining compatibility with older metadata values.

## [1.6.1] - 2026-10-09

### Fixed

- Ctrl/Cmd + wheel zoom now keeps the date under the pointer fixed, or keeps the timeline center when zooming from the task grid.

## [1.6.0] - 2026-10-09

### Added

- Dependency-arrow context menus through `dependencyContextMenuTemplate`, including targeted dependency context, viewport-safe positioning and keyboard opening with `ContextMenu` / `Shift+F10`.
- Incremental dependency removal remains available through `removeDependency(from, to)`, preserving the existing plan view and compatibility with 1.5.0 integrations.
- Unit and interaction coverage for dependency targeting, task-menu separation, cancellation, keyboard closing and incremental removal.

## [1.5.0] - 2026-10-09

### Added

- Visual calendar exceptions in the planning and resource grids, including accessible date/status titles and light/dark theme variables.
- `GanttData.projectCalendarId`, `GanttTask.calendarId` and `GanttCalendar.exceptionLabels`.
- Targeted `updateCalendar(calendar)` and `setProjectCalendarId(calendarId)` APIs that preserve selection, zoom and scroll state without recalculating business data.
- Automated coverage for holiday exceptions, worked weekend overrides, task/resource calendars and targeted visual updates.

## [1.4.0] - 2026-10-08

### Added

- Incremental task and resource APIs: `updateTask()`, `updateTaskResources()`, `updateResourceAssignment()`, `removeResourceAssignment()` and `refreshTask()`.
- Focused `task-updated` and `resource-assignment-updated` events with monotonic revisions and typed update reasons.
- `incrementalUpdates`, `recalculateOnMoveEnd` and `preserveScroll` configuration options.
- Documentation and test coverage for parent phase roll-ups, detached resources, scroll preservation and selection/editor-state preservation.

### Changed

- Targeted updates now reconcile only the affected task/assignment through the existing Lit render tree; `data` remains the full-load/import/reload API.
- Resource and schedule changes keep detached resource panels synchronized without requiring host-side full-data reinjection.

## [1.3.0] - 2026-10-08

### Added

- Optional deferred and controlled task move/resize scheduling through `scheduleEditing`.
- Schedule-edit lifecycle callbacks, controlled commit results and `isScheduleEditing()` / `cancelScheduleEdit()` APIs.

## [1.2.0] - 2026-10-07

### Added

- Native `select` editors for resource columns through `GanttResourceColumnEditor` and `GanttResourceColumnOption`.
- Disabled-option support and disabled fallbacks for resource values that are not present in the configured options.

### Changed

- Resource-column editors now accept explicit `text`, `number` and `select` types while preserving the 1.1.0 fallback behavior.

## [1.1.0] - 2026-09-10

### Added

- Public component version through `GANTT_COMPONENT_VERSION`, `GanttChart.version` and `gantt.version`.
- Configurable task and resource column layouts: resize, order, visibility and required columns.
- Column-layout persistence API: `getColumnSettings()`, `setColumnSettings()` and `resetColumnSettings()`.
- `columnSettings.onChange` and `columnSettings.onReset` hooks, plus `column-settings-changed` and `column-settings-reset` events.
- Independent column permissions: `allowResize`, `allowReorder` and `allowVisibility`.
- Hover-only six-dot drag handles and keyboard-accessible order controls in the Columns panel.
- Configurable task-row height, including a Columns-panel slider and persistence through `GanttColumnSettings.taskRowHeight`.
- Resource-column numeric types, increments, minimum values and custom metadata-backed columns.
- Built-in French and English labels for the latest grid and column controls.

### Changed

- Improved dark-theme contrast, timeline/resource-grid alignment and Gantt scrolling behaviour.
- Expanded documentation and demo coverage for external integrations, templates, themes, calendars, headers, tooltips and column settings.
- Package build now includes TypeScript declaration files and supports Git-based installation through `prepare`.

### Fixed

- Removed redundant Lit update scheduling from resource timeline measurement.
- Corrected Lit input bindings for numeric `step` values and header drag attributes.
- Corrected week-header rendering and grid separator alignment.

## [1.0.0] - 2026-09-08

### Added

- Initial reusable Lit Gantt component with task tree, dependencies, resource assignments, timeline editing, import/export and host integration hooks.
