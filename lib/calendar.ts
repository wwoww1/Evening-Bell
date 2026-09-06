import { activeTask, localDate } from './model.ts';
import type { AppState, Goal } from './model.ts';
export function deadlineGoals(state: AppState): Goal[] {
  return state.goals.filter(
    (g) => g.deadline && Number.isFinite(new Date(g.deadline).getTime()),
  );
}
export function goalsOnDate(state: AppState, date: string): Goal[] {
  return deadlineGoals(state)
    .filter((g) => localDate(new Date(g.deadline)) === date)
    .sort((a, b) => a.deadline.localeCompare(b.deadline));
}
export function deadlineStatus(
  state: AppState,
  goal: Goal,
  now: number,
): 'done' | 'cancelled' | 'overdue' | 'upcoming' {
  const tasks = state.tasks.filter(
    (t) => t.goalId === goal.id && t.status !== 'cancelled',
  );
  if (!tasks.length && state.tasks.some((t) => t.goalId === goal.id))
    return 'cancelled';
  if (tasks.length && tasks.every((t) => !activeTask(t))) return 'done';
  return new Date(goal.deadline).getTime() < now ? 'overdue' : 'upcoming';
}
