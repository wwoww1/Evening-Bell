import { restoreState } from './persistence.ts';
import type { AppState } from './model.ts';

/** Validate imported records before allowing an explicit destructive replacement. */
export function parseBackup(raw: string): AppState {
  if (new TextEncoder().encode(raw).byteLength > 240 * 1024)
    throw new Error('备份超过 240 KiB，请先精简原应用中的记录。');
  const state = restoreState(raw);
  const fail = () => {
    throw new Error('备份数据格式无效，未导入任何内容。');
  };
  const object = (v: unknown): v is Record<string, unknown> =>
    !!v && typeof v === 'object' && !Array.isArray(v);
  const strings = (v: unknown) =>
    Array.isArray(v) && v.every((x) => typeof x === 'string');
  function rows(
    value: unknown,
    fields: Record<string, 'string' | 'number' | 'boolean'>,
  ) {
    if (!Array.isArray(value)) return fail();
    const ids = new Set();
    for (const row of value) {
      if (
        !object(row) ||
        typeof row.id !== 'string' ||
        !row.id ||
        ids.has(row.id)
      )
        return fail();
      ids.add(row.id);
      for (const [key, type] of Object.entries(fields))
        if (
          typeof row[key] !== type ||
          (type === 'number' && !Number.isFinite(row[key]))
        )
          return fail();
    }
  }
  function checkin(value: unknown) {
    if (
      !object(value) ||
      !['date', 'start', 'end', 'mood'].every(
        (k) => typeof value[k] === 'string',
      ) ||
      typeof value.nextDay !== 'boolean' ||
      !['low', 'medium', 'high'].includes(String(value.energy))
    )
      return fail();
    rows(value.commitments, {
      title: 'string',
      start: 'string',
      end: 'string',
    });
  }
  function tasks(value: unknown) {
    rows(value, {
      title: 'string',
      goalId: 'string',
      outcome: 'string',
      estimate: 'number',
      remaining: 'number',
      fixedStart: 'string',
      splittable: 'boolean',
    });
    for (const task of value as AppState['tasks'])
      if (
        !strings(task.dependsOn) ||
        !['todo', 'doing', 'done', 'cancelled'].includes(task.status) ||
        !['low', 'medium', 'high'].includes(task.energy) ||
        task.remaining < 0 ||
        task.estimate <= 0
      )
        fail();
  }
  rows(state.goals, {
    title: 'string',
    outcome: 'string',
    deadline: 'string',
    priority: 'number',
    color: 'string',
  });
  tasks(state.tasks);
  rows(state.habits, {
    title: 'string',
    minutes: 'number',
    priority: 'number',
    enabled: 'boolean',
    splittable: 'boolean',
  });
  for (const habit of state.habits)
    if (
      !Array.isArray(habit.days) ||
      !habit.days.every((d) => Number.isInteger(d) && d >= 0 && d <= 6) ||
      !['low', 'medium', 'high'].includes(habit.energy)
    )
      fail();
  rows(state.sessions, {
    taskId: 'string',
    title: 'string',
    startedAt: 'number',
    endedAt: 'number',
    durationMs: 'number',
    demo: 'boolean',
  });
  for (const session of state.sessions)
    if (session.note !== undefined && typeof session.note !== 'string') fail();
  rows(state.reflections, { date: 'string', mood: 'string', note: 'string' });
  rows(state.notifications, {
    title: 'string',
    message: 'string',
    createdAt: 'number',
    read: 'boolean',
    kind: 'string',
  });
  rows(state.feedbackEntries, {
    category: 'string',
    message: 'string',
    createdAt: 'number',
  });
  checkin(state.checkin);
  for (const plan of [state.plan, state.previousPlan]) {
    if (plan === null) continue;
    if (
      !object(plan) ||
      typeof plan.id !== 'string' ||
      typeof plan.date !== 'string' ||
      !strings(plan.notes) ||
      !Number.isFinite(plan.generatedAt)
    )
      fail();
    checkin(plan.checkin);
    rows(plan.blocks, {
      title: 'string',
      start: 'number',
      end: 'number',
      reason: 'string',
      locked: 'boolean',
      done: 'boolean',
      type: 'string',
    });
    if (plan.habitTasks !== undefined) tasks(plan.habitTasks);
  }
  if (!object(state.settings)) fail();
  const settings = state.settings;
  if (
    !['name', 'usualStart', 'usualEnd', 'notifyStart', 'notifyEnd'].every(
      (k) =>
        typeof (settings as unknown as Record<string, unknown>)[k] === 'string',
    ) ||
    !Array.isArray(settings.usualDays) ||
    !settings.usualDays.every((n) => Number.isInteger(n) && n >= 0 && n <= 6)
  )
    fail();
  for (const key of [
    'focusMinutes',
    'breakMinutes',
    'longBreakMinutes',
    'preparation',
    'buffer',
  ] as const)
    if (
      !Number.isFinite(settings[key]) ||
      settings[key] < (key === 'preparation' || key === 'buffer' ? 0 : 1) ||
      settings[key] > 480
    )
      fail();
  for (const key of [
    'futureKnown',
    'companion',
    'notifications',
    'sound',
    'demoTimer',
  ] as const)
    if (typeof settings[key] !== 'boolean') fail();
  if (
    !strings(state.notified) ||
    !object(state.skipped) ||
    typeof state.skipped.date !== 'string' ||
    !strings(state.skipped.ids) ||
    !object(state.reminderSnoozes) ||
    !Object.values(state.reminderSnoozes).every(Number.isFinite)
  )
    fail();
  if (
    state.previousSkipped !== null &&
    (!object(state.previousSkipped) ||
      typeof state.previousSkipped.date !== 'string' ||
      !strings(state.previousSkipped.ids))
  )
    fail();
  if (state.timer !== null) {
    const timer = state.timer;
    if (
      !object(timer) ||
      !['id', 'taskId'].every((k) => typeof timer[k as 'id'] === 'string') ||
      !['focus', 'break'].includes(timer.kind) ||
      !['running', 'paused', 'awaiting'].includes(timer.status) ||
      ![timer.durationMs, timer.elapsedMs, timer.startedAt].every(
        Number.isFinite,
      ) ||
      timer.durationMs <= 0 ||
      timer.elapsedMs < 0 ||
      typeof timer.demo !== 'boolean' ||
      (timer.segmentStart !== null && !Number.isFinite(timer.segmentStart))
    )
      fail();
  }
  return state;
}
