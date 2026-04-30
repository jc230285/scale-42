const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const ROOT = path.resolve(__dirname, '..');

let pool = null;
let ready = false;

function getPool() {
  if (pool) return pool;
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.warn('[db] DATABASE_URL not set — falling back to JSON-only mode (no DB)');
    return null;
  }
  pool = new Pool({
    connectionString: url,
    ssl: process.env.PGSSL === 'require' ? { rejectUnauthorized: false } : false,
    max: 5,
  });
  pool.on('error', (e) => console.error('[db] pool error', e));
  return pool;
}

async function init() {
  const p = getPool();
  if (!p) return false;
  await p.query(`
    CREATE TABLE IF NOT EXISTS cms_users (
      username   TEXT PRIMARY KEY,
      password_hash TEXT NOT NULL,
      name       TEXT NOT NULL,
      email      TEXT NOT NULL,
      is_admin   BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS cms_audit (
      id         BIGSERIAL PRIMARY KEY,
      ts         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      username   TEXT NOT NULL,
      user_name  TEXT,
      section    TEXT NOT NULL,
      action     TEXT NOT NULL,
      changes    JSONB
    );
    CREATE INDEX IF NOT EXISTS cms_audit_section_ts_idx ON cms_audit(section, ts DESC);
    CREATE INDEX IF NOT EXISTS cms_audit_user_ts_idx ON cms_audit(username, ts DESC);
  `);
  // First-run seed from cms-users.json if table is empty
  const r = await p.query('SELECT COUNT(*)::int AS n FROM cms_users');
  if (r.rows[0].n === 0) {
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(ROOT, 'content', 'cms-users.json'), 'utf-8'));
      for (const u of (raw.users || [])) {
        const hash = await bcrypt.hash(u.password || 'change-me', 10);
        await p.query(
          'INSERT INTO cms_users(username, password_hash, name, email, is_admin) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (username) DO NOTHING',
          [u.username, hash, u.name || u.username, u.email || '', u.username === 'admin']
        );
      }
      console.log(`[db] seeded ${raw.users?.length || 0} users from cms-users.json`);
    } catch (e) { console.warn('[db] seed skipped:', e.message); }
  }
  ready = true;
  return true;
}

async function findUser(username) {
  const p = getPool();
  if (!p) return null;
  const r = await p.query('SELECT * FROM cms_users WHERE username = $1', [username]);
  return r.rows[0] || null;
}

async function verifyPassword(username, plaintext) {
  const u = await findUser(username);
  if (!u) return null;
  const ok = await bcrypt.compare(plaintext, u.password_hash);
  return ok ? u : null;
}

async function setPassword(username, newPlaintext) {
  const p = getPool();
  if (!p) throw new Error('DB not configured');
  const hash = await bcrypt.hash(newPlaintext, 10);
  await p.query('UPDATE cms_users SET password_hash = $1, updated_at = NOW() WHERE username = $2', [hash, username]);
}

async function listUsers() {
  const p = getPool();
  if (!p) return [];
  const r = await p.query('SELECT username, name, email, is_admin, created_at, updated_at FROM cms_users ORDER BY username');
  return r.rows;
}

async function upsertUser({ username, password, name, email, is_admin }) {
  const p = getPool();
  if (!p) throw new Error('DB not configured');
  const hash = password ? await bcrypt.hash(password, 10) : null;
  if (hash) {
    await p.query(
      `INSERT INTO cms_users(username, password_hash, name, email, is_admin)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (username) DO UPDATE SET password_hash=$2, name=$3, email=$4, is_admin=$5, updated_at=NOW()`,
      [username, hash, name || username, email || '', !!is_admin]
    );
  } else {
    await p.query(
      `INSERT INTO cms_users(username, password_hash, name, email, is_admin)
       VALUES ($1, '', $2, $3, $4)
       ON CONFLICT (username) DO UPDATE SET name=$2, email=$3, is_admin=$4, updated_at=NOW()`,
      [username, name || username, email || '', !!is_admin]
    );
  }
}

async function deleteUser(username) {
  const p = getPool();
  if (!p) throw new Error('DB not configured');
  await p.query('DELETE FROM cms_users WHERE username = $1', [username]);
}

async function recordAudit(section, user, changes, action) {
  const p = getPool();
  if (!p) return null;
  const r = await p.query(
    'INSERT INTO cms_audit(username, user_name, section, action, changes) VALUES ($1,$2,$3,$4,$5) RETURNING id, ts',
    [user?.username || 'unknown', user?.name || '', section, action || 'save', JSON.stringify(changes || [])]
  );
  return r.rows[0];
}

async function recentAudit(limit, section) {
  const p = getPool();
  if (!p) return [];
  const params = [limit];
  let where = '';
  if (section) { where = 'WHERE section = $2'; params.push(section); }
  const r = await p.query(`SELECT id, ts, username, user_name, section, action, changes FROM cms_audit ${where} ORDER BY ts DESC LIMIT $1`, params);
  return r.rows;
}

function isReady() { return ready; }

module.exports = {
  init, getPool, findUser, verifyPassword, setPassword,
  listUsers, upsertUser, deleteUser,
  recordAudit, recentAudit, isReady,
};
