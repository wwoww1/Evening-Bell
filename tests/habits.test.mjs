import test from 'node:test';
import assert from 'node:assert/strict';
import { initialState, at, MINUTE } from '../lib/model.ts';
import {
  materializeHabits,
  tasksForDay,
  habitTaskId,
  saveHabit,
  removeHabit,
  habitBudget,
  dailyHabitTasks,
} from '../lib/habits.ts';
import { generatePlan, validatePlan, capacityRisks } from '../lib/scheduler.ts';
import {
  acceptDailyPlan,
  planningCandidates,
  validatePlanningAdvice,
  habitScheduleSummary,
} from '../lib/planning.ts';
import {
  recordProgress,
  startFocus,
  currentPlan,
  completeHabitForDay,
} from '../lib/actions.ts';
import { startPomodoro } from '../lib/timer.ts';
import {
  addNotification,
  syncDeadlines,
  reminderRelevant,
} from '../lib/notifications.ts';
import { goalsOnDate, deadlineStatus } from '../lib/calendar.ts';
import { restoreState } from '../lib/persistence.ts';

const date = '2026-09-05',
  now = at(date, '20:00');
function fixture() {
  const s = initialState();
  s.checkin = {
    date,
    start: '20:00',
    end: '22:00',
    nextDay: false,
    energy: 'medium',
    mood: '',
    commitments: [],
  };
  s.settings = {
    ...s.settings,
    preparation: 0,
    buffer: 0,
    breakMinutes: 0,
    longBreakMinutes: 0,
    futureKnown: true,
    usualDays: [],
  };
  s.habits = [
    {
      id: 'exercise',
      title: '锻炼',
      minutes: 30,
      energy: 'medium',
      priority: 3,
      days: [0, 1, 2, 3, 4, 5, 6],
      enabled: true,
      splittable: false,
    },
  ];
  return s;
}
const todayId = habitTaskId('exercise', date);

test('习惯未能排入或只排入一部分时，预览和采纳摘要不会误报已全部安排', () => {
  const s = fixture();
  const short = { ...s.checkin, end: '20:15' };
  const omitted = generatePlan(s, short, now);
  assert.deepEqual(habitScheduleSummary(s, omitted), {
    total: 1,
    scheduled: 0,
    remainingTitles: ['锻炼'],
  });
  s.habits[0].splittable = true;
  const partial = generatePlan(s, short, now);
  assert.ok(partial.blocks.some((block) => block.type === 'focus'));
  assert.deepEqual(habitScheduleSummary(s, partial), {
    total: 1,
    scheduled: 0,
    remainingTitles: ['锻炼'],
  });
  const full = generatePlan(s, s.checkin, now);
  assert.deepEqual(habitScheduleSummary(s, full), {
    total: 1,
    scheduled: 1,
    remainingTitles: [],
  });
});

test('新建习惯无需报到或采纳计划即可出现在 Today，读取不会写入任务', () => {
  const s = fixture();
  const running = { ...s.habits[0], id: 'running', title: '跑步' };
  const saved = saveHabit({ ...s, habits: [] }, running);
  const snapshot = JSON.stringify(saved);
  assert.equal(saved.plan, null);
  assert.equal(saved.tasks.length, 0);
  assert.deepEqual(
    dailyHabitTasks(saved, date).map((task) => task.title),
    ['跑步'],
  );
  assert.equal(
    dailyHabitTasks(saved, date)[0].id,
    habitTaskId('running', date),
  );
  assert.equal(JSON.stringify(saved), snapshot);
});

