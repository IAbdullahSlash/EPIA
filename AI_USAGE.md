# AI Usage Note

## AI tools used

| Tool | How it was used |
|---|---|
| **Claude Code** (Claude Opus 5.5) | Wrote most of the code, including the staff review UI, the API routes, the database layer, the tests and the documentation. |
| **Google Gemini** (`gemini-3.1-flash-lite`) | The AI model inside the app that writes the WhatsApp follow-up drafts. |

## What was done by AI

The UI and most of the coding were done by Claude Opus 5.5, working from my requirements and decisions.

## What I personally did

I made the technical decisions that shaped the project:

- **REST API.** I chose a REST API over other API styles, because it is simple, widely understood, and fits a small set of patient operations well.
- **Error handling.** I set the requirement that the error handling catches edge cases such as bad inputs, for example invalid phone numbers, impossible dates, a follow-up date before the consultation, malformed requests and completing a follow-up twice. Each case returns a clear message and the right status code.
- **Gemini API.** I chose Gemini for its generous free tier, which leaves room for retries when a request fails instead of dropping straight to a template.
- **Model choice.** I set the model to `gemini-3.1-flash-lite` to keep token usage to a minimum, since a short WhatsApp message doesn't need a larger model.

## Notes

- All patient data is fictional.
- No message is sent automatically. Every draft needs staff approval, and sending is a manual step in WhatsApp.
