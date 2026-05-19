// Public contact-form handler. Sends email via SMTP, appends to inquiries.json.
// Mounted PUBLICLY (no auth middleware) — rate-limited and honeypot-guarded.
const express = require('express');
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
let geoip = null;
try { geoip = require('geoip-lite'); } catch { /* optional dep — country/region/city fall back to null */ }

const router = express.Router();
const ROOT = path.resolve(__dirname, '..', '..');
// Persistent across deploys when INQUIRIES_PATH points at a Coolify volume mount.
// Falls back to repo-local path for local dev.
const INQ_PATH = process.env.INQUIRIES_PATH || path.join(ROOT, 'content', 'inquiries.json');

// Rate limit: max 2 submissions / 7 days / IP. The 3rd attempt within the window
// bans that IP for 30 days (returns 429 instantly, no work done).
// State is persisted to the runtime volume so deploys don't reset bans.
const RATE_PATH = process.env.RATE_PATH
  || path.join(path.dirname(INQ_PATH), 'rate-limit.json');
const WEEK_MS = 7 * 24 * 3600_000;
const BAN_MS = 30 * 24 * 3600_000;
const MAX_PER_WEEK = 2;
let rateState = { hits: {}, bans: {} }; // hits: ip->[ts,...]; bans: ip->banUntilMs
try { rateState = JSON.parse(fs.readFileSync(RATE_PATH, 'utf-8')); } catch {}
function saveRateState() {
  try {
    fs.mkdirSync(path.dirname(RATE_PATH), { recursive: true });
    fs.writeFileSync(RATE_PATH, JSON.stringify(rateState), 'utf-8');
  } catch (e) { console.warn('[contact] saveRateState failed:', e.message); }
}
function clientIp(req) { return (req.headers['x-forwarded-for'] || req.ip || '').split(',')[0].trim(); }
function rateLimit(req, res, next) {
  const ip = clientIp(req);
  if (!ip) return next();
  const now = Date.now();
  // Sweep stale bans
  for (const [k, until] of Object.entries(rateState.bans)) {
    if (until < now) delete rateState.bans[k];
  }
  // Banned?
  const banUntil = rateState.bans[ip];
  if (banUntil && banUntil > now) {
    const days = Math.ceil((banUntil - now) / 86400_000);
    return res.status(429).send(`This IP is blocked from submitting (${days} day${days === 1 ? '' : 's'} remaining). If this is a mistake, email info@scale-42.com directly.`);
  }
  // Trim hits to the last week
  const arr = (rateState.hits[ip] || []).filter(t => now - t < WEEK_MS);
  if (arr.length >= MAX_PER_WEEK) {
    rateState.bans[ip] = now + BAN_MS;
    delete rateState.hits[ip];
    saveRateState();
    console.warn(`[contact] BANNED ip=${ip} for 30d (exceeded ${MAX_PER_WEEK}/week)`);
    return res.status(429).send('This IP is blocked from submitting for 30 days. Email info@scale-42.com directly.');
  }
  arr.push(now);
  rateState.hits[ip] = arr;
  // GC: drop any ip whose hits all expired
  if (Object.keys(rateState.hits).length > 5000) {
    for (const [k, list] of Object.entries(rateState.hits)) {
      const fresh = list.filter(t => now - t < WEEK_MS);
      if (!fresh.length) delete rateState.hits[k]; else rateState.hits[k] = fresh;
    }
  }
  saveRateState();
  next();
}

