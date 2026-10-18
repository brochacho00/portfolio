'use strict';

/* =========================================================
   EDIT YOUR CONTENT HERE
   section: "games" | "fun" | "customer"
   images:  paths like "images/my-game-1.jpg". Leave empty to use a generated placeholder.
   ========================================================= */
const PROJECTS = [
  {
    section: 'games',
    name: 'Placeholder Game One',
    subtitle: 'Collection game, in development',
    images: [],
    description: 'Describe the game here: what players do, what makes it fun, and what you built for it.',
    tags: ['UI', 'game systems', 'DataStore saves', 'economy']
  },
  {
    section: 'games',
    name: 'Placeholder Game Two',
    subtitle: 'Obby / simulator',
    images: [],
    description: 'A second game entry. Add as many as you like by copying this block.',
    tags: ['map building', 'scripting', 'monetization']
  },
  {
    section: 'fun',
    name: 'Placeholder Build',
    subtitle: 'Personal build, no client',
    images: [],
    description: 'Something you built just because you wanted to.',
    tags: ['building', 'lighting', 'terrain']
  },
  {
    section: 'customer',
    name: 'Placeholder Client Job',
    subtitle: 'Work done for a client',
    images: [],
    description: 'What the client asked for and what you delivered.',
    tags: ['scripting', 'UI', 'delivered on time']
  }
];

const CONTACT = {
  discord: 'your_discord_name',
  roblox: 'https://www.roblox.com/users/0000000/profile'
};

/* Reviews worker (Cloudflare). If you change it, also change connect-src in index.html. */
const WORKER_URL = 'https://WORKER_HOST_PLACEHOLDER';

const SECTIONS = [
  { id: 'games', title: 'My Games', sub: 'Games I made or worked on' },
  { id: 'fun', title: 'Builds for Fun', sub: 'Personal builds, no client' },
  { id: 'customer', title: 'Customer Builds', sub: 'Work I did for clients' },
  { id: 'reviews', title: 'Reviews', sub: 'What clients say' },
  { id: 'about', title: 'About', sub: 'Who is behind the drill' },
  { id: 'contact', title: 'Contact', sub: 'Open for scripting and building work' }
];

const HYPE = 'SPIRAL POWER MAXED. THE CEILING NEVER HAD A CHANCE.';

/* ---------- helpers (all text goes through textContent) ---------- */
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}
const SVG_NS = 'http://www.w3.org/2000/svg';
function svg(tag, attrs) {
  const n = document.createElementNS(SVG_NS, tag);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  return n;
}

/* Generated placeholder art: a fiery gradient with a drill and a label. */
function placeholder(label, seed) {
  const hues = [[8, 30], [20, 45], [355, 15], [30, 55]];
  const [a, b] = hues[seed % hues.length];
  const safe = String(label).replace(/[<>&"']/g, '');
  const s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${a},90%,22%)"/><stop offset="1" stop-color="hsl(${b},95%,48%)"/></linearGradient></defs>
<rect width="1600" height="900" fill="url(#g)"/>
<g opacity=".16" stroke="#000" stroke-width="40">${Array.from({ length: 14 }, (_, i) => `<line x1="${i * 140 - 300}" y1="0" x2="${i * 140 + 200}" y2="900"/>`).join('')}</g>
<path d="M1200 150 L1350 650 L1050 650 Z" fill="#ffe14a" stroke="#000" stroke-width="12"/>
<rect x="1030" y="650" width="340" height="60" rx="10" fill="#ff2a1a" stroke="#000" stroke-width="12"/>
<text x="90" y="780" font-family="Impact, Arial Narrow, sans-serif" font-size="110" fill="#f7eedd" stroke="#000" stroke-width="6">${safe}</text>
<text x="96" y="840" font-family="monospace" font-size="38" fill="#000">PLACEHOLDER SCREENSHOT</text>
</svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s);
}

function drillIcon() {
  const s = svg('svg', { class: 'mi-drill', viewBox: '0 0 32 32', 'aria-hidden': 'true' });
  const g = svg('g', {});
  g.append(
    svg('path', { class: 'd-cone', d: 'M16 3 L26 16 L16 29 L6 16 Z' }),
    svg('path', { class: 'd-line', d: 'M9 12 L23 10 M8 17 L24 15 M10 22 L22 20', fill: 'none' })
  );
  s.append(g);
  return s;
}

