const { isValidDate } = require('./dates');
const { HttpError } = require('./errors');

const PHONE = /^\+[1-9]\d{7,14}$/;

function normalisePhone(value) {
  return typeof value === 'string' ? value.replace(/[\s\-()]/g, '') : value;
}

function validatePatient(body) {
  const errors = {};
  const input = body && typeof body === 'object' ? body : {};

  const name = typeof input.name === 'string' ? input.name.trim() : '';
  if (!name) errors.name = 'Name is required';
  else if (name.length > 100) errors.name = 'Name must be 100 characters or fewer';

  const phone = normalisePhone(input.phone);
  if (!phone) errors.phone = 'Phone number is required';
  else if (!PHONE.test(phone)) errors.phone = 'Phone must be in international format, e.g. +923001234567';

  const { consultation_date, next_followup_date } = input;
  if (!consultation_date) errors.consultation_date = 'Consultation date is required';
  else if (!isValidDate(consultation_date)) errors.consultation_date = 'Must be a real date in YYYY-MM-DD format';

  if (!next_followup_date) errors.next_followup_date = 'Next follow-up date is required';
  else if (!isValidDate(next_followup_date)) errors.next_followup_date = 'Must be a real date in YYYY-MM-DD format';

  if (!errors.consultation_date && !errors.next_followup_date && next_followup_date < consultation_date) {
    errors.next_followup_date = 'Follow-up date cannot be before the consultation date';
  }

  if (Object.keys(errors).length) throw new HttpError(400, 'Validation failed', errors);
  return { name, phone, consultation_date, next_followup_date };
}

function parseId(value) {
  const id = Number(value);
  if (!Number.isInteger(id) || id < 1) throw new HttpError(400, 'ID must be a positive integer');
  return id;
}

module.exports = { validatePatient, parseId };