test('已有计划后新增习惯立即可见，原时间块和锁定安排不被重排', () => {
  const s = fixture();
  const planned = acceptDailyPlan(s, generatePlan(s, s.checkin, now));
  planned.plan.blocks[0].locked = true;
  const saved = saveHabit(planned, {
    ...s.habits[0],
    id: 'running',
    title: '跑步',
  });
  assert.deepEqual(saved.plan.blocks, planned.plan.blocks);
  assert.deepEqual(
    dailyHabitTasks(saved, date).map((task) => task.title),
    ['锻炼', '跑步'],
  );
  assert.equal(
    dailyHabitTasks(saved, date).filter((task) => task.id === todayId).length,
    1,
  );
  const replanned = acceptDailyPlan(
    saved,
    generatePlan(saved, saved.checkin, now),
  );
  assert.equal(
    replanned.plan.blocks.filter(
      (block) => block.taskId === habitTaskId('running', date),
    ).length,
    1,
  );
  assert.equal(dailyHabitTasks(replanned, date).length, 2);
});

test('Today 清单遵守重复日期、暂停、重新启用和删除，并立即反映编辑', () => {
  const s = fixture();
  const edited = saveHabit(s, {
    ...s.habits[0],
    title: '跑步',
    minutes: 45,
    days: [6],
  });
  assert.equal(dailyHabitTasks(edited, date)[0].remaining, 45);
  assert.equal(dailyHabitTasks(edited, date)[0].title, '跑步');
  assert.deepEqual(dailyHabitTasks(edited, '2026-09-06'), []);
  const paused = saveHabit(edited, { ...edited.habits[0], enabled: false });
  assert.deepEqual(dailyHabitTasks(paused, date), []);
  const enabled = saveHabit(paused, { ...paused.habits[0], enabled: true });
  assert.equal(dailyHabitTasks(enabled, date).length, 1);
  assert.deepEqual(dailyHabitTasks(removeHabit(enabled, 'exercise'), date), []);
});

test('Today 未排程习惯可直接打卡，刷新后保留且第二天恢复待办', () => {
  const s = fixture();
  const done = completeHabitForDay(s, 'exercise', date, now);
  const restored = restoreState(JSON.stringify(done));
  assert.equal(restored.plan, null);
  assert.equal(restored.sessions.length, 0);
  assert.equal(dailyHabitTasks(restored, date)[0].status, 'done');
  assert.equal(completeHabitForDay(restored, 'exercise', date, now), restored);
  const nextDay = dailyHabitTasks(restored, '2026-09-06');
  assert.equal(nextDay[0].status, 'todo');
  assert.equal(nextDay[0].remaining, 30);
  assert.equal(restored.tasks.length, 1);
});

test('计时中新增习惯仍显示在 Today，打卡不会误结束当前番茄钟', () => {
  const s = fixture();
  const running = startPomodoro(s, now);
  const saved = saveHabit(running, {
    ...s.habits[0],
    id: 'reading',
    title: '阅读',
  });
  assert.equal(dailyHabitTasks(saved, date).length, 2);
  assert.deepEqual(saved.timer, running.timer);
  assert.throws(() => completeHabitForDay(saved, 'reading', date, now), /计时/);
  assert.deepEqual(saved.sessions, []);
});

test('旧 Today 页面不能打卡已暂停、已删除或已过期的习惯', () => {
  const s = materializeHabits(fixture(), date);
  for (const changed of [
    saveHabit(s, { ...s.habits[0], enabled: false }),
    removeHabit(s, 'exercise'),
  ])
    assert.throws(
      () => completeHabitForDay(changed, 'exercise', date, now),
      /今天/,
    );
  assert.throws(
    () => completeHabitForDay(s, 'exercise', date, at('2026-09-06', '08:00')),
    /今天/,
  );
});

