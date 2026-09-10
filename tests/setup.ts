class TestResizeObserver {
  observe(): void { /* Layout is not required in unit tests. */ }
  unobserve(): void { /* Layout is not required in unit tests. */ }
  disconnect(): void { /* Layout is not required in unit tests. */ }
}

if (!globalThis.ResizeObserver) globalThis.ResizeObserver = TestResizeObserver as typeof ResizeObserver;
