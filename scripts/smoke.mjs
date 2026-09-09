import assert from 'node:assert/strict';
const base = process.env.SMOKE_URL || 'http://localhost:3000';
const root = await fetch(base);
assert.equal(root.status, 200);
const html = await root.text();
assert.match(html, /<html[^>]*lang="en"/);
assert.match(html, /New plan/);
assert.match(html, /Language \/ 语言/);
const health = await fetch(base + '/api/agent');
assert.equal(health.status, 200);
const config = await health.json();
assert.ok(['local', 'ai'].includes(config.mode));
const post = (body, language = 'en') =>
  fetch(base + '/api/agent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-App-Language': language },
    body: JSON.stringify(body),
  });
for (const language of ['en', 'zh-CN']) {
  const invalid = await post({ action: 'unknown', language }, language);
  assert.equal(invalid.status, 400);
  assert.equal(
    (await invalid.json()).error,
    language === 'en' ? 'Unsupported action.' : '不支持的操作。',
  );
  const noTitle = await post(
    { action: 'decompose', title: '', language },
    language,
  );
  assert.equal(noTitle.status, 400);
  assert.equal(
    (await noTitle.json()).error,
    language === 'en'
      ? 'Please enter a goal name first.'
      : '请先填写目标名称。',
  );
}
for (const body of [null, [], 'invalid'])
  assert.equal((await post(body)).status, 400);
const badHabit = await post({
  action: 'prioritize',
  tasks: [{ id: 'h', title: 'Exercise', kind: 'habit', remaining: -1 }],
});
assert.equal(badHabit.status, 400);
const duplicate = await post({
  action: 'prioritize',
  tasks: [
    { id: 'h', title: 'Exercise', kind: 'habit', remaining: 30 },
    { id: 'h', title: 'Exercise', kind: 'habit', remaining: 30 },
  ],
});
assert.equal(duplicate.status, 400);
const origin = await fetch(base + '/api/agent', {
  method: 'POST',
  headers: {
    Origin: 'https://untrusted.invalid',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ action: 'coach', message: 'hi' }),
});
assert.equal(origin.status, 403);
if (config.mode === 'local') {
  for (const language of ['en', 'zh-CN']) {
    const response = await post({
      action: 'decompose',
      language,
      title: 'Portfolio',
      outcome: 'A reviewable draft',
      source: 'Collect screenshots 25 minutes\nWrite overview 50 mins',
    });
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.tasks.length, 2);
    assert.equal(data.tasks[0].minutes, 25);
    assert.equal(data.tasks[1].title, 'Write overview');
    assert.equal(
      data.tasks[0].outcome,
      language === 'en'
        ? 'Complete this item and check the result'
        : '完成该项内容并检查结果',
    );
    const coach = await post({
      action: 'coach',
      language,
      message: 'Help me choose a next step',
    });
    const reply = (await coach.json()).message;
    if (language === 'en') assert.doesNotMatch(reply, /[\u3400-\u9fff]/);
    else assert.match(reply, /下一步|眼前/);
    const prioritize = await post({
      action: 'prioritize',
      language,
      tasks: [
        {
          id: 'habit:exercise',
          title: 'Exercise',
          kind: 'habit',
          remaining: 30,
        },
      ],
    });
    assert.equal(prioritize.status, 200);
    assert.equal((await prioritize.json()).mode, 'local');
  }
} else {
  console.log(
    'Real AI provider configured: skipped generation calls to avoid using the provider.',
  );
}
for (const resource of ['/manifest.webmanifest', '/icon.svg', '/sw.js'])
  assert.equal((await fetch(base + resource)).status, 200);
const manifest = await (await fetch(base + '/manifest.webmanifest')).json();
assert.equal(manifest.lang, 'en');
assert.equal(manifest.name, 'Evening Bell');
console.log(
  'HTTP checks passed: English page, bilingual API, validation, origin checks, and PWA resources.',
);
