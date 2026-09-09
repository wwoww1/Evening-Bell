import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_LOCALE,
  LOCALE_STORAGE_KEY,
  normalizeLocale,
  readLocale,
  saveLocale,
  translate,
  createTranslator,
} from '../lib/i18n.ts';
import { messages } from '../lib/messages.ts';
import { initialState, exampleState, at, MINUTE } from '../lib/model.ts';
import { parseCheckin, generatePlan } from '../lib/scheduler.ts';
import { localDecompose } from '../lib/agent.ts';
import { restoreState } from '../lib/persistence.ts';
import { createTimer, elapsed } from '../lib/timer.ts';

test('English is the default, including missing and invalid saved preferences', () => {
  assert.equal(DEFAULT_LOCALE, 'en');
  for (const value of [undefined, null, '', 'fr', 'invalid'])
    assert.equal(normalizeLocale(value), 'en');
  assert.equal(readLocale(), 'en');
  assert.equal(normalizeLocale('zh'), 'zh-CN');
  assert.equal(normalizeLocale('zh-CN'), 'zh-CN');
});

test('Language preference persists independently of all existing application data', () => {
  const saved = JSON.stringify(initialState());
  const data = new Map([['afterhours.state.v1', saved]]);
  const storage = {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
  };
  saveLocale('zh-CN', storage);
  assert.equal(data.get(LOCALE_STORAGE_KEY), 'zh-CN');
  assert.equal(readLocale(storage), 'zh-CN');
  assert.equal(data.get('afterhours.state.v1'), saved);
  saveLocale('en', storage);
  assert.equal(readLocale(storage), 'en');
});

test('Blocked browser storage does not prevent translation or throw on a language change', () => {
  const storage = {
    getItem() {
      throw new Error('blocked');
    },
    setItem() {
      throw new Error('blocked');
    },
  };
  assert.equal(readLocale(storage), 'en');
  assert.doesNotThrow(() => saveLocale('zh-CN', storage));
  assert.equal(translate('今天', 'zh-CN'), '今天');
});

test('English and Chinese translators are isolated from concurrent calls', async () => {
  const [en, zh] = await Promise.all([
    Promise.resolve(createTranslator('en')('新建计划')),
    Promise.resolve(createTranslator('zh-CN')('新建计划')),
  ]);
  assert.equal(en, 'New plan');
  assert.equal(zh, '新建计划');
  assert.equal(translate('今天'), 'Today');
});

test('Every translation preserves its numbered parameters', () => {
  const slots = (value) =>
    [...value.matchAll(/\{(\d+)\}/g)]
      .map((match) => match[1])
      .sort((a, b) => Number(a) - Number(b));
  for (const [zh, en] of Object.entries(messages))
    assert.deepEqual(slots(en), slots(zh), zh);
});

test('Interpolating system messages preserves user names and special characters exactly', () => {
  const name = '今天 $& <script> {1} “quoted”';
  assert.equal(translate('删除{0}', 'en', [name]), 'Delete ' + name);
  assert.equal(translate('删除{0}', 'zh-CN', [name]), '删除' + name);
  const message = '「' + name + '」的前置任务不存在。';
  const en = translate(message, 'en');
  assert.equal(en, 'A prerequisite for “' + name + '” does not exist.');
  assert.equal(translate(en, 'zh-CN'), message);
  assert.equal(
    translate('A user-authored sentence'),
    'A user-authored sentence',
  );
});

test('Saved Chinese planning notes and reasons display in English without rewriting records', () => {
  const s = exampleState(initialState(), 'en');
  s.checkin = {
    ...s.checkin,
    date: '2026-09-07',
    start: '20:00',
    end: '20:40',
    energy: 'low',
  };
  const p = generatePlan(s, s.checkin, at('2026-09-07', '19:00'));
  const original = JSON.stringify(p);
  for (const note of p.notes)
    assert.doesNotMatch(translate(note, 'en'), /[\u3400-\u9fff]/);
  for (const block of p.blocks) {
    assert.doesNotMatch(translate(block.reason, 'en'), /[\u3400-\u9fff]/);
    if (block.type !== 'focus' && block.type !== 'commitment')
      assert.doesNotMatch(translate(block.title, 'en'), /[\u3400-\u9fff]/);
  }
  assert.equal(JSON.stringify(p), original);
  assert.equal(
    translate('按通常时段估算，共享时间预算，已为启用习惯预留时长', 'en'),
    'Estimated from usual time slots; a shared time budget, with time reserved for enabled habits',
  );
});

