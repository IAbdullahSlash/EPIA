const path = require('path');
const express = require('express');
const patientsRouter = require('./routes/patients');
const followupsRouter = require('./routes/followups');
const { notFound, errorHandler } = require('./errors');

function createApp({ db, config, fetchImpl }) {
  const app = express();
  app.use(express.json({ limit: '100kb' }));
  app.use(express.static(path.join(__dirname, '..', 'public')));

  app.get('/api/health', (req, res) =>
    res.json({
      status: 'ok',
      ai_mode: config.gemini?.apiKey ? 'ai' : 'mock',
      ai_model: config.gemini?.apiKey ? config.gemini.model : null,
      clinic: config.clinicName,
      timezone: config.timezone,
    }),
  );
  app.use('/api/patients', patientsRouter({ db, config }));
  app.use('/api', followupsRouter({ db, config, fetchImpl }));

  app.use(notFound);
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
