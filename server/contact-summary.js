// Weekly contact-form summary email. Sends every Monday ~09:00 Europe/Oslo to CONTACT_TO.
// Stateful: writes last-sent ISO week to content/contact-summary-state.json to avoid duplicates on restart.
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');

const ROOT = path.resolve(__dirname, '..');
const INQ_PATH = process.env.INQUIRIES_PATH || path.join(ROOT, 'content', 'inquiries.json');
const STATE_PATH = path.join(ROOT, 'content', 'contact-summary-state.json');

function escHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function getMailer() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS,
          GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN, GMAIL_USER } = process.env;
  if (SMTP_HOST && SMTP_USER && SMTP_PASS) {
    return nodemailer.createTransport({
      host: SMTP_HOST,
      port: parseInt(SMTP_PORT || '587', 10),
      secure: parseInt(SMTP_PORT || '587', 10) === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });
  }
  if (GMAIL_CLIENT_ID && GMAIL_CLIENT_SECRET && GMAIL_REFRESH_TOKEN && GMAIL_USER) {
    return nodemailer.createTransport({
      service: 'gmail',
      auth: { type: 'OAuth2', user: GMAIL_USER, clientId: GMAIL_CLIENT_ID, clientSecret: GMAIL_CLIENT_SECRET, refreshToken: GMAIL_REFRESH_TOKEN },
    });
  }
  return null;
}

function osloParts(date) {
  // Returns { y, m, d, hour, weekday } in Europe/Oslo. weekday: 1=Mon..7=Sun
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Oslo', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', hour12: false, weekday: 'short',
  });
  const parts = Object.fromEntries(fmt.formatToParts(date).map(p => [p.type, p.value]));
  const wkMap = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  return { y: parts.year, m: parts.month, d: parts.day, hour: parseInt(parts.hour, 10), weekday: wkMap[parts.weekday] || 0 };
}

function isoWeekKey(date) {
  // Use Oslo date for stability around midnight. ISO week is fine to derive from UTC date with offset adjustment;
  // for our needs the Oslo year+ordinal-week is sufficient and uniquely identifies "this Monday".
  const p = osloParts(date);
  // Cheap key: yyyy-mm-dd of the Monday-of-week (approximate via day-of-week).
  const local = new Date(`${p.y}-${p.m}-${p.d}T00:00:00`);
  const dow = p.weekday; // 1..7, Mon=1
  const monday = new Date(local.getTime() - (dow - 1) * 86400000);
  return monday.toISOString().slice(0, 10);
}

function loadState() { try { return JSON.parse(fs.readFileSync(STATE_PATH, 'utf-8')); } catch { return {}; } }
function saveState(s) {
  try { fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true }); fs.writeFileSync(STATE_PATH, JSON.stringify(s, null, 2) + '\n'); } catch {}
}

function loadItems() { try { return JSON.parse(fs.readFileSync(INQ_PATH, 'utf-8')).items || []; } catch { return []; } }

function buildSummary(items, days = 7) {
  const cutoff = Date.now() - days * 86400000;
  const recent = items.filter(it => { const t = Date.parse(it.ts || ''); return Number.isFinite(t) && t >= cutoff; });
  const real = recent.filter(it => !it.blocked);
  const spam = recent.filter(it => it.blocked);
  const groupBy = (arr, key) => {
    const m = {};
    for (const it of arr) { const k = it[key] || '—'; m[k] = (m[k] || 0) + 1; }
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  };
  return {
    days, total: recent.length, real_count: real.length, spam_count: spam.length,
    by_reason: groupBy(spam, 'blocked'),
    by_country: groupBy(recent, 'country').slice(0, 10),
    by_domain_spam: groupBy(spam, 'email_domain').slice(0, 10),
    real,
  };
}