test('Sample goals use the selected language and leave existing goals untouched', () => {
  const base = initialState();
  base.goals.push({
    id: 'mine',
    title: '我的计划 Keep this',
    outcome: '不要翻译',
    deadline: '',
    priority: 1,
    color: '#123',
  });
  assert.match(exampleState(base).goals[1].title, /portfolio/);
  assert.equal(exampleState(base, 'zh-CN').goals[1].title, '完成个人作品集');
  assert.deepEqual(exampleState(base).goals[0], base.goals[0]);
  assert.equal(base.goals.length, 1);
});

test('Task breakdown accepts English minute units and preserves source task names', () => {
  const tasks = localDecompose(
    'My goal',
    '',
    'Collect screenshots 25 minutes\nDraft overview 50 mins\n检查页面 15分钟',
  );
  assert.deepEqual(
    tasks.map((task) => task.minutes),
    [25, 50, 15],
  );
  assert.deepEqual(
    tasks.map((task) => task.title),
    ['Collect screenshots', 'Draft overview', '检查页面'],
  );
  assert.equal(tasks[0].outcome, 'Complete this item and check the result');
  assert.equal(
    localDecompose('目标', '', '整理 20分钟', 'zh-CN')[0].outcome,
    '完成该项内容并检查结果',
  );
  assert.match(localDecompose('My goal', '', '')[0].title, /Define the steps/);
});

test('English and Chinese time commands produce equivalent schedule drafts', () => {
  const current = {
    ...initialState().checkin,
    date: '2026-09-07',
    start: '20:00',
    end: '22:00',
  };
  const english = parseCheckin(
    "Start 30 minutes later. I'm tired, I only have 30 minutes.",
    current,
  );
  const chinese = parseCheckin('晚半小时开始，很累，只想做半小时', current);
  assert.deepEqual(english.checkin, chinese.checkin);
  assert.equal(english.checkin.start, '20:30');
  assert.equal(english.checkin.end, '21:00');
  assert.equal(english.checkin.energy, 'low');
  assert.equal(current.start, '20:00');
});

test('English hour, rest, energy and overnight commands are understood', () => {
  const current = {
    ...initialState().checkin,
    date: '2026-09-07',
    start: '23:30',
    end: '23:50',
  };
  const overnight = parseCheckin('I only have an hour', current).checkin;
  assert.equal(overnight.end, '00:30');
  assert.equal(overnight.nextDay, true);
  assert.equal(parseCheckin('Rest today', current).checkin.end, '23:30');
  assert.equal(parseCheckin('Full of energy', current).checkin.energy, 'high');
  assert.equal(
    parseCheckin('I am not tired', current).checkin.energy,
    'medium',
  );
  const day = { ...current, start: '20:00', end: '22:00' };
  assert.equal(
    parseCheckin('Delay by half an hour', day).checkin.start,
    '20:30',
  );
  assert.equal(parseCheckin('Start 1 hour later', day).checkin.start, '21:00');
});

test('An existing Chinese backup retains its task content and running timer during language changes', () => {
  const s = exampleState(initialState(), 'zh-CN');
  s.timer = createTimer(s.tasks[0].id, 25, 'focus', undefined, false, 1000);
  const saved = JSON.stringify(s);
  const restored = restoreState(saved);
  translate('专注结束', 'en');
  translate('专注结束', 'zh-CN');
  assert.deepEqual(restored.tasks, s.tasks);
  assert.deepEqual(restored.timer, JSON.parse(saved).timer);
  assert.equal(elapsed(restored.timer, 1000 + 5 * MINUTE), 5 * MINUTE);
});
