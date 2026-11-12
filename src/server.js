const config = require('./config');
const { openDatabase } = require('./db');
const { createApp } = require('./app');

const db = openDatabase(config.dbPath);
const app = createApp({ db, config });

app.listen(config.port, () => {
  console.log(`EPIA follow-up API running at http://localhost:${config.port}`);
  console.log(`Clinic timezone: ${config.timezone}`);
});
