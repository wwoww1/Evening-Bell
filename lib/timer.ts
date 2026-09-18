import type { AppState, Timer } from './model.ts';
import { MINUTE, uid } from './model.ts';
export function elapsed(timer: Timer, now = Date.now()): number {
  return Math.min(
    timer.durationMs,
    Math.max(
      0,
      timer.elapsedMs +
        (timer.status === 'running' && timer.segmentStart !== null
          ? Math.max(0, now - timer.segmentStart)
          : 0),
    ),
  );
}
export function createTimer(
  taskId: string,
  minutes: number,
  kind: Timer['kind'] = 'focus',
  blockId?: string,
  demo = false,
  now = Date.now(),
): Timer {
  return {
    id: uid(),
    taskId,
    blockId,
    kind,
    status: 'running',
    durationMs: demo ? 10000 : Math.max(1, minutes) * MINUTE,
    elapsedMs: 0,
    segmentStart: now,
    startedAt: now,
    demo,
  };
}
export function pauseTimer(t: Timer, now = Date.now()): Timer {
  return {
    ...t,
    elapsedMs: elapsed(t, now),
    segmentStart: null,
    status: 'paused',
  };
}
export function resumeTimer(t: Timer, now = Date.now()): Timer {
  return { ...t, segmentStart: now, status: 'running' };
}
export function startPomodoro(state: AppState, now = Date.now()): AppState {
  if (state.timer) throw new Error('已有计时，请先结算。');
  return {
    ...state,
    timer: createTimer(
      '',
      state.settings.focusMinutes,
      'focus',
      undefined,
      state.settings.demoTimer,
      now,
    ),
  };
}
export function settleTimer(state: AppState, now = Date.now()): AppState {
  const t = state.timer;
  if (!t) return state;
  const durationMs = elapsed(t, now);
  const sessionExists = state.sessions.some((s) => s.id === t.id);
  const sessions =
    t.kind === 'focus' && !sessionExists && durationMs > 0
      ? [
          ...state.sessions,
          {
            id: t.id,
            taskId: t.taskId,
            title:
              state.tasks.find((x) => x.id === t.taskId)?.title ||
              (t.taskId ? '已删除任务' : '自由专注'),
            startedAt: t.startedAt,
            endedAt: Math.min(
              now,
              (t.segmentStart ?? now) + Math.max(0, t.durationMs - t.elapsedMs),
            ),
            durationMs,
            demo: t.demo,
          },
        ]
      : state.sessions;
  return {
    ...state,
    sessions,
    timer:
      t.kind === 'focus' && !t.taskId
        ? null
        : {
            ...t,
            status: 'awaiting',
            elapsedMs: durationMs,
            segmentStart: null,
          },
  };
}
