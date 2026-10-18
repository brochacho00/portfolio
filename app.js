'use strict';

/* =========================================================
   EDIT YOUR CONTENT HERE
   GAMES: one entry per screenshot tab in "My Games".
     tab     - text on the tab button
     image   - file inside the images/ folder
     alt     - short description of the picture (for screen readers)
     caption - text shown under the picture
   SKILLS: the "/ tag" list under My Games.
   ========================================================= */
const GAMES = [
  { tab: 'Town', image: 'images/town.webp', alt: 'Maplewood from above: a town hall with a clock tower, a fountain square and market stalls',
    caption: 'Maplewood: a town hall with a clock tower, a fountain square and market stalls.' },
  { tab: 'Hill town', image: 'images/hilltown.webp', alt: 'Oakridge from above: a hilltop town with a church among rolling hills',
    caption: 'Oakridge, a hilltop town with a church, packed tight around its streets.' },
  { tab: 'Hub', image: 'images/hub.webp', alt: 'Eight empty ranches around a round hub with four striped stalls',
    caption: 'Eight ranches around the hub. The four stalls in the middle hold my NPCs and shop screens.' },
  { tab: 'Plaza', image: 'images/plaza.webp', alt: 'A plaza with shop stalls at the far edge and two-floor bases on both sides',
    caption: 'A plaza with shop stalls along the edge and two-floor bases on both sides.' },
  { tab: 'Sky track', image: 'images/skytrack.webp', alt: 'A track across floating islands with gates for Maple Valley, Desert Oasis and Red Canyon',
    caption: 'A track across floating islands, split into zones like Maple Valley, Desert Oasis and Red Canyon.' },
  { tab: 'Ride', image: 'images/ride.webp', alt: 'A player riding toward the ranch with the Rebirth, Index and Shop buttons, a cash counter and a Dismount button on screen',
    caption: 'Riding back to the ranch. The Rebirth, Index and Shop buttons, the cash counter and the Dismount button are my UI.' },
  { tab: 'Carry', image: 'images/carry.webp', alt: 'A player carrying a character through tall grass at night, with the Food, Sell, Gears and Track stalls behind',
    caption: 'Carrying a character home at night, past the Food, Sell, Gears and Track stalls.' },
  { tab: 'Radars', image: 'images/radars.webp', alt: 'Six handheld radars in a row, each a different color, above the map',
    caption: 'The six radars, one for each rarity tier. They are sold at the Gears stall, in the radar shop I built.' }
];

const SKILLS = ['UI panels', '3D previews', 'hub stalls', 'NPC dialogue', 'food shop', 'radar shop', 'sell stall',
  'egg hatching', 'ride bar', 'player saves', 'Robux purchases', 'economy'];

/* Reviews worker (Cloudflare). If you change it, also change connect-src in index.html. */
const WORKER_URL = 'https://WORKER_HOST_PLACEHOLDER';

/* ========================================================= */

