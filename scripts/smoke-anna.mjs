import assert from 'node:assert/strict';
import { initialState, exampleState, at, MINUTE } from '../lib/model.ts';
import { createAnnaStateStore } from '../lib/anna-storage.ts';
import { saveHabit, habitTaskId } from '../lib/habits.ts';
import { generatePlan } from '../lib/scheduler.ts';
import { acceptDailyPlan, habitScheduleSummary } from '../lib/planning.ts';
import { startFocus } from '../lib/actions.ts';
import { startPomodoro, settleTimer } from '../lib/timer.ts';

// Use ONLY with the disposable local harness started for this check.
const base = process.env.ANNA_SMOKE_URL || 'http://localhost:5180';
if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(base).hostname))
  throw new Error('ANNA smoke tests must target a local development harness.');
async function post(path, body) {
  const response = await fetch(base + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  assert.equal(response.status, 200);
  return response.json();
}
const configResponse = await fetch(base + '/api/config');
assert.equal(configResponse.status, 200);
const config = await configResponse.json();
const entry = new URL(config.bundle_base, base);
const page = await fetch(entry);
assert.equal(page.status, 200);
const html = await page.text();
for (const match of html.matchAll(/(?:src|href)="([^"#]+)"/g)) {
  const asset = new URL(match[1], entry);
  assert.equal(
    (await fetch(asset)).status,
    200,
    'ANNA asset must load: ' + asset.pathname,
  );
}
const sdk = await fetch(base + '/static/anna-apps/_sdk/latest/index.js');
assert.equal(sdk.status, 200);
assert.match(await sdk.text(), /AnnaAppRuntime/);
const session = await post('/api/session/create', {});
assert.equal(typeof session.session_id, 'string');
async function rpc(ns, method, args = {}) {
  const reply = await post('/api/session/call', {
    session_id: session.session_id,
    ns,
    method,
    args,
  });
  if (reply.ok === false || reply.error)
    throw Object.assign(new Error(reply.error?.message || 'RPC failed'), {
      code: reply.error?.code,
    });
  return reply.result ?? reply;
}
const hello = await rpc('window', 'hello');
assert.ok(hello.capabilities.scopes.includes('llm.complete'));
assert.ok(hello.capabilities.scopes.includes('storage.get'));
assert.ok(hello.capabilities.scopes.includes('storage.set'));
assert.deepEqual(config.executas, []);
const store = createAnnaStateStore(
  {
    get: (args) => rpc('storage', 'get', args),
    set: (args) => rpc('storage', 'set', args),
  },
  () => {},
);
await store.refresh();
const sample = exampleState(initialState(), 'en');
await store.update(() => sample);
await store.refresh();
assert.deepEqual(store.read(), sample);
// Review regression: save a habit, accept its actual time block, reopen, focus.
const seed = initialState();
seed.checkin = {
  ...seed.checkin,
  date: '2026-09-18',
  start: '20:00',
  end: '21:00',
};
const now = at(seed.checkin.date, '20:00');
await store.update(() =>
  saveHabit(seed, {
    id: 'walking',
    title: 'Walking',
    minutes: 15,
    energy: 'medium',
    priority: 2,
    days: [0, 1, 2, 3, 4, 5, 6],
    enabled: true,
    splittable: false,
  }),
);
const preview = generatePlan(store.read(), seed.checkin, now);
assert.deepEqual(habitScheduleSummary(store.read(), preview), {
  total: 1,
  scheduled: 1,
  remainingTitles: [],
});
await store.update((state) => acceptDailyPlan(state, preview));
await store.refresh();
const block = store
  .read()
  .plan.blocks.find(
    (item) => item.taskId === habitTaskId('walking', seed.checkin.date),
  );
assert.ok(block, 'Walking must persist as a scheduled block');
assert.equal(block.end - block.start, 15 * MINUTE);
await store.update((state) =>
  startFocus(state, block.taskId, block.id, block.start),
);
await store.refresh();
assert.equal(store.read().timer.taskId, block.taskId);
assert.equal(store.read().timer.status, 'running');
// Free Pomodoro must also work with no check-in or accepted plan.
await store.update(() => startPomodoro(initialState(), now));
await store.refresh();
assert.equal(store.read().timer.taskId, '');
await store.update((state) => settleTimer(state, now + MINUTE));
await store.refresh();
assert.equal(store.read().timer, null);
assert.equal(store.read().sessions.length, 1);
assert.equal(store.read().sessions[0].durationMs, MINUTE);
await rpc('storage', 'set', { key: 'evening-bell.language', value: 'zh-CN' });
assert.equal(
  (await rpc('storage', 'get', { key: 'evening-bell.language' })).value,
  'zh-CN',
);
await assert.rejects(
  rpc('storage', 'delete', { key: 'evening-bell.language' }),
);
console.log(
  'ANNA smoke passed: HTML/assets/SDK, window handshake, declared grants, record save/reload, Walking 15-minute schedule, scheduled Start Focus, anytime Pomodoro and session persistence, language storage, denied undeclared permission. No model request made.',
);
