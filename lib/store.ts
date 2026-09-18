'use client';
import { useEffect, useState } from 'react';
import { initialState } from './model.ts';
import type { AppState } from './model.ts';
import { restoreState } from './persistence.ts';
import { getAnnaRuntime, isAnna } from './anna-runtime.ts';
import { createAnnaStateStore, storageErrorMessage } from './anna-storage.ts';
const KEY = 'afterhours.state.v1';
let memory: AppState | undefined;
let saveError = '';
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((f) => f());
let remote: ReturnType<typeof createAnnaStateStore> | undefined;
function cloud() {
  return (remote ??= createAnnaStateStore(getAnnaRuntime().storage, notify));
}
export async function initializeState() {
  if (isAnna()) await cloud().refresh();
  else readState();
}
export function readState(): AppState {
  if (isAnna()) return cloud().read();
  if (memory) return memory;
  if (typeof window === 'undefined') return initialState();
  const raw = localStorage.getItem(KEY);
  if (!raw) return (memory = initialState());
  return (memory = restoreState(raw));
}
export function updateState(updater: (s: AppState) => AppState): AppState {
  if (isAnna()) throw new Error('ANNA writes must use atomicUpdate.');
  const previous = readState();
  const state = updater(previous);
  if (state === previous) return state;
  localStorage.setItem(KEY, JSON.stringify(state));
  memory = state;
  listeners.forEach((f) => f());
  return state;
}
export async function atomicUpdate(
  updater: (s: AppState) => AppState,
): Promise<AppState> {
  try {
    let result: AppState;
    if (isAnna()) result = await cloud().update(updater);
    else if (navigator.locks)
      result = await navigator.locks.request('afterhours-write', () => {
        memory = undefined;
        return updateState(updater);
      });
    else result = updateState(updater);
    saveError = '';
    notify();
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    saveError = isAnna()
      ? storageErrorMessage(
          error,
          typeof document !== 'undefined' &&
            document.documentElement.lang === 'zh-CN'
            ? 'zh-CN'
            : 'en',
        )
      : message;
    notify();
    throw new Error(saveError);
  }
}
export function useAppState() {
  const [state, setState] = useState<AppState>(initialState),
    [ready, setReady] = useState(false),
    [error, setError] = useState(''),
    [writeError, setWriteError] = useState('');
  useEffect(() => {
    const sync = () => {
      try {
        setState(readState());
        setError('');
      } catch (e) {
        setError(String(e));
      }
      setWriteError(saveError);
      setReady(true);
    };
    const storage = (e: StorageEvent) => {
      if (!isAnna() && (e.key === KEY || e.key === null)) {
        memory = undefined;
        sync();
      }
    };
    const refresh = () => {
      if (!isAnna() || document.visibilityState === 'hidden') return;
      void cloud()
        .refresh()
        .catch((e) =>
          setError(
            storageErrorMessage(
              e,
              document.documentElement.lang === 'zh-CN' ? 'zh-CN' : 'en',
            ),
          ),
        );
    };
    listeners.add(sync);
    const onFailure = (event: Event) => {
      saveError = String((event as CustomEvent).detail);
      sync();
    };
    window.addEventListener('evening-bell-storage-error', onFailure);
    window.addEventListener('storage', storage);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    const interval = isAnna() ? setInterval(refresh, 30000) : undefined;
    sync();
    return () => {
      listeners.delete(sync);
      window.removeEventListener('evening-bell-storage-error', onFailure);
      window.removeEventListener('storage', storage);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
      if (interval) clearInterval(interval);
    };
  }, []);
  return { state, ready, error, writeError };
}
export function rawBackup() {
  if (isAnna()) return cloud().backup();
  return localStorage.getItem(KEY) || '{}';
}
