import { activeTask, localDate, MINUTE } from './model.ts';
import type { AppState, AppNotification } from './model.ts';
export function reminderRelevant(
  state: AppState,
  planId: string,
  blockId: string,
  now = Date.now(),
): boolean {
  const plan = state.plan,
    b = plan?.blocks.find((item) => item.id === blockId);
  return !!(
    plan?.id === planId &&
    b?.type === 'focus' &&
    !b.done &&
    b.end > now &&
    state.timer?.blockId !== blockId &&
    state.tasks.some((t) => t.id === b.taskId && activeTask(t)) &&
    !(
      state.skipped.date === plan.date &&
      state.skipped.ids.includes(b.taskId || '')
    )
  );
}
export function addNotification(
  state: AppState,
  item: Omit<AppNotification, 'read'>,
): AppState {
  if (state.notifications.some((n) => n.id === item.id)) return state;
  return {
    ...state,
    notifications: [{ ...item, read: false }, ...state.notifications].slice(
      0,
      200,
    ),
  };
}
export function deadlineNotifications(
  state: AppState,
  now = Date.now(),
): AppNotification[] {
  return state.goals
    .filter(
      (g) =>
        g.deadline &&
        state.tasks.some(
          (t) => t.goalId === g.id && !t.habitId && activeTask(t),
        ),
    )
    .flatMap((g) => {
      const due = new Date(g.deadline).getTime(),
        left = due - now;
      if (!Number.isFinite(due) || left > 3 * 24 * 60 * MINUTE) return [];
      const phase =
        left < 0
          ? 'overdue'
          : localDate(new Date(due)) === localDate(new Date(now))
            ? 'today'
            : 'soon';
      return [
        {
          id: `deadline:${g.id}:${g.deadline}:${phase}`,
          title:
            phase === 'overdue'
              ? '目标已到截止时间'
              : phase === 'today'
                ? '今天有目标截止'
                : '目标即将截止',
          message: `${g.title} · ${g.deadline.replace('T', ' ')}`,
          kind: 'deadline' as const,
          goalId: g.id,
          createdAt: now,
          read: false,
        },
      ];
    });
}
export function syncDeadlines(state: AppState, now = Date.now()): AppState {
  const valid = new Set(deadlineNotifications(state, now).map((n) => n.id));
  const notifications = state.notifications.filter(
    (n) => n.kind !== 'deadline' || valid.has(n.id),
  );
  let result =
    notifications.length === state.notifications.length
      ? state
      : { ...state, notifications };
  for (const item of deadlineNotifications(state, now))
    result = addNotification(result, item);
  return result;
}
