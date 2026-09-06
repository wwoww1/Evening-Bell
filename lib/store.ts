'use client';
import { useEffect, useState } from 'react';
import { initialState } from './model';
import type { AppState } from './model';
import { restoreState } from './persistence';
const KEY = 'afterhours.state.v1';
let memory: AppState | undefined;
const listeners = new Set<() => void>();
export function readState(): AppState {
  if (memory) return memory;
  if (typeof window === 'undefined') return initialState();
  const raw = localStorage.getItem(KEY);
  if (!raw) return (memory = initialState());
  return (memory = restoreState(raw));
}
export function updateState(updater: (s: AppState) => AppState): AppState {
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
  if (navigator.locks)
    return navigator.locks.request('afterhours-write', () => {
      memory = undefined;
      return updateState(updater);
    });
  return updateState(updater);
}
export function useAppState() {
  const [state, setState] = useState<AppState>(initialState),
    [ready, setReady] = useState(false),
    [error, setError] = useState('');
  useEffect(() => {
    const sync = () => {
      try {
        setState(readState());
        setError('');
      } catch (e) {
        setError(String(e));
      }
      setReady(true);
    };
    const storage = (e: StorageEvent) => {
      if (e.key === KEY) {
        memory = undefined;
        sync();
      }
    };
    listeners.add(sync);
    window.addEventListener('storage', storage);
    sync();
    return () => {
      listeners.delete(sync);
      window.removeEventListener('storage', storage);
    };
  }, []);
  return { state, ready, error };
}
export function rawBackup() {
  return localStorage.getItem(KEY) || '{}';
}
