import test from 'node:test';
import assert from 'node:assert/strict';
import { createAnnaStateStore, MAX_STATE_BYTES } from '../lib/anna-storage.ts';
import { initialState, exampleState } from '../lib/model.ts';
import { createTimer, settleTimer } from '../lib/timer.ts';
import { parseBackup } from '../lib/backup.ts';
import { handleAgentRequest } from '../lib/agent-service.ts';
import { installAnnaRuntime } from '../lib/anna-runtime.ts';
import { agentRequest } from '../lib/agent-client.ts';

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
