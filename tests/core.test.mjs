import test from 'node:test';
import assert from 'node:assert/strict';
import { initialState, at, MINUTE } from '../lib/model.ts';
import {
  generatePlan,
  validateTasks,
  validatePlan,
  capacityRisks,
  parseCheckin,
} from '../lib/scheduler.ts';
import {
  createTimer,
  elapsed,
  pauseTimer,
  resumeTimer,
  settleTimer,
} from '../lib/timer.ts';
import { localDecompose, validateDraftTasks } from '../lib/agent.ts';

const date = '2026-09-05',
  now = at(date, '20:00');
function fixture() {
  const s = initialState();
  s.checkin = {
    date,
    start: '21:00',
    end: '22:30',
    nextDay: false,
    energy: 'medium',
    mood: '',
    commitments: [],
  };
  s.goals = [
    {
      id: 'g',
      title: '作品集',
      outcome: '初稿',
      deadline: '2026-09-19T22:30',
      priority: 3,
      color: '#456',
    },
  ];
  s.tasks = [task('a', 25), task('b', 25, ['a']), task('c', 10)];
  return s;
}
function task(id, remaining, dependsOn = []) {
  return {
    id,
    goalId: 'g',
    title: id,
    outcome: '完成',
    estimate: remaining,
    remaining,
    energy: 'medium',
    splittable: true,
    dependsOn,
    fixedStart: '',
    status: 'todo',
  };
}
test('90分钟窗口包含准备、任务、休息和缓冲且不重叠', () => {
  const s = fixture(),
    p = generatePlan(s, s.checkin, now);
  assert.deepEqual(validatePlan(p, s.tasks), []);
  assert.equal(
    p.blocks
      .filter((b) => b.type === 'focus')
      .reduce((n, b) => n + (b.end - b.start) / MINUTE, 0),
    60,
  );
  assert.equal(p.blocks[0].start, at(date, '21:00'));
  assert.equal(p.blocks.at(-1).end, at(date, '22:30'));
  for (let i = 1; i < p.blocks.length; i++)
    assert.ok(p.blocks[i].start >= p.blocks[i - 1].end);
  const a = p.blocks.find((b) => b.taskId === 'a'),
    b = p.blocks.find((b) => b.taskId === 'b');
  assert.ok(a.end <= b.start);
});
test('不可拆分30分钟任务不能塞入两个20分钟空档', () => {
  const s = fixture();
  s.settings.preparation = 0;
  s.settings.buffer = 0;
  s.checkin.start = '21:00';
  s.checkin.end = '22:00';
  s.checkin.commitments = [
    { id: 'x', title: '固定事务', start: '21:20', end: '21:40' },
  ];
  s.tasks = [{ ...task('a', 30), splittable: false }];
  const p = generatePlan(s, s.checkin, now);
  assert.equal(p.blocks.filter((b) => b.type === 'focus').length, 0);
  assert.match(p.notes.join(), /连续时间/);
});
test('固定事务永不被任务覆盖', () => {
  const s = fixture();
  s.checkin.commitments = [
    { id: 'x', title: '家务', start: '21:20', end: '21:40' },
  ];
  const p = generatePlan(s, s.checkin, now);
  const fixed = p.blocks.find((b) => b.type === 'commitment');
  for (const b of p.blocks.filter((b) => b.type === 'focus'))
    assert.ok(b.end <= fixed.start || b.start >= fixed.end);
});
test('锁定块与新结束时间冲突时保持旧计划', () => {
  const s = fixture();
  s.plan = generatePlan(s, s.checkin, now);
  const b = s.plan.blocks.find((b) => b.type === 'focus');
  b.locked = true;
  const before = structuredClone(s.plan);
  assert.throws(
    () => generatePlan(s, { ...s.checkin, end: '21:15' }, now),
    /锁定/,
  );
  assert.deepEqual(s.plan, before);
});
test('重排保留已完成和锁定块', () => {
  const s = fixture();
  s.plan = generatePlan(s, s.checkin, now);
  const a = s.plan.blocks.find((b) => b.taskId === 'a');
  a.done = true;
  s.tasks[0].status = 'done';
  s.tasks[0].remaining = 0;
  const b = s.plan.blocks.find((b) => b.taskId === 'b');
  b.locked = true;
  const p = generatePlan(
    s,
    { ...s.checkin, start: '21:35' },
    at(date, '21:35'),
  );
  assert.deepEqual(
    p.blocks.find((x) => x.id === a.id),
    a,
  );
  assert.deepEqual(
    p.blocks.find((x) => x.id === b.id),
    b,
  );
});
test('同截止日期多个目标共享容量，不重复分配', () => {
  const s = fixture();
  s.goals[0].deadline = date + 'T23:00';
  s.goals.push({ ...s.goals[0], id: 'h', title: '另一目标' });
  s.tasks = [task('a', 90), { ...task('b', 90), goalId: 'h' }];
  s.settings.preparation = 0;
  s.settings.buffer = 0;
  s.settings.breakMinutes = 0;
  s.settings.longBreakMinutes = 0;
  s.checkin = { ...s.checkin, start: '21:00', end: '23:00' };
  const r = capacityRisks(s, s.checkin, now)[0];
  assert.equal(r.demand, 180);
  assert.equal(r.capacity, 120);
  assert.equal(r.gap, 60);
});
test('未来可用时段未知时不输出确定容量', () => {
  const s = fixture();
  const r = capacityRisks(s, s.checkin, now)[0];
  assert.equal(r.capacity, null);
  assert.equal(r.gap, null);
  assert.match(r.label, /未确认/);
});
test('开始等于结束产生休息日，无任务丢失', () => {
  const s = fixture();
  const p = generatePlan(s, { ...s.checkin, end: s.checkin.start }, now);
  assert.equal(p.blocks.length, 0);
  assert.equal(s.tasks.length, 3);
  assert.match(p.notes.join(), /休息/);
});
test('有活动计时不能隐式重排', () => {
  const s = fixture();
  s.timer = createTimer('a', 25);
  assert.throws(() => generatePlan(s, s.checkin, now), /计时/);
});
test('循环、缺失、自我依赖均被拒绝', () => {
  assert.ok(validateTasks([task('a', 25, ['b']), task('b', 25, ['a'])]).length);
  assert.ok(validateTasks([task('a', 25, ['missing'])]).length);
  assert.ok(validateTasks([task('a', 25, ['a'])]).length);
});
test('取消的前置任务不会解锁后续任务', () => {
  const s = fixture();
  s.tasks[0].status = 'cancelled';
  const p = generatePlan(s, s.checkin, now);
  assert.equal(
    p.blocks.some((b) => b.taskId === 'b'),
    false,
  );
});
test('编辑预览后超量、越界、重叠可被拒绝', () => {
  const s = fixture();
  const p = generatePlan(s, s.checkin, now);
  p.blocks.find((b) => b.type === 'focus').end = at(date, '23:00');
  assert.ok(validatePlan(p, s.tasks).length >= 2);
});
test('暂停、继续、刷新按活动时间恢复', () => {
  let t = createTimer('a', 25, 'focus', undefined, false, at(date, '21:00'));
  t = pauseTimer(t, at(date, '21:07') + 30000);
  assert.equal(elapsed(t, at(date, '21:12')), 7.5 * MINUTE);
  t = resumeTimer(t, at(date, '21:12') + 30000);
  assert.equal(elapsed(t, at(date, '21:20')), 15 * MINUTE);
  assert.equal(
    elapsed(JSON.parse(JSON.stringify(t)), at(date, '21:30')),
    25 * MINUTE,
  );
});
test('后台迟到恢复只记设定时长且重复结算幂等', () => {
  let s = fixture();
  s.timer = createTimer('a', 25, 'focus', undefined, false, at(date, '21:00'));
  s = settleTimer(s, at(date, '21:35'));
  assert.equal(s.sessions[0].durationMs, 25 * MINUTE);
  assert.equal(s.tasks[0].status, 'todo');
  s = settleTimer(s, at(date, '21:36'));
  s = settleTimer(s, at(date, '21:37'));
  assert.equal(s.sessions.length, 1);
  assert.equal(s.timer.status, 'awaiting');
});
test('提前结束保留精确秒数，不自动完成任务', () => {
  let s = fixture();
  s.timer = createTimer('a', 25, 'focus', undefined, false, now);
  s = settleTimer(s, now + 35000);
  assert.equal(s.sessions[0].durationMs, 35000);
  assert.equal(s.tasks[0].remaining, 25);
  assert.equal(s.tasks[0].status, 'todo');
});
test('休息计时不增加专注记录', () => {
  let s = fixture();
  s.timer = createTimer('', 5, 'break', undefined, false, now);
  s = settleTimer(s, now + 10 * MINUTE);
  assert.equal(s.sessions.length, 0);
});
test('演示计时明确标记，实际十秒封顶', () => {
  let s = fixture();
  s.timer = createTimer('a', 25, 'focus', undefined, true, now);
  s = settleTimer(s, now + 20000);
  assert.equal(s.sessions[0].durationMs, 10000);
  assert.equal(s.sessions[0].demo, true);
});
test('自然语言晚半小时与疲惫状态只形成新草稿', () => {
  const s = fixture();
  const p = parseCheckin('晚半小时开始，我很累', s.checkin);
  assert.equal(p.checkin.start, '21:30');
  assert.equal(p.checkin.energy, 'low');
  assert.equal(s.checkin.start, '21:00');
});
test('本地拆分保留用户已有任务和显式分钟数', () => {
  const tasks = localDecompose(
    '作品集',
    '完成初稿',
    '整理截图 25分钟\n撰写介绍 50分钟',
  );
  assert.equal(tasks.length, 2);
  assert.equal(tasks[1].minutes, 50);
  assert.equal(tasks[0].title, '整理截图');
});
test('模型返回非法依赖或空清单时拒绝写入', () => {
  assert.throws(() => validateDraftTasks([]));
  assert.throws(() =>
    validateDraftTasks([{ title: 'a', minutes: 25, dependsOn: [1] }]),
  );
  assert.throws(() =>
    validateDraftTasks([{ title: 'a', minutes: NaN, dependsOn: [] }]),
  );
});
import { startFocus, recordProgress, currentPlan } from '../lib/actions.ts';
test('跨午夜事务属于次日且不被专注覆盖', () => {
  const s = fixture();
  s.checkin = {
    ...s.checkin,
    start: '23:00',
    end: '01:00',
    nextDay: true,
    commitments: [{ id: 'x', title: '家务', start: '00:00', end: '00:30' }],
  };
  const p = generatePlan(s, s.checkin, at(date, '22:00'));
  const c = p.blocks.find((b) => b.type === 'commitment');
  assert.equal(c.start, at('2026-09-06', '00:00'));
  assert.equal(c.end, at('2026-09-06', '00:30'));
  assert.deepEqual(validatePlan(p, s.tasks), []);
});
test('固定任务的前置优先于其他高优先级目标', () => {
  const s = fixture();
  s.checkin.start = '20:00';
  s.checkin.end = '22:00';
  s.settings.preparation = 0;
  s.settings.buffer = 0;
  s.goals.push({
    ...s.goals[0],
    id: 'urgent',
    priority: 3,
    deadline: date + 'T22:00',
  });
  s.goals[0].priority = 1;
  s.tasks = [
    task('a', 25),
    { ...task('b', 25, ['a']), fixedStart: '21:00' },
    { ...task('c', 50), goalId: 'urgent' },
  ];
  const p = generatePlan(s, s.checkin, at(date, '20:00'));
  assert.ok(p.blocks.find((b) => b.taskId === 'a').end <= at(date, '21:00'));
  assert.ok(p.blocks.find((b) => b.taskId === 'b'));
});
test('固定任务的前置不可完成时不丢弃整份有用规划', () => {
  const s = fixture();
  s.checkin.start = '20:00';
  s.checkin.end = '22:00';
  s.tasks = [
    task('a', 90),
    { ...task('b', 25, ['a']), fixedStart: '20:30' },
    task('c', 15),
  ];
  const p = generatePlan(s, s.checkin, at(date, '20:00'));
  assert.ok(p.blocks.some((b) => b.type === 'focus'));
  assert.equal(
    p.blocks.some((b) => b.taskId === 'b'),
    false,
  );
  assert.match(p.notes.join(), /无法在固定时段前完成/);
});
test('固定任务不能提前开始，即便从计划页直接启动', () => {
  const s = fixture();
  s.checkin.start = '20:00';
  s.tasks = [{ ...task('a', 25), fixedStart: '21:00' }];
  assert.throws(
    () => startFocus(s, 'a', undefined, at(date, '20:10')),
    /固定开始/,
  );
});
test('前置只是排满分钟却未确认完成时不能开始后续', () => {
  const s = fixture();
  s.checkin.start = '20:00';
  assert.throws(() => startFocus(s, 'b', undefined, at(date, '21:00')), /前置/);
});
test('手动更新其他任务不会终止当前计时', () => {
  const s = fixture();
  s.timer = createTimer('a', 25, 'focus', undefined, false, now);
  assert.throws(
    () => recordProgress(s, 'b', true, 0, false, false, now + 35000),
    /其他任务/,
  );
  assert.equal(s.timer.status, 'running');
  assert.equal(s.sessions.length, 0);
});
test('今天先到这里会移除同任务后续时间块并停止提醒来源', () => {
  let s = fixture();
  s.tasks = [task('a', 50)];
  s.plan = generatePlan(s, s.checkin, now);
  const first = s.plan.blocks.find((b) => b.taskId === 'a');
  s.timer = createTimer('a', 25, 'focus', first.id, false, first.start);
  s = recordProgress(s, 'a', false, 25, false, true, first.end);
  assert.equal(s.timer, null);
  assert.ok(s.skipped.ids.includes('a'));
  assert.equal(
    s.plan.blocks.filter((b) => b.taskId === 'a' && !b.done).length,
    0,
  );
  assert.equal(s.tasks[0].remaining, 25);
  assert.equal(s.tasks[0].status, 'doing');
});
test('午夜后仍能读取前一天开始的活动计划', () => {
  const s = fixture();
  s.checkin = { ...s.checkin, start: '23:00', end: '01:00', nextDay: true };
  s.plan = generatePlan(s, s.checkin, at(date, '22:00'));
  assert.equal(currentPlan(s, at('2026-09-06', '00:10')).id, s.plan.id);
});
test('跨午夜前已开始的事务仍裁切保留，不能被任务覆盖', () => {
  const s = fixture();
  s.settings.preparation = 0;
  s.settings.buffer = 0;
  s.checkin = {
    ...s.checkin,
    start: '23:00',
    end: '01:00',
    nextDay: true,
    commitments: [{ id: 'x', title: '晚餐', start: '22:45', end: '23:15' }],
  };
  const p = generatePlan(s, s.checkin, at(date, '22:00'));
  const b = p.blocks.find((b) => b.type === 'commitment');
  assert.equal(b.start, at(date, '23:00'));
  assert.equal(b.end, at(date, '23:15'));
  assert.ok(
    p.blocks
      .filter((b) => b.type === 'focus')
      .every((b) => b.start >= at(date, '23:15')),
  );
});
