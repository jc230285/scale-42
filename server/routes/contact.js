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
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return null;
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: parseInt(SMTP_PORT || '587', 10),
    secure: parseInt(SMTP_PORT || '587', 10) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
  return transporter;
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
      try { appendInquiry(entry); } catch (e) { console.error('inquiry append failed', e); }

      const t = getTransporter();
      if (t) {
        const to = process.env.CONTACT_TO || 'info@scale-42.com';
        const subject = `[Scale42 contact · ${inquiry_type}] ${name}${company ? ' — ' + company : ''}`;
        const text = [
          `Inquiry type: ${inquiry_type}`,
          `Name:    ${name}`,
          `Company: ${company || '—'}`,
          `Email:   ${email}`,
          `Phone:   ${phone || '—'}`,
          `MW:      ${mw || '—'}`,
          '',
          'Message:',
          message,
          '',
          `--`,
          `Submitted: ${ts}`,
          `IP: ${ip}`,
        ].join('\n');
        const html = `<table cellpadding="6" style="font-family:sans-serif;font-size:14px;border-collapse:collapse">
          <tr><td><b>Inquiry type</b></td><td>${escHtml(inquiry_type)}</td></tr>
          <tr><td><b>Name</b></td><td>${escHtml(name)}</td></tr>
          <tr><td><b>Company</b></td><td>${escHtml(company) || '—'}</td></tr>
          <tr><td><b>Email</b></td><td><a href="mailto:${escHtml(email)}">${escHtml(email)}</a></td></tr>
          <tr><td><b>Phone</b></td><td>${escHtml(phone) || '—'}</td></tr>
          <tr><td><b>MW</b></td><td>${escHtml(mw) || '—'}</td></tr>
          <tr><td valign="top"><b>Message</b></td><td><pre style="white-space:pre-wrap;font-family:inherit;margin:0">${escHtml(message)}</pre></td></tr>
          <tr><td><b>Submitted</b></td><td>${escHtml(ts)} (IP ${escHtml(ip)})</td></tr>
        </table>`;
        try {
          await t.sendMail({
            from: `"Scale42 website" <${process.env.SMTP_USER}>`,
            to,
            replyTo: `"${name}" <${email}>`,
            subject,
            text,
            html,
          });
        } catch (e) { console.error('SMTP send failed', e); }
      } else {
        console.warn('Contact submission received but SMTP not configured.');
      }

      res.redirect(303, '/contact/sent/');
    } catch (e) {
      console.error('contact handler error', e);
      res.status(500).send('Server error. Please email info@scale-42.com directly.');
    }
  });

module.exports = router;
