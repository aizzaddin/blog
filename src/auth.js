const crypto = require('crypto');
const { promisify } = require('util');
const db = require('./db');

const scrypt = promisify(crypto.scrypt);
const COOKIE = 'session';
const SESSION_DAYS = 30;
const KEY_LENGTH = 64;
const SCRYPT = { N: 16384, r: 8, p: 1 };

// Passwords are stored as scrypt$N$r$p$salt$hash.
async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(password, salt, KEY_LENGTH, SCRYPT);
  return ['scrypt', SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString('base64'), hash.toString('base64')].join('$');
}

async function verifyPassword(password, stored) {
  const [scheme, N, r, p, salt, hash] = String(stored || '').split('$');
  if (scheme !== 'scrypt') return false;
  const expected = Buffer.from(hash, 'base64');
  const actual = await scrypt(password, Buffer.from(salt, 'base64'), expected.length, { N: +N, r: +r, p: +p });
  return crypto.timingSafeEqual(actual, expected);
}

// Compared against when the email is unknown, so a wrong email takes as long as a wrong password.
const DUMMY_HASH = hashPassword(crypto.randomBytes(16).toString('hex'));

const tokenHash = (token) => crypto.createHash('sha256').update(token).digest('hex');

function readCookie(req, name) {
  for (const part of (req.headers.cookie || '').split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return null;
}

function setSessionCookie(res, token, maxAgeSeconds) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.append('Set-Cookie', `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`);
}

async function signIn(email, password) {
  const { rows: [author] } = await db.query(
    `SELECT id, password_hash FROM authors WHERE lower(email) = lower($1)`,
    [String(email || '').trim()],
  );
  const ok = await verifyPassword(String(password || ''), author?.password_hash || await DUMMY_HASH);
  return ok && author ? author.id : null;
}

async function startSession(res, authorId) {
  const token = crypto.randomBytes(32).toString('base64url');
  await db.query(
    `INSERT INTO sessions (token_hash, author_id, expires_at) VALUES ($1, $2, now() + make_interval(days => $3))`,
    [tokenHash(token), authorId, SESSION_DAYS],
  );
  await db.query(`DELETE FROM sessions WHERE expires_at < now()`);
  setSessionCookie(res, token, SESSION_DAYS * 24 * 60 * 60);
}

async function endSession(req, res) {
  const token = readCookie(req, COOKIE);
  if (token) await db.query(`DELETE FROM sessions WHERE token_hash = $1`, [tokenHash(token)]);
  setSessionCookie(res, '', 0);
}

// Loads the signed-in writer (if any) into req.author and res.locals.me.
async function loadSession(req, res, next) {
  req.author = null;
  const token = readCookie(req, COOKIE);
  if (token) {
    const { rows: [author] } = await db.query(
      `SELECT a.id, a.username, a.name, a.avatar_url
         FROM sessions s JOIN authors a ON a.id = s.author_id
        WHERE s.token_hash = $1 AND s.expires_at > now()`,
      [tokenHash(token)],
    );
    req.author = author || null;
  }
  res.locals.me = req.author;
  next();
}

// Rejects form posts sent from other sites.
function sameOrigin(req) {
  const origin = req.headers.origin || req.headers.referer;
  if (!origin) return true;
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

function requireAuth(req, res, next) {
  if (req.method !== 'GET' && !sameOrigin(req)) {
    return res.status(403).send('This request came from another site and was blocked.');
  }
  if (req.author) return next();
  // The editor's image upload needs a clear message if the session ran out.
  if (req.accepts(['html', 'json']) === 'json') return res.status(401).json({ error: 'Sign in again to continue.' });
  // To visitors, private pages look like any page that doesn't exist.
  return res.status(404).render('not-found', { title: 'Page not found' });
}

// Slows down password guessing: 5 failed attempts per address, then a 15-minute wait.
const attempts = new Map();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;

function loginBlocked(ip) {
  const entry = attempts.get(ip);
  if (!entry || entry.reset < Date.now()) return 0;
  return entry.count >= MAX_FAILURES ? Math.ceil((entry.reset - Date.now()) / 60000) : 0;
}

function recordFailure(ip) {
  const entry = attempts.get(ip);
  if (!entry || entry.reset < Date.now()) attempts.set(ip, { count: 1, reset: Date.now() + WINDOW_MS });
  else entry.count += 1;
}

const clearFailures = (ip) => attempts.delete(ip);

// Only redirect to paths on this site after signing in.
const safeNext = (next) => (/^\/(?!\/)[\w\-./?=&%@]*$/.test(next || '') ? next : '/');

module.exports = {
  hashPassword, signIn, startSession, endSession, loadSession, requireAuth, sameOrigin,
  loginBlocked, recordFailure, clearFailures, safeNext,
};
