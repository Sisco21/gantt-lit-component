# Packaging and consuming the Gantt component

This guide explains how to build `gantt-lit-component` and consume it from another application.

## Build a distributable package

From the component repository:

```bash
pnpm install
pnpm build
```

`pnpm build` produces the `dist/` directory containing the ESM bundle, CSS, source maps and TypeScript declarations.

Before sharing a package, inspect the published contents:

```bash
pnpm pack --dry-run
```

## Install from a local archive

Create an installable archive:

```bash
pnpm pack
```

This produces a file similar to:

```text
gantt-lit-component-1.1.0.tgz
```

Install that archive in the consuming application:

```bash
pnpm add "D:\projects\sandBox\GanttComponent\gantt-lit-component-1.1.0.tgz"
```

Use a relative path when both projects are checked out together:

```bash
pnpm add ../GanttComponent/gantt-lit-component-1.1.0.tgz
```

## Install from a package registry

For a public npm package:

```bash
npm login
npm publish --access public
```

For a private registry, configure the registry and authentication in the consuming application's `.npmrc`, then publish according to your registry's policy.

After publication, install a versioned dependency:

```bash
pnpm add @your-company/gantt-lit-component@1.1.0
```

Always publish a new semantic version for every release. Use a patch version for fixes, a minor version for backward-compatible features, and a major version for breaking API changes.

## Register the web component

Import the component once at application startup. Importing the stylesheet loads the bundled Roboto font faces.

```ts
import 'gantt-lit-component';
import 'gantt-lit-component/style.css';

import type {
  GanttChart,
  GanttData,
  GanttOptions,
} from 'gantt-lit-component';
```

Add the custom element to the page:

```html
<gantt-chart id="project-gantt"></gantt-chart>
```

Then configure it from TypeScript:

```ts
const gantt = document.querySelector('#project-gantt') as GanttChart;

const options: GanttOptions = {
  locale: 'fr-FR',
  taskGridSplitter: {
    minWidth: 280,
    minTimelineWidth: 320,
  },
  resourcePanel: {
    detachable: true,
  },
};

const data: GanttData = {
  name: 'Example project',
  tasks: [],
  dependencies: [],
  calendars: [],
};

gantt.options = options;
gantt.setData(data);
```

## Persist changes in the host application

The component owns the editing UI. The consuming application owns API calls, authentication and persistence.

```ts
gantt.addEventListener('tasks-changed', async event => {
  const change = event.detail;

  await fetch(`/api/projects/${change.projectId}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(change.data),
  });
});
```

`change.data` is the portable `GanttData` model. It can be stored directly as JSON or mapped to an application-specific API model.

## Optional detached resource window

Enable `resourcePanel.detachable` to display an **Undock resources** action after a task is selected:

```ts
gantt.options = {
  ...gantt.options,
  resourcePanel: {
    detachable: true,
    windowWidth: 1180,
    windowHeight: 680,
  },
};
```

The host can also control the window directly:

```ts
gantt.undockResources();
gantt.dockResources();
```

The detached window must be opened from a user action when popup blockers are enabled. It must run on the same origin as the host application. Resource edits, task selection, date scrolling, theme and visual CSS variables are synchronized with the main Gantt.

## Upgrade checklist

1. Update the dependency version in the consuming application.
2. Run the consuming application's build and tests.
3. Check the component changelog for breaking changes and migrations.
4. Verify import/export, persistence hooks, custom templates, translations and resource-window behavior in a staging environment.