/* ---------- menu ---------- */
const menuList = document.getElementById('menuList');
const panel = document.getElementById('panel');
const items = SECTIONS.map((sec, i) => {
  const li = el('li');
  const b = el('button', 'menu-item');
  b.type = 'button';
  b.id = 'tab-' + sec.id;
  b.setAttribute('role', 'tab');
  b.setAttribute('aria-controls', 'panel');
  b.style.setProperty('--i', i);
  const text = el('span');
  text.append(el('span', 'mi-title', sec.title), el('span', 'mi-sub', sec.sub));
  b.append(text, drillIcon());
  b.addEventListener('click', () => select(i));
  li.append(b);
  menuList.append(li);
  return b;
});

let current = -1;
const visited = new Set();
let power = 0;

function select(i, focus) {
  if (i === current) return;
  current = i;
  items.forEach((b, k) => {
    b.setAttribute('aria-selected', String(k === i));
    b.tabIndex = k === i ? 0 : -1;
  });
  panel.setAttribute('aria-labelledby', items[i].id);
  if (focus) items[i].focus();
  render(SECTIONS[i].id);
  galaxyBoost();
  if (!visited.has(i)) {
    if (visited.size > 0) addPower(20);
    visited.add(i);
  }
}

document.addEventListener('keydown', e => {
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
  const t = e.target.tagName;
  if (t === 'INPUT' || t === 'TEXTAREA') return;
  e.preventDefault();
  const n = e.key === 'ArrowDown' ? Math.min(SECTIONS.length - 1, current + 1) : Math.max(0, current - 1);
  select(n, true);
});

/* ---------- spiral power meter ---------- */
const meter = document.querySelector('.meter');
const meterFill = document.getElementById('meterFill');
const meterValue = document.getElementById('meterValue');
const meterHype = document.getElementById('meterHype');
function addPower(n) {
  if (power >= 100) return;
  power = Math.min(100, power + n);
  const h = 92 * power / 100;
  meterFill.setAttribute('y', String(96 - h));
  meterFill.setAttribute('height', String(h));
  meterValue.textContent = power + '%';
  if (power === 100) {
    meter.classList.add('full');
    meterHype.textContent = HYPE;
    meterHype.hidden = false;
    galaxyBoost(3);
    setTimeout(() => { meterHype.hidden = true; }, 4500);
  }
}

/* ---------- panel rendering ---------- */
function shoutTitle(text) { return el('h2', 'shout', text); }

function renderProject(list) {
  let pi = 0;
  const wrap = el('div');
  wrap.style.display = 'contents';
  const draw = () => {
    const p = list[pi];
    const images = p.images.length ? p.images : [placeholder(p.name, pi), placeholder(p.name + ' 2', pi + 1)];
    const frame = el('div', 'frame');
    const img = el('img');
    img.alt = p.name + ' screenshot 1';
    img.src = images[0];
    frame.append(img);
    const shots = el('div', 'shots');
    shots.setAttribute('aria-label', 'Screenshots');
    const btns = images.map((src, k) => {
      const c = el('button', 'chip');
      c.type = 'button';
      c.append(el('span', '', 'Shot ' + (k + 1)));
      c.setAttribute('aria-pressed', String(k === 0));
      c.addEventListener('click', () => {
        btns.forEach((x, j) => x.setAttribute('aria-pressed', String(j === k)));
        const next = el('img', reduceMotion ? '' : 'drill-in');
        next.alt = p.name + ' screenshot ' + (k + 1);
        next.src = src;
        frame.append(next);
        const old = [...frame.querySelectorAll('img')].slice(0, -1);
        const done = () => old.forEach(o => o.remove());
        if (reduceMotion) done(); else next.addEventListener('animationend', done, { once: true });
        galaxyBoost(.5);
      });
      return c;
    });
    shots.append(...btns);
    const nodes = [frame, shots];
    if (list.length > 1) {
      const pr = el('div', 'projects');
      list.forEach((q, k) => {
        const c = el('button', 'chip');
        c.type = 'button';
        c.append(el('span', '', q.name));
        c.setAttribute('aria-pressed', String(k === pi));
        c.addEventListener('click', () => { pi = k; draw(); });
        pr.append(c);
      });
      nodes.push(pr);
    }
    const tags = el('ul', 'tags');
    p.tags.forEach(t => tags.append(el('li', '', t)));
    nodes.push(shoutTitle(p.name), el('p', 'sub', p.subtitle), el('p', 'desc', p.description), el('p', 'tags-title', 'WHAT I DID'), tags);
    wrap.replaceChildren(...nodes);
  };
  draw();
  return [wrap];
}

