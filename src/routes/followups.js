const express = require('express');
const { generateDraft } = require('../ai/draftGenerator');
const { isValidDate, today } = require('../dates');
const { parseId } = require('../validation');
const { HttpError } = require('../errors');

const DRAFT_QUERY = `
  SELECT d.*, p.name AS patient_name, p.phone AS patient_phone,
         p.next_followup_date, p.followup_status
  FROM message_drafts d JOIN patients p ON p.id = d.patient_id
`;

function whatsappUrl(phone, message) {
  return `https://wa.me/${phone.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`;
}

function withLink(draft) {
  return draft.status === 'approved' ? { ...draft, whatsapp_url: whatsappUrl(draft.patient_phone, draft.message) } : draft;
}

function followupsRouter({ db, config, fetchImpl }) {
  const router = express.Router();
  const findDraft = db.prepare(`${DRAFT_QUERY} WHERE d.id = ?`);

  function loadReviewableDraft(id) {
    const draft = findDraft.get(parseId(id));
    if (!draft) throw new HttpError(404, 'Draft not found');
    if (draft.status !== 'pending_review') throw new HttpError(409, `Draft is already ${draft.status}`);
    return draft;
  }

  function readMessage(body, required) {
    const message = typeof body?.message === 'string' ? body.message.trim() : '';
    if (!message) {
      if (required) throw new HttpError(400, 'message is required');
      return null;
    }
    if (message.length > 1000) throw new HttpError(400, 'message must be 1000 characters or fewer');
    return message;
  }

  router.post('/followups/generate', async (req, res) => {
    const body = req.body || {};
    const date = body.date ?? today(config.timezone);
    if (!isValidDate(date)) throw new HttpError(400, 'date must be a real date in YYYY-MM-DD format');
    const includeOverdue = body.includeOverdue !== false;

    const due = db
      .prepare(`
        SELECT * FROM patients
        WHERE followup_status = 'pending' AND next_followup_date ${includeOverdue ? '<=' : '='} ?
        ORDER BY next_followup_date, id
      `)
      .all(date);

    const hasOpenDraft = db.prepare("SELECT 1 FROM message_drafts WHERE patient_id = ? AND status IN ('pending_review', 'approved')");
    const insert = db.prepare('INSERT INTO message_drafts (patient_id, message, source, model) VALUES (?, ?, ?, ?)');

    const toDraft = due.filter((p) => !hasOpenDraft.get(p.id));
    const skipped = due
      .filter((p) => !toDraft.includes(p))
      .map((p) => ({ patient_id: p.id, patient_name: p.name, reason: 'Draft already awaiting review or approved' }));

    const drafts = await Promise.all(
      toDraft.map((patient) =>
        generateDraft(patient, { clinicName: config.clinicName, today: date, gemini: config.gemini, fetchImpl, retry: config.aiRetry }),
      ),
    );

    const warnings = [];
    const generated = toDraft.map((patient, i) => {
      const draft = drafts[i];
      if (draft.warning) warnings.push({ patient_id: patient.id, warning: draft.warning });
      const { lastInsertRowid } = insert.run(patient.id, draft.message, draft.source, draft.model ?? null);
      return findDraft.get(lastInsertRowid);
    });

    res.status(201).json({
      date,
      includeOverdue,
      mode: config.gemini?.apiKey ? 'ai' : 'mock',
      due_count: due.length,
      generated,
      skipped,
      warnings,
    });
  });

  router.get('/drafts', (req, res) => {
    const { status } = req.query;
    if (status && !['pending_review', 'approved', 'rejected'].includes(status)) {
      throw new HttpError(400, "status must be 'pending_review', 'approved' or 'rejected'");
    }
    const rows = status
      ? db.prepare(`${DRAFT_QUERY} WHERE d.status = ? ORDER BY d.created_at DESC, d.id DESC`).all(status)
      : db.prepare(`${DRAFT_QUERY} ORDER BY d.created_at DESC, d.id DESC`).all();
    res.json(rows.map(withLink));
  });

  router.patch('/drafts/:id', (req, res) => {
    const draft = loadReviewableDraft(req.params.id);
    const message = readMessage(req.body, true);
    db.prepare('UPDATE message_drafts SET message = ? WHERE id = ?').run(message, draft.id);
    res.json(findDraft.get(draft.id));
  });

  router.post('/drafts/:id/approve', (req, res) => {
    const draft = loadReviewableDraft(req.params.id);
    const message = readMessage(req.body, false) ?? draft.message;
    db.prepare("UPDATE message_drafts SET message = ?, status = 'approved', reviewed_at = datetime('now') WHERE id = ?").run(message, draft.id);
    res.json({
      ...withLink(findDraft.get(draft.id)),
      note: 'Approved only. Nothing was sent. Staff must open whatsapp_url and press send themselves.',
    });
  });

  router.post('/drafts/:id/reject', (req, res) => {
    const draft = loadReviewableDraft(req.params.id);
    db.prepare("UPDATE message_drafts SET status = 'rejected', reviewed_at = datetime('now') WHERE id = ?").run(draft.id);
    res.json(findDraft.get(draft.id));
  });

  return router;
}

module.exports = followupsRouter;
