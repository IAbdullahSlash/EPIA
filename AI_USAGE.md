# AI Usage Note

## AI tools used

| Tool | How it was used |
|---|---|
| **Claude Code** (Anthropic, Claude Opus 5.5) | Coding assistant. It wrote most of the implementation from my requirements and decisions: the Express API, validation, SQLite schema, Gemini integration, staff review page, tests and README. It also tested the app in a browser and debugged issues, such as a retired Gemini model and overloaded models timing out. |
| **Google Gemini** (`gemini-3.1-flash-lite`, fallback `gemini-3.8-flash`) | The AI model inside the product, generating the WhatsApp follow-up drafts. |

## What I did personally

> TODO: replace this section with your own honest account before submitting.

Examples of what to cover, keeping only what is true:

- Decisions I made, e.g. choosing Gemini, a web page for staff review, and no comments in the code.
- Code I wrote or changed myself.
- Parts I reviewed line by line and can explain.
- What I tested manually, e.g. the generate, edit, approve and complete flow in the browser.
- The demo video and the submission.

## Notes

- No real patient data was used. All patients are fictional.
- No message is sent automatically. Every AI draft needs staff approval, and sending is a manual step in WhatsApp.