test('跨午夜活动计划的 Today 沿用原日期习惯，计划结束后显示新一天', () => {
  const s = fixture();
  s.checkin = { ...s.checkin, start: '23:00', end: '01:00', nextDay: true };
  const daily = acceptDailyPlan(
    s,
    generatePlan(s, s.checkin, at(date, '23:00')),
  );
  const midnight = at('2026-09-06', '00:10');
  const activeDate = currentPlan(daily, midnight).date;
  assert.equal(dailyHabitTasks(daily, activeDate)[0].id, todayId);
  const done = completeHabitForDay(daily, 'exercise', activeDate, midnight);
  assert.equal(dailyHabitTasks(done, activeDate)[0].status, 'done');
  assert.equal(currentPlan(done, at('2026-09-06', '08:00')), null);
  assert.equal(dailyHabitTasks(done, '2026-09-06')[0].status, 'todo');
});
test('习惯预览不写入状态；多次预览及采纳使用同一天唯一实例', () => {
  const s = fixture(),
    p = generatePlan(s, s.checkin, now),
    p2 = generatePlan(s, s.checkin, now);
  assert.equal(s.tasks.length, 0);
  assert.equal(p.blocks.find((b) => b.type === 'focus').taskId, todayId);
  assert.equal(p2.habitTasks[0].id, todayId);
  const accepted = acceptDailyPlan(s, p);
  assert.equal(accepted.tasks.length, 1);
  assert.deepEqual(validatePlan(p, accepted.tasks), []);
  assert.equal(materializeHabits(accepted, date).tasks.length, 1);
});
test('完成只影响当天；第二天按默认时长生成且没有旧习惯积压', () => {
  const s = fixture(),
    daily = materializeHabits(s, date),
    done = recordProgress(daily, todayId, true, 0, false, false, now);
  assert.equal(
    generatePlan(done, s.checkin, now).blocks.filter((b) => b.type === 'focus')
      .length,
    0,
  );
  const next = materializeHabits(done, '2026-09-06');
  assert.equal(tasksForDay(next, '2026-09-06').length, 1);
  assert.equal(tasksForDay(next, '2026-09-06')[0].remaining, 30);
  assert.equal(next.tasks.find((t) => t.id === todayId).status, 'done');
  const unfinished = materializeHabits(daily, '2026-09-06');
  assert.equal(tasksForDay(unfinished, '2026-09-06').length, 1);
});
test('部分进度与今天停止只影响当日，次日重新安排完整习惯', () => {
  const s = fixture(),
    daily = materializeHabits(s, date),
    partial = recordProgress(daily, todayId, false, 10, false, true, now);
  assert.equal(
    generatePlan(partial, s.checkin, now).blocks.filter(
      (b) => b.type === 'focus',
    ).length,
    0,
  );
  assert.equal(habitBudget(partial, date), 0);
  const nextCheckin = { ...s.checkin, date: '2026-09-06' };
  assert.equal(
    generatePlan(partial, nextCheckin, at(nextCheckin.date, '20:00'))
      .habitTasks[0].remaining,
    30,
  );
});
test('指定重复日期与暂停设置控制是否进入排程', () => {
  const s = fixture();
  s.habits[0].days = [1];
  assert.equal(generatePlan(s, s.checkin, now).habitTasks.length, 0);
  s.habits[0].days = [6];
  s.habits[0].enabled = false;
  assert.equal(generatePlan(s, s.checkin, now).habitTasks.length, 0);
});
test('只有习惯而没有目标时也能生成今晚安排', () => {
  const s = fixture(),
    p = generatePlan(s, s.checkin, now);
  assert.equal(p.blocks.filter((b) => b.type === 'focus').length, 1);
  assert.equal(p.blocks.find((b) => b.type === 'focus').end - now, 30 * MINUTE);
  assert.equal(p.habitTasks[0].goalId, '');
  assert.deepEqual(capacityRisks(s, s.checkin, now), []);
});
test('采纳旧预览不会恢复已经完成、暂停、删除或修改的习惯', () => {
  const s = fixture(),
    p = generatePlan(s, s.checkin, now),
    daily = materializeHabits(s, date);
  for (const changed of [
    recordProgress(daily, todayId, true, 0, false, false, now),
    saveHabit(daily, { ...s.habits[0], enabled: false }),
    removeHabit(daily, 'exercise'),
    saveHabit(daily, { ...s.habits[0], priority: 1 }),
  ])
    assert.throws(() => acceptDailyPlan(changed, p), /习惯/);
});
test('预览后在另一标签页今天延后的任务不能被采纳恢复', () => {
  const s = fixture(),
    p = generatePlan(s, s.checkin, now);
  s.skipped = { date, ids: [todayId] };
  assert.throws(() => acceptDailyPlan(s, p), /延后/);
});
test('暂停或删除移除未来习惯块，保留过去的完成与专注记录', () => {
  const s = fixture();
  let daily = acceptDailyPlan(s, generatePlan(s, s.checkin, now));
  const block = daily.plan.blocks.find((b) => b.type === 'focus');
  daily.sessions = [
    {
      id: 'session',
      taskId: todayId,
      title: '锻炼',
      startedAt: now,
      endedAt: now + MINUTE,
      durationMs: MINUTE,
      demo: false,
    },
  ];
  const paused = saveHabit(daily, { ...s.habits[0], enabled: false });
  assert.equal(
    paused.plan.blocks.some((b) => b.id === block.id),
    false,
  );
  assert.equal(paused.sessions.length, 1);
  daily = recordProgress(daily, todayId, true, 0, false, false, now);
  const removed = removeHabit(daily, 'exercise');
  assert.equal(removed.tasks[0].status, 'done');
  assert.equal(removed.sessions.length, 1);
});
test('习惯正在计时时拒绝修改或删除，旧日期实例不能启动', () => {
  const s = fixture(),
    daily = materializeHabits(s, date),
    running = startFocus(daily, todayId, undefined, now);
  assert.throws(() => saveHabit(running, s.habits[0]), /结算/);
  assert.throws(() => removeHabit(running, 'exercise'), /结算/);
  assert.throws(
    () => startFocus(daily, todayId, undefined, at('2026-09-06', '20:00')),
    /今天/,
  );
});
test('午夜后重排沿用前一晚习惯实例与剩余进度', () => {
  const s = fixture();
  s.checkin = { ...s.checkin, start: '23:00', end: '01:00', nextDay: true };
  const start = at(date, '23:00');
  const daily = acceptDailyPlan(s, generatePlan(s, s.checkin, start));
  daily.tasks[0] = { ...daily.tasks[0], status: 'doing', remaining: 15 };
  const midnight = at('2026-09-06', '00:10');
  const p = generatePlan(daily, currentPlan(daily, midnight).checkin, midnight);
  assert.equal(p.date, date);
  assert.equal(p.habitTasks.length, 1);
  assert.equal(p.habitTasks[0].id, todayId);
  assert.equal(p.habitTasks[0].remaining, 15);
  assert.ok(p.blocks.every((b) => b.start >= midnight));
});
test('期限风险从目标共享容量扣习惯预算，不把习惯变成截止需求', () => {
  const s = fixture();
  s.checkin.end = '21:00';
  s.goals = [
    {
      id: 'g',
      title: '目标',
      outcome: '完成',
      deadline: date + 'T21:00',
      priority: 2,
      color: '#fff',
    },
  ];
  s.tasks = [
    {
      id: 't',
      goalId: 'g',
      title: '任务',
      outcome: '完成',
      estimate: 60,
      remaining: 60,
      energy: 'medium',
      splittable: true,
      dependsOn: [],
      fixedStart: '',
      status: 'todo',
    },
  ];
  const risk = capacityRisks(s, s.checkin, now)[0];
  assert.equal(risk.demand, 60);
  assert.equal(risk.capacity, 30);
  assert.equal(risk.gap, 30);
  const done = recordProgress(
    materializeHabits(s, date),
    todayId,
    true,
    0,
    false,
    false,
    now,
  );
  assert.equal(capacityRisks(done, s.checkin, now)[0].capacity, 60);
});
test('模型上下文含无 deadline 的每日习惯，拒绝虚构、遗漏和重复 id', () => {
  const s = fixture(),
    candidates = planningCandidates(s, s.checkin);
  assert.equal(candidates[0].kind, 'habit');
  assert.equal(candidates[0].deadline, null);
  for (const ids of [[], ['madeup'], [todayId, todayId]])
    assert.throws(
      () => validatePlanningAdvice({ orderedTaskIds: ids }, [todayId]),
      /不一致/,
    );
  const advice = validatePlanningAdvice(
    { orderedTaskIds: [todayId], reasons: { [todayId]: '留出锻炼时间' } },
    [todayId],
  );
  const p = generatePlan(s, s.checkin, now, advice);
  assert.equal(p.planningMode, 'ai');
  assert.match(p.blocks.find((b) => b.type === 'focus').reason, /留出锻炼时间/);
});
test('日历按本地截止日期聚合多个目标，取消目标不显示逾期', () => {
  const s = fixture();
  s.goals = [
    { id: 'a', title: 'A', deadline: date + 'T22:00' },
    { id: 'b', title: 'B', deadline: date + 'T20:00' },
  ];
  s.tasks = [{ id: 't', goalId: 'a', status: 'cancelled' }];
  assert.deepEqual(
    goalsOnDate(s, date).map((g) => g.id),
    ['b', 'a'],
  );
  assert.equal(
    deadlineStatus(s, s.goals[0], now + 4 * 60 * MINUTE),
    'cancelled',
  );
  assert.deepEqual(goalsOnDate(s, '2026-09-06'), []);
});
test('截止通知去重并保持已读，修改 deadline 或完成目标会清理旧提醒', () => {
  let s = fixture();
  s.goals = [{ id: 'g', title: '目标', deadline: date + 'T21:00' }];
  s.tasks = [{ id: 't', goalId: 'g', status: 'todo' }];
  s = syncDeadlines(s, now);
  assert.equal(s.notifications.length, 1);
  s.notifications[0].read = true;
  assert.equal(syncDeadlines(s, now + 1000), s);
  const changed = syncDeadlines(
    { ...s, goals: [{ ...s.goals[0], deadline: '2026-10-01T21:00' }] },
    now,
  );
  assert.equal(changed.notifications.length, 0);
  assert.equal(
    syncDeadlines({ ...s, tasks: [{ ...s.tasks[0], status: 'done' }] }, now)
      .notifications.length,
    0,
  );
});
test('计时通知幂等；相同计划中已经删除或跳过的块不再提醒', () => {
  const s = fixture();
  let daily = acceptDailyPlan(s, generatePlan(s, s.checkin, now));
  const item = {
    id: 'timer:1',
    title: '专注结束',
    message: '确认进度',
    createdAt: now,
    kind: 'timer',
  };
  daily = addNotification(daily, item);
  assert.equal(addNotification(daily, item), daily);
  const b = daily.plan.blocks.find((b) => b.type === 'focus');
  assert.equal(reminderRelevant(daily, daily.plan.id, b.id, now), true);
  assert.equal(
    reminderRelevant(
      { ...daily, skipped: { date, ids: [todayId] } },
      daily.plan.id,
      b.id,
      now,
    ),
    false,
  );
  assert.equal(
    reminderRelevant(
      { ...daily, plan: { ...daily.plan, blocks: [] } },
      daily.plan.id,
      b.id,
      now,
    ),
    false,
  );
});
test('旧版数据迁移补齐新字段，原目标、计时和记录原样保留', () => {
  const s = fixture();
  delete s.habits;
  delete s.notifications;
  delete s.feedbackEntries;
  s.sessions = [{ id: 'keep' }];
  const restored = restoreState(JSON.stringify(s));
  assert.deepEqual(restored.habits, []);
  assert.deepEqual(restored.notifications, []);
  assert.deepEqual(restored.feedbackEntries, []);
  assert.deepEqual(restored.sessions, s.sessions);
  assert.deepEqual(restored.settings, s.settings);
  assert.throws(
    () => restoreState(JSON.stringify({ ...s, habits: null })),
    /格式/,
  );
});
