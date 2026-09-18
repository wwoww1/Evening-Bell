import { localDate } from './model.ts';
import type { AppState, Session } from './model.ts';
import { EditConflictError } from './editing.ts';

// Overnight sessions belong to the local calendar day on which they started.
export function sessionsOnDate(sessions: Session[], date: string): Session[] {
  return sessions
    .filter((session) => localDate(new Date(session.startedAt)) === date)
    .sort((a, b) => b.startedAt - a.startedAt);
}

export function updateSessionNote(
  state: AppState,
  id: string,
  note: string,
  previousNote: string,
): AppState {
  const session = state.sessions.find((item) => item.id === id);
  if (!session || (session.note || '') !== previousNote)
    throw new EditConflictError(
      '这条记录已在其他窗口更新或删除，请重新打开记录后编辑。',
    );
  if (note.length > 2000) throw new Error('备注最多 2000 字。');
  return {
    ...state,
    sessions: state.sessions.map((item) =>
      item.id === id ? { ...item, note: note.trim() } : item,
    ),
  };
}
