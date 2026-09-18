import { activeTask, localDate, MINUTE } from './model.ts';
import type { AppState, Plan } from './model.ts';
import { clockInWindow, windowFor } from './scheduler.ts';
import { createTimer, settleTimer } from './timer.ts';
import { isHabitDay, materializeHabits, habitTaskId } from './habits.ts';

export function currentPlan(state: AppState, now = Date.now()): Plan | null {
  const p = state.plan;
  return p &&
    (p.date === localDate(new Date(now)) || windowFor(p.checkin)[1] > now)
    ? p
    : null;
}
export function completeHabitForDay(
  state: AppState,
  habitId: string,
  date: string,
  now = Date.now(),
): AppState {
  const habit = state.habits.find((item) => item.id === habitId);
  const currentDate = currentPlan(state, now)?.date || localDate(new Date(now));
  if (date !== currentDate || !habit || !isHabitDay(habit, date))
    throw new Error('这个习惯未在今天启用，请使用今天的习惯记录。');
  const taskId = habitTaskId(habitId, date);
  if (state.tasks.find((task) => task.id === taskId)?.status === 'done')
    return state;
  if (state.timer) throw new Error('请先结束当前计时。');
  return recordProgress(
    materializeHabits(state, date),
    taskId,
    true,
    0,
    false,
    false,
    now,
  );
}
export function startFocus(
  state: AppState,
  taskId: string,
  blockId?: string,
  now = Date.now(),
): AppState {
  const t = state.tasks.find((x) => x.id === taskId);
  if (!t || !activeTask(t)) throw new Error('这个任务已经完成、取消或不存在。');
  if (
    t.dependsOn.some(
      (id) => state.tasks.find((x) => x.id === id)?.status !== 'done',
    )
  )
    throw new Error('请先确认前置任务已完成，再开始这个任务。');
  if (state.timer) throw new Error('已有计时，请先结算。');
  const plan = currentPlan(state, now),
    checkin = plan?.checkin || {
      ...state.checkin,
      date: localDate(new Date(now)),
    };
  const [begin, end] = windowFor(checkin),
    demo = state.settings.demoTimer;
  if (
    t.habitId &&
    (t.habitDate !== checkin.date ||
      !state.habits.some(
        (h) => h.id === t.habitId && isHabitDay(h, checkin.date),
      ))
  )
    throw new Error('这个习惯未在今天启用，请使用今天的习惯记录。');
  const block = blockId
    ? plan?.blocks.find((b) => b.id === blockId)
    : undefined;
  if (blockId && !block)
    throw new Error('这个时间块已经变化，请使用最新安排。');
  if (!demo && now < begin)
    throw new Error(
      '还未到你设置的开始时间。可以在报到中修改为现在，再采纳安排。',
    );
  if (!demo && t.fixedStart && now < clockInWindow(checkin, t.fixedStart))
    throw new Error('还没到该任务的固定开始时间。');
  if (!demo && block && now < block.start)
    throw new Error('还没到这段专注的开始时间。如需提前，请先调整今日安排。');
  let stop = end;
  if (block) {
    if (block.end <= now && !demo)
      throw new Error('这个时间块已经过去，请重新安排。');
    stop = Math.min(stop, block.end);
  }
  for (const reserved of plan?.blocks || []) {
    if (reserved.id === block?.id || reserved.done) continue;
    const hard =
      reserved.locked ||
      ['commitment', 'buffer', 'preparation', 'break'].includes(reserved.type);
    if (hard && reserved.start <= now && reserved.end > now && !demo)
      throw new Error('现在是预留事务或休息时段，请先调整安排。');
    if (hard && reserved.start > now) stop = Math.min(stop, reserved.start);
  }
  const available = (stop - now) / MINUTE;
  if (available < 1 && !demo)
    throw new Error('今天剩余时间不足一分钟，可以休息或重新安排。');
  const minutes = demo
    ? state.settings.focusMinutes
    : Math.min(
        t.remaining,
        t.splittable ? state.settings.focusMinutes : t.remaining,
        available,
      );
  if (!t.splittable && minutes < t.remaining && !demo)
    throw new Error('该任务不可拆分，当前连续时间不足。');
  return {
    ...state,
    tasks: state.tasks.map((x) =>
      x.id === t.id ? { ...x, status: 'doing' } : x,
    ),
    timer: createTimer(t.id, minutes, 'focus', block?.id, demo, now),
  };
}
export function recordProgress(
  state: AppState,
  taskId: string,
  complete: boolean,
  remaining: number,
  rest: boolean,
  stopToday = false,
  now = Date.now(),
): AppState {
  const task = state.tasks.find((t) => t.id === taskId);
  if (!task) throw new Error('任务不存在。');
  const t = state.timer;
  if (t && (t.kind !== 'focus' || t.taskId !== taskId))
    throw new Error('其他任务正在计时，请先结算当前专注再更新此任务。');
  if (!complete && (!Number.isFinite(remaining) || remaining < 1))
    throw new Error('未完成任务的剩余时长至少为 1 分钟。');
  const settled = t ? settleTimer(state, now) : state;
  const cycles = settled.sessions.filter((x) => !x.demo).length;
  let restMinutes =
    cycles > 0 && cycles % 4 === 0
      ? state.settings.longBreakMinutes
      : state.settings.breakMinutes;
  const plan = currentPlan(state, now);
  if (plan) {
    restMinutes = Math.min(
      restMinutes,
      Math.max(0, (windowFor(plan.checkin)[1] - now) / MINUTE),
    );
    const nextReserved = plan.blocks
      .filter(
        (b) =>
          !b.done && (b.locked || b.type === 'commitment') && b.start >= now,
      )
      .sort((a, b) => a.start - b.start)[0];
    if (nextReserved)
      restMinutes = Math.min(restMinutes, (nextReserved.start - now) / MINUTE);
  }
  const blocks = state.plan?.blocks
    .filter(
      (b) =>
        !(
          (complete || stopToday) &&
          b.taskId === taskId &&
          b.id !== t?.blockId &&
          !b.done
        ),
    )
    .map((b) =>
      b.id === t?.blockId ? { ...b, done: true, locked: false } : b,
    );
  const date = plan?.date || localDate(new Date(now));
  return {
    ...settled,
    tasks: state.tasks.map((x) =>
      x.id === taskId
        ? {
            ...x,
            status: complete ? 'done' : 'doing',
            remaining: complete ? 0 : remaining,
          }
        : x,
    ),
    timer:
      rest && !stopToday && restMinutes >= 1
        ? createTimer(
            '',
            restMinutes,
            'break',
            undefined,
            state.settings.demoTimer,
            now,
          )
        : null,
    plan: state.plan
      ? {
          ...state.plan,
          blocks: blocks!,
          notes: [
            ...state.plan.notes,
            complete
              ? '任务进度已更新。'
              : stopToday
                ? '该任务今天先到这里，剩余工作保留到后续。'
                : '还有剩余工作，可重新安排后续任务。',
          ],
        }
      : null,
    skipped: stopToday
      ? {
          date,
          ids: [
            ...new Set([
              ...(state.skipped.date === date ? state.skipped.ids : []),
              taskId,
            ]),
          ],
        }
      : state.skipped,
    previousPlan: null,
    previousSkipped: null,
  };
}
