/**
 * Framework-independent snapshot history used by the Gantt component.
 * The owner decides when history is enabled and how many actions to retain.
 */
export class GanttHistory<T> {
  private past: T[] = [];
  private future: T[] = [];
  private current?: T;

  constructor(
    private readonly clone: (value: T) => T,
    private readonly serialize: (value: T) => string,
  ) {}

  get canUndo(): boolean { return this.past.length > 0; }
  get canRedo(): boolean { return this.future.length > 0; }

  reset(snapshot?: T): void {
    this.past = [];
    this.future = [];
    this.current = snapshot === undefined ? undefined : this.clone(snapshot);
  }

  record(snapshot: T, maxActions: number): void {
    const next = this.clone(snapshot);
    if (!this.current) {
      this.current = next;
      return;
    }
    if (this.serialize(this.current) === this.serialize(next)) return;
    this.past.push(this.current);
    this.trimPast(maxActions);
    this.future = [];
    this.current = next;
  }

  undo(): T | undefined {
    if (!this.current) return undefined;
    const previous = this.past.pop();
    if (!previous) return undefined;
    this.future.push(this.clone(this.current));
    this.current = this.clone(previous);
    return this.clone(this.current);
  }

  redo(maxActions: number): T | undefined {
    if (!this.current) return undefined;
    const next = this.future.pop();
    if (!next) return undefined;
    this.past.push(this.clone(this.current));
    this.trimPast(maxActions);
    this.current = this.clone(next);
    return this.clone(this.current);
  }

  trim(maxActions: number): void {
    this.trimPast(maxActions);
  }

  private trimPast(maxActions: number): void {
    const limit = Math.max(0, Math.floor(maxActions));
    if (this.past.length > limit) this.past.splice(0, this.past.length - limit);
  }
}
