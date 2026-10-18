// Reviews API for the portfolio (Cloudflare Worker + D1).
//
// Public:
//   GET  /reviews              latest 100 visible reviews + average rating
//   POST /reviews              { code, name, text, stars }
// Admin (Authorization: Bearer <ADMIN_KEY>):
//   GET    /admin/check
//   GET    /admin/codes        list codes (client, dates, status; the code itself is never stored)
//   POST   /admin/codes        { client } -> creates a code and returns it once
//   DELETE /admin/codes/:id
//   GET    /admin/reviews      all reviews, hidden ones included
//   POST   /admin/reviews/:id  { hidden: true|false }
//   DELETE /admin/reviews/:id

const MAX_BODY = 4000;          // bytes
const MAX_NAME = 40;
const MIN_TEXT = 10;
const MAX_TEXT = 600;
const MAX_CLIENT = 60;
const REVIEW_LIMIT = 10;        // review attempts per IP per hour
const ADMIN_FAIL_LIMIT = 10;    // wrong admin passwords per IP per hour
const HOUR = 3600;
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O, 1/I/L

/* ---------- helpers ---------- */

function cors(origin, env) {
  if (origin && origin === env.ALLOWED_ORIGIN) {
    return {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
      Vary: 'Origin'
    };
  }
  return { Vary: 'Origin' };
}

function json(data, status, origin, env) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...cors(origin, env)
    }
  });
}

function configured(env) {
  return !!env.DB &&
    typeof env.ALLOWED_ORIGIN === 'string' && env.ALLOWED_ORIGIN.startsWith('https://') &&
    typeof env.ADMIN_KEY === 'string' && env.ADMIN_KEY.length >= 20 &&
    typeof env.CODE_PEPPER === 'string' && env.CODE_PEPPER.length >= 32 &&
    typeof env.IP_SALT === 'string' && env.IP_SALT.length >= 32;
}

async function hmacHex(key, message) {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(message));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('');
}

const ipHash = (request, env) => hmacHex(env.IP_SALT, request.headers.get('CF-Connecting-IP') || 'unknown');
const codeHash = (code, env) => hmacHex(env.CODE_PEPPER, code);

function safeEqual(a, b) {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] || 0) ^ (y[i] || 0);
  return diff === 0;
}

// "4m5k 7rq5-34u5" -> "4M5K-7RQ5-34U5", or "" if it is not a valid code.
function normalizeCode(input) {
  const raw = String(input || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (raw.length !== 12) return '';
  for (const ch of raw) if (!CODE_ALPHABET.includes(ch)) return '';
  return raw.slice(0, 4) + '-' + raw.slice(4, 8) + '-' + raw.slice(8);
}

function newCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  const s = [...bytes].map(b => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
  return s.slice(0, 4) + '-' + s.slice(4, 8) + '-' + s.slice(8);
}

// Plain text only: drop invisible/format characters (zero-width, direction overrides),
// control characters and stacked combining marks ("zalgo").
function cleanText(value, { multiline = false } = {}) {
  let s = String(value || '').normalize('NFC');
  s = s.replace(/\r\n?/g, '\n');
  s = s.replace(/[​-‏‪-‮⁠-⁯﻿­͏؜ᅟᅠ឴឵᠎ㅤﾠ]/g, '');
  s = s.replace(multiline ? /[\u0000-\u0009\u000B-\u001F\u007F-\u009F]/g : /[\u0000-\u001F\u007F-\u009F]/g, multiline ? '' : ' ');
  s = s.replace(/(\p{M}{2})\p{M}+/gu, '$1');
  s = multiline ? s.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n') : s.replace(/\s+/g, ' ');
  return s.trim();
}

const now = () => new Date().toISOString();
const unix = () => Math.floor(Date.now() / 1000);

async function readJson(request, origin, env) {
  const declared = Number(request.headers.get('Content-Length') || 0);
  if (declared > MAX_BODY) return { error: json({ error: 'Request is too large.' }, 413, origin, env) };
  const raw = await request.text();
  if (new TextEncoder().encode(raw).length > MAX_BODY) return { error: json({ error: 'Request is too large.' }, 413, origin, env) };
  let body;
  try { body = raw ? JSON.parse(raw) : {}; } catch { return { error: json({ error: 'Invalid JSON.' }, 400, origin, env) }; }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: json({ error: 'Invalid request.' }, 400, origin, env) };
  return { body };
}

