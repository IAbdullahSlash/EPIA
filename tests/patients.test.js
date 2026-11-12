const test = require('node:test');
const assert = require('node:assert/strict');
const { buildApp, validPatient } = require('./helpers');
const { today } = require('../src/dates');

test('POST /api/patients creates a patient with a normalised phone', async () => {
  const { api } = buildApp();
  const res = await api.post('/api/patients').send(validPatient({ phone: '+92 300-123 4567' }));
  assert.equal(res.status, 201);
  assert.equal(res.body.id, 1);
  assert.equal(res.body.phone, '+923001234567');
  assert.equal(res.body.followup_status, 'pending');
});

test('POST /api/patients rejects missing and invalid fields', async () => {
  const { api } = buildApp();
  const res = await api.post('/api/patients').send({ phone: '0300', consultation_date: '2026-02-30' });
  assert.equal(res.status, 400);
  assert.deepEqual(Object.keys(res.body.details).sort(), ['consultation_date', 'name', 'next_followup_date', 'phone']);
});

test('POST /api/patients rejects a follow-up before the consultation', async () => {
  const { api } = buildApp();
  const res = await api.post('/api/patients').send(validPatient({ next_followup_date: '2025-12-31' }));
  assert.equal(res.status, 400);
  assert.ok(res.body.details.next_followup_date);
});

test('POST /api/patients returns 400 for malformed JSON', async () => {
  const { api } = buildApp();
  const res = await api.post('/api/patients').set('Content-Type', 'application/json').send('{"name":');
  assert.equal(res.status, 400);
});

test('GET /api/patients lists all patients and filters by status', async () => {
  const { api } = buildApp();
  await api.post('/api/patients').send(validPatient({ name: 'A' }));
  await api.post('/api/patients').send(validPatient({ name: 'B' }));
  await api.patch('/api/patients/2/complete');

  const all = await api.get('/api/patients');
  assert.equal(all.body.length, 2);

  const pending = await api.get('/api/patients?status=pending');
  assert.deepEqual(pending.body.map((p) => p.name), ['A']);

  const bad = await api.get('/api/patients?status=done');
  assert.equal(bad.status, 400);
});

test('GET /api/patients/due-today defaults to today and excludes completed or other dates', async () => {
  const { api } = buildApp();
  const now = today('UTC');
  await api.post('/api/patients').send(validPatient({ name: 'Due', consultation_date: now, next_followup_date: now }));
  await api.post('/api/patients').send(validPatient({ name: 'Later', consultation_date: now, next_followup_date: '2099-01-01' }));
  await api.post('/api/patients').send(validPatient({ name: 'Done', consultation_date: now, next_followup_date: now }));
  await api.patch('/api/patients/3/complete');

  const res = await api.get('/api/patients/due-today');
  assert.equal(res.status, 200);
  assert.equal(res.body.date, now);
  assert.deepEqual(res.body.patients.map((p) => p.name), ['Due']);
});

test('GET /api/patients/due-today supports a date override and overdue patients', async () => {
  const { api } = buildApp();
  await api.post('/api/patients').send(validPatient({ name: 'Overdue', next_followup_date: '2026-01-10' }));
  await api.post('/api/patients').send(validPatient({ name: 'Today', next_followup_date: '2026-01-15' }));

  const exact = await api.get('/api/patients/due-today?date=2026-01-15');
  assert.deepEqual(exact.body.patients.map((p) => p.name), ['Today']);

  const withOverdue = await api.get('/api/patients/due-today?date=2026-01-15&includeOverdue=true');
  assert.deepEqual(withOverdue.body.patients.map((p) => p.name), ['Overdue', 'Today']);

  const bad = await api.get('/api/patients/due-today?date=15-01-2026');
  assert.equal(bad.status, 400);
});

test('PATCH /api/patients/:id/complete marks completed and handles errors', async () => {
  const { api } = buildApp();
  await api.post('/api/patients').send(validPatient());

  const ok = await api.patch('/api/patients/1/complete');
  assert.equal(ok.status, 200);
  assert.equal(ok.body.followup_status, 'completed');
  assert.ok(ok.body.completed_at);

  assert.equal((await api.patch('/api/patients/1/complete')).status, 409);
  assert.equal((await api.patch('/api/patients/999/complete')).status, 404);
  assert.equal((await api.patch('/api/patients/abc/complete')).status, 400);
});
