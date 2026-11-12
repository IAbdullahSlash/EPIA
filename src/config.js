require('dotenv').config();

module.exports = {
  port: Number(process.env.PORT) || 3000,
  dbPath: process.env.DB_PATH || './data/epia.db',
  clinicName: process.env.CLINIC_NAME || 'EPIA Fertility',
  timezone: process.env.CLINIC_TIMEZONE || Intl.DateTimeFormat().resolvedOptions().timeZone,
  gemini: {
    apiKey: process.env.GEMINI_API_KEY || '',
    model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
  },
};
