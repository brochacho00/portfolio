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

  async function api(method, path) {
    const res = await fetch(WORKER_URL + path, {
      method,
      headers: { Authorization: 'Bearer ' + password }
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

  /* ---- Codes ---- */
  async function loadCodes() {
    const list = $('codes');
    try {
      const { codes } = await api('GET', '/admin/codes');
      if (!codes.length) { list.replaceChildren(el('li', 'empty', 'No codes yet.')); return; }
      list.replaceChildren(...codes.map(c => {
        const li = el('li', c.used ? 'used' : '');
        const draw = () => {
          const parts = [el('span', 'code', c.code), el('span', 'tag', c.used ? 'Used' : 'Unused')];
          if (!c.used) {
            const cp = button('Copy');
            cp.addEventListener('click', () => copy(c.code, cp));
            parts.push(cp);
          }
          const del = button('Delete');
          del.addEventListener('click', () => confirmRow(li, 'Delete ' + c.code + '?', async () => {
            try { await api('DELETE', '/admin/codes/' + encodeURIComponent(c.code)); $('code-status').textContent = 'Code deleted.'; loadCodes(); }
            catch (e) { $('code-status').textContent = e.message; draw(); }
          }, draw));
          parts.push(del);
          li.replaceChildren(...parts);
        };
        draw();
        return li;
      }));
    } catch (e) {
      handleError(e, 'code-status');
    }
  }

  $('new-code').addEventListener('click', async () => {
    const btn = $('new-code');
    btn.disabled = true;
    try {
      const { code } = await api('POST', '/admin/codes');
      const box = $('fresh');
      const cp = button('Copy', 'act small');
      cp.addEventListener('click', () => copy(code, cp));
      box.replaceChildren(el('span', '', code), cp);
      box.hidden = false;
      $('code-status').textContent = 'New code ready. Send it to your client.';
      loadCodes();
    } catch (e) {
      handleError(e, 'code-status');
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
        const li = el('li');
        const draw = () => {
          const stars = Math.max(1, Math.min(5, Number(r.stars) || 0));
          const del = button('Delete');
          del.addEventListener('click', () => confirmRow(li, 'Delete the review from ' + r.name + '?', async () => {
            try { await api('DELETE', '/admin/reviews/' + encodeURIComponent(r.id)); $('rev-status').textContent = 'Review deleted.'; loadReviews(); }
            catch (e) { $('rev-status').textContent = e.message; draw(); }
          }, draw));
          li.replaceChildren(
            el('span', 'stars', '★'.repeat(stars) + '☆'.repeat(5 - stars)),
            el('p', 'rev-body', String(r.text || '')),
            el('span', 'rev-meta', String(r.name || '') + ' · ' + String(r.date || '')),
            del
          );
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
