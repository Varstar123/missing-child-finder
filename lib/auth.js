// Minimal admin-session auth for the Alerts page. No external deps — uses Node's
// built-in crypto to sign a tamper-proof session token stored in an HttpOnly
// cookie. Access is limited to an allowlist of admin emails (ADMIN_EMAILS) who
// sign in with a shared admin password (ADMIN_PASSWORD). Tokens are signed with
// SESSION_SECRET. If any of these are unset the gate fails CLOSED (no access).
const crypto = require('crypto');

const COOKIE_NAME = 'mcf_session';
const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours

function adminEmails() {
  return String(process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}
function adminPassword() { return process.env.ADMIN_PASSWORD || ''; }
function sessionSecret() { return process.env.SESSION_SECRET || ''; }

// True only when every piece of the gate is configured. Used to fail closed.
function isConfigured() {
  return adminEmails().length > 0 && adminPassword() !== '' && sessionSecret() !== '';
}

function isAllowedEmail(email) {
  return adminEmails().indexOf(String(email || '').trim().toLowerCase()) !== -1;
}

// Constant-time compare that never throws on a length mismatch.
function safeEqual(a, b) {
  const ba = Buffer.from(String(a == null ? '' : a));
  const bb = Buffer.from(String(b == null ? '' : b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

function b64url(buf) {
  return Buffer.from(buf).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlDecode(str) {
  return Buffer.from(String(str).replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
}
function sign(payload) {
  return b64url(crypto.createHmac('sha256', sessionSecret()).update(payload).digest());
}

// token = base64url(JSON payload) + "." + base64url(HMAC-SHA256 of that payload)
function createToken(email) {
  const payload = b64url(JSON.stringify({
    email: String(email).trim().toLowerCase(),
    exp: Date.now() + SESSION_TTL_MS,
  }));
  return payload + '.' + sign(payload);
}

// Returns the email if the token is authentic, unexpired, and the email is still
// on the allowlist (so removing an email from ADMIN_EMAILS revokes their token).
function verifyToken(token) {
  if (!token || typeof token !== 'string' || !sessionSecret()) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const payload = parts[0];
  if (!safeEqual(parts[1], sign(payload))) return null;
  let data;
  try { data = JSON.parse(b64urlDecode(payload)); } catch (_) { return null; }
  if (!data || !data.exp || Date.now() > data.exp) return null;
  if (!isAllowedEmail(data.email)) return null;
  return data.email;
}

function parseCookies(req) {
  const header = req.headers && req.headers.cookie;
  const out = {};
  if (!header) return out;
  header.split(';').forEach((pair) => {
    const idx = pair.indexOf('=');
    if (idx === -1) return;
    const k = pair.slice(0, idx).trim();
    if (k) out[k] = decodeURIComponent(pair.slice(idx + 1).trim());
  });
  return out;
}

// Set the Secure flag only over HTTPS (Vercel) — not over http://localhost, where
// a Secure cookie would be silently dropped and break local sign-in.
function isSecureReq(req) {
  const proto = req.headers['x-forwarded-proto'];
  if (proto) return String(proto).split(',')[0].trim() === 'https';
  return !/^(localhost|127\.0\.0\.1)(:|$)/.test(String(req.headers.host || ''));
}

function buildCookie(req, value, maxAgeSeconds) {
  const parts = [
    COOKIE_NAME + '=' + value,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=' + maxAgeSeconds,
  ];
  if (isSecureReq(req)) parts.push('Secure');
  return parts.join('; ');
}

function setSessionCookie(req, res, token) {
  res.setHeader('Set-Cookie', buildCookie(req, token, Math.floor(SESSION_TTL_MS / 1000)));
}
function clearSessionCookie(req, res) {
  res.setHeader('Set-Cookie', buildCookie(req, '', 0));
}

// The admin email for this request, or null if there's no valid session.
function getSessionEmail(req) {
  return verifyToken(parseCookies(req)[COOKIE_NAME]);
}

module.exports = {
  COOKIE_NAME,
  isConfigured,
  isAllowedEmail,
  adminPassword,
  safeEqual,
  createToken,
  verifyToken,
  setSessionCookie,
  clearSessionCookie,
  getSessionEmail,
};
