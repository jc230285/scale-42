const express = require('express');
const basicAuth = require('express-basic-auth');
const path = require('path');
const fs = require('fs');
const db = require('./db');
db.init().then(ok => { if (ok) console.log('[db] connected & ready'); }).catch(e => console.error('[db] init failed:', e.message));

const app = express();
const ROOT = path.resolve(__dirname, '..');
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '12mb' }));

// Light rate limit for /cms and /api (per-IP, in-memory)
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 120;
const buckets = new Map();
app.use((req, res, next) => {
  if (!req.path.startsWith('/cms') && !req.path.startsWith('/api')) return next();
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  const now = Date.now();
  const b = buckets.get(ip) || { count: 0, reset: now + RATE_WINDOW_MS };
  if (now > b.reset) { b.count = 0; b.reset = now + RATE_WINDOW_MS; }
  b.count++;
  buckets.set(ip, b);
  if (b.count > RATE_LIMIT) return res.status(429).json({ error: 'rate limit' });
  next();
});

// Discourage indexing of /cms even though it's basic-auth protected
app.use('/cms', (req, res, next) => { res.set('X-Robots-Tag', 'noindex, nofollow'); next(); });

// DB-backed multi-user auth. Passwords (bcrypt) live in Postgres so changes don't require a redeploy.
// Falls back to JSON file → env vars only if DATABASE_URL is unset.
function loadJsonUsers() {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(ROOT, 'content', 'cms-users.json'), 'utf-8'));
    const m = {};
    for (const u of (raw.users || [])) m[u.username] = u.password;
    if (Object.keys(m).length) return m;
  } catch {}
  return { [process.env.CMS_USER || 'admin']: process.env.CMS_PASS || 'change-me' };
}

const auth = basicAuth({
  authorizer: (username, password, callback) => {
    if (db.isReady()) {
      db.verifyPassword(username, password)
        .then(u => callback(null, !!u))
        .catch(e => { console.error('[auth] db verify failed:', e.message); callback(null, false); });
    } else {
      const users = loadJsonUsers();
      callback(null, users[username] && users[username] === password);
    }
  },
  authorizeAsync: true,
  challenge: true,
  realm: 'Scale42 CMS',
});

// Capture authenticated user details (name/email) for audit + git commit attribution
function attachUser(req, _res, next) {
  const username = req.auth?.user;
  if (!username) { req.cmsUser = { username: 'unknown', name: 'unknown', email: '' }; return next(); }
  if (db.isReady()) {
    db.findUser(username).then(u => {
      req.cmsUser = u ? { username: u.username, name: u.name, email: u.email, is_admin: u.is_admin } : { username, name: username, email: '' };
      next();
    }).catch(() => { req.cmsUser = { username, name: username, email: '' }; next(); });
  } else {
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(ROOT, 'content', 'cms-users.json'), 'utf-8'));
      const u = (raw.users || []).find(x => x.username === username);
      req.cmsUser = u || { username, name: username, email: '' };
    } catch { req.cmsUser = { username, name: username, email: '' }; }
    next();
  }
}

// Public contact form — no auth, rate-limited inside the route module.
app.use('/api', require('./routes/contact'));

app.use('/cms', auth, express.static(path.join(ROOT, 'cms-ui')));
app.use('/api', auth, attachUser, require('./routes/people'));
app.use('/api', auth, attachUser, require('./routes/sites'));
app.use('/api', auth, attachUser, require('./routes/news'));
app.use('/api', auth, attachUser, require('./routes/sections'));
app.use('/api', auth, attachUser, require('./routes/journey'));
app.use('/api', auth, attachUser, require('./routes/upload'));
app.use('/api', auth, attachUser, require('./routes/publish'));
app.use('/api', auth, attachUser, require('./routes/audit'));
app.use('/api', auth, attachUser, require('./routes/account'));
app.use('/api', auth, attachUser, require('./routes/inquiries'));
app.use('/api', auth, attachUser, require('./routes/developers'));

// Block private directories from being served as static assets.
// /content/ contains sites.json (with internal fields), cms-users.json (bcrypt hashes),
// audit.jsonl, journey.json, etc. — none of these should be publicly fetchable.
// /server/, /scripts/, /cms-ui/ are also private (cms-ui is mounted under /cms with auth above).
const PRIVATE_PREFIXES = ['/content/', '/server/', '/scripts/', '/cms-ui/', '/.git/', '/.env'];
app.use((req, res, next) => {
  const p = req.path.toLowerCase();
  for (const prefix of PRIVATE_PREFIXES) {
    if (p === prefix.replace(/\/$/, '') || p.startsWith(prefix)) {
      return res.status(404).send('Not found');
    }
  }
  next();
});

app.use(express.static(ROOT, {
  extensions: ['html'],
  index: 'index.html',
}));

app.use((req, res) => {
  const fallback = path.join(ROOT, '404.html');
  if (fs.existsSync(fallback)) return res.status(404).sendFile(fallback);
  res.status(404).send('Not found');
});

app.listen(PORT, () => console.log(`Scale42 server on :${PORT}`));
