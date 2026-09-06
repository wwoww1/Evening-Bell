import { activeTask } from './model.ts';
import type { AppState, Habit, Task } from './model.ts';

export function isHabitDay(habit: Habit, date: string): boolean {
  return (
    habit.enabled && habit.days.includes(new Date(`${date}T12:00:00`).getDay())
  );
}
export function validateHabit(habit: Habit): void {
  if (!habit.title.trim()) throw new Error('请填写习惯名称。');
  if (
    !Number.isInteger(habit.minutes) ||
    habit.minutes < 1 ||
    habit.minutes > 180
  )
    throw new Error('每次习惯时长请填写 1–180 分钟。');
  if (
    !habit.days.length ||
    habit.days.some((d) => !Number.isInteger(d) || d < 0 || d > 6)
  )
    throw new Error('至少选择一天有效的重复日期。');
  if (
    !['low', 'medium', 'high'].includes(habit.energy) ||
    ![1, 2, 3].includes(habit.priority)
  )
    throw new Error('请检查精力和优先级设置。');
}
export const habitTaskId = (habitId: string, date: string) =>
  `habit:${habitId}:${date}`;
export const habitSignature = (state: AppState, date: string) =>
  JSON.stringify(
    state.habits
      .filter((h) => isHabitDay(h, date))
      .sort((a, b) => a.id.localeCompare(b.id)),
  );
export function materializeHabits(state: AppState, date: string): AppState {
  const tasks = [...state.tasks];
  const ids = new Set(tasks.map((t) => t.id));
  for (const h of state.habits || []) {
    if (!isHabitDay(h, date)) continue;
    validateHabit(h);
    const id = habitTaskId(h.id, date);
    if (ids.has(id)) continue;
    tasks.push({
      id,
      habitId: h.id,
      habitDate: date,
      goalId: '',
      title: h.title,
      outcome: `完成今天的${h.title}`,
      estimate: h.minutes,
      remaining: h.minutes,
      energy: h.energy,
      splittable: h.splittable,
      dependsOn: [],
      fixedStart: '',
      status: 'todo',
    });
    ids.add(id);
  }
  return { ...state, tasks };
}
export function tasksForDay(state: AppState, date: string): Task[] {
  return state.tasks.filter(
    (t) =>
      !t.habitId ||
      (t.habitDate === date &&
        state.habits.some((h) => h.id === t.habitId && isHabitDay(h, date))),
  );
}
export function habitBudget(state: AppState, date: string): number {
  return (state.habits || [])
    .filter((h) => isHabitDay(h, date))
    .reduce((total, h) => {
      const id = habitTaskId(h.id, date),
        task = state.tasks.find((t) => t.id === id);
      if (
        (state.skipped.date === date && state.skipped.ids.includes(id)) ||
        (task && !activeTask(task))
      )
        return total;
      return total + (task?.remaining ?? h.minutes);
    }, 0);
}
export function taskOwner(state: AppState, task?: Task): string {
  return task?.habitId
    ? '每日习惯'
    : state.goals.find((g) => g.id === task?.goalId)?.title || '个人任务';
}
export function saveHabit(state: AppState, habit: Habit): AppState {
  validateHabit(habit);
  if (
    state.timer &&
    state.tasks.some(
      (t) => t.id === state.timer?.taskId && t.habitId === habit.id,
    )
  )
    throw new Error('请先结算这个习惯的当前计时。');
  const tasks = state.tasks.map((t) =>
    t.habitId === habit.id && activeTask(t)
      ? {
          ...t,
          title: habit.title,
          energy: habit.energy,
          splittable: habit.splittable,
          estimate: habit.minutes,
          remaining: t.status === 'todo' ? habit.minutes : t.remaining,
        }
      : t,
  );
  const ids = new Set(
    tasks
      .filter((t) => t.habitId === habit.id && activeTask(t))
      .map((t) => t.id),
  );
  return {
    ...state,
    habits: [...state.habits.filter((h) => h.id !== habit.id), habit],
    tasks,
    plan: state.plan
      ? {
          ...state.plan,
          blocks: state.plan.blocks.filter(
            (b) => b.done || !b.taskId || !ids.has(b.taskId),
          ),
          notes: [
            ...state.plan.notes,
            '习惯设置已更新，下次排程会使用最新设置。',
          ],
        }
      : null,
    previousPlan: null,
    previousSkipped: null,
  };
}
export function removeHabit(state: AppState, id: string): AppState {
  if (
    state.timer &&
    state.tasks.some((t) => t.id === state.timer?.taskId && t.habitId === id)
  )
    throw new Error('请先结算这个习惯的当前计时。');
  const ids = new Set(
    state.tasks.filter((t) => t.habitId === id).map((t) => t.id),
  );
  return {
    ...state,
    habits: state.habits.filter((h) => h.id !== id),
    tasks: state.tasks.map((t) =>
      t.habitId === id && activeTask(t) ? { ...t, status: 'cancelled' } : t,
    ),
    plan: state.plan
      ? {
          ...state.plan,
          blocks: state.plan.blocks.filter(
            (b) => b.done || !b.taskId || !ids.has(b.taskId),
          ),
        }
      : null,
    previousPlan: null,
    previousSkipped: null,
  };
}
