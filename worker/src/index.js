// Reviews API for the portfolio. Runs on Cloudflare Workers with one KV namespace (REVIEWS_KV).
//
// KV keys:
//   code:<CODE>        "unused" or "used:<reviewId>"   (you create these with wrangler)
//   review:<id>        JSON {name, stars, text, date}
//   rl:<hashed ip>     attempt counter, expires after 10 minutes
//
// Note: KV is eventually consistent, so two submissions with the same code within a few
// seconds from different places could both pass. For a small portfolio that is acceptable.

const MAX_NAME = 40;
const MAX_TEXT = 600;
const MAX_BODY = 4096;
const RATE_LIMIT = 5;
const RATE_WINDOW = 600; // seconds

function json(data, status, origin, env) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...cors(origin, env) }
  });
}

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

async function hashIp(ip, salt) {
  const data = new TextEncoder().encode(salt + '|' + ip);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

async function listReviews(env) {
  const reviews = [];
  let cursor;
  do {
    const page = await env.REVIEWS_KV.list({ prefix: 'review:', cursor });
    const values = await Promise.all(page.keys.map(k => env.REVIEWS_KV.get(k.name, 'json')));
    for (const v of values) if (v) reviews.push({ name: v.name, stars: v.stars, text: v.text, date: v.date });
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  reviews.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  return reviews;
}

async function postReview(request, env, origin) {
  if (origin !== env.ALLOWED_ORIGIN) return json({ error: 'Origin not allowed.' }, 403, origin, env);

  // Rate limit by hashed IP (the raw IP is never stored).
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const ipKey = 'rl:' + await hashIp(ip, env.IP_SALT || 'portfolio-reviews');
  const attempts = Number(await env.REVIEWS_KV.get(ipKey)) || 0;
  if (attempts >= RATE_LIMIT) return json({ error: 'Too many attempts. Try again in 10 minutes.' }, 429, origin, env);
  await env.REVIEWS_KV.put(ipKey, String(attempts + 1), { expirationTtl: RATE_WINDOW });

  if (!(request.headers.get('Content-Type') || '').includes('application/json')) {
    return json({ error: 'Send the review as JSON.' }, 415, origin, env);
  }
  const raw = await request.text();
  if (raw.length > MAX_BODY) return json({ error: 'Request is too large.' }, 413, origin, env);

  let body;
  try { body = JSON.parse(raw); } catch { return json({ error: 'Invalid JSON.' }, 400, origin, env); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ error: 'Invalid request.' }, 400, origin, env);

  const code = typeof body.code === 'string' ? body.code.trim() : '';
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  const stars = body.stars;

  if (!code || code.length > 64) return json({ error: 'Enter a valid review code.' }, 400, origin, env);
  if (!name) return json({ error: 'Name is required.' }, 400, origin, env);
  if (name.length > MAX_NAME) return json({ error: `Name must be at most ${MAX_NAME} characters.` }, 400, origin, env);
  if (!text) return json({ error: 'Review text is required.' }, 400, origin, env);
  if (text.length > MAX_TEXT) return json({ error: `Review must be at most ${MAX_TEXT} characters.` }, 400, origin, env);
  if (!Number.isInteger(stars) || stars < 1 || stars > 5) return json({ error: 'Stars must be a whole number from 1 to 5.' }, 400, origin, env);

  const codeKey = 'code:' + code;
  const state = await env.REVIEWS_KV.get(codeKey);
  if (state === null) return json({ error: 'This review code is not valid.' }, 403, origin, env);
  if (state !== 'unused') return json({ error: 'This review code was already used.' }, 409, origin, env);

  const id = new Date().toISOString().replace(/[:.]/g, '-') + '-' + crypto.randomUUID().slice(0, 8);
  const review = { name, stars, text, date: new Date().toISOString().slice(0, 10) };
  await env.REVIEWS_KV.put(codeKey, 'used:' + id);
  await env.REVIEWS_KV.put('review:' + id, JSON.stringify(review));
  return json({ ok: true, review }, 201, origin, env);
}

/* ---------- Admin API (password in the ADMIN_KEY secret, never in the repo) ---------- */

const ADMIN_FAIL_LIMIT = 10; // wrong passwords per IP per 10 minutes
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function safeEqual(a, b) {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] || 0) ^ (y[i] || 0);
  return diff === 0;
}

function newCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  const s = [...bytes].map(b => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
  return 'BRO-' + s.slice(0, 4) + '-' + s.slice(4);
}

async function listKeys(env, prefix) {
  const keys = [];
  let cursor;
  do {
    const page = await env.REVIEWS_KV.list({ prefix, cursor });
    keys.push(...page.keys.map(k => k.name));
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return keys;
}

async function handleAdmin(request, env, origin, path) {
  if (origin !== env.ALLOWED_ORIGIN) return json({ error: 'Origin not allowed.' }, 403, origin, env);
  if (!env.ADMIN_KEY) return json({ error: 'Admin password is not set up.' }, 503, origin, env);

  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const failKey = 'rl:admin:' + await hashIp(ip, env.IP_SALT || 'portfolio-reviews');
  const fails = Number(await env.REVIEWS_KV.get(failKey)) || 0;
  if (fails >= ADMIN_FAIL_LIMIT) return json({ error: 'Too many wrong passwords. Try again in 10 minutes.' }, 429, origin, env);

  const auth = request.headers.get('Authorization') || '';
  const given = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!given || !safeEqual(given, env.ADMIN_KEY)) {
    await env.REVIEWS_KV.put(failKey, String(fails + 1), { expirationTtl: RATE_WINDOW });
    return json({ error: 'Wrong password.' }, 401, origin, env);
  }

  const parts = path.split('/').filter(Boolean); // ["admin", "codes"|"reviews", id?]
  const kind = parts[1];
  const id = parts[2] ? decodeURIComponent(parts[2]) : '';

  if (kind === 'check' && request.method === 'GET') return json({ ok: true }, 200, origin, env);

  if (kind === 'codes') {
    if (request.method === 'GET' && !id) {
      const keys = await listKeys(env, 'code:');
      const values = await Promise.all(keys.map(k => env.REVIEWS_KV.get(k)));
      const codes = keys.map((k, i) => ({ code: k.slice(5), used: values[i] !== 'unused' }));
      codes.sort((a, b) => Number(a.used) - Number(b.used) || a.code.localeCompare(b.code));
      return json({ codes }, 200, origin, env);
    }
    if (request.method === 'POST' && !id) {
      let code = newCode();
      while (await env.REVIEWS_KV.get('code:' + code) !== null) code = newCode();
      await env.REVIEWS_KV.put('code:' + code, 'unused');
      return json({ code }, 201, origin, env);
    }
    if (request.method === 'DELETE' && id) {
      await env.REVIEWS_KV.delete('code:' + id);
      return json({ ok: true }, 200, origin, env);
    }
  }

  if (kind === 'reviews') {
    if (request.method === 'GET' && !id) {
      const keys = await listKeys(env, 'review:');
      const values = await Promise.all(keys.map(k => env.REVIEWS_KV.get(k, 'json')));
      const reviews = keys.map((k, i) => values[i] && { id: k.slice(7), ...values[i] }).filter(Boolean);
      reviews.sort((a, b) => b.id.localeCompare(a.id));
      return json({ reviews }, 200, origin, env);
    }
    if (request.method === 'DELETE' && id) {
      await env.REVIEWS_KV.delete('review:' + id);
      return json({ ok: true }, 200, origin, env);
    }
  }

  return json({ error: 'Not found.' }, 404, origin, env);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin');

    if (url.pathname.startsWith('/admin/')) {
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin, env) });
      return handleAdmin(request, env, origin, url.pathname);
    }
    if (url.pathname !== '/reviews') return json({ error: 'Not found.' }, 404, origin, env);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin, env) });
    if (request.method === 'GET') return json({ reviews: await listReviews(env) }, 200, origin, env);
    if (request.method === 'POST') return postReview(request, env, origin);
    return json({ error: 'Method not allowed.' }, 405, origin, env);
  }
};
