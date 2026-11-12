const test = require('node:test');
const assert = require('node:assert/strict');
const { buildApp, validPatient } = require('./helpers');
const { buildPrompt } = require('../src/ai/draftGenerator');

async function seed(api) {
  await api.post('/api/patients').send(validPatient({ name: 'Ayesha Malik', next_followup_date: '2026-01-15' }));
  await api.post('/api/patients').send(validPatient({ name: 'Hina Raza', next_followup_date: '2026-01-10' }));
  await api.post('/api/patients').send(validPatient({ name: 'Bilal Ahmed', next_followup_date: '2026-02-01' }));
}

function fakeGemini(text, status = 200) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options, body: JSON.parse(options.body) });
    return {
      ok: status === 200,
      status,
      statusText: 'fake',
      json: async () => (status === 200 ? { candidates: [{ content: { parts: [{ text }] } }] } : { error: { message: 'quota exceeded' } }),
    };
  };
  return { fetchImpl, calls };
}

test('generate creates mock drafts for due and overdue patients when no API key is set', async () => {
  const { api } = buildApp();
  await seed(api);

  const res = await api.post('/api/followups/generate').send({ date: '2026-01-15' });
  assert.equal(res.status, 201);
  assert.equal(res.body.mode, 'mock');
  assert.equal(res.body.due_count, 2);
  assert.deepEqual(res.body.generated.map((d) => d.patient_name).sort(), ['Ayesha Malik', 'Hina Raza']);
  for (const draft of res.body.generated) {
    assert.equal(draft.status, 'pending_review');
    assert.equal(draft.source, 'mock');
    assert.match(draft.message, /EPIA Fertility/);
  }
});

test('generate can be limited to patients due exactly on the date', async () => {
  const { api } = buildApp();
  await seed(api);
  const res = await api.post('/api/followups/generate').send({ date: '2026-01-15', includeOverdue: false });
  assert.deepEqual(res.body.generated.map((d) => d.patient_name), ['Ayesha Malik']);
});

test('generate does not duplicate drafts that are awaiting review', async () => {
  const { api } = buildApp();
  await seed(api);
  await api.post('/api/followups/generate').send({ date: '2026-01-15' });
  const again = await api.post('/api/followups/generate').send({ date: '2026-01-15' });
  assert.equal(again.body.generated.length, 0);
  assert.equal(again.body.skipped.length, 2);
});

test('generate uses Gemini when a key is set and sends only the first name', async () => {
  const { fetchImpl, calls } = fakeGemini('"Hi Ayesha, please reply to confirm a time. EPIA Fertility"');
  const { api } = buildApp({ gemini: { apiKey: 'test-key', model: 'gemini-test' }, fetchImpl });
  await api.post('/api/patients').send(validPatient({ name: 'Ayesha Malik', next_followup_date: '2026-01-15' }));

  const res = await api.post('/api/followups/generate').send({ date: '2026-01-15' });
  assert.equal(res.body.mode, 'ai');
  assert.equal(res.body.generated[0].source, 'ai');
  assert.equal(res.body.generated[0].message, 'Hi Ayesha, please reply to confirm a time. EPIA Fertility');

  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /models\/gemini-test:generateContent$/);
  assert.equal(calls[0].options.headers['x-goog-api-key'], 'test-key');
  const prompt = calls[0].body.contents[0].parts[0].text;
  assert.match(prompt, /Ayesha/);
  assert.doesNotMatch(prompt, /Malik|\+92/);
});

test('generate falls back to a labelled mock draft when Gemini fails', async () => {
  const { fetchImpl } = fakeGemini('', 429);
  const { api } = buildApp({ gemini: { apiKey: 'test-key', model: 'gemini-test' }, fetchImpl });
  await api.post('/api/patients').send(validPatient({ next_followup_date: '2026-01-15' }));

  const res = await api.post('/api/followups/generate').send({ date: '2026-01-15' });
  assert.equal(res.body.generated[0].source, 'mock');
  assert.match(res.body.warnings[0].warning, /quota exceeded/);
});

test('generate retries, then switches to the fallback model when the primary is overloaded', async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    const primary = url.includes('primary-model');
    return {
      ok: !primary,
      status: primary ? 503 : 200,
      json: async () =>
        primary ? { error: { message: 'high demand' } } : { candidates: [{ content: { parts: [{ text: 'Hi Test, from the fallback.' }] } }] },
    };
  };
  const { api } = buildApp({ gemini: { apiKey: 'k', model: 'primary-model', fallbackModel: 'backup-model' }, fetchImpl });
  await api.post('/api/patients').send(validPatient({ next_followup_date: '2026-01-15' }));

  const res = await api.post('/api/followups/generate').send({ date: '2026-01-15' });
  assert.equal(calls.filter((u) => u.includes('primary-model')).length, 2);
  assert.equal(res.body.generated[0].source, 'ai');
  assert.equal(res.body.generated[0].model, 'backup-model');
  assert.equal(res.body.generated[0].message, 'Hi Test, from the fallback.');
});

test('staff can edit then approve a draft, which returns a WhatsApp link without sending', async () => {
  const { api } = buildApp();
  await seed(api);
  await api.post('/api/followups/generate').send({ date: '2026-01-15', includeOverdue: false });

  const edited = await api.patch('/api/drafts/1').send({ message: 'Hi Ayesha, see you soon!' });
  assert.equal(edited.status, 200);
  assert.equal(edited.body.message, 'Hi Ayesha, see you soon!');

  const approved = await api.post('/api/drafts/1/approve');
  assert.equal(approved.status, 200);
  assert.equal(approved.body.status, 'approved');
  assert.equal(approved.body.whatsapp_url, 'https://wa.me/923001234567?text=Hi%20Ayesha%2C%20see%20you%20soon!');
  assert.match(approved.body.note, /Nothing was sent/);

  assert.equal((await api.post('/api/drafts/1/approve')).status, 409);
  assert.equal((await api.patch('/api/drafts/1').send({ message: 'late edit' })).status, 409);
});

test('staff can reject a draft and a new one can then be generated', async () => {
  const { api } = buildApp();
  await seed(api);
  await api.post('/api/followups/generate').send({ date: '2026-01-15', includeOverdue: false });

  const rejected = await api.post('/api/drafts/1/reject');
  assert.equal(rejected.body.status, 'rejected');

  const regenerated = await api.post('/api/followups/generate').send({ date: '2026-01-15', includeOverdue: false });
  assert.equal(regenerated.body.generated.length, 1);

  const pending = await api.get('/api/drafts?status=pending_review');
  assert.equal(pending.body.length, 1);
});

test('draft endpoints validate input', async () => {
  const { api } = buildApp();
  await seed(api);
  await api.post('/api/followups/generate').send({ date: '2026-01-15' });

  assert.equal((await api.patch('/api/drafts/1').send({ message: '   ' })).status, 400);
  assert.equal((await api.post('/api/drafts/999/approve')).status, 404);
  assert.equal((await api.get('/api/drafts?status=sent')).status, 400);
  assert.equal((await api.post('/api/followups/generate').send({ date: 'tomorrow' })).status, 400);
});

test('prompt never includes the surname or phone number', () => {
  const prompt = buildPrompt(
    { id: 1, name: 'Fatima Noor', phone: '+923214445566', consultation_date: '2026-01-01', next_followup_date: '2026-01-15' },
    { clinicName: 'EPIA Fertility', today: '2026-01-15' },
  );
  assert.match(prompt, /Fatima/);
  assert.match(prompt, /due today/);
  assert.doesNotMatch(prompt, /Noor|445566/);
});