(() => {
  const root = document.documentElement;
  const css = getComputedStyle(root);
  const tok = n => css.getPropertyValue(n).trim();
  const COL = { bone: tok('--bone'), flame: tok('--flame'), spiral: tok('--spiral'), crimson: tok('--crimson') };
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const wide = matchMedia('(min-width: 900px)');
  if (reduce) document.querySelectorAll('svg').forEach(s => s.pauseAnimations && s.pauseAnimations());

  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  };

  /* ---- Sections: each menu item is one altitude zone ---- */
  const ZONES = [
    { zone: 'UNDERGROUND', alt: -250, stars: 0 },
    { zone: 'SURFACE', alt: 0, stars: .12 },
    { zone: 'SKY', alt: 12000, stars: .35 },
    { zone: 'STRATOSPHERE', alt: 50000, stars: .65 },
    { zone: 'ORBIT', alt: 400000, stars: 1 },
    { zone: 'GALAXY', alt: Infinity, stars: 1 }
  ];
  const HASH = { games: 0, skills: 1, method: 2, reviews: 3, about: 4, contact: 5 };
  const items = [...document.querySelectorAll('.m-item')];
  const panels = items.map(b => document.getElementById(b.getAttribute('aria-controls')));
  const layers = [...document.querySelectorAll('.sky .layer')];
  const alt = document.querySelector('.alt');
  const numEl = alt.querySelector('.alt-num');
  const zoneEl = alt.querySelector('.alt-zone');
  const stage = document.querySelector('.stage');
  let current = -1;
  let starVis = 0, starTarget = 0, galVis = 0, galTarget = 0;
  let shownAlt = -250, altAnim = 0;

  function fmt(a) {
    if (a === Infinity || a >= 1e9) return '∞';
    const sign = a < 0 ? '−' : (a > 0 ? '+' : '');
    const v = Math.abs(a);
    if (v < 1000) return sign + Math.round(v) + ' m';
    return sign + (v / 1000).toLocaleString('en-US', { maximumFractionDigits: v < 10000 ? 1 : 0 }) + ' km';
  }

  function tweenAlt(to) {
    cancelAnimationFrame(altAnim);
    const from = shownAlt;
    const target = to === Infinity ? 1e9 : to;
    if (reduce) { shownAlt = target; numEl.textContent = fmt(to); return; }
    const t0 = performance.now();
    const step = now => {
      const t = Math.min(1, (now - t0) / 650);
      const e = 1 - Math.pow(1 - t, 3);
      shownAlt = from + (target - from) * e;
      numEl.textContent = t === 1 ? fmt(to) : fmt(Math.min(shownAlt, 999999000));
      if (t < 1) altAnim = requestAnimationFrame(step);
    };
    altAnim = requestAnimationFrame(step);
  }

  function show(i, focus) {
    if (i === current) { if (focus) items[i].focus(); return; }
    current = i;
    items.forEach((b, k) => {
      b.setAttribute('aria-selected', String(k === i));
      b.tabIndex = k === i ? 0 : -1;
    });
    panels.forEach((p, k) => { p.hidden = k !== i; });
    layers.forEach((l, k) => l.classList.toggle('on', k === i));
    const z = ZONES[i];
    zoneEl.textContent = z.zone;
    tweenAlt(z.alt);
    alt.style.setProperty('--p', (i / (items.length - 1)).toFixed(3));
    starTarget = z.stars;
    galTarget = i === items.length - 1 ? 1 : 0;
    stage.scrollTop = 0;
    if (focus) items[i].focus();
    if (i === HASH.reviews) loadReviews();
    if (reduce) { starVis = starTarget; galVis = galTarget; drawStars(0); drawGalaxy(0); }
  }

  items.forEach((b, k) => b.addEventListener('click', () => show(k)));
  document.addEventListener('keydown', e => {
    if (e.altKey || e.ctrlKey || e.metaKey || !wide.matches) return;
    const onMenu = document.activeElement && document.activeElement.classList.contains('m-item');
    if (onMenu && (e.key === 'Home' || e.key === 'End')) {
      e.preventDefault();
      show(e.key === 'Home' ? 0 : items.length - 1, true);
      return;
    }
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    const tag = e.target && e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target && e.target.isContentEditable)) return;
    e.preventDefault();
    const n = e.key === 'ArrowDown' ? Math.min(items.length - 1, current + 1) : Math.max(0, current - 1);
    show(n, onMenu);
  });

  /* ---- My Games screen tabs, built from GAMES ---- */
  const shotStage = document.getElementById('shot-stage');
  const shot = shotStage.querySelector('.screen');
  const shotImg = shot.querySelector('img');
  const shotCount = shot.querySelector('.s-count');
  const shotCap = document.querySelector('.viewer .cap');
  const tabBox = document.querySelector('.viewer .tabs');
  const pad = n => String(n).padStart(2, '0');
  const tabs = GAMES.map((g, k) => {
    const b = el('button', 'chip');
    b.type = 'button';
    b.id = 'shot-tab-' + k;
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-controls', 'shot-stage');
    b.append(el('span', '', g.tab));
    tabBox.append(b);
    return b;
  });
  const skillList = document.querySelector('.viewer .skills');
  SKILLS.forEach(s => skillList.append(el('li', '', s)));

  function showShot(k, focus, animate) {
    const g = GAMES[k];
    tabs.forEach((t, j) => {
      t.setAttribute('aria-selected', String(j === k));
      t.tabIndex = j === k ? 0 : -1;
    });
    shotStage.setAttribute('aria-labelledby', tabs[k].id);
    shotImg.src = g.image;
    shotImg.alt = g.alt;
    shotCap.textContent = g.caption;
    shotCount.textContent = pad(k + 1) + ' / ' + pad(GAMES.length);
    if (animate && !reduce) {
      shot.classList.remove('swap');
      void shot.offsetWidth;
      shot.classList.add('swap');
    }
    if (focus) tabs[k].focus();
  }

  tabs.forEach((t, k) => {
    t.addEventListener('click', () => showShot(k, false, true));
    t.addEventListener('keydown', e => {
      const last = tabs.length - 1;
      const n = { ArrowRight: k === last ? 0 : k + 1, ArrowLeft: k === 0 ? last : k - 1, Home: 0, End: last }[e.key];
      if (n === undefined) return;
      e.preventDefault();
      e.stopPropagation();
      showShot(n, true, true);
    });
  });
  if (GAMES.length) showShot(0, false, false);
  addEventListener('load', () => GAMES.forEach(g => { const p = new Image(); p.src = g.image; }));

  /* ---- Reviews (Cloudflare Worker) ---- */
  const revPanel = document.getElementById('p-reviews');
  const revSummary = revPanel.querySelector('.rev-summary');
  const revAvg = revPanel.querySelector('.rev-avg');
  const revBig = revPanel.querySelector('.rev-big');
  const revTotal = revPanel.querySelector('.rev-total');
  const revEmpty = revPanel.querySelector('.rev-empty');
  const revList = revPanel.querySelector('.rev-list');
  const badge = document.querySelector('.rating');
  const form = document.getElementById('rev-form');
  const fCode = document.getElementById('rev-code');
  const fName = document.getElementById('rev-name');
  const fText = document.getElementById('rev-text');
  const sendBtn = document.getElementById('rev-send');
  const statusEl = document.getElementById('rev-status');
  let loading = null;

  badge.addEventListener('click', () => show(HASH.reviews));

  function starsEl(n) {
    const w = el('span', 'stars');
    w.setAttribute('role', 'img');
    w.setAttribute('aria-label', n + ' out of 5 stars');
    w.append(el('span', '', '★'.repeat(n)), el('span', 'off', '★'.repeat(5 - n)));
    return w;
  }

  function monthLabel(iso) {
    const d = new Date(String(iso) + 'T12:00:00');
    return isNaN(d) ? '' : d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  }

  function clean(r) {
    if (!r || typeof r !== 'object') return null;
    const stars = Math.round(Number(r.stars));
    const name = String(r.name || '').trim().slice(0, 40);
    const text = String(r.text || '').trim().slice(0, 600);
    if (!name || !text || !(stars >= 1 && stars <= 5)) return null;
    return { name, stars, text, date: String(r.date || '').slice(0, 10) };
  }

  function renderReviews(list) {
    revList.replaceChildren(...list.map(r => {
      const li = el('li', 'rev');
      const q = el('blockquote');
      q.append(el('p', '', r.text));
      const who = el('p', 'who');
      who.append(el('span', '', r.name));
      const when = monthLabel(r.date);
      if (when) who.append(el('span', 'when', when));
      li.append(starsEl(r.stars), q, who);
      return li;
    }));
    revList.hidden = list.length === 0;
    revEmpty.hidden = list.length > 0;
    revEmpty.textContent = 'No reviews yet. Worked with me? Leave the first one below.';
    if (!list.length) { revSummary.hidden = true; badge.hidden = true; return; }
    const n = list.length;
    const avg = list.reduce((s, r) => s + r.stars, 0) / n;
    revAvg.textContent = avg.toFixed(1);
    revBig.replaceChildren(starsEl(Math.round(avg)));
    revTotal.textContent = n + (n === 1 ? ' review' : ' reviews');
    revSummary.hidden = false;
    badge.querySelector('.r-avg').textContent = avg.toFixed(1);
    badge.querySelector('.r-stars').replaceChildren(starsEl(Math.round(avg)));
    badge.querySelector('.r-count').textContent = '(' + n + ')';
    badge.setAttribute('aria-label', 'Rated ' + avg.toFixed(1) + ' out of 5 from ' + n + (n === 1 ? ' review' : ' reviews') + '. See reviews');
    badge.hidden = false;
  }

  function loadReviews(force) {
    if (loading && !force) return loading;
    loading = fetch(WORKER_URL + '/reviews', { cache: 'no-store' })
      .then(res => { if (!res.ok) throw new Error(String(res.status)); return res.json(); })
      .then(data => renderReviews((Array.isArray(data.reviews) ? data.reviews : []).map(clean).filter(Boolean)))
      .catch(() => {
        revEmpty.hidden = false;
        revEmpty.textContent = 'Reviews could not load right now. Try again later.';
        loading = null;
      });
    return loading;
  }

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const picked = form.querySelector('input[name="rev-stars"]:checked');
    const review = {
      code: fCode.value.trim(),
      name: fName.value.trim(),
      text: fText.value.trim(),
      stars: picked ? Number(picked.value) : 5
    };
    if (!review.code) { statusEl.textContent = 'Enter the review code I gave you.'; return; }
    if (!review.name || !review.text) { statusEl.textContent = 'Write your name and your review.'; return; }
    sendBtn.disabled = true;
    statusEl.textContent = 'Sending…';
    try {
      const res = await fetch(WORKER_URL + '/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(review)
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        statusEl.textContent = typeof data.error === 'string' ? data.error : 'Could not send the review (error ' + res.status + ').';
        return;
      }
      statusEl.textContent = 'Thanks! Your review is live.';
      form.reset();
      loadReviews(true);
    } catch (err) {
      statusEl.textContent = 'Could not reach the review server. Try again later.';
    } finally {
      sendBtn.disabled = false;
    }
  });

  /* ---- Copy buttons (Contact) ---- */
  document.querySelectorAll('.copy').forEach(btn => {
    btn.addEventListener('click', () => {
      const reset = msg => {
        btn.textContent = msg;
        setTimeout(() => { btn.textContent = 'Copy'; }, 1600);
      };
      const selectIt = () => {
        const v = btn.closest('.handle').querySelector('.v');
        const r = document.createRange();
        r.selectNodeContents(v);
        const sel = getSelection();
        sel.removeAllRanges();
        sel.addRange(r);
        reset('Selected');
      };
      try {
        navigator.clipboard.writeText(btn.dataset.copy).then(() => reset('Copied'), selectIt);
      } catch (err) {
        selectIt();
      }
    });
  });

  /* ---- Stars ---- */
  const sc = document.getElementById('stars');
  const sx = sc.getContext('2d');
  let stars = [], W = 0, H = 0;

  function sizeStars(regen) {
    const d = Math.min(2, devicePixelRatio || 1);
    W = innerWidth; H = innerHeight;
    sc.width = W * d; sc.height = H * d;
    sx.setTransform(d, 0, 0, d, 0, 0);
    if (!regen) return;
    const n = Math.round(W * H / 5200);
    stars = Array.from({ length: n }, () => {
      const r = Math.random();
      return {
        x: Math.random(), y: Math.random(),
        s: Math.random() < .08 ? 1.8 : Math.random() * 1.1 + .4,
        ph: Math.random() * 6.28, sp: .6 + Math.random() * 1.8,
        c: r < .12 ? COL.spiral : r < .3 ? COL.flame : COL.bone
      };
    });
  }

  function drawStars(t) {
    sx.clearRect(0, 0, W, H);
    if (starVis <= .01) return;
    for (const s of stars) {
      sx.globalAlpha = starVis * (.55 + .45 * Math.sin(t * .001 * s.sp + s.ph));
      sx.fillStyle = s.c;
      sx.fillRect(s.x * W, s.y * H, s.s, s.s);
    }
    sx.globalAlpha = 1;
  }

  /* ---- Spiral galaxy behind Contact ---- */
  const gc = document.getElementById('galaxy');
  const gx = gc.getContext('2d');
  let gp = [];

  function sizeGalaxy(regen) {
    const d = Math.min(2, devicePixelRatio || 1);
    gc.width = W * d; gc.height = H * d;
    gx.setTransform(d, 0, 0, d, 0, 0);
    if (!regen) return;
    const n = W < 700 ? 800 : 1600;
    gp = Array.from({ length: n }, (_, i) => {
      const arm = i % 3;
      const rr = Math.pow(Math.random(), 1.5);
      const spread = (Math.random() + Math.random() + Math.random() - 1.5) * (.55 - .35 * rr);
      const pick = Math.random();
      return {
        rr,
        a0: arm * 2.0944 + rr * 4.8 + spread,
        sz: Math.random() < .05 ? 2.4 : Math.random() * 1.3 + .5,
        c: rr < .15 ? COL.bone : pick < .66 ? COL.spiral : pick < .86 ? COL.flame : COL.crimson
      };
    });
  }

  function drawGalaxy(t) {
    const narrow = !wide.matches;
    gc.style.opacity = (galVis * (narrow ? .5 : 1)).toFixed(3);
    gx.clearRect(0, 0, W, H);
    if (galVis <= .01) return;
    const cx = narrow ? W * .5 : W * .72;
    const cy = narrow ? H * .6 : H * .58;
    const R = narrow ? W * .6 : Math.min(W * .3, H * .5);
    const glow = gx.createRadialGradient(cx, cy, 0, cx, cy, R * .55);
    glow.addColorStop(0, 'rgba(255, 238, 200, .5)');
    glow.addColorStop(.3, 'rgba(76, 243, 160, .12)');
    glow.addColorStop(1, 'rgba(76, 243, 160, 0)');
    gx.fillStyle = glow;
    gx.fillRect(0, 0, W, H);
    gx.globalCompositeOperation = 'lighter';
    const tilt = -.38, ct = Math.cos(tilt), st = Math.sin(tilt);
    const time = t * .00007;
    for (const p of gp) {
      const ang = p.a0 + time / (.25 + p.rr);
      const x = Math.cos(ang) * p.rr * R;
      const y = Math.sin(ang) * p.rr * R * .42;
      gx.globalAlpha = .3 + .7 * (1 - p.rr);
      gx.fillStyle = p.c;
      gx.fillRect(cx + x * ct - y * st, cy + x * st + y * ct, p.sz, p.sz);
    }
    gx.globalAlpha = 1;
    gx.globalCompositeOperation = 'source-over';
  }

  /* ---- Wiring ---- */
  let lastW = -1;
  function resize() {
    const regen = innerWidth !== lastW;
    lastW = innerWidth;
    sizeStars(regen);
    sizeGalaxy(regen);
    if (reduce) { drawStars(0); drawGalaxy(0); }
  }
  resize();
  addEventListener('resize', resize);

  show(HASH[location.hash.slice(1)] ?? 0);
  loadReviews();

  if (!reduce) {
    const loop = t => {
      starVis += (starTarget - starVis) * .06;
      galVis += (galTarget - galVis) * .06;
      drawStars(t);
      drawGalaxy(t);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
})();