function starsEl(n) {
  const s = el('span', 'stars');
  s.setAttribute('role', 'img');
  s.setAttribute('aria-label', n + ' out of 5 stars');
  s.append(el('span', '', '★'.repeat(n)), el('span', 'off', '★'.repeat(5 - n)));
  return s;
}

async function loadReviews() {
  try {
    const res = await fetch(WORKER_URL + '/reviews', { cache: 'no-store' });
    if (!res.ok) throw new Error(String(res.status));
    const data = await res.json();
    return { ok: true, list: (Array.isArray(data.reviews) ? data.reviews : []).filter(r => r && r.name && r.text)
      .map(r => ({ name: String(r.name).slice(0, 40), text: String(r.text).slice(0, 600), stars: Math.min(5, Math.max(1, Math.round(Number(r.stars) || 5))), date: String(r.date || '').slice(0, 10) })) };
  } catch (e) {
    return { ok: false, list: [] };
  }
}

function fillReviews(sum, list, empty) {
  empty.textContent = 'Loading reviews…';
  empty.hidden = false;
  sum.replaceChildren();
  list.replaceChildren();
  loadReviews().then(({ ok, list: rs }) => {
    if (!ok) { empty.textContent = 'Reviews could not load right now.'; return; }
    if (!rs.length) { empty.textContent = 'No reviews yet. Be the first.'; return; }
    empty.hidden = true;
    const avg = rs.reduce((a, r) => a + r.stars, 0) / rs.length;
    sum.append(el('span', 'rating-avg', avg.toFixed(1)), starsEl(Math.round(avg)), el('span', 'sub', rs.length + (rs.length === 1 ? ' review' : ' reviews')));
    rs.forEach(r => {
      const li = el('li', 'review');
      li.append(starsEl(r.stars), el('p', '', r.text), el('p', 'meta', r.name + (r.date ? ' · ' + r.date : '')));
      list.append(li);
    });
  });
}

function renderReviews() {
  const sum = el('div', 'rating-sum');
  const list = el('ul', 'review-list');
  const empty = el('p', 'desc');
  fillReviews(sum, list, empty);

  const form = el('form', 'review-form');
  form.noValidate = true;
  form.append(el('h3', '', 'Leave a review'), el('p', 'desc', 'Only clients can review. Use the one-time code I gave you.'));
  const codeL = el('label', '', 'REVIEW CODE'); codeL.htmlFor = 'rv-code';
  const code = el('input'); code.type = 'text'; code.id = 'rv-code'; code.maxLength = 40; code.autocomplete = 'off'; code.spellcheck = false;
  const nameL = el('label', '', 'NAME'); nameL.htmlFor = 'rv-name';
  const name = el('input'); name.type = 'text'; name.id = 'rv-name'; name.maxLength = 40;
  const starL = el('span', 'lbl', 'RATING'); starL.id = 'rv-stars-l';
  const pick = el('div', 'star-pick');
  pick.setAttribute('role', 'radiogroup');
  pick.setAttribute('aria-labelledby', 'rv-stars-l');
  for (let n = 5; n >= 1; n--) {
    const r = el('input'); r.type = 'radio'; r.name = 'rv-stars'; r.id = 'rv-s' + n; r.value = String(n);
    r.setAttribute('aria-label', n + (n === 1 ? ' star' : ' stars'));
    if (n === 5) r.checked = true;
    const l = el('label', '', '★'); l.htmlFor = r.id;
    pick.append(r, l);
  }
  const textL = el('label', '', 'REVIEW'); textL.htmlFor = 'rv-text';
  const text = el('textarea'); text.id = 'rv-text'; text.rows = 3; text.maxLength = 600;
  const btn = el('button', 'btn', 'Send review'); btn.type = 'submit';
  const msg = el('p', 'form-msg'); msg.setAttribute('aria-live', 'polite');
  form.append(codeL, code, nameL, name, starL, pick, textL, text, btn, msg);
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const review = {
      code: code.value.trim(),
      name: name.value.trim(),
      text: text.value.trim(),
      stars: Number(form.querySelector('input[name="rv-stars"]:checked').value)
    };
    if (!review.code) { msg.textContent = 'Enter your review code.'; return; }
    if (!review.name || !review.text) { msg.textContent = 'Write your name and your review.'; return; }
    btn.disabled = true;
    msg.textContent = 'Sending…';
    try {
      const res = await fetch(WORKER_URL + '/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(review)
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        msg.textContent = typeof data.error === 'string' ? data.error : 'Could not send the review (error ' + res.status + ').';
        return;
      }
      msg.textContent = 'Thanks! Your review is live.';
      form.reset();
      fillReviews(sum, list, empty);
    } catch (err) {
      msg.textContent = 'Could not reach the review server. Try again later.';
    } finally {
      btn.disabled = false;
    }
  });
  return [shoutTitle('Reviews'), sum, empty, list, form];
}