// Per-/24 burst tracking: ≥3 blocked submissions in 10 min → ban that /24 for 24 h.
const recentBlocksBySubnet = new Map();
const bannedSubnets = new Map();
function subnet24(ip) { const m = String(ip || '').match(/^(\d+)\.(\d+)\.(\d+)\./); return m ? `${m[1]}.${m[2]}.${m[3]}` : null; }
function isSubnetBanned(ip) {
  const s = subnet24(ip); if (!s) return false;
  const until = bannedSubnets.get(s);
  if (!until) return false;
  if (Date.now() > until) { bannedSubnets.delete(s); return false; }
  return true;
}
function noteBlock(ip) {
  const s = subnet24(ip); if (!s) return;
  const now = Date.now();
  const arr = (recentBlocksBySubnet.get(s) || []).filter(t => now - t < 10 * 60_000);
  arr.push(now);
  recentBlocksBySubnet.set(s, arr);
  if (arr.length >= 3) bannedSubnets.set(s, now + 24 * 3600_000);
}

// Disposable email providers — auto-blocked. Real users on these are vanishingly rare.
const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com','guerrillamail.com','guerrillamail.net','guerrillamail.org','guerrillamail.biz',
  'sharklasers.com','grr.la','spam4.me','tempmail.com','temp-mail.org','10minutemail.com','10minutemail.net',
  'yopmail.com','yopmail.fr','trashmail.com','trashmail.de','maildrop.cc','getairmail.com','dispostable.com',
  'mintemail.com','throwawaymail.com','fakeinbox.com','mailcatch.com','mailnesia.com','spamgourmet.com',
  'tempr.email','tempinbox.com','emailondeck.com','mohmal.com','mvrht.com','spambox.us','byom.de',
  'inboxbear.com','tempail.com','tempemail.net','tempmailaddress.com','jetable.org','spambog.com',
  'discard.email','discardmail.com','mailtemp.info','mail-temp.com','tempmail.email','cock.li',
]);

let transporter = null;
function getTransporter() {
  if (transporter) return transporter;
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS,
          GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN, GMAIL_USER } = process.env;
  // Path 1: SMTP with app password
  if (SMTP_HOST && SMTP_USER && SMTP_PASS) {
    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: parseInt(SMTP_PORT || '587', 10),
      secure: parseInt(SMTP_PORT || '587', 10) === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });
    return transporter;
  }
  // Path 2: Gmail OAuth2 (XOAUTH2) — user is the Workspace mailbox to send from
  if (GMAIL_CLIENT_ID && GMAIL_CLIENT_SECRET && GMAIL_REFRESH_TOKEN && GMAIL_USER) {
    transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        type: 'OAuth2',
        user: GMAIL_USER,
        clientId: GMAIL_CLIENT_ID,
        clientSecret: GMAIL_CLIENT_SECRET,
        refreshToken: GMAIL_REFRESH_TOKEN,
      },
    });
    return transporter;
  }
  return null;
}

