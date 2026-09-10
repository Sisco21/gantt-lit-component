# Changelog

All notable changes to this project are documented in this file.

## [1.1.0] - 2026-09-10

### Added

- Public component version through `GANTT_COMPONENT_VERSION`, `GanttChart.version` and `gantt.version`.
- Configurable task and resource column layouts: resize, order, visibility and required columns.
- Column-layout persistence API: `getColumnSettings()`, `setColumnSettings()` and `resetColumnSettings()`.
- `columnSettings.onChange` and `columnSettings.onReset` hooks, plus `column-settings-changed` and `column-settings-reset` events.
- Independent column permissions: `allowResize`, `allowReorder` and `allowVisibility`.
- Hover-only six-dot drag handles and keyboard-accessible order controls in the Columns panel.
- Resource-column numeric types, increments, minimum values and custom metadata-backed columns.
- Built-in French and English labels for the latest grid and column controls.

### Changed

- Improved dark-theme contrast, timeline/resource-grid alignment and Gantt scrolling behaviour.
- Expanded documentation and demo coverage for external integrations, templates, themes, calendars, headers, tooltips and column settings.

### Fixed

- Removed redundant Lit update scheduling from resource timeline measurement.
- Corrected Lit input bindings for numeric `step` values and header drag attributes.
- Corrected week-header rendering and grid separator alignment.

## [1.0.0] - 2026-09-08

### Added

- Initial reusable Lit Gantt component with task tree, dependencies, resource assignments, timeline editing, import/export and host integration hooks.
