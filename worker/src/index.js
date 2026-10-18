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
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
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

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin');

    if (url.pathname !== '/reviews') return json({ error: 'Not found.' }, 404, origin, env);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin, env) });
    if (request.method === 'GET') return json({ reviews: await listReviews(env) }, 200, origin, env);
    if (request.method === 'POST') return postReview(request, env, origin);
    return json({ error: 'Method not allowed.' }, 405, origin, env);
  }
};