async function countAttempts(env, kind, hash) {
  const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM attempts WHERE kind = ? AND ip_hash = ? AND created_at > ?')
    .bind(kind, hash, unix() - HOUR).first();
  return row ? row.n : 0;
}

const logAttempt = (env, kind, hash) =>
  env.DB.prepare('INSERT INTO attempts (kind, ip_hash, created_at) VALUES (?, ?, ?)').bind(kind, hash, unix()).run();

/* ---------- public ---------- */

async function getReviews(env, origin) {
  const [list, stats] = await env.DB.batch([
    env.DB.prepare('SELECT name, stars, text, created_at FROM reviews WHERE hidden = 0 ORDER BY id DESC LIMIT 100'),
    env.DB.prepare('SELECT COUNT(*) AS count, AVG(stars) AS average FROM reviews WHERE hidden = 0')
  ]);
  const s = stats.results[0] || { count: 0, average: null };
  return json({
    reviews: list.results.map(r => ({ name: r.name, stars: r.stars, text: r.text, date: String(r.created_at).slice(0, 10) })),
    count: s.count,
    average: s.average === null ? null : Math.round(s.average * 10) / 10
  }, 200, origin, env);
}

async function postReview(request, env, origin) {
  if (origin !== env.ALLOWED_ORIGIN) return json({ error: 'Origin not allowed.' }, 403, origin, env);
  if (!(request.headers.get('Content-Type') || '').includes('application/json')) {
    return json({ error: 'Send the review as JSON.' }, 415, origin, env);
  }

  // 1. Size
  const { body, error } = await readJson(request, origin, env);
  if (error) return error;

  // 2. Cheap checks, no database
  const name = cleanText(body.name);
  const text = cleanText(body.text, { multiline: true });
  const stars = body.stars;
  const code = normalizeCode(body.code);
  if (!name) return json({ error: 'Name is required.' }, 400, origin, env);
  if (name.length > MAX_NAME) return json({ error: `Name must be at most ${MAX_NAME} characters.` }, 400, origin, env);
  if (text.length < MIN_TEXT) return json({ error: `Review must be at least ${MIN_TEXT} characters.` }, 400, origin, env);
  if (text.length > MAX_TEXT) return json({ error: `Review must be at most ${MAX_TEXT} characters.` }, 400, origin, env);
  if (!Number.isInteger(stars) || stars < 1 || stars > 5) return json({ error: 'Stars must be a whole number from 1 to 5.' }, 400, origin, env);
  if (!code) return json({ error: 'That does not look like a review code (format XXXX-XXXX-XXXX).' }, 400, origin, env);

  // 3. Rate limit: every attempt counts, right or wrong
  const ip = await ipHash(request, env);
  if (await countAttempts(env, 'review', ip) >= REVIEW_LIMIT) {
    return json({ error: 'Too many attempts. Try again in an hour.' }, 429, origin, env);
  }
  await logAttempt(env, 'review', ip);

  // 4. Look up the hashed code
  const row = await env.DB.prepare('SELECT id, used_at FROM codes WHERE code_hash = ?').bind(await codeHash(code, env)).first();
  if (!row) return json({ error: 'This review code is not valid.' }, 403, origin, env);
  if (row.used_at) return json({ error: 'This review code was already used.' }, 409, origin, env);

  // 5. Save the review and burn the code in one transaction; only one request can win.
  const at = now();
  const [ins] = await env.DB.batch([
    env.DB.prepare('INSERT INTO reviews (code_id, name, stars, text, created_at) SELECT id, ?, ?, ?, ? FROM codes WHERE id = ? AND used_at IS NULL')
      .bind(name, stars, text, at, row.id),
    env.DB.prepare('UPDATE codes SET used_at = ?, review_id = last_insert_rowid() WHERE id = ? AND used_at IS NULL AND changes() = 1')
      .bind(at, row.id)
  ]);
  if (!ins.meta || ins.meta.changes !== 1) return json({ error: 'This review code was already used.' }, 409, origin, env);

  // Housekeeping: forget attempts older than a day.
  await env.DB.prepare('DELETE FROM attempts WHERE created_at < ?').bind(unix() - 24 * HOUR).run();

  return json({ ok: true, review: { name, stars, text, date: at.slice(0, 10) } }, 201, origin, env);
}

