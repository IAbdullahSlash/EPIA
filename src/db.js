const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS patients (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    name               TEXT NOT NULL,
    phone              TEXT NOT NULL,
    consultation_date  TEXT NOT NULL,
    next_followup_date TEXT NOT NULL,
    followup_status    TEXT NOT NULL DEFAULT 'pending' CHECK (followup_status IN ('pending', 'completed')),
    completed_at       TEXT,
    created_at         TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS message_drafts (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id  INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    message     TEXT NOT NULL,
    source      TEXT NOT NULL CHECK (source IN ('ai', 'mock')),
    model       TEXT,
    status      TEXT NOT NULL DEFAULT 'pending_review' CHECK (status IN ('pending_review', 'approved', 'rejected')),
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    reviewed_at TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_patients_due ON patients (next_followup_date, followup_status);
  CREATE INDEX IF NOT EXISTS idx_drafts_status ON message_drafts (status);
`;

function openDatabase(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  return db;
}

module.exports = { openDatabase };
