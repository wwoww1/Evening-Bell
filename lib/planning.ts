import { activeTask } from './model.ts';
import type { AppState, Checkin, Plan } from './model.ts';
import { materializeHabits, tasksForDay, habitSignature } from './habits.ts';
import { validatePlan } from './scheduler.ts';
import type { PlanningAdvice } from './scheduler.ts';

export function planningCandidates(state: AppState, checkin: Checkin) {
  const daily = materializeHabits(state, checkin.date);
  return tasksForDay(daily, checkin.date)
    .filter(
      (t) =>
        activeTask(t) &&
        !(
          state.skipped.date === checkin.date &&
          state.skipped.ids.includes(t.id)
        ),
    )
    .map((t) => ({
      id: t.id,
      title: t.title,
      kind: t.habitId ? 'habit' : 'task',
      remaining: t.remaining,
      energy: t.energy,
      dependsOn: t.dependsOn,
      priority: t.habitId
        ? state.habits.find((h) => h.id === t.habitId)?.priority
        : state.goals.find((g) => g.id === t.goalId)?.priority,
      deadline: t.habitId
        ? null
        : state.goals.find((g) => g.id === t.goalId)?.deadline || null,
    }));
}
export function validatePlanningAdvice(
  value: unknown,
  ids: string[],
): PlanningAdvice {
  if (!value || typeof value !== 'object') throw new Error('排序建议无效。');
  const v = value as Record<string, unknown>;
  if (
    !Array.isArray(v.orderedTaskIds) ||
    v.orderedTaskIds.length !== ids.length ||
    new Set(v.orderedTaskIds).size !== ids.length ||
    v.orderedTaskIds.some((id) => typeof id !== 'string' || !ids.includes(id))
  )
    throw new Error('排序建议中的任务与当前任务不一致。');
  const reasons: Record<string, string> = Object.create(null);
  if (v.reasons && typeof v.reasons === 'object')
    for (const id of ids) {
      const reason = (v.reasons as Record<string, unknown>)[id];
      if (typeof reason === 'string') reasons[id] = reason.slice(0, 160);
    }
  return { orderedTaskIds: v.orderedTaskIds as string[], reasons };
}
export function acceptDailyPlan(state: AppState, plan: Plan): AppState {
  if (state.timer) throw new Error('请先结束当前计时再采纳新安排。');
  const daily = materializeHabits(state, plan.date),
    tasks = tasksForDay(daily, plan.date);
  const habitTasks = tasks.filter((t) => t.habitId);
  if (
    plan.habitSignature !== undefined &&
    plan.habitSignature !== habitSignature(state, plan.date)
  )
    throw new Error('习惯设置已改变，请重新生成安排。');
  if (JSON.stringify(habitTasks) !== JSON.stringify(plan.habitTasks || []))
    throw new Error('习惯或今日进度已改变，请重新生成安排。');
  const errors = validatePlan(plan, tasks);
  if (errors.length) throw new Error(errors[0]);
  if (
    state.skipped.date === plan.date &&
    plan.blocks.some(
      (b) =>
        b.type === 'focus' &&
        !b.done &&
        b.taskId &&
        state.skipped.ids.includes(b.taskId),
    )
  )
    throw new Error('有任务已在今天延后，请重新生成安排。');
  return {
    ...daily,
    previousPlan: state.plan,
    previousSkipped: state.skipped,
    plan,
    checkin: plan.checkin,
    notified: [],
    reminderSnoozes: {},
    notifications: state.notifications.filter((n) => n.kind !== 'task'),
  };
}
