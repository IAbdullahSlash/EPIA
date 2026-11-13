# Setup

## Requirements

- Node.js 22 or newer
- A Google Gemini API key (optional, the app runs in mock mode without one)

## Dependencies

| Package | Purpose |
|---|---|
| `express` | Web server and REST API |
| `better-sqlite3` | SQLite database |
| `dotenv` | Loads settings from `.env` |
| `supertest` (dev) | API tests |

All of these are installed with `npm install`.

## Installation

```bash
git clone https://github.com/IAbdullahSlash/EPIA.git
cd EPIA
npm install
cp .env.example .env
npm run seed
npm start
```

Then open http://localhost:3000.

## Configuration

Settings live in `.env`:

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | Server port |
| `DB_PATH` | `./data/epia.db` | Database file |
| `CLINIC_NAME` | `EPIA Fertility` | Name used in the messages |
| `CLINIC_TIMEZONE` | system timezone | Decides what "today" means |
| `GEMINI_API_KEY` | empty | Turns on AI drafts |
| `GEMINI_MODEL` | `gemini-3.1-flash-lite` | Main model |
| `GEMINI_FALLBACK_MODEL` | `gemini-3.8-flash` | Backup model |

## Commands

| Command | What it does |
|---|---|
| `npm start` | Starts the server |
| `npm run seed` | Resets the database with fictional patients |
| `npm test` | Runs the tests |

See [README.md](README.md) for the full API reference.
