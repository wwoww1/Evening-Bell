import test from 'node:test';
import assert from 'node:assert/strict';
import { initialState, at, MINUTE } from '../lib/model.ts';
import {
  elapsed,
  pauseTimer,
  resumeTimer,
  settleTimer,
  startPomodoro,
} from '../lib/timer.ts';
import { sessionsOnDate, updateSessionNote } from '../lib/sessions.ts';
import { restoreState } from '../lib/persistence.ts';
import { parseBackup } from '../lib/backup.ts';

const date = '2026-09-18';

test('a standalone Pomodoro starts without tasks or check-in at any hour', () => {
  const state = initialState();
  state.checkin = { ...state.checkin, date, start: '20:00', end: '22:30' };
  for (const hour of ['08:00', '20:00', '23:30']) {
    const started = startPomodoro(state, at(date, hour));
    assert.equal(started.timer.taskId, '');
    assert.equal(started.timer.startedAt, at(date, hour));
    assert.equal(started.timer.durationMs, 25 * MINUTE);
    assert.equal(started.plan, null);
    assert.deepEqual(started.tasks, []);
    assert.deepEqual(started.checkin, state.checkin);
  }
});

test('plans, commitments and the end of a planning window do not constrain a free timer', () => {
  const state = initialState();
  state.settings.focusMinutes = 40;
  state.plan = {
    id: 'plan',
    date,
    checkin: { ...state.checkin, date, start: '20:00', end: '20:10' },
    blocks: [
      {
        id: 'reserved',
        type: 'commitment',
        locked: true,
        done: false,
        start: at(date, '20:00'),
        end: at(date, '20:10'),
        title: 'Reserved',
        reason: '',
      },
    ],
    notes: [],
    generatedAt: at(date, '19:00'),
  };
  const started = startPomodoro(state, at(date, '20:05'));
  assert.equal(started.timer.durationMs, 40 * MINUTE);
  assert.deepEqual(started.plan, state.plan);
  assert.throws(() => startPomodoro(started), /已有计时/);
});

test('ending early saves exact timing once and permits another timer immediately', () => {
  const start = at(date, '09:00');
  const state = startPomodoro(initialState(), start);
  const saved = settleTimer(state, start + 35000);
  assert.equal(saved.timer, null);
  assert.equal(saved.sessions[0].title, '自由专注');
  assert.equal(saved.sessions[0].startedAt, start);
  assert.equal(saved.sessions[0].endedAt, start + 35000);
  assert.equal(saved.sessions[0].durationMs, 35000);
  assert.equal(settleTimer(saved, start + 40000).sessions.length, 1);
  assert.equal(startPomodoro(saved, start + 40000).sessions.length, 1);
});

test('refresh, pause and late completion preserve only active focus time', () => {
  const start = at(date, '10:00');
  let state = startPomodoro(initialState(), start);
  state.timer = pauseTimer(state.timer, start + 5 * MINUTE);
  state = restoreState(JSON.stringify(state));
  assert.equal(elapsed(state.timer, start + 10 * MINUTE), 5 * MINUTE);
  state.timer = resumeTimer(state.timer, start + 10 * MINUTE);
  state = restoreState(JSON.stringify(state));
  state = settleTimer(state, start + 60 * MINUTE);
  assert.equal(state.sessions[0].durationMs, 25 * MINUTE);
  assert.equal(state.sessions[0].endedAt, start + 30 * MINUTE);
  assert.equal(state.timer, null);
});

test('ending while paused excludes the pause and retains the actual ending time', () => {
  const start = at(date, '10:00');
  let state = startPomodoro(initialState(), start);
  state.timer = pauseTimer(state.timer, start + 3 * MINUTE);
  state = settleTimer(state, start + 8 * MINUTE);
  assert.equal(state.sessions[0].durationMs, 3 * MINUTE);
  assert.equal(state.sessions[0].endedAt, start + 8 * MINUTE);
});

test('daily records use local start dates and show newest sessions first, including overnight sessions', () => {
  let state = initialState();
  for (const start of [
    at(date, '08:00'),
    at(date, '23:50'),
    at('2026-09-19', '12:00'),
  ])
    state = settleTimer(startPomodoro(state, start), start + 25 * MINUTE);
  const snapshot = JSON.stringify(state.sessions);
  const day = sessionsOnDate(state.sessions, date);
  assert.equal(day.length, 2);
  assert.equal(day[0].startedAt, at(date, '23:50'));
  assert.equal(day[0].endedAt, at('2026-09-19', '00:15'));
  assert.equal(sessionsOnDate(state.sessions, '2026-09-19').length, 1);
  assert.deepEqual(sessionsOnDate(state.sessions, '2026-09-17'), []);
  assert.equal(JSON.stringify(state.sessions), snapshot);
});

test('notes on new and legacy records can be added, edited, cleared and backed up', () => {
  const start = at(date, '08:00');
  const original = settleTimer(
    startPomodoro(initialState(), start),
    start + 25 * MINUTE,
  );
  const id = original.sessions[0].id;
  assert.deepEqual(parseBackup(JSON.stringify(original)), original);
  let state = updateSessionNote(original, id, '读书\n整理笔记', '');
  state = parseBackup(JSON.stringify(state));
  assert.equal(state.sessions[0].note, '读书\n整理笔记');
  assert.equal(state.sessions[0].durationMs, original.sessions[0].durationMs);
  state = updateSessionNote(state, id, '完成第二章', state.sessions[0].note);
  assert.equal(
    restoreState(JSON.stringify(state)).sessions[0].note,
    '完成第二章',
  );
  state = updateSessionNote(state, id, '', '完成第二章');
  assert.equal(state.sessions[0].note, '');
  assert.equal(original.sessions[0].note, undefined);
});

test('stale notes and invalid imports fail without replacing saved data', () => {
  const start = at(date, '08:00');
  const original = settleTimer(
    startPomodoro(initialState(), start),
    start + MINUTE,
  );
  const id = original.sessions[0].id;
  const state = updateSessionNote(original, id, 'Another window', '');
  assert.throws(
    () => updateSessionNote(state, id, 'Overwrite', ''),
    /其他窗口/,
  );
  assert.throws(
    () => updateSessionNote(state, 'missing', 'Note', ''),
    /其他窗口/,
  );
  assert.throws(
    () => updateSessionNote(original, id, 'x'.repeat(2001), ''),
    /2000/,
  );
  const invalid = structuredClone(original);
  invalid.sessions[0].note = {};
  assert.throws(() => parseBackup(JSON.stringify(invalid)), /备份数据格式无效/);
});

test('demo sessions stay marked and excluded from real daily totals', () => {
  const state = initialState();
  state.settings.demoTimer = true;
  const start = at(date, '09:00');
  const saved = settleTimer(startPomodoro(state, start), start + 20000);
  assert.equal(saved.sessions[0].demo, true);
  assert.equal(saved.sessions[0].durationMs, 10000);
  assert.equal(
    sessionsOnDate(saved.sessions, date).filter((s) => !s.demo).length,
    0,
  );
});
