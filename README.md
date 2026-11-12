# EPIA Patient Follow-up System

A small patient follow-up service built for the EPIA Backend & AI Automation assessment.

- **Task 1:** a REST API (Node.js, Express, SQLite) to add patients, list them, find follow-ups due today and mark follow-ups completed.
- **Task 2:** a workflow that finds due patients, asks Google Gemini to draft a personalised WhatsApp message for each, and puts every draft in front of a staff member to edit, approve or reject. **Nothing is ever sent automatically.**

All patient data in this project is fictional.

---

## Quick start

Requires **Node.js 22 or newer**.

```bash
git clone https://github.com/IAbdullahSlash/EPIA.git
cd EPIA
npm install
cp .env.example .env
npm run seed
npm start
```

Open **http://localhost:3000** for the staff review page. The API is served from the same port under `/api`.

`npm run seed` resets the database and loads 7 fictional patients with dates relative to today: 3 due today, 1 overdue, 2 upcoming and 1 already completed. Run it again at any time to start over.

### Using Gemini

Put your key in `.env`:

```
GEMINI_API_KEY=your-key-here
```

Without a key the app runs in **mock mode**: drafts come from built-in templates, are labelled "Mock draft" in the UI and `"source": "mock"` in the API, and the rest of the workflow behaves exactly the same.

If a key is already set as a system environment variable it takes priority over `.env`.

### Configuration

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `DB_PATH` | `./data/epia.db` | SQLite file, created automatically |
| `CLINIC_NAME` | `EPIA Fertility` | Name used to sign the drafts |
| `CLINIC_TIMEZONE` | system timezone | Decides what "today" means, e.g. `Asia/Dubai` |
| `GEMINI_API_KEY` | empty | Enables real AI drafts |
| `GEMINI_MODEL` | `gemini-3.1-flash-lite` | Primary model |
| `GEMINI_FALLBACK_MODEL` | `gemini-3.8-flash` | Tried if the primary fails; set it empty to disable |

---

## Running the tests

```bash
npm test
```

18 tests using Node's built-in test runner and Supertest, against an in-memory database. Gemini is replaced by a fake, so tests need no key or network.

They cover validation, error codes, the due-today logic, draft generation in AI and mock mode, model fallback, duplicate prevention, and the edit, approve and reject flow.

---

## API reference

All requests and responses are JSON. Errors always look like this:

```json
{ "error": "Validation failed", "details": { "phone": "Phone must be in international format, e.g. +923001234567" } }
```

| Status | Meaning |
|---|---|
| `400` | Invalid input, malformed JSON or a bad ID |
| `404` | Patient, draft or route not found |
| `409` | Action not allowed in the current state, e.g. completing an already completed follow-up |
| `500` | Unexpected server error, details are logged and not exposed |

### Patients (Task 1)

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/patients` | Add a patient |
| `GET` | `/api/patients` | List all patients, optional `?status=pending\|completed` |
| `GET` | `/api/patients/due-today` | Pending follow-ups due today |
| `GET` | `/api/patients/:id` | Get one patient |
| `PATCH` | `/api/patients/:id/complete` | Mark the follow-up as completed |

#### `POST /api/patients`

```bash
curl -X POST http://localhost:3000/api/patients \
  -H "Content-Type: application/json" \
  -d '{"name":"Jane Doe","phone":"+92 300 1234567","consultation_date":"2026-11-01","next_followup_date":"2026-11-15"}'
```

Validation rules:

- `name`: required, up to 100 characters.
- `phone`: required, international format starting with `+`. Spaces, dashes and brackets are stripped, so `+92 300-123 4567` is stored as `+923001234567`.
- `consultation_date`, `next_followup_date`: required, real calendar dates in `YYYY-MM-DD` format.
- `next_followup_date` cannot be earlier than `consultation_date`.

Response `201`:

```json
{
  "id": 8,
  "name": "Jane Doe",
  "phone": "+923001234567",
  "consultation_date": "2026-11-01",
  "next_followup_date": "2026-11-15",
  "followup_status": "pending",
  "completed_at": null,
  "created_at": "2026-11-13 10:00:00"
}
```

#### `GET /api/patients/due-today`

```bash
curl http://localhost:3000/api/patients/due-today
curl "http://localhost:3000/api/patients/due-today?includeOverdue=true"
curl "http://localhost:3000/api/patients/due-today?date=2026-11-20"
```

Returns pending patients whose `next_followup_date` is today in the clinic timezone. Completed follow-ups are excluded.

- `includeOverdue=true` also returns pending follow-ups from earlier dates, so a missed day doesn't drop anyone.
- `date` overrides "today", which is handy for testing.

```json
{ "date": "2026-11-13", "includeOverdue": false, "count": 3, "patients": [ ... ] }
```

#### `PATCH /api/patients/:id/complete`

```bash
curl -X PATCH http://localhost:3000/api/patients/1/complete
```

Returns the updated patient with `followup_status: "completed"` and `completed_at`. Returns `409` if it is already completed and `404` if the patient doesn't exist.

### Follow-up drafts (Task 2)

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/followups/generate` | Find due patients and create a draft for each |
| `GET` | `/api/drafts` | List drafts, optional `?status=pending_review\|approved\|rejected` |
| `PATCH` | `/api/drafts/:id` | Edit a draft's message while it is pending review |
| `POST` | `/api/drafts/:id/approve` | Approve, optionally with a final edited `message` |
| `POST` | `/api/drafts/:id/reject` | Reject the draft |
| `GET` | `/api/health` | Status, plus whether AI or mock mode is active |

