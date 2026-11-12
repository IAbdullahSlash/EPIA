const path = require('path');

const root = path.join(__dirname, '..');
require('dotenv').config({ path: path.join(root, '.env'), quiet: true });

module.exports = {
  port: Number(process.env.PORT) || 3000,
  dbPath: path.resolve(root, process.env.DB_PATH || 'data/epia.db'),
  clinicName: process.env.CLINIC_NAME || 'EPIA Fertility',
  timezone: process.env.CLINIC_TIMEZONE || Intl.DateTimeFormat().resolvedOptions().timeZone,
  gemini: {
    apiKey: process.env.GEMINI_API_KEY || '',
    model: process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite',
    fallbackModel: process.env.GEMINI_FALLBACK_MODEL ?? 'gemini-3.8-flash',
  },
};
