import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createAnnaStateStore,
  MAX_STATE_BYTES,
  AnnaStorageError,
  storageErrorMessage,
} from '../lib/anna-storage.ts';
import { initialState, exampleState, at, MINUTE } from '../lib/model.ts';
import { createTimer, settleTimer, startPomodoro } from '../lib/timer.ts';
import { parseBackup } from '../lib/backup.ts';
import { handleAgentRequest } from '../lib/agent-service.ts';
import { installAnnaRuntime } from '../lib/anna-runtime.ts';
import { agentRequest } from '../lib/agent-client.ts';
import {
  EditConflictError,
  assertSettingsUnchanged,
  settingsEditBaseline,
  assertGoalUnchanged,
  goalEditBaseline,
} from '../lib/editing.ts';
import { recordProgress, startFocus } from '../lib/actions.ts';
import { generatePlan } from '../lib/scheduler.ts';
import { acceptDailyPlan, habitScheduleSummary } from '../lib/planning.ts';
import { saveHabit, habitTaskId } from '../lib/habits.ts';
import { translate } from '../lib/i18n.ts';
import { atomicUpdate, initializeState } from '../lib/store.ts';

function host(seed) {
  let value = seed,
    revision = 1;
  return {
    writes: 0,
    fail: null,
    conflict: false,
    peek: () => structuredClone(value),
    change(next) {
      value = next;
      revision++;
    },
    async get() {
      return value === undefined
        ? { exists: false, value: null }
        : {
            exists: true,
            value: structuredClone(value),
            etag: String(revision),
          };
    },
    async set(args) {
      if (this.fail) throw this.fail;
      if (
        this.conflict ||
        (args.if_match && args.if_match !== String(revision))
      )
        throw Object.assign(new Error('conflict'), {
          code: 'precondition_failed',
        });
      this.writes++;
      value = structuredClone(args.value);
      revision++;
      return { etag: String(revision) };
    },
  };
}
test('ANNA first read does not write empty data; saves and reloads real user records', async () => {
  const api = host();
  const store = createAnnaStateStore(api, () => {});
  await store.refresh();
  assert.equal(api.writes, 0);
  const next = exampleState(initialState(), 'zh-CN');
  await store.update(() => next);
  const reopened = createAnnaStateStore(api, () => {});
  await reopened.refresh();
  assert.deepEqual(reopened.read(), next);
  assert.deepEqual(JSON.parse(reopened.backup()), next);
});
test('ANNA serializes writes and re-reads remote changes before modifying state', async () => {
  const api = host(initialState());
  const store = createAnnaStateStore(api, () => {});
  await store.refresh();
  await Promise.all([
    store.update((s) => ({ ...s, notified: [...s.notified, 'a'] })),
    store.update((s) => ({ ...s, notified: [...s.notified, 'b'] })),
  ]);
  api.change({
    ...api.peek(),
    settings: { ...api.peek().settings, name: 'Another device' },
  });
  await store.update((s) => ({ ...s, notified: [...s.notified, 'c'] }));
  assert.deepEqual(store.read().notified, ['a', 'b', 'c']);
  assert.equal(store.read().settings.name, 'Another device');
});
test('An open settings draft cannot undo a later save from another device, even after refresh', async () => {
  const api = host(initialState());
  const first = createAnnaStateStore(api, () => {});
  const second = createAnnaStateStore(api, () => {});
  await first.refresh();
  const baseline = settingsEditBaseline(first.read().settings);
  const draft = { ...first.read().settings, name: 'Alice' };
  await second.update((state) => ({
    ...state,
    settings: { ...state.settings, focusMinutes: 50 },
  }));
  await first.refresh();
  const before = api.peek();
  await assert.rejects(
    first.update((state) => {
      assertSettingsUnchanged(state.settings, baseline);
      return { ...state, settings: draft };
    }),
    EditConflictError,
  );
  assert.deepEqual(api.peek(), before);
  assert.equal(api.writes, 1);
  assert.equal(draft.name, 'Alice');
  assert.equal(draft.focusMinutes, 25);
  assert.equal(first.read().settings.focusMinutes, 50);
});
test('Settings can be saved again after a successful save, explicit import or clear', async () => {
  const api = host(initialState());
  const store = createAnnaStateStore(api, () => {});
  await store.refresh();
  let baseline = settingsEditBaseline(store.read().settings);
  const imported = exampleState(initialState());
  imported.settings.name = 'Imported';
  imported.settings.focusMinutes = 40;
  for (const replacement of [null, imported, initialState()]) {
    if (replacement) {
      const saved = await store.update(() => replacement);
      baseline = settingsEditBaseline(saved.settings);
    }
    for (const name of ['First edit', 'Second edit']) {
      // An unrelated change must not make this settings form stale.
      api.change({ ...api.peek(), notified: ['another-window'] });
      const draft = { ...store.read().settings, name };
      const saved = await store.update((state) => {
        assertSettingsUnchanged(state.settings, baseline);
        return { ...state, settings: draft };
      });
      baseline = settingsEditBaseline(saved.settings);
      assert.equal(api.peek().settings.name, name);
      assert.deepEqual(api.peek().notified, ['another-window']);
    }
  }
});
test('Stale goal edits cannot reverse completed tasks or restore a deleted goal', async () => {
  for (const remoteChange of [
    (state) => recordProgress(state, state.tasks[0].id, true, 0, false),
    (state) => ({
      ...state,
      tasks: state.tasks.filter((task) => task.id !== state.tasks[0].id),
    }),
    (state) => ({
      ...state,
      goals: state.goals.map((goal, index) =>
        index === 0 ? { ...goal, title: 'Changed elsewhere' } : goal,
      ),
    }),
    (state) => ({
      ...state,
      goals: state.goals.slice(1),
      tasks: state.tasks.filter((task) => task.goalId !== state.goals[0].id),
    }),
  ]) {
    const seed = exampleState(initialState());
    const api = host(seed);
    const store = createAnnaStateStore(api, () => {});
    await store.refresh();
    const goal = structuredClone(seed.goals[0]);
    const tasks = structuredClone(
      seed.tasks.filter((task) => task.goalId === goal.id),
    );
    const baseline = goalEditBaseline(store.read(), goal.id);
    api.change(remoteChange(api.peek()));
    await store.refresh();
    const before = api.peek();
    await assert.rejects(
      store.update((state) => {
        assertGoalUnchanged(state, goal.id, baseline);
        return {
          ...state,
          goals: [...state.goals.filter((item) => item.id !== goal.id), goal],
          tasks: [
            ...state.tasks.filter((task) => task.goalId !== goal.id),
            ...tasks,
          ],
        };
      }),
      EditConflictError,
    );
    assert.deepEqual(api.peek(), before);
    assert.equal(api.writes, 0);
    assert.equal(tasks[0].status, 'todo');
  }
});
test('A goal edit permits unrelated changes and captures a new baseline only after success', async () => {
  const seed = exampleState(initialState());
  const api = host(seed);
  const store = createAnnaStateStore(api, () => {});
  await store.refresh();
  const goalId = seed.goals[0].id;
  let baseline = goalEditBaseline(store.read(), goalId);
  api.change({
    ...api.peek(),
    settings: { ...seed.settings, focusMinutes: 50 },
    goals: seed.goals.map((goal, index) =>
      index === 1 ? { ...goal, title: 'Other goal updated' } : goal,
    ),
  });
  for (const title of ['First title', 'Second title']) {
    const saved = await store.update((state) => {
      assertGoalUnchanged(state, goalId, baseline);
      return {
        ...state,
        goals: state.goals.map((goal) =>
          goal.id === goalId ? { ...goal, title } : goal,
        ),
      };
    });
    baseline = goalEditBaseline(saved, goalId);
    assert.equal(api.peek().goals[0].title, title);
    assert.equal(api.peek().goals[1].title, 'Other goal updated');
    assert.equal(api.peek().settings.focusMinutes, 50);
  }
});
test('Conflict and quota errors never produce a successful local commit; later operations recover', async () => {
  const seed = initialState();
  const api = host(seed);
  const store = createAnnaStateStore(api, () => {});
  await store.refresh();
  api.conflict = true;
  await assert.rejects(
    store.update((s) => ({ ...s, notified: ['unsaved'] })),
    /conflict/,
  );
  assert.deepEqual(store.read(), seed);
  api.conflict = false;
  api.fail = Object.assign(new Error('quota'), { code: 'quota_exceeded' });
  await assert.rejects(
    store.update((s) => ({ ...s, notified: ['unsaved'] })),
    /quota/,
  );
  assert.deepEqual(JSON.parse(store.backup()), seed);
  api.fail = null;
  await store.update((s) => ({ ...s, notified: ['saved'] }));
  assert.deepEqual(api.peek().notified, ['saved']);
});
test('Corrupt, stored-null and oversized values cannot silently replace saved ANNA data', async () => {
  for (const invalid of [null, { version: 99 }]) {
    const api = host(invalid);
    const store = createAnnaStateStore(api, () => {});
    await assert.rejects(store.refresh());
    await assert.rejects(store.update(() => initialState()));
    assert.equal(api.writes, 0);
    assert.deepEqual(JSON.parse(store.backup()), invalid);
  }
  const api = host(initialState());
  const store = createAnnaStateStore(api, () => {});
  await store.refresh();
  await assert.rejects(
    store.update((s) => ({
      ...s,
      settings: { ...s.settings, name: '大'.repeat(MAX_STATE_BYTES / 2) },
    })),
    /240 KiB/,
  );
  assert.equal(api.writes, 0);
});
test('No-op and simultaneous timer settlements do not double-count a focus session', async () => {
  const seed = exampleState(initialState());
  seed.timer = createTimer(seed.tasks[0].id, 1, 'focus', undefined, false, 1);
  const api = host(seed);
  const store = createAnnaStateStore(api, () => {});
  await store.refresh();
  await store.update((s) => s);
  assert.equal(api.writes, 0);
  await Promise.all([
    store.update((s) => settleTimer(s)),
    store.update((s) => settleTimer(s)),
  ]);
  assert.equal(api.peek().sessions.length, 1);
});
test('Backups migrate existing bilingual plans and active timers; malformed nested data is rejected', () => {
  const seed = exampleState(initialState(), 'zh-CN');
  seed.timer = createTimer(
    seed.tasks[0].id,
    25,
    'focus',
    undefined,
    false,
    Date.now(),
  );
  assert.deepEqual(
    parseBackup(JSON.stringify(seed)),
    JSON.parse(JSON.stringify(seed)),
  );
  for (const patch of [
    { sessions: {} },
    { tasks: [null] },
    { checkin: null },
    { timer: {} },
    { plan: {} },
    { settings: { usualDays: null } },
  ])
    assert.throws(() => parseBackup(JSON.stringify({ ...seed, ...patch })));
});
const request = (body) =>
  new Request('https://example.test/api/agent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
test('Shared model service preserves local fallback and rejects invalid requests before calling any model', async () => {
  const local = await handleAgentRequest(
    request({ action: 'decompose', title: 'A goal', language: 'en' }),
  );
  assert.equal((await local.json()).mode, 'local');
  let calls = 0;
  for (const body of [
    { action: 'unknown' },
    { action: 'decompose', title: '' },
    { action: 'prioritize', tasks: [{}] },
  ]) {
    const result = await handleAgentRequest(request(body), async () => {
      calls++;
      return '';
    });
    assert.equal(result.status, 400);
  }
  assert.equal(calls, 0);
});
test('Malformed model task dependencies and unknown ordering IDs are rejected before user acceptance', async () => {
  const bad = await handleAgentRequest(
    request({ action: 'decompose', title: 'Goal' }),
    async () =>
      JSON.stringify({
        tasks: [
          {
            title: 'a',
            outcome: '',
            minutes: 25,
            energy: 'low',
            dependsOn: [1],
          },
        ],
      }),
  );
  assert.equal(bad.status, 400);
  const order = await handleAgentRequest(
    request({
      action: 'prioritize',
      tasks: [{ id: 'a', title: 'A', remaining: 25, kind: 'task' }],
    }),
    async () => JSON.stringify({ orderedTaskIds: ['invented'], reasons: {} }),
  );
  assert.equal(order.status, 400);
});
test('ANNA adapter uses the actual MCP completion shape, localized prompts and actionable permission errors', async () => {
  let sent;
  const runtime = {
    capabilities: { scopes: ['llm.complete', 'storage.get', 'storage.set'] },
    storage: host(),
    on: () => () => {},
    llm: {
      async complete(args) {
        sent = args;
        return {
          content: { type: 'text', text: 'Keep going.' },
          stopReason: 'endTurn',
        };
      },
    },
  };
  installAnnaRuntime(runtime);
  const options = {
    method: 'POST',
    headers: { 'X-App-Language': 'en' },
    body: JSON.stringify({ action: 'coach', language: 'en', message: 'Hello' }),
  };
  assert.equal(
    (await (await agentRequest(options)).json()).message,
    'Keep going.',
  );
  assert.match(sent.systemPrompt, /Write all user-facing text in English/);
  assert.equal(sent.messages[0].content.type, 'text');
  assert.equal(sent.maxTokens, 1024);
  runtime.llm.complete = async () => {
    throw Object.assign(new Error('denied'), {
      details: { errorCode: 'APP_NOT_GRANTED' },
    });
  };
  const denied = await agentRequest(options);
  assert.equal(denied.status, 400);
  assert.match((await denied.json()).error, /Installed Apps/);
  runtime.llm.complete = async () => ({
    content: { text: 'partial' },
    stopReason: 'maxTokens',
  });
  assert.equal((await agentRequest(options)).status, 400);
});
test('ANNA saves preserve localized edit conflict messages and never replace remote data', async () => {
  const api = host(exampleState(initialState()));
  installAnnaRuntime({
    storage: api,
    capabilities: { scopes: ['storage.get', 'storage.set'] },
    on: () => () => {},
    llm: { complete: async () => ({}) },
  });
  await initializeState();
  const original = api.peek();
  const settingsBaseline = settingsEditBaseline(original.settings);
  const goalId = original.goals[0].id;
  const goalBaseline = goalEditBaseline(original, goalId);
  api.change({
    ...original,
    settings: { ...original.settings, focusMinutes: 50 },
    tasks: original.tasks.map((task, index) =>
      index === 0 ? { ...task, status: 'done', remaining: 0 } : task,
    ),
  });
  const before = api.peek();
  for (const check of [
    (state) => assertSettingsUnchanged(state.settings, settingsBaseline),
    (state) => assertGoalUnchanged(state, goalId, goalBaseline),
  ]) {
    await assert.rejects(
      atomicUpdate((state) => {
        check(state);
        return original;
      }),
      (error) => {
        assert.match(error.message, /草稿仍保留/);
        const english = translate(error.message, 'en');
        assert.match(english, /Your changes were not saved/);
        assert.doesNotMatch(english, /[\u3400-\u9fff]/);
        assert.equal(translate(english, 'zh-CN'), error.message);
        return true;
      },
    );
  }
  assert.deepEqual(api.peek(), before);
  assert.equal(api.writes, 0);
  await assert.rejects(
    atomicUpdate(() => {
      throw new Error('还没到这段专注的开始时间。如需提前，请先调整今日安排。');
    }),
    /还没到这段专注/,
  );
  api.fail = Object.assign(new Error('RPC timed out'), { code: 'timeout' });
  await assert.rejects(
    atomicUpdate((state) => ({ ...state, timer: createTimer('', 25) })),
    /did not respond in time/,
  );
  assert.equal(api.peek().timer, null);
  api.fail = null;
});

test('ANNA focus validation remains actionable; actual storage failures retain transport details', async () => {
  const start = at('2026-09-18', '20:00');
  const seed = exampleState(initialState());
  seed.checkin = {
    ...seed.checkin,
    date: '2026-09-18',
    start: '20:00',
    end: '22:00',
  };
  const api = host(seed);
  const store = createAnnaStateStore(api, () => {});
  await store.refresh();
  await assert.rejects(
    store.update((state) =>
      startFocus(state, state.tasks[0].id, undefined, start - MINUTE),
    ),
    (error) => {
      assert.equal(error instanceof AnnaStorageError, false);
      assert.match(storageErrorMessage(error, 'zh-CN'), /开始时间/);
      assert.doesNotMatch(storageErrorMessage(error, 'zh-CN'), /检查连接/);
      return true;
    },
  );
  assert.equal(api.writes, 0);
  await store.update((state) => startPomodoro(state, start - MINUTE));
  await store.refresh();
  assert.equal(store.read().timer.status, 'running');
  api.fail = Object.assign(new Error('host failed'), {
    details: { errorCode: 'permission_denied' },
  });
  await assert.rejects(
    store.update((state) => settleTimer(state, start)),
    (error) => {
      assert.ok(error instanceof AnnaStorageError);
      assert.match(storageErrorMessage(error, 'en'), /Installed Apps/);
      return true;
    },
  );
  assert.equal(store.read().sessions.length, 0);
  api.fail = null;
  await store.update((state) => settleTimer(state, start));
  assert.equal(store.read().sessions.length, 1);
});

test('ANNA save Walking 15 min, preview and accept persists a real time block after reopening', async () => {
  const now = at('2026-09-18', '20:00');
  const seed = initialState();
  seed.checkin = {
    ...seed.checkin,
    date: '2026-09-18',
    start: '20:00',
    end: '21:00',
  };
  const api = host(seed);
  const store = createAnnaStateStore(api, () => {});
  await store.refresh();
  await store.update((state) =>
    saveHabit(state, {
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
  const reopened = createAnnaStateStore(api, () => {});
  await reopened.refresh();
  const block = reopened
    .read()
    .plan.blocks.find(
      (item) => item.taskId === habitTaskId('walking', seed.checkin.date),
    );
  assert.equal(block.end - block.start, 15 * MINUTE);
  await reopened.update((state) =>
    startFocus(state, block.taskId, block.id, block.start),
  );
  assert.equal(reopened.read().timer.taskId, block.taskId);
});
