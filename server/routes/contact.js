// Public contact-form handler. Sends email via SMTP, appends to inquiries.json.
// Mounted PUBLICLY (no auth middleware) — rate-limited and honeypot-guarded.
const express = require('express');
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');

const router = express.Router();
const ROOT = path.resolve(__dirname, '..', '..');
const INQ_PATH = path.join(ROOT, 'content', 'inquiries.json');

// Simple in-memory rate limit: 1 submission / 60 s / IP
const lastByIp = new Map();
function rateLimit(req, res, next) {
  const ip = (req.headers['x-forwarded-for'] || req.ip || '').split(',')[0].trim();
  const now = Date.now();
  const last = lastByIp.get(ip) || 0;
  if (now - last < 60_000) return res.status(429).send('Too many requests. Try again in a minute.');
  lastByIp.set(ip, now);
  // Garbage-collect old entries
  if (lastByIp.size > 5000) {
    for (const [k, t] of lastByIp) if (now - t > 3600_000) lastByIp.delete(k);
  }
  next();
}

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

function renderInquiryEmail({ name, company, email, phone, message, niceTs }) {
  const row = (label, value, isLink, linkPrefix) => {
    if (!value) value = '<span style="color:' + BRAND.muted + ';">—</span>';
    else if (isLink) value = `<a href="${linkPrefix}${escHtml(value)}" style="color:${BRAND.accent};text-decoration:none;">${escHtml(value)}</a>`;
    else value = escHtml(value);
    return `<tr>
      <td style="padding:8px 0;width:90px;color:${BRAND.muted};font-size:12px;text-transform:uppercase;letter-spacing:0.08em;font-weight:600;vertical-align:top;">${label}</td>
      <td style="padding:8px 0;font-size:15px;color:${BRAND.ink};">${value}</td>
    </tr>`;
  };
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
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 8px;">
      <tr>
        <td style="padding:14px 20px;background:${BRAND.ink};border-radius:8px;text-align:center;">
          <a href="mailto:${escHtml(email)}?subject=Re%3A%20your%20Scale42%20inquiry" style="color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;">Reply to ${escHtml(name)} →</a>
        </td>
      </tr>
    </table>
    <p style="margin:16px 0 0;color:${BRAND.muted};font-size:12px;">Submitted ${escHtml(niceTs)} (Oslo time). Replying to this email goes directly to the sender.</p>
  `;
  return emailShell(inner, `New inquiry from ${name}${company ? ' at ' + company : ''}`);
}

function renderAutoReply({ name }) {
  const inner = `
    <p style="margin:0 0 4px;color:${BRAND.muted};font-size:12px;text-transform:uppercase;letter-spacing:0.12em;font-weight:600;">Thanks for reaching out</p>
    <h1 style="margin:0 0 16px;font-size:24px;font-weight:600;letter-spacing:-0.01em;color:${BRAND.ink};">We've received your message, ${escHtml((name || '').split(' ')[0] || 'there')}.</h1>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:${BRAND.ink};">A member of the Scale42 team will be in touch within one working day.</p>
    <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:${BRAND.ink};">In the meantime, you can browse our pan-Nordic <a href="https://www.scale-42.com/datacenters/" style="color:${BRAND.accent};text-decoration:none;font-weight:600;">site portfolio</a> or read about our <a href="https://www.scale-42.com/solutions/" style="color:${BRAND.accent};text-decoration:none;font-weight:600;">solutions</a>.</p>
    <div style="background:${BRAND.bgSoft};padding:18px 22px;border-radius:8px;margin:0 0 0;">
      <p style="margin:0;color:${BRAND.muted};font-size:13px;line-height:1.55;">For urgent matters, email <a href="mailto:info@scale-42.com" style="color:${BRAND.accent};text-decoration:none;">info@scale-42.com</a> directly.</p>
    </div>
  `;
  return emailShell(inner, `Thanks — we'll be in touch within one working day.`);
}

router.post('/contact',
  express.urlencoded({ extended: false, limit: '64kb' }),
  rateLimit,
  async (req, res) => {
    try {
      const b = req.body || {};
      // Honeypot — bots fill any field; humans never see it
      if (b.website && String(b.website).trim() !== '') return res.redirect(303, '/contact/sent/');

      const inquiry_type = String(b.inquiry_type || 'general').slice(0, 40);
      const name = String(b.name || '').trim().slice(0, 200);
      const company = String(b.company || '').trim().slice(0, 200);
      const email = String(b.email || '').trim().slice(0, 200);
      const phone = String(b.phone || '').trim().slice(0, 60);
      const mw = String(b.mw || '').trim().slice(0, 40);
      const message = String(b.message || '').trim().slice(0, 5000);

      // Minimum viable fields
      if (!name || !email || !message) {
        return res.status(400).send('Missing required fields. <a href="/contact/">Back</a>.');
      }
      if (!/^\S+@\S+\.\S+$/.test(email)) {
        return res.status(400).send('Invalid email. <a href="/contact/">Back</a>.');
      }

      const ip = (req.headers['x-forwarded-for'] || req.ip || '').split(',')[0].trim();
      const ua = String(req.headers['user-agent'] || '').slice(0, 500);
      const ts = new Date().toISOString();

      const entry = { ts, inquiry_type, name, company, email, phone, mw, message, ip, ua };

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
        const html = renderInquiryEmail({ name, company, email, phone, message, niceTs });
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
            const replyText = `Hi ${(name || '').split(' ')[0] || 'there'},\n\nThanks for reaching out to Scale42. A member of our team will be in touch within one working day.\n\nFor urgent matters, email info@scale-42.com directly.\n\n— The Scale42 team`;
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
