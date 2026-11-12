const express = require('express');
const { validatePatient, parseId } = require('../validation');
const { isValidDate, today } = require('../dates');
const { HttpError } = require('../errors');

function patientsRouter({ db, config }) {
  const router = express.Router();

  const insert = db.prepare(`
    INSERT INTO patients (name, phone, consultation_date, next_followup_date)
    VALUES (@name, @phone, @consultation_date, @next_followup_date)
  `);
  const findById = db.prepare('SELECT * FROM patients WHERE id = ?');

  router.post('/', (req, res) => {
    const patient = validatePatient(req.body);
    const { lastInsertRowid } = insert.run(patient);
    res.status(201).json(findById.get(lastInsertRowid));
  });

  router.get('/', (req, res) => {
    const { status } = req.query;
    if (status && !['pending', 'completed'].includes(status)) {
      throw new HttpError(400, "status must be 'pending' or 'completed'");
    }
    const rows = status
      ? db.prepare('SELECT * FROM patients WHERE followup_status = ? ORDER BY next_followup_date, id').all(status)
      : db.prepare('SELECT * FROM patients ORDER BY next_followup_date, id').all();
    res.json(rows);
  });

  router.get('/due-today', (req, res) => {
    const date = req.query.date ?? today(config.timezone);
    if (!isValidDate(date)) throw new HttpError(400, 'date must be a real date in YYYY-MM-DD format');
    const includeOverdue = req.query.includeOverdue === 'true';
    const rows = db
      .prepare(`
        SELECT * FROM patients
        WHERE followup_status = 'pending' AND next_followup_date ${includeOverdue ? '<=' : '='} ?
        ORDER BY next_followup_date, id
      `)
      .all(date);
    res.json({ date, includeOverdue, count: rows.length, patients: rows });
  });

  router.get('/:id', (req, res) => {
    const patient = findById.get(parseId(req.params.id));
    if (!patient) throw new HttpError(404, 'Patient not found');
    res.json(patient);
  });

  router.patch('/:id/complete', (req, res) => {
    const id = parseId(req.params.id);
    const patient = findById.get(id);
    if (!patient) throw new HttpError(404, 'Patient not found');
    if (patient.followup_status === 'completed') throw new HttpError(409, 'Follow-up is already completed');
    db.prepare("UPDATE patients SET followup_status = 'completed', completed_at = datetime('now') WHERE id = ?").run(id);
    res.json(findById.get(id));
  });

  return router;
}

module.exports = patientsRouter;
