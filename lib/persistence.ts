import { initialState } from './model.ts';
import type { AppState } from './model.ts';

export function restoreState(raw: string): AppState {
  const parsed = JSON.parse(raw);
  if (
    !parsed ||
    parsed.version !== 1 ||
    !Array.isArray(parsed.tasks) ||
    !Array.isArray(parsed.goals) ||
    !parsed.settings ||
    ['habits', 'notifications', 'feedbackEntries'].some(
      (key) => parsed[key] !== undefined && !Array.isArray(parsed[key]),
    )
  )
    throw new Error('保存的数据格式无法识别，请先导出备份。');
  const defaults = initialState();
  return {
    ...defaults,
    ...parsed,
    settings: { ...defaults.settings, ...parsed.settings },
    reminderSnoozes: parsed.reminderSnoozes || {},
  };
}
