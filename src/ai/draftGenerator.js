const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

const SYSTEM_PROMPT = `You write WhatsApp follow-up messages for staff at a fertility clinic.
Rules:
- Warm, respectful, professional and brief: 2 to 4 short sentences, under 70 words.
- Greet the patient by first name only.
- Never mention diagnoses, treatments, test results, medication or anything about fertility. WhatsApp is not private, so keep it generic.
- Ask the patient to reply to confirm a convenient time for their follow-up, or to let the clinic know if they need to reschedule.
- Sign off with the clinic name.
- Plain text only: no markdown, no placeholders in brackets, no links, at most one emoji.
- Output only the message text.`;

function firstName(name) {
  return name.trim().split(/\s+/)[0];
}

function describeTiming(patient, today) {
  if (patient.next_followup_date === today) return 'Their follow-up is due today.';
  if (patient.next_followup_date < today) return `Their follow-up was due on ${patient.next_followup_date} and is now overdue.`;
  return `Their follow-up is due on ${patient.next_followup_date}.`;
}

function buildPrompt(patient, { clinicName, today }) {
  return [
    `Clinic name: ${clinicName}`,
    `Patient first name: ${firstName(patient.name)}`,
    `Last consultation date: ${patient.consultation_date}`,
    `Today's date: ${today}`,
    describeTiming(patient, today),
    'Write the WhatsApp message.',
  ].join('\n');
}

function mockDraft(patient, { clinicName, today }) {
  const name = firstName(patient.name);
  const overdue = patient.next_followup_date < today;
  const templates = overdue
    ? [
        `Hi ${name}, we hope you're keeping well. We noticed your follow-up with us is now due, and we'd love to make sure you're looked after. Could you reply with a time that suits you, or let us know if you'd like to reschedule? Warm regards, ${clinicName}`,
        `Hello ${name}, this is a gentle reminder from ${clinicName} that your follow-up is overdue. Please reply to let us know a convenient time and we'll arrange it for you. Take care, ${clinicName}`,
      ]
    : [
        `Hi ${name}, we hope you're doing well. Your follow-up with ${clinicName} is due today. Please reply to confirm a time that works for you, or let us know if you need to reschedule. Warm regards, ${clinicName}`,
        `Hello ${name}, this is a friendly reminder that your follow-up is scheduled for today. Just reply to confirm a convenient time, or tell us if another day suits you better. Kind regards, ${clinicName}`,
      ];
  return templates[patient.id % templates.length];
}

function cleanMessage(text) {
  return text.trim().replace(/^["'“”]+|["'“”]+$/g, '').trim();
}

const RETRYABLE_STATUS = new Set([429, 500, 503, 504]);

class GeminiError extends Error {
  constructor(message, retryable) {
    super(message);
    this.retryable = retryable;
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function callGemini(prompt, { apiKey, model, fetchImpl = fetch, timeoutMs = 10000 }) {
  let res;
  try {
    res = await fetchImpl(`${GEMINI_URL}/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7 },
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    const timedOut = err.name === 'TimeoutError';
    throw new GeminiError(`${model}: ${timedOut ? 'request timed out' : err.message}`, !timedOut);
  }

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new GeminiError(`${model} ${res.status}: ${body.error?.message || res.statusText}`, RETRYABLE_STATUS.has(res.status));
  }

  const text = (body.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
  if (!text.trim()) {
    throw new GeminiError(`${model} returned no text (finishReason: ${body.candidates?.[0]?.finishReason || 'unknown'})`, true);
  }
  return cleanMessage(text);
}

async function callWithRetries(prompt, gemini, { attempts = 2, backoffMs = 800 } = {}) {
  const models = [gemini.model, gemini.fallbackModel].filter((m, i, all) => m && all.indexOf(m) === i);
  const errors = [];
  for (const model of models) {
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        return { message: await callGemini(prompt, { ...gemini, model }), model };
      } catch (err) {
        errors.push(err.message);
        if (!err.retryable) break;
        if (attempt < attempts) await sleep(backoffMs * attempt);
      }
    }
  }
  throw new Error(errors.join(' | '));
}

async function generateDraft(patient, { clinicName, today, gemini, fetchImpl, retry }) {
  const context = { clinicName, today };
  if (!gemini?.apiKey) {
    return { message: mockDraft(patient, context), source: 'mock', warning: 'GEMINI_API_KEY not set, used mock draft' };
  }
  try {
    const { message, model } = await callWithRetries(buildPrompt(patient, context), { ...gemini, fetchImpl }, retry);
    return { message, source: 'ai', model };
  } catch (err) {
    return { message: mockDraft(patient, context), source: 'mock', warning: `AI unavailable, used mock draft: ${err.message}` };
  }
}

module.exports = { generateDraft, buildPrompt, mockDraft, SYSTEM_PROMPT };
