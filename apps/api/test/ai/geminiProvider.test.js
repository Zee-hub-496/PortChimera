import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGeminiProvider, buildRequest, parseResponse } from '../../src/ai/geminiProvider.js';

const KEY = 'test-key-not-real-0000';
const MODEL = 'test-model';
const OK_JSON = { fields: {} };
const okBody = {
  candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(OK_JSON) }] } }],
};
const resp = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});
const input = {
  documentType: 'commercial_invoice',
  text: 'Invoice text for the test',
  file: undefined,
};

/** Fake fetch that answers from a script and records calls. */
function scripted(steps) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    const step = steps[Math.min(calls.length - 1, steps.length - 1)];
    if (step instanceof Error) throw step;
    return step;
  };
  fetchImpl.calls = calls;
  return fetchImpl;
}
const make = (fetchImpl) => {
  const sleeps = [];
  const provider = createGeminiProvider({
    apiKey: KEY,
    model: MODEL,
    fetchImpl,
    sleep: async (ms) => sleeps.push(ms),
  });
  return { provider, sleeps };
};
const timeoutErr = () =>
  Object.assign(new Error('The operation timed out'), { name: 'TimeoutError' });
const failsWith = (p, kind) => assert.rejects(p, (e) => e.name === 'AiError' && e.kind === kind);

test('success returns parsed JSON and model, key only in header', async () => {
  const f = scripted([resp(200, okBody)]);
  const { provider } = make(f);
  const out = await provider.extractDocument(input);
  assert.deepEqual(out, { raw: OK_JSON, model: MODEL });
  const [{ url, init }] = f.calls;
  assert.equal(
    url,
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
  );
  assert.equal(init.headers['x-goog-api-key'], KEY);
  assert.ok(!url.includes(KEY));
  assert.ok(!init.body.includes(KEY));
  assert.equal(init.method, 'POST');
});

test('request has JSON mime type, no tools, text only and no inline data when text exists', () => {
  const { body } = buildRequest({
    model: MODEL,
    documentType: 'commercial_invoice',
    text: 'Some invoice text here',
    file: { bytes: Buffer.from('abc'), mimeType: 'application/pdf' },
  });
  assert.equal(body.generationConfig.responseMimeType, 'application/json');
  assert.equal(body.tools, undefined);
  assert.equal(body.contents[0].parts.length, 1);
  assert.ok(!JSON.stringify(body).includes('inline_data'));
});

test('request sends the file inline as base64 only when there is no text', () => {
  const { body } = buildRequest({
    model: MODEL,
    documentType: 'packing_list',
    text: null,
    file: { bytes: Buffer.from('abc'), mimeType: 'image/png' },
  });
  const part = body.contents[0].parts[1];
  assert.deepEqual(part.inline_data, {
    mime_type: 'image/png',
    data: Buffer.from('abc').toString('base64'),
  });
});

test('429 then success retries once with backoff', async () => {
  const f = scripted([resp(429, {}), resp(200, okBody)]);
  const { provider, sleeps } = make(f);
  assert.deepEqual((await provider.extractDocument(input)).raw, OK_JSON);
  assert.equal(f.calls.length, 2);
  assert.equal(sleeps.length, 1);
});

test('429 twice fails with rate_limited after exactly two calls', async () => {
  const f = scripted([resp(429, {})]);
  await failsWith(make(f).provider.extractDocument(input), 'rate_limited');
  assert.equal(f.calls.length, 2);
});

test('500 is retried once then reported as upstream', async () => {
  const f = scripted([resp(500, {})]);
  await failsWith(make(f).provider.extractDocument(input), 'upstream');
  assert.equal(f.calls.length, 2);
});

test('timeout is retried once, then reported as timeout', async () => {
  const f = scripted([timeoutErr()]);
  await failsWith(make(f).provider.extractDocument(input), 'timeout');
  assert.equal(f.calls.length, 2);
});

test('timeout then success works', async () => {
  const f = scripted([timeoutErr(), resp(200, okBody)]);
  assert.deepEqual((await make(f).provider.extractDocument(input)).raw, OK_JSON);
});

test('400 is not retried', async () => {
  const f = scripted([resp(400, {})]);
  await failsWith(make(f).provider.extractDocument(input), 'upstream');
  assert.equal(f.calls.length, 1);
});

test('401 and 403 are auth errors and not retried', async () => {
  for (const status of [401, 403]) {
    const f = scripted([resp(status, {})]);
    await failsWith(make(f).provider.extractDocument(input), 'auth');
    assert.equal(f.calls.length, 1);
  }
});

test('malformed JSON text is bad_output and not retried', async () => {
  const body = {
    candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '{not json' }] } }],
  };
  const f = scripted([resp(200, body)]);
  await failsWith(make(f).provider.extractDocument(input), 'bad_output');
  assert.equal(f.calls.length, 1);
});

test('non-JSON HTTP body is bad_output', async () => {
  const f = scripted([{ ok: true, status: 200, json: async () => Promise.reject(new Error('x')) }]);
  await failsWith(make(f).provider.extractDocument(input), 'bad_output');
});

test('parseResponse rejects blocked, empty and non-STOP answers', () => {
  assert.throws(() => parseResponse({ promptFeedback: { blockReason: 'SAFETY' } }), {
    kind: 'bad_output',
  });
  assert.throws(() => parseResponse({}), { kind: 'bad_output' });
  assert.throws(
    () =>
      parseResponse({
        candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: '{}' }] } }],
      }),
    { kind: 'bad_output' },
  );
});

test('the key never appears in any error message', async () => {
  const cases = [
    [resp(429, {})],
    [resp(500, {})],
    [resp(400, {})],
    [resp(401, {})],
    [timeoutErr()],
    [new Error(`network down ${KEY}`)],
  ];
  for (const steps of cases) {
    try {
      await make(scripted(steps)).provider.extractDocument(input);
      assert.fail('should have thrown');
    } catch (e) {
      assert.equal(e.name, 'AiError');
      assert.ok(!e.message.includes(KEY));
      assert.ok(!String(e.stack).includes(KEY));
    }
  }
});

test('constructor requires a key and a model', () => {
  assert.throws(() => createGeminiProvider({ model: MODEL }));
  assert.throws(() => createGeminiProvider({ apiKey: KEY }));
});
