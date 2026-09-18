import type { AppState } from './model.ts';
import { initialState } from './model.ts';
import { restoreState } from './persistence.ts';
import type { AnnaStorage } from './anna-runtime.ts';
import { annaError } from './anna-runtime.ts';

/** Only host I/O failures are connection/permission errors; updater errors are local validation. */
export class AnnaStorageError extends Error {
  constructor(cause: unknown) {
    super(cause instanceof Error ? cause.message : String(cause), { cause });
    this.name = 'AnnaStorageError';
  }
}
export function storageErrorMessage(error: unknown, locale: 'en' | 'zh-CN') {
  return error instanceof AnnaStorageError
    ? annaError(error.cause, locale)
    : error instanceof Error
      ? error.message
      : String(error);
}

async function hostRequest<T>(request: () => Promise<T>): Promise<T> {
  try {
    return await request();
  } catch (error) {
    throw new AnnaStorageError(error);
  }
}

export const ANNA_STATE_KEY = 'evening-bell/state-v1';
// Keep below both APS's per-value and the legacy harness's total-state cap.
export const MAX_STATE_BYTES = 240 * 1024;

/** Serial writes, commit-after-ack and optimistic concurrency for the APS path. */
export function createAnnaStateStore(
  storage: AnnaStorage,
  changed: () => void,
) {
  let state: AppState | undefined;
  let backup = '{}';
  let queue: Promise<unknown> = Promise.resolve();
  const serialize = <T>(run: () => Promise<T>): Promise<T> => {
    const next = queue.then(run);
    queue = next.catch(() => {});
    return next;
  };
  async function load() {
    const current = await hostRequest(() =>
      storage.get({ key: ANNA_STATE_KEY }),
    );
    // Legacy harness has no `exists`; production APS does, including stored null.
    const exists =
      current.exists ?? (current.value !== null && current.value !== undefined);
    const raw = exists ? JSON.stringify(current.value) : '{}';
    backup = raw;
    const next = exists ? restoreState(raw) : initialState();
    state = next;
    changed();
    return { ...current, exists, state: next };
  }
  return {
    read() {
      if (!state)
        throw new Error('ANNA data is still loading. / ANNA 数据仍在加载。');
      return state;
    },
    backup: () => backup,
    refresh: () => serialize(load),
    update(updater: (old: AppState) => AppState) {
      return serialize(async () => {
        // Re-read before each write, including timer settlement and deletions.
        const current = await load();
        const next = updater(current.state);
        if (next === current.state) return next;
        const raw = JSON.stringify(next);
        if (new TextEncoder().encode(raw).byteLength > MAX_STATE_BYTES) {
          throw new Error(
            'Data exceeds 240 KiB. Export a backup and reduce old records before saving. / 数据超过 240 KiB，请先导出备份并精简旧记录，再保存。',
          );
        }
        await hostRequest(() =>
          storage.set({
            key: ANNA_STATE_KEY,
            value: next,
            ...(current.etag ? { if_match: current.etag } : {}),
          }),
        );
        // No optimistic UI success and no automatic retries of an ambiguous write.
        backup = raw;
        state = next;
        changed();
        return next;
      });
    },
  };
}
