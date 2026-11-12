const $ = (selector) => document.querySelector(selector);

const escapeHtml = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

async function api(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json' },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(data.error || `Request failed (${res.status})`);
    error.details = data.details;
    throw error;
  }
  return data;
}

let toastTimer;
function toast(message, isError = false) {
  const el = $('#toast');
  el.textContent = message;
  el.className = `toast${isError ? ' error' : ''}`;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), 4000);
}

const sourceBadge = (draft) =>
  draft.source === 'ai'
    ? `<span class="badge ai" title="Written by Gemini">AI · ${escapeHtml(draft.model || 'Gemini')}</span>`
    : '<span class="badge mock" title="Gemini was unavailable, so a template was used">Mock draft</span>';

function renderMode(health) {
  const el = $('#mode');
  if (health.ai_mode === 'ai') {
    el.className = 'badge ai';
    el.textContent = `AI: ${health.ai_model}`;
  } else {
    el.className = 'badge mock';
    el.textContent = 'Mock mode (no Gemini key)';
    el.title = 'Set GEMINI_API_KEY in .env to generate drafts with Gemini.';
  }
}

function renderDue({ date, patients }) {
  $('#due-caption').textContent = `Pending patients due on or before ${date}.`;
  $('#due-list').innerHTML = patients.length
    ? patients
        .map(
          (p) => `
      <div class="row">
        <div><strong>${escapeHtml(p.name)}</strong> <span class="muted">${escapeHtml(p.phone)}</span></div>
        <div class="badges">
          ${p.next_followup_date < date ? `<span class="badge overdue">Overdue since ${p.next_followup_date}</span>` : '<span class="badge">Due today</span>'}
        </div>
      </div>`,
        )
        .join('')
    : '<p class="empty">No follow-ups are due.</p>';
}

function renderReview(drafts) {
  $('#review-list').innerHTML = drafts.length
    ? drafts
        .map(
          (d) => `
      <div class="card" data-id="${d.id}">
        <div class="card-head">
          <div><strong>${escapeHtml(d.patient_name)}</strong> <span class="meta">${escapeHtml(d.patient_phone)} · follow-up ${d.next_followup_date}</span></div>
          <div class="badges">${sourceBadge(d)}</div>
        </div>
        <textarea maxlength="1000" aria-label="Message for ${escapeHtml(d.patient_name)}">${escapeHtml(d.message)}</textarea>
        <div class="counter">${d.message.length} / 1000</div>
        <div class="actions">
          <button class="primary" data-action="approve">Approve</button>
          <button data-action="save">Save edit</button>
          <button class="danger" data-action="reject">Reject</button>
        </div>
      </div>`,
        )
        .join('')
    : '<p class="empty">No drafts waiting for review. Use "Generate drafts" above.</p>';
}

function renderApproved(drafts) {
  $('#approved-list').innerHTML = drafts.length
    ? drafts
        .map(
          (d) => `
      <div class="card" data-id="${d.id}" data-patient="${d.patient_id}">
        <div class="card-head">
          <div><strong>${escapeHtml(d.patient_name)}</strong> <span class="meta">${escapeHtml(d.patient_phone)}</span></div>
          <div class="badges"><span class="badge ok">Approved · not sent</span>${sourceBadge(d)}</div>
        </div>
        <p class="message">${escapeHtml(d.message)}</p>
        <div class="actions">
          <a class="button primary" href="${escapeHtml(d.whatsapp_url)}" target="_blank" rel="noopener">Open in WhatsApp</a>
          <button data-action="complete">Mark follow-up completed</button>
        </div>
      </div>`,
        )
        .join('')
    : '<p class="empty">Nothing approved yet.</p>';
}

function renderHistory(drafts) {
  $('#history-list').innerHTML = drafts.length
    ? drafts
        .map(
          (d) => `
      <div class="row">
        <div><strong>${escapeHtml(d.patient_name)}</strong> <span class="muted">${escapeHtml(d.message.slice(0, 90))}${d.message.length > 90 ? '…' : ''}</span></div>
        <div class="badges">
          <span class="badge ${d.status === 'approved' ? 'ok' : 'overdue'}">${d.status}</span>${sourceBadge(d)}
        </div>
      </div>`,
        )
        .join('')
    : '<p class="empty">No reviewed drafts yet.</p>';
}

