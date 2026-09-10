import { GanttChange, GanttData, GanttPersistenceAdapter } from './types';

/**
 * Small browser-local adapter. It stores the latest canonical project snapshot
 * and can therefore also be used with `autoSave = true`.
 */
export class LocalStorageGanttPersistenceAdapter implements GanttPersistenceAdapter {
  constructor(private readonly keyPrefix = 'gantt-project') {}

  async load(projectId: string): Promise<GanttData | null> {
    const raw = this.storage()?.getItem(this.key(projectId));
    return raw ? JSON.parse(raw) as GanttData : null;
  }

  async save(change: GanttChange): Promise<void> {
    const storage = this.storage();
    if (!storage) throw new Error('localStorage is unavailable in this environment.');
    storage.setItem(this.key(change.projectId || 'default'), JSON.stringify(change.data));
  }

  remove(projectId: string): void {
    this.storage()?.removeItem(this.key(projectId));
  }

  private key(projectId: string): string {
    return `${this.keyPrefix}:${projectId}`;
  }

  private storage(): Storage | undefined {
    return typeof window === 'undefined' ? undefined : window.localStorage;
  }
}
