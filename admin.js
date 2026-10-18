'use strict';

/* Hidden admin page. The password is checked by the Worker (ADMIN_KEY secret);
   nothing secret lives in this file. */
const WORKER_URL = 'https://fatih-reviews.fatihinceoglu2009.workers.dev';
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
  const readStored = () => {
    try { return sessionStorage.getItem(STORE_KEY) || localStorage.getItem(STORE_KEY) || ''; } catch (e) { return ''; }
  };
  const store = (pw, remember) => {
    try {
      sessionStorage.setItem(STORE_KEY, pw);
      if (remember) localStorage.setItem(STORE_KEY, pw); else localStorage.removeItem(STORE_KEY);
    } catch (e) { /* storage blocked: stay logged in for this page only */ }
  };
  const forget = () => {
    try { sessionStorage.removeItem(STORE_KEY); localStorage.removeItem(STORE_KEY); } catch (e) { /* ignore */ }
  };

  async function api(method, path, body) {
    const headers = { Authorization: 'Bearer ' + password };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const res = await fetch(WORKER_URL + path, {
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
      const { codes } = await api('GET', '/admin/codes');
      if (!codes.length) { list.replaceChildren(el('li', 'empty', 'No codes yet.')); return; }
      list.replaceChildren(...codes.map(c => {
        const used = !!c.used_at;
        const li = el('li', used ? 'used' : '');
        const who = c.client || 'No client name';
        const draw = () => {
          const del = button('Delete');
          del.addEventListener('click', () => confirmRow(li, 'Delete the code for ' + who + '?', async () => {
            try { await api('DELETE', '/admin/codes/' + c.id); $('code-status').textContent = 'Code deleted.'; loadCodes(); }
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
      const { code, client } = await api('POST', '/admin/codes', { client: $('client').value.trim() });
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
      const { reviews } = await api('GET', '/admin/reviews');
      if (!reviews.length) { list.replaceChildren(el('li', 'empty', 'No reviews yet.')); return; }
      list.replaceChildren(...reviews.map(r => {
        const li = el('li', r.hidden ? 'hidden-review' : '');
        const draw = () => {
          const stars = Math.max(1, Math.min(5, Number(r.stars) || 0));
          const toggle = button(r.hidden ? 'Show' : 'Hide');
          toggle.addEventListener('click', async () => {
            try {
              await api('POST', '/admin/reviews/' + r.id, { hidden: !r.hidden });
              $('rev-status').textContent = r.hidden ? 'Review is visible again.' : 'Review hidden from the site.';
              loadReviews();
            } catch (e) { handleError(e, 'rev-status'); }
          });
          const del = button('Delete');
          del.addEventListener('click', () => confirmRow(li, 'Delete the review from ' + r.name + ' for good?', async () => {
            try { await api('DELETE', '/admin/reviews/' + r.id); $('rev-status').textContent = 'Review deleted.'; loadReviews(); }
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
    $('login').hidden = true;
    $('board').hidden = false;
    $('logout').hidden = false;
    loadCodes();
    loadReviews();
  }

  function logout(msg) {
    password = '';
    forget();
    $('board').hidden = true;
    $('logout').hidden = true;
    $('login').hidden = false;
    $('login-status').textContent = msg || '';
    $('pw').value = '';
    $('pw').focus();
  }

  $('login-form').addEventListener('submit', async e => {
    e.preventDefault();
    const pw = $('pw').value.trim();
    if (!pw) { $('login-status').textContent = 'Enter the password.'; return; }
    password = pw;
    $('login-status').textContent = 'Checking…';
    try {
      await api('GET', '/admin/check');
      store(pw, $('remember').checked);
      $('login-status').textContent = '';
      showBoard();
    } catch (err) {
      password = '';
      $('login-status').textContent = err.status === 401 ? 'Wrong password.' : (err.message || 'Could not reach the server.');
    }
  });

  $('logout').addEventListener('click', () => logout('Logged out.'));

  const saved = readStored();
  if (saved) {
    password = saved;
    api('GET', '/admin/check').then(showBoard, () => logout(''));
  }
})();