/* ---------- admin ---------- */

async function handleAdmin(request, env, origin, path) {
  if (origin !== env.ALLOWED_ORIGIN) return json({ error: 'Origin not allowed.' }, 403, origin, env);

  const ip = await ipHash(request, env);
  if (await countAttempts(env, 'admin', ip) >= ADMIN_FAIL_LIMIT) {
    return json({ error: 'Too many wrong passwords. Locked for an hour.' }, 429, origin, env);
  }
  const auth = request.headers.get('Authorization') || '';
  const given = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!given || !safeEqual(given, env.ADMIN_KEY)) {
    await logAttempt(env, 'admin', ip);
    return json({ error: 'Wrong password.' }, 401, origin, env);
  }

  const parts = path.split('/').filter(Boolean); // ["admin", kind, id?]
  const kind = parts[1];
  const id = parts[2] !== undefined ? Number(parts[2]) : null;
  if (parts.length > 3 || (parts[2] !== undefined && !Number.isInteger(id))) return json({ error: 'Not found.' }, 404, origin, env);
  const m = request.method;

  if (kind === 'check' && m === 'GET' && id === null) return json({ ok: true }, 200, origin, env);

  if (kind === 'codes') {
    if (m === 'GET' && id === null) {
      const { results } = await env.DB.prepare('SELECT id, client, created_at, used_at, review_id FROM codes ORDER BY (used_at IS NOT NULL), id DESC').all();
      return json({ codes: results }, 200, origin, env);
    }
    if (m === 'POST' && id === null) {
      const { body, error } = await readJson(request, origin, env);
      if (error) return error;
      const client = cleanText(body.client).slice(0, MAX_CLIENT);
      for (let tries = 0; tries < 5; tries++) {
        const code = newCode();
        const res = await env.DB.prepare('INSERT OR IGNORE INTO codes (code_hash, client, created_at) VALUES (?, ?, ?)')
          .bind(await codeHash(code, env), client, now()).run();
        if (res.meta.changes === 1) return json({ code, client }, 201, origin, env);
      }
      return json({ error: 'Could not create a code. Try again.' }, 500, origin, env);
    }
    if (m === 'DELETE' && id !== null) {
      await env.DB.prepare('DELETE FROM codes WHERE id = ?').bind(id).run();
      return json({ ok: true }, 200, origin, env);
    }
  }

  if (kind === 'reviews') {
    if (m === 'GET' && id === null) {
      const { results } = await env.DB.prepare(
        'SELECT r.id, r.name, r.stars, r.text, r.created_at, r.hidden, c.client FROM reviews r LEFT JOIN codes c ON c.id = r.code_id ORDER BY r.id DESC'
      ).all();
      return json({ reviews: results }, 200, origin, env);
    }
    if (m === 'POST' && id !== null) {
      const { body, error } = await readJson(request, origin, env);
      if (error) return error;
      if (typeof body.hidden !== 'boolean') return json({ error: 'Send { "hidden": true } or { "hidden": false }.' }, 400, origin, env);
      await env.DB.prepare('UPDATE reviews SET hidden = ? WHERE id = ?').bind(body.hidden ? 1 : 0, id).run();
      return json({ ok: true }, 200, origin, env);
    }
    if (m === 'DELETE' && id !== null) {
      await env.DB.prepare('DELETE FROM reviews WHERE id = ?').bind(id).run();
      return json({ ok: true }, 200, origin, env);
    }
  }

  return json({ error: 'Not found.' }, 404, origin, env);
}

/* ---------- router ---------- */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin');

    if (!configured(env)) return json({ error: 'Server is not set up yet.' }, 503, origin, env);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin, env) });

    try {
      if (url.pathname.startsWith('/admin/')) return await handleAdmin(request, env, origin, url.pathname);
      if (url.pathname === '/reviews') {
        if (request.method === 'GET') return await getReviews(env, origin);
        if (request.method === 'POST') return await postReview(request, env, origin);
        return json({ error: 'Method not allowed.' }, 405, origin, env);
      }
      return json({ error: 'Not found.' }, 404, origin, env);
    } catch (err) {
      console.error(err);
      return json({ error: 'Server error. Try again later.' }, 500, origin, env);
    }
  }
};
