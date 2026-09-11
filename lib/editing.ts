import type { AppState, Settings } from './model.ts';

/** A rejected stale form is distinct from a failed ANNA storage request. */
export class EditConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EditConflictError';
  }
}

// Strings keep the baseline independent of later draft edits and host refreshes.
export const settingsEditBaseline = (settings: Settings): string =>
  JSON.stringify(settings);

export function assertSettingsUnchanged(
  current: Settings,
  baseline: string,
): void {
  if (settingsEditBaseline(current) !== baseline)
    throw new EditConflictError(
      '偏好已在其他窗口或设备更新，本次修改未保存。草稿仍保留，请记下修改后重新打开设置，查看最新内容。',
    );
}

export function goalEditBaseline(state: AppState, goalId: string): string {
  return JSON.stringify({
    goal: state.goals.find((goal) => goal.id === goalId) ?? null,
    tasks: state.tasks.filter((task) => task.goalId === goalId),
  });
}

export function assertGoalUnchanged(
  current: AppState,
  goalId: string,
  baseline: string,
): void {
  if (goalEditBaseline(current, goalId) !== baseline)
    throw new EditConflictError(
      '此目标或任务已在其他窗口或设备更新或删除，本次修改未保存。草稿仍保留，请记下修改后关闭编辑器，查看最新目标再编辑。',
    );
}