function renderAbout() {
  const tags = el('ul', 'tags');
  ['Luau scripting', 'building', 'UI', 'game systems', 'DataStores', 'Rojo + Git'].forEach(t => tags.append(el('li', '', t)));
  return [
    shoutTitle('About'),
    el('p', 'sub', 'Building for 2 years, scripting for 1'),
    el('p', 'desc', 'I make Roblox games, maps and the systems that run them. Give me a goal and I keep drilling until it is done, then I drill a little further.'),
    el('p', 'tags-title', 'WHAT I DO'),
    tags
  ];
}

function renderContact() {
  const box = el('div', 'handles');
  const d = el('div', 'handle');
  d.append(el('span', '', 'DISCORD'), el('strong', '', CONTACT.discord));
  const r = el('div', 'handle');
  const a = el('a', '', 'Roblox profile ↗');
  a.href = CONTACT.roblox; a.target = '_blank'; a.rel = 'noopener';
  r.append(el('span', '', 'ROBLOX'), a);
  box.append(d, r);
  return [shoutTitle('Contact'), el('p', 'desc', 'Need a game, a map or a system? Message me and tell me exactly what you want.'), box];
}

function render(id) {
  let nodes;
  if (id === 'reviews') nodes = renderReviews();
  else if (id === 'about') nodes = renderAbout();
  else if (id === 'contact') nodes = renderContact();
  else {
    const list = PROJECTS.filter(p => p.section === id);
    nodes = list.length ? renderProject(list) : [shoutTitle(SECTIONS.find(s => s.id === id).title), el('p', 'desc', 'Coming soon.')];
  }
  panel.replaceChildren(...nodes);
}

/* ---------- galaxy background ---------- */
const canvas = document.getElementById('galaxy');
const ctx = canvas.getContext('2d');
let W = 0, H = 0, parts = [], boost = 0, angle = 0;
const COLORS = ['#39ff8e', '#39ff8e', '#ffe14a', '#ff8a00', '#ff2a1a', '#f7eedd'];
function resize() {
  const dpr = Math.min(2, devicePixelRatio || 1);
  W = innerWidth; H = innerHeight;
  canvas.width = W * dpr; canvas.height = H * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const n = W < 700 ? 700 : 1400;
  parts = Array.from({ length: n }, (_, i) => {
    const r = Math.pow(Math.random(), 1.5);
    return { r, a: (i % 3) * 2.094 + r * 5 + (Math.random() - .5) * (.6 - .4 * r), s: Math.random() < .05 ? 2.2 : Math.random() * 1.2 + .4, c: COLORS[(Math.random() * COLORS.length) | 0] };
  });
  if (reduceMotion) draw(0);
}
function galaxyBoost(amount = 1) { boost = Math.min(4, boost + amount); }
function draw(dt) {
  angle += dt * (0.00004 + boost * 0.0006);
  boost *= 0.96;
  ctx.clearRect(0, 0, W, H);
  const cx = W * .68, cy = H * .55, R = Math.max(W, H) * .55;
  ctx.globalCompositeOperation = 'lighter';
  for (const p of parts) {
    const ang = p.a + angle / (.3 + p.r);
    const x = Math.cos(ang) * p.r * R, y = Math.sin(ang) * p.r * R * .5;
    ctx.globalAlpha = .12 + .35 * (1 - p.r);
    ctx.fillStyle = p.c;
    ctx.fillRect(cx + x * .94 - y * .34, cy + x * .34 + y * .94, p.s, p.s);
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}
let last = performance.now();
function loop(t) { draw(t - last); last = t; requestAnimationFrame(loop); }
addEventListener('resize', resize);
resize();
if (!reduceMotion) requestAnimationFrame(loop);

document.getElementById('year').textContent = new Date().getFullYear();
select(0);