function appendInquiry(entry) {
  let data = { items: [] };
  try { data = JSON.parse(fs.readFileSync(INQ_PATH, 'utf-8')); } catch {}
  data.items = data.items || [];
  data.items.unshift(entry);
  // Auto-purge blocked/spam entries older than 30 days. Real (non-blocked) entries are kept forever.
  const cutoff = Date.now() - 30 * 24 * 3600 * 1000;
  data.items = data.items.filter(it => {
    if (!it || !it.blocked) return true;
    const t = Date.parse(it.ts || '');
    return !(Number.isFinite(t) && t < cutoff);
  });
  if (data.items.length > 5000) data.items.length = 5000;
  fs.mkdirSync(path.dirname(INQ_PATH), { recursive: true });
  fs.writeFileSync(INQ_PATH, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

function escHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const BRAND = { ink: '#1c2e3f', accent: '#2f6675', gold: '#e8b87a', muted: '#6b7a87', line: '#e3e8ec', bgSoft: '#f6f8fa' };

function emailShell(innerHtml, preheader) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Scale42</title></head>
<body style="margin:0;padding:0;background:${BRAND.bgSoft};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:${BRAND.ink};">
<div style="display:none;max-height:0;overflow:hidden;color:transparent;opacity:0;">${escHtml(preheader || '')}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BRAND.bgSoft};padding:32px 16px;">
  <tr><td align="center">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:#ffffff;border:1px solid ${BRAND.line};border-radius:12px;overflow:hidden;">
      <tr><td style="background:${BRAND.ink};padding:24px 32px;">
        <table width="100%" role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
          <td style="color:#ffffff;font-size:20px;font-weight:600;letter-spacing:-0.01em;">Scale42</td>
          <td align="right" style="color:rgba(255,255,255,0.6);font-size:11px;text-transform:uppercase;letter-spacing:0.12em;">Pan-Nordic AI infrastructure</td>
        </tr></table>
      </td></tr>
      <tr><td style="padding:32px;">${innerHtml}</td></tr>
      <tr><td style="background:${BRAND.bgSoft};padding:18px 32px;border-top:1px solid ${BRAND.line};color:${BRAND.muted};font-size:12px;line-height:1.5;">
        Scale42 AS · <a href="https://www.scale-42.com/" style="color:${BRAND.accent};text-decoration:none;">scale-42.com</a> · <a href="mailto:info@scale-42.com" style="color:${BRAND.accent};text-decoration:none;">info@scale-42.com</a>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

function renderInquiryEmail({ name, company, email, phone, message, niceTs, meta }) {
  const row = (label, value, isLink, linkPrefix) => {
    if (!value && value !== 0) value = `<span style="color:${BRAND.muted};">—</span>`;
    else if (isLink) value = `<a href="${linkPrefix}${escHtml(value)}" style="color:${BRAND.accent};text-decoration:none;">${escHtml(value)}</a>`;
    else value = escHtml(value);
    return `<tr>
      <td style="padding:6px 0;width:130px;color:${BRAND.muted};font-size:11px;text-transform:uppercase;letter-spacing:0.08em;font-weight:600;vertical-align:top;">${label}</td>
      <td style="padding:6px 0;font-size:14px;color:${BRAND.ink};word-break:break-word;">${value}</td>
    </tr>`;
  };
  const m = meta || {};
  const loc = [m.city, m.region, m.country].filter(Boolean).join(', ') || null;
  const fillMs = m.fill_ms == null ? null
    : m.fill_ms < 1000 ? `${m.fill_ms}ms`
    : m.fill_ms < 60000 ? `${(m.fill_ms/1000).toFixed(1)}s`
    : `${Math.round(m.fill_ms/1000)}s`;
  const signals = [
    m.js_ran ? 'js✓' : 'js✗',
    fillMs ? `fill ${fillMs}` : null,
    m.link_count ? `${m.link_count} link${m.link_count===1?'':'s'} in message` : null,
    m.honey_filled && m.honey_filled.length ? `honeypot:${m.honey_filled.join(',')}` : null,
    m.tz_offset != null ? `tz${m.tz_offset}` : null,
  ].filter(Boolean).join(' · ') || null;

  const inner = `
    <p style="margin:0 0 4px;color:${BRAND.muted};font-size:12px;text-transform:uppercase;letter-spacing:0.12em;font-weight:600;">New website inquiry</p>
    <h1 style="margin:0 0 24px;font-size:24px;font-weight:600;letter-spacing:-0.01em;color:${BRAND.ink};">${escHtml(name)}${company ? ` <span style="color:${BRAND.muted};font-weight:400;">· ${escHtml(company)}</span>` : ''}</h1>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid ${BRAND.line};margin:0 0 24px;">
      ${row('From', name)}
      ${row('Company', company)}
      ${row('Email', email, true, 'mailto:')}
      ${row('Phone', phone, !!phone, 'tel:')}
    </table>
    <div style="background:${BRAND.bgSoft};border-left:3px solid ${BRAND.accent};padding:20px 24px;border-radius:0 8px 8px 0;margin:0 0 24px;">
      <p style="margin:0 0 8px;color:${BRAND.muted};font-size:11px;text-transform:uppercase;letter-spacing:0.08em;font-weight:600;">Message</p>
      <p style="margin:0;font-size:15px;line-height:1.55;color:${BRAND.ink};white-space:pre-wrap;">${escHtml(message)}</p>
    </div>
    <p style="margin:0 0 8px;color:${BRAND.muted};font-size:11px;text-transform:uppercase;letter-spacing:0.08em;font-weight:600;border-top:1px solid ${BRAND.line};padding-top:18px;">Submission details</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;">
      ${row('Submitted', niceTs ? `${niceTs} (Oslo)` : null)}
      ${row('IP', m.ip)}
      ${row('Location', loc)}
      ${row('Geo timezone', m.timezone_geo)}
      ${row('Client tz offset', m.tz_offset == null ? null : String(m.tz_offset))}
      ${row('Signals', signals)}
      ${row('Email domain', m.email_domain)}
      ${row('Origin', m.origin)}
      ${row('Referer', m.referer)}
      ${row('Accept-Language', m.accept_language)}
      ${row('User agent', m.ua)}
    </table>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 8px;">
      <tr>
        <td style="padding:14px 20px;background:${BRAND.ink};border-radius:8px;text-align:center;">
          <a href="mailto:${escHtml(email)}?subject=Re%3A%20your%20Scale42%20inquiry" style="color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;">Reply to ${escHtml(name)} →</a>
        </td>
      </tr>
    </table>
    <p style="margin:16px 0 0;color:${BRAND.muted};font-size:12px;">Replying goes directly to the sender. Full log: <a href="https://www.scale-42.com/cms/inquiries.html" style="color:${BRAND.accent};">/cms/inquiries.html</a></p>
  `;
  return emailShell(inner, `New inquiry from ${name}${company ? ' at ' + company : ''}`);
}

function renderAutoReply({ name }) {
  const inner = `
    <p style="margin:0 0 4px;color:${BRAND.muted};font-size:12px;text-transform:uppercase;letter-spacing:0.12em;font-weight:600;">Thanks for reaching out</p>
    <h1 style="margin:0 0 16px;font-size:24px;font-weight:600;letter-spacing:-0.01em;color:${BRAND.ink};">We've received your message, ${escHtml((name || '').split(' ')[0] || 'there')}.</h1>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:${BRAND.ink};">A member of the Scale42 team will be in touch.</p>
    <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:${BRAND.ink};">In the meantime, you can browse our pan-Nordic <a href="https://www.scale-42.com/datacenters/" style="color:${BRAND.accent};text-decoration:none;font-weight:600;">site portfolio</a> or read about our <a href="https://www.scale-42.com/solutions/" style="color:${BRAND.accent};text-decoration:none;font-weight:600;">solutions</a>.</p>
    <div style="background:${BRAND.bgSoft};padding:18px 22px;border-radius:8px;margin:0 0 0;">
      <p style="margin:0;color:${BRAND.muted};font-size:13px;line-height:1.55;">For urgent matters, email <a href="mailto:info@scale-42.com" style="color:${BRAND.accent};text-decoration:none;">info@scale-42.com</a> directly.</p>
    </div>
  `;
  return emailShell(inner, `Thanks — we'll be in touch.`);
}

router.post('/contact',
  express.urlencoded({ extended: false, limit: '64kb' }),
  rateLimit,
  async (req, res) => {
    try {
      const b = req.body || {};
      const now = Date.now();

      // Field rename: real fields are full_name / email_addr; literal "name"/"email" are not used (decoy-free in B).
      const inquiry_type = String(b.inquiry_type || 'general').slice(0, 40);
      const name = String(b.full_name || b.name || '').trim().slice(0, 200);
      const company = String(b.company || '').trim().slice(0, 200);
      const email = String(b.email_addr || b.email || '').trim().slice(0, 200);
      const phone = String(b.phone || '').trim().slice(0, 60);
      const mw = String(b.mw || '').trim().slice(0, 40);
      const message = String(b.message || '').trim().slice(0, 5000);

      // Request metadata
      const xff = String(req.headers['x-forwarded-for'] || '').trim();
      const ip = (xff || req.ip || '').split(',')[0].trim();
      const ua = String(req.headers['user-agent'] || '').slice(0, 500);
      const referer = String(req.headers.referer || '').slice(0, 500);
      const origin = String(req.headers.origin || req.headers.referer || '');
      let country = String(req.headers['cf-ipcountry'] || req.headers['x-vercel-ip-country'] || '').slice(0, 8) || null;
      let region = null, city = null, timezone_geo = null, ip_lat = null, ip_lon = null;
      if (geoip && ip) {
        try {
          const g = geoip.lookup(ip);
          if (g) {
            if (!country) country = g.country || null;
            region = g.region || null;
            city = g.city || null;
            timezone_geo = g.timezone || null;
            if (Array.isArray(g.ll) && g.ll.length === 2) { ip_lat = g.ll[0]; ip_lon = g.ll[1]; }
          }
        } catch {}
      }
      const accept_language = String(req.headers['accept-language'] || '').slice(0, 200);
      const ts = new Date(now).toISOString();

      // Form-supplied client signals
      const tsClient = parseInt(String(b._ts || ''), 10);
      const fill_ms = Number.isFinite(tsClient) && tsClient > 0 ? (now - tsClient) : null;
      const js_ran = String(b._token || '') === 'ok';
      const tz_offset = (() => { const n = parseInt(String(b._tz || ''), 10); return Number.isFinite(n) ? n : null; })();

      // Derived signals
      const email_domain = (email.split('@')[1] || '').toLowerCase().slice(0, 100);
      const link_count = (message.match(/https?:\/\/|www\./gi) || []).length;
      const honey_filled = [];
      if (b.website && String(b.website).trim() !== '') honey_filled.push('website');

      // Spam checks — set `blocked` instead of early-returning, so we always log.
      let blocked = null;
      if (isSubnetBanned(ip)) blocked = 'burst_subnet';
      else if (DISPOSABLE_DOMAINS.has(email_domain)) blocked = 'disposable_email';
      else if (honey_filled.length) blocked = 'honeypot';
      else if (!js_ran) blocked = 'no_js';
      else if (fill_ms !== null && fill_ms < 2500) blocked = 'too_fast';
      else if (fill_ms !== null && fill_ms > 6 * 3600 * 1000) blocked = 'stale';
      else if (!/^https?:\/\/(www\.)?scale-42\.com(\/|$)/i.test(origin) && !/^https?:\/\/localhost(:|\/|$)/i.test(origin)) blocked = 'bad_origin';
      else if (/[Ѐ-ӿ]/.test(`${name} ${company} ${message}`)) blocked = 'cyrillic';
      // "Robertfup / Williamfup / Jamesfup …" — known WP spambot name pattern.
      else if (/^[A-Za-z]{3,20}(fup|kar|sib|jak|hib|gob|tek|met|mok|nuh|pak)$/i.test(name.replace(/\s+/g, ''))) blocked = 'spam_pattern';
      // Single big-tech word as company when the email domain doesn't match it.
      else if (company && /^(google|amazon|microsoft|apple|facebook|meta|openai|tesla|netflix|nvidia)$/i.test(company.trim()) && !email_domain.includes(company.trim().toLowerCase())) blocked = 'spam_pattern';
      // Phone is 10-15 digits with no separators AND message is < 60 chars in a non-Nordic/EN language hint.
      else if (/^\+?\d{10,15}$/.test(phone) && message.length < 80 && /[áéíóúñçàèìòù]/i.test(message)) blocked = 'spam_pattern';

      // Required-field check only applies if not already blocked — bots often omit fields.
      if (!blocked && (!name || !email || !message)) {
        return res.status(400).send('Missing required fields. <a href="/contact/">Back</a>.');
      }
      if (!blocked && !/^\S+@\S+\.\S+$/.test(email)) {
        return res.status(400).send('Invalid email. <a href="/contact/">Back</a>.');
      }

      const entry = {
        ts, inquiry_type, name, company, email, phone, mw, message,
        ip, xff, ua, referer, origin,
        country, region, city, timezone_geo, ip_lat, ip_lon,
        accept_language,
        fill_ms, js_ran, tz_offset,
        email_domain, link_count,
        message_length: message.length, name_length: name.length, company_length: company.length,
        honey_filled,
        blocked,
      };

      if (blocked) {
        console.warn(`[contact] BLOCKED reason=${blocked} ip=${ip} country=${country || '?'} email=${email || '(none)'} fill_ms=${fill_ms}`);
        try { noteBlock(ip); } catch {}
        try { appendInquiry(entry); } catch {}
        return res.redirect(303, '/contact/sent/');
      }

      const t = getTransporter();
      if (t) {
        const to = process.env.CONTACT_TO || 'info@scale-42.com';
        const subject = `New website inquiry — ${name}${company ? ' (' + company + ')' : ''}`;
        const niceTs = new Date(ts).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Oslo' });
        const text = [
          `New inquiry from the Scale42 website`,
          ``,
          `From:    ${name}${company ? ' (' + company + ')' : ''}`,
          `Email:   ${email}`,
          `Phone:   ${phone || '—'}`,
          ``,
          `Message:`,
          message,
          ``,
          `Submitted ${niceTs} from ${ip}`,
          `Reply directly to this email — it goes to ${name}.`,
        ].join('\n');
        const html = renderInquiryEmail({ name, company, email, phone, message, niceTs, meta: entry });
        try {
          const fromUser = process.env.GMAIL_USER || process.env.SMTP_USER;
          const fromAlias = process.env.MAIL_FROM || fromUser;
          const info = await t.sendMail({
            from: `"Scale42 website" <${fromAlias}>`,
            envelope: { from: fromUser, to: to.split(',').map(s => s.trim()) },
            to,
            replyTo: `"${name}" <${email}>`,
            subject,
            text,
            html,
          });
          entry.email_sent = true;
          entry.message_id = info.messageId;
          entry.smtp_response = info.response;
          console.log(`[contact] email OK to=${to} msgId=${info.messageId} resp=${info.response}`);

          // Auto-reply to the submitter
          try {
            const replyHtml = renderAutoReply({ name });
            const replyText = `Hi ${(name || '').split(' ')[0] || 'there'},\n\nThanks for reaching out to Scale42. A member of our team will be in touch.\n\nFor urgent matters, email info@scale-42.com directly.\n\n— The Scale42 team`;
            await t.sendMail({
              from: `"Scale42" <${fromAlias}>`,
              envelope: { from: fromUser, to: [email] },
              to: email,
              replyTo: 'info@scale-42.com',
              subject: 'We received your message — Scale42',
              text: replyText,
              html: replyHtml,
            });
            entry.autoreply_sent = true;
            console.log(`[contact] auto-reply OK to=${email}`);
          } catch (e) {
            entry.autoreply_sent = false;
            entry.autoreply_error = String((e && e.message) || e);
            console.warn('[contact] auto-reply FAILED:', (e && e.message) || e);
          }
          try { appendInquiry(entry); } catch {}
        } catch (e) {
          entry.email_sent = false;
          entry.email_error = String((e && e.message) || e);
          console.error('[contact] SMTP send FAILED:', (e && e.message) || e);
          try { appendInquiry(entry); } catch {}
        }
      } else {
        console.warn('[contact] submission received but SMTP not configured');
        try { appendInquiry(entry); } catch {}
      }

      res.redirect(303, '/contact/sent/');
    } catch (e) {
      console.error('contact handler error', e);
      res.status(500).send('Server error. Please email info@scale-42.com directly.');
    }
  });

module.exports = router;
