const path = require('path');
const express = require('express');
const patientsRouter = require('./routes/patients');
const { notFound, errorHandler } = require('./errors');

function createApp({ db, config }) {
  const app = express();
  app.use(express.json({ limit: '100kb' }));
  app.use(express.static(path.join(__dirname, '..', 'public')));

  app.get('/api/health', (req, res) => res.json({ status: 'ok' }));
  app.use('/api/patients', patientsRouter({ db, config }));

  app.use(notFound);
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