#### `POST /api/followups/generate`

```bash
curl -X POST http://localhost:3000/api/followups/generate -H "Content-Type: application/json" -d '{}'
```

Optional body: `{ "date": "2026-11-13", "includeOverdue": true }`. Overdue patients are included by default.

- Patients who already have a draft awaiting review or approved are skipped, so running it twice never creates duplicates.
- A rejected draft can be regenerated.

```json
{
  "date": "2026-11-13",
  "mode": "ai",
  "due_count": 4,
  "generated": [
    { "id": 1, "patient_id": 3, "patient_name": "Omar Siddiqui", "message": "Hello Omar, ...", "source": "ai", "model": "gemini-3.1-flash-lite", "status": "pending_review" }
  ],
  "skipped": [],
  "warnings": []
}
```

#### `POST /api/drafts/:id/approve`

```bash
curl -X POST http://localhost:3000/api/drafts/1/approve -H "Content-Type: application/json" -d '{"message":"Final text after staff edits"}'
```

Marks the draft as approved and returns a `whatsapp_url` (a `wa.me` link with the message pre-filled). **The server sends nothing.** A staff member opens the link and presses send in WhatsApp themselves, then marks the follow-up completed.

---

## How the AI workflow works

```
due patients ──► Gemini (or mock) ──► draft: pending_review ──► staff edits ──► approve ──► wa.me link ──► staff sends manually
                                                                            └─► reject ──► can regenerate
```

1. **Find due patients:** pending follow-ups due today or overdue.
2. **Generate:** one Gemini call per patient, run in parallel.
3. **Review:** every draft is stored as `pending_review` and shown on the staff page, where it can be edited, approved or rejected.
4. **Send:** approval only produces a WhatsApp link. A person has to press send.

### Prompt design and privacy

The prompt is in [`src/ai/draftGenerator.js`](src/ai/draftGenerator.js). Because this is a fertility clinic and WhatsApp is not a private channel:

- Only the patient's **first name**, the consultation date and the follow-up timing are sent to the model. The surname and phone number are never sent, and a test checks this.
- The model is told never to mention diagnoses, treatments, results or anything fertility-related.
- Messages are kept short, warm and generic, ask the patient to confirm or reschedule, and are signed with the clinic name.

### Reliability and fallback

- Overload errors (`429`, `503`) are retried once with a short backoff.
- A timeout or repeated failure moves on to the fallback model.
- If every model fails, the draft falls back to a template. It is clearly labelled as a mock draft, the reason is returned in `warnings`, and it still goes through staff review.

### Limitations

- There is no real WhatsApp integration. As the brief allows, approval produces a `wa.me` link and a person sends the message.
- There is no authentication on the staff page. A real deployment would need staff logins and an audit of who approved what.
- AI output can still be imperfect, which is exactly why every draft requires human approval.

---

## Project structure

```
src/
  server.js              entry point
  app.js                 Express app and routes
  config.js              environment configuration
  db.js                  SQLite schema
  dates.js               date validation and clinic "today"
  validation.js          request validation
  errors.js              error types and handler
  routes/patients.js     Task 1 endpoints
  routes/followups.js    Task 2 endpoints
  ai/draftGenerator.js   Gemini prompt, retries, fallback and mock
public/                  staff review page (HTML, CSS, JS)
scripts/seed.js          fictional demo data
tests/                   API and workflow tests
```

## Dependencies

| Package | Purpose |
|---|---|
| `express` | HTTP server and routing |
| `better-sqlite3` | SQLite database |
| `dotenv` | Loads `.env` |
| `supertest` (dev) | HTTP testing |

Gemini is called through its REST API with Node's built-in `fetch`, so no SDK is needed.