function renderHtml(s) {
  const row = (label, count, total) => `<tr><td style="padding:4px 12px 4px 0;color:#6b7a87;">${escHtml(label)}</td><td style="padding:4px 0;text-align:right;font-weight:600;">${count}</td></tr>`;
  const block = (title, pairs) => pairs.length
    ? `<h3 style="font-size:13px;margin:18px 0 6px;color:#1c2e3f;text-transform:uppercase;letter-spacing:0.06em;">${title}</h3><table style="border-collapse:collapse;font-size:14px;">${pairs.map(([k, v]) => row(k, v)).join('')}</table>`
    : '';
  const realList = s.real.length
    ? `<h3 style="font-size:13px;margin:18px 0 6px;color:#1c2e3f;text-transform:uppercase;letter-spacing:0.06em;">Real inquiries (${s.real.length})</h3>` +
      s.real.map(it => `<div style="padding:10px 0;border-top:1px solid #e3e8ec;font-size:14px;line-height:1.5;">
        <strong>${escHtml(it.name || '?')}</strong>${it.company ? ' · ' + escHtml(it.company) : ''} — <a href="mailto:${escHtml(it.email || '')}" style="color:#2f6675;">${escHtml(it.email || '')}</a><br>
        <span style="color:#6b7a87;font-size:12px;">${escHtml(it.ts || '')} · ${escHtml(it.country || '—')} · ${escHtml(it.ip || '')}</span>
        ${it.message ? `<div style="margin:6px 0 0;white-space:pre-wrap;color:#1c2e3f;">${escHtml(String(it.message).slice(0, 400))}${(it.message||'').length>400?'…':''}</div>` : ''}
      </div>`).join('')
    : '<p style="color:#6b7a87;font-size:14px;margin:18px 0 0;">No real inquiries this week.</p>';

  return `<!doctype html><html><body style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#1c2e3f;max-width:640px;margin:0 auto;padding:24px;">
    <h1 style="font-size:22px;margin:0 0 8px;">Scale42 — weekly contact summary</h1>
    <p style="color:#6b7a87;margin:0 0 18px;">Last ${s.days} days · ${s.total} submissions (${s.real_count} real, ${s.spam_count} blocked)</p>
    ${block('Blocked by reason', s.by_reason)}
    ${block('By country', s.by_country)}
    ${block('Top spam domains', s.by_domain_spam)}
    ${realList}
    <p style="color:#6b7a87;font-size:12px;margin:24px 0 0;">Full log: <a href="https://www.scale-42.com/cms/inquiries.html" style="color:#2f6675;">/cms/inquiries.html</a></p>
  </body></html>`;
}

async function sendSummary() {
  const t = getMailer();
  if (!t) { console.warn('[contact-summary] SMTP not configured, skipping'); return; }
  const items = loadItems();
  const s = buildSummary(items, 7);
  const to = process.env.CONTACT_SUMMARY_TO || process.env.CONTACT_TO || 'info@scale-42.com';
  const fromUser = process.env.GMAIL_USER || process.env.SMTP_USER;
  const fromAlias = process.env.MAIL_FROM || fromUser;
  const subject = `Scale42 contact summary — ${s.real_count} real, ${s.spam_count} blocked (7d)`;
  const html = renderHtml(s);
  await t.sendMail({
    from: `"Scale42 website" <${fromAlias}>`,
    envelope: { from: fromUser, to: to.split(',').map(x => x.trim()) },
    to, subject, html,
    text: `Scale42 weekly contact summary\n\n${s.real_count} real, ${s.spam_count} blocked over ${s.days} days.\nSee https://www.scale-42.com/cms/inquiries.html`,
  });
  console.log(`[contact-summary] sent to=${to} real=${s.real_count} spam=${s.spam_count}`);
}

function tick() {
  try {
    const now = new Date();
    const p = osloParts(now);
    // Fire Mondays at 09:xx Oslo time (any minute in the 9 o'clock hour).
    if (p.weekday !== 1 || p.hour !== 9) return;
    const key = isoWeekKey(now);
    const state = loadState();
    if (state.last_sent_week === key) return;
    state.last_sent_week = key;
    state.last_sent_at = now.toISOString();
    saveState(state);
    sendSummary().catch(e => console.error('[contact-summary] send failed:', e.message));
  } catch (e) { console.error('[contact-summary] tick error:', e.message); }
}

function start() {
  // Check every 15 minutes — Monday 09:00 Oslo will be hit reliably.
  setInterval(tick, 15 * 60 * 1000);
  // Also run once at startup so a freshly-deployed Monday 09:xx still fires.
  setTimeout(tick, 30 * 1000);
  console.log('[contact-summary] scheduler started (Mon 09:00 Europe/Oslo)');
}

module.exports = { start, sendSummary, buildSummary };
