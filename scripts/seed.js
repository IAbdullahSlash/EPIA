const config = require('../src/config');
const { openDatabase } = require('../src/db');
const { today, addDays } = require('../src/dates');

const db = openDatabase(config.dbPath);
const now = today(config.timezone);

const patients = [
  { name: 'Ayesha Malik', phone: '+923001112233', consultation: -14, followup: 0 },
  { name: 'Fatima Noor', phone: '+923214445566', consultation: -30, followup: 0 },
  { name: 'Omar Siddiqui', phone: '+923337778899', consultation: -7, followup: 0 },
  { name: 'Hina Raza', phone: '+923451234567', consultation: -21, followup: -2 },
  { name: 'Zainab Ali', phone: '+923009876543', consultation: -3, followup: 4 },
  { name: 'Bilal Ahmed', phone: '+923125556677', consultation: -10, followup: 10 },
  { name: 'Sana Iqbal', phone: '+923018889900', consultation: -40, followup: -5, completed: true },
];

const insert = db.prepare(`
  INSERT INTO patients (name, phone, consultation_date, next_followup_date, followup_status, completed_at)
  VALUES (?, ?, ?, ?, ?, ?)
`);

db.transaction(() => {
  db.exec('DELETE FROM message_drafts; DELETE FROM patients; DELETE FROM sqlite_sequence;');
  for (const p of patients) {
    insert.run(
      p.name,
      p.phone,
      addDays(now, p.consultation),
      addDays(now, p.followup),
      p.completed ? 'completed' : 'pending',
      p.completed ? new Date().toISOString() : null,
    );
  }
})();

console.log(`Seeded ${patients.length} fictional patients into ${config.dbPath} (today is ${now}).`);
