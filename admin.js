'use strict';

/* Hidden admin page. Nothing secret lives in this file: you type the admin URL
   (Worker address + secret ADMIN_PATH) and the token when you sign in, and the
   Worker checks both. They are kept only in this tab and are gone when it closes. */
const STORE_KEY = 'brochacho-admin';

(() => {
  const $ = id => document.getElementById(id);
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  };
  const button = (text, cls) => {
    const b = el('button', cls || 'act ghost small', text);
    b.type = 'button';
    return b;
  };

  let password = '';
  let adminUrl = '';
  const readStored = () => {
    try {
      const s = JSON.parse(sessionStorage.getItem(STORE_KEY) || 'null');
      return s && typeof s.url === 'string' && typeof s.token === 'string' ? s : null;
    } catch (e) { return null; }
  };
  const store = (url, token) => {
    try { sessionStorage.setItem(STORE_KEY, JSON.stringify({ url, token })); } catch (e) { /* storage blocked: this page only */ }
  };
  const forget = () => {
    try { sessionStorage.removeItem(STORE_KEY); localStorage.removeItem(STORE_KEY); } catch (e) { /* ignore */ }
  };

  // "https://x.workers.dev/secret-path/" -> "https://x.workers.dev/secret-path", or "" if not usable.
  function cleanAdminUrl(input) {
    try {
      const u = new URL(String(input || '').trim());
      const path = u.pathname.replace(/\/+$/, '');
      if (u.protocol !== 'https:' || !path || path === '/' || u.search || u.hash) return '';
      return u.origin + path;
    } catch (e) { return ''; }
  }

  async function api(method, path, body) {
    if (!adminUrl || !password) {
      const err = new Error('Sign in with the Worker URL and token first.');
      err.status = 401;
      throw err;
    }
    const headers = { Authorization: 'Bearer ' + password };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const res = await fetch(adminUrl + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(typeof data.error === 'string' ? data.error : 'Error ' + res.status);
      err.status = res.status;
      throw err;
    }
    return data;
  }

  function copy(text, btn) {
    const flash = msg => {
      const old = btn.textContent;
      btn.textContent = msg;
      setTimeout(() => { btn.textContent = old === 'Copied' ? 'Copy' : old; }, 1400);
    };
    try {
      navigator.clipboard.writeText(text).then(() => flash('Copied'), () => flash('Copy failed'));
    } catch (e) {
      flash('Copy failed');
    }
  }

  function confirmRow(li, question, onYes, restore) {
    const yes = button('Yes, delete', 'act small');
    const no = button('Keep');
    yes.addEventListener('click', onYes);
    no.addEventListener('click', restore);
    li.replaceChildren(el('span', 'tag', question), yes, no);
  }

  const day = iso => String(iso || '').slice(0, 10);

  /* ---- Codes (stored hashed: the code text is only known right after creation) ---- */
  async function loadCodes() {
    const list = $('codes');
    try {
      const { codes } = await api('GET', '/codes');
      if (!codes.length) { list.replaceChildren(el('li', 'empty', 'No codes yet.')); return; }
      list.replaceChildren(...codes.map(c => {
        const used = !!c.used_at;
        const li = el('li', used ? 'used' : '');
        const who = c.client || 'No client name';
        const draw = () => {
          const del = button('Delete');
          del.addEventListener('click', () => confirmRow(li, 'Delete the code for ' + who + '?', async () => {
            try { await api('DELETE', '/codes/' + c.id); $('code-status').textContent = 'Code deleted.'; loadCodes(); }
            catch (e) { $('code-status').textContent = e.message; draw(); }
          }, draw));
          li.replaceChildren(
            el('span', 'code', who),
            el('span', 'tag', used ? 'Used ' + day(c.used_at) : 'Unused · made ' + day(c.created_at)),
            del
          );
        };
        draw();
        return li;
      }));
    } catch (e) {
      handleError(e, 'code-status');
    }
  }

  $('code-form').addEventListener('submit', async e => {
    e.preventDefault();
    const btn = $('new-code');
    btn.disabled = true;
    try {
      const { code, client } = await api('POST', '/codes', { client: $('client').value.trim() });
      const box = $('fresh');
      const cp = button('Copy', 'act small');
      cp.addEventListener('click', () => copy(code, cp));
      box.replaceChildren(el('span', '', code), cp);
      box.hidden = false;
      $('code-status').textContent = 'Code for ' + (client || 'your client') + ' is ready. Copy it now: it will not be shown again.';
      $('client').value = '';
      loadCodes();
    } catch (err) {
      handleError(err, 'code-status');
    } finally {
      btn.disabled = false;
    }
  });

  /* ---- Reviews ---- */
  async function loadReviews() {
    const list = $('reviews');
    try {
      const { reviews } = await api('GET', '/reviews');
      if (!reviews.length) { list.replaceChildren(el('li', 'empty', 'No reviews yet.')); return; }
      list.replaceChildren(...reviews.map(r => {
        const li = el('li', r.hidden ? 'hidden-review' : '');
        const draw = () => {
          const stars = Math.max(1, Math.min(5, Number(r.stars) || 0));
          const toggle = button(r.hidden ? 'Show' : 'Hide');
          toggle.addEventListener('click', async () => {
            try {
              await api('POST', '/reviews/' + r.id, { hidden: !r.hidden });
              $('rev-status').textContent = r.hidden ? 'Review is visible again.' : 'Review hidden from the site.';
              loadReviews();
            } catch (e) { handleError(e, 'rev-status'); }
          });
          const del = button('Delete');
          del.addEventListener('click', () => confirmRow(li, 'Delete the review from ' + r.name + ' for good?', async () => {
            try { await api('DELETE', '/reviews/' + r.id); $('rev-status').textContent = 'Review deleted.'; loadReviews(); }
            catch (e) { $('rev-status').textContent = e.message; draw(); }
          }, draw));
          const meta = String(r.name || '') + ' · ' + day(r.created_at) + (r.client ? ' · code for ' + r.client : '');
          const parts = [el('span', 'stars', '★'.repeat(stars) + '☆'.repeat(5 - stars))];
          if (r.hidden) parts.push(el('span', 'flag', 'HIDDEN'));
          parts.push(el('p', 'rev-body', String(r.text || '')), el('span', 'rev-meta', meta), toggle, del);
          li.replaceChildren(...parts);
        };
        draw();
        return li;
      }));
    } catch (e) {
      handleError(e, 'rev-status');
    }
  }

  /* ---- Login ---- */
  function handleError(e, statusId) {
    if (e.status === 401) { logout('Wrong password.'); return; }
    $(statusId).textContent = e.message || 'Something went wrong.';
  }

  function showBoard() {
    if (!adminUrl || !password) { logout(''); return; }
    $('login').hidden = true;
    $('board').hidden = false;
    $('logout').hidden = false;
    loadCodes();
    loadReviews();
  }

  function logout(msg) {
    password = '';
    adminUrl = '';
    forget();
    $('codes').replaceChildren();
    $('reviews').replaceChildren();
    $('fresh').replaceChildren();
    $('fresh').hidden = true;
    $('worker-url').value = '';
    $('board').hidden = true;
    $('logout').hidden = true;
    $('login').hidden = false;
    $('login-status').textContent = msg || '';
    $('pw').value = '';
    $('worker-url').focus();
  }

  $('login-form').addEventListener('submit', async e => {
    e.preventDefault();
    const url = cleanAdminUrl($('worker-url').value);
    const pw = $('pw').value.trim();
    if (!url) { $('login-status').textContent = 'Enter the full Worker URL, including the secret path.'; return; }
    if (!pw) { $('login-status').textContent = 'Enter the token.'; return; }
    adminUrl = url;
    password = pw;
    $('login-status').textContent = 'Checking…';
    try {
      await api('GET', '/check');
      store(url, pw);
      $('login-status').textContent = '';
      showBoard();
    } catch (err) {
      adminUrl = '';
      password = '';
      // A wrong path and a wrong token both just fail; the server does not say which one.
      $('login-status').textContent = err.status === 429 ? err.message : 'Wrong Worker URL or token.';
    }
  });

  $('logout').addEventListener('click', () => logout('Logged out.'));

  const saved = readStored();
  if (saved) {
    adminUrl = cleanAdminUrl(saved.url);
    password = saved.token;
    api('GET', '/check').then(showBoard, () => logout(''));
  }
})();
