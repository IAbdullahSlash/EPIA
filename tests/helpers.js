const request = require('supertest');
const { openDatabase } = require('../src/db');
const { createApp } = require('../src/app');

function buildApp({ fetchImpl, ...overrides } = {}) {
  const db = openDatabase(':memory:');
  const config = { timezone: 'UTC', clinicName: 'EPIA Fertility', gemini: { apiKey: '' }, ...overrides };
  const app = createApp({ db, config, fetchImpl });
  return { db, app, api: request(app) };
}

const validPatient = (fields = {}) => ({
  name: 'Test Patient',
  phone: '+923001234567',
  consultation_date: '2026-01-01',
  next_followup_date: '2026-01-15',
  ...fields,
});

module.exports = { buildApp, validPatient };