function renderPatients(patients) {
  $('#patients').innerHTML = patients
    .map(
      (p) => `
    <tr>
      <td>${escapeHtml(p.name)}</td>
      <td>${escapeHtml(p.phone)}</td>
      <td>${p.consultation_date}</td>
      <td>${p.next_followup_date}</td>
      <td><span class="badge ${p.followup_status === 'completed' ? 'ok' : ''}">${p.followup_status}</span></td>
    </tr>`,
    )
    .join('');
}

async function refresh() {
  try {
    const [health, due, drafts, patients] = await Promise.all([
      api('/api/health'),
      api('/api/patients/due-today?includeOverdue=true'),
      api('/api/drafts'),
      api('/api/patients'),
    ]);
    renderMode(health);
    renderDue(due);
    renderReview(drafts.filter((d) => d.status === 'pending_review'));
    renderApproved(drafts.filter((d) => d.status === 'approved' && d.followup_status === 'pending'));
    renderHistory(drafts.filter((d) => d.status !== 'pending_review'));
    renderPatients(patients);
  } catch (err) {
    toast(err.message, true);
  }
}

async function withBusy(button, task) {
  button.disabled = true;
  try {
    await task();
  } catch (err) {
    toast(err.message, true);
  } finally {
    button.disabled = false;
  }
}

$('#generate').addEventListener('click', (e) => {
  const button = e.currentTarget;
  withBusy(button, async () => {
    button.textContent = 'Generating…';
    try {
      const result = await api('/api/followups/generate', { method: 'POST', body: {} });
      const parts = [`${result.generated.length} draft(s) created`];
      if (result.skipped.length) parts.push(`${result.skipped.length} skipped (already drafted)`);
      if (result.warnings.length) parts.push(`${result.warnings.length} used mock fallback`);
      toast(parts.join(', '));
      await refresh();
    } finally {
      button.textContent = 'Generate drafts';
    }
  });
});

$('#review-list').addEventListener('input', (e) => {
  if (e.target.tagName !== 'TEXTAREA') return;
  e.target.nextElementSibling.textContent = `${e.target.value.length} / 1000`;
});

$('#review-list').addEventListener('click', (e) => {
  const button = e.target.closest('button[data-action]');
  if (!button) return;
  const card = button.closest('.card');
  const id = card.dataset.id;
  const message = card.querySelector('textarea').value;

  withBusy(button, async () => {
    if (button.dataset.action === 'save') {
      await api(`/api/drafts/${id}`, { method: 'PATCH', body: { message } });
      toast('Edit saved');
    } else if (button.dataset.action === 'approve') {
      await api(`/api/drafts/${id}/approve`, { method: 'POST', body: { message } });
      toast('Approved. Nothing has been sent; use "Open in WhatsApp" to send it yourself.');
    } else if (button.dataset.action === 'reject') {
      if (!confirm('Reject this draft? You can generate a new one afterwards.')) return;
      await api(`/api/drafts/${id}/reject`, { method: 'POST' });
      toast('Draft rejected');
    }
    await refresh();
  });
});

$('#approved-list').addEventListener('click', (e) => {
  const button = e.target.closest('button[data-action="complete"]');
  if (!button) return;
  withBusy(button, async () => {
    await api(`/api/patients/${button.closest('.card').dataset.patient}/complete`, { method: 'PATCH' });
    toast('Follow-up marked as completed');
    await refresh();
  });
});

$('#add-patient').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.currentTarget;
  const errorsBox = $('#form-errors');
  errorsBox.hidden = true;
  try {
    await api('/api/patients', { method: 'POST', body: Object.fromEntries(new FormData(form)) });
    form.reset();
    toast('Patient added');
    await refresh();
  } catch (err) {
    errorsBox.innerHTML = err.details
      ? `<ul>${Object.values(err.details).map((m) => `<li>${escapeHtml(m)}</li>`).join('')}</ul>`
      : escapeHtml(err.message);
    errorsBox.hidden = false;
  }
});

refresh();
