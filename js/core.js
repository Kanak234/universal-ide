/* ============================================================
   UNIVERSAL IDE — core.js
   Storage, auth, settings, subscriptions and the hash-chained
   payment ledger. Client-side demo build (localStorage).
   ============================================================ */

const UIDE = (() => {

  /* ---------- tiny storage helpers ---------- */
  const K = {
    USERS: 'uide_users',
    SETTINGS: 'uide_settings',
    PAYMENTS: 'uide_payments',
    LEDGER: 'uide_ledger',
    SESSION: 'uide_session'
  };
  const load = (k, fb) => {
    try { const v = JSON.parse(localStorage.getItem(k)); return v === null || v === undefined ? fb : v; }
    catch { return fb; }
  };
  const save = (k, v) => localStorage.setItem(k, JSON.stringify(v));

  /* ---------- crypto ---------- */
  async function sha256(str) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
  }
  const rid = (p = 'id') => p + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  /* ---------- default settings ---------- */
  const DEFAULT_SETTINGS = {
    appName: 'Universal IDE',
    // Set your REAL UPI ID here or from Admin → Settings.
    // A bare phone number is not a valid VPA — use e.g. 7257864300@ybl / @paytm / @okaxis
    upiVpa: '7257864300@ybl',
    payeeName: 'Universal IDE',
    planDays: 30,
    languages: [
      { id: 'c',      name: 'C',          glyph: 'C',   free: false, price: 79,  desc: 'GCC compiler with program input (stdin). Perfect for BCA lab programs.' },
      { id: 'cpp',    name: 'C++',        glyph: 'C++', free: false, price: 79,  desc: 'Modern g++ with STL support. Data structures, OOP, everything.' },
      { id: 'java',   name: 'Java',       glyph: 'Jv',  free: false, price: 99,  desc: 'Full JDK. Classes, collections, exceptions — run real Java.' },
      { id: 'python', name: 'Python',     glyph: 'Py',  free: false, price: 99,  desc: 'Python 3 with stdin input. From basics to problem solving.' },
      { id: 'js',     name: 'JavaScript', glyph: 'JS',  free: true,  price: 49,  desc: 'Runs in a sandbox with a live console. Instant feedback.' },
      { id: 'html',   name: 'HTML',       glyph: '<>',  free: true,  price: 49,  desc: 'Live page preview as you type. Build and see it instantly.' },
      { id: 'css',    name: 'CSS',        glyph: '{}',  free: false, price: 49,  desc: 'Style a sample page live. Selectors, flexbox, animations.' },
      { id: 'sql',    name: 'SQL',        glyph: 'SQ',  free: false, price: 59,  desc: 'Real SQL engine in the browser (SQLite — MySQL-style syntax).' },
      { id: 'mongodb',name: 'MongoDB',    glyph: 'Mg',  free: false, price: 59,  desc: 'Practice core Mongo shell commands on an in-browser store.' }
    ]
  };

  function getSettings() {
    const s = load(K.SETTINGS, null);
    if (!s) { save(K.SETTINGS, DEFAULT_SETTINGS); return structuredClone(DEFAULT_SETTINGS); }
    // merge in any languages added in newer versions
    for (const dl of DEFAULT_SETTINGS.languages) {
      if (!s.languages.some(l => l.id === dl.id)) s.languages.push(structuredClone(dl));
    }
    return s;
  }
  const saveSettings = s => save(K.SETTINGS, s);
  const getLang = id => getSettings().languages.find(l => l.id === id);

  /* ---------- users & auth ---------- */
  const getUsers = () => load(K.USERS, []);
  const saveUsers = u => save(K.USERS, u);
  const findUser = email => getUsers().find(u => u.email === (email || '').toLowerCase().trim());

  async function signup(name, email, password) {
    name = (name || '').trim(); email = (email || '').toLowerCase().trim();
    if (!name || !email || !password) throw new Error('Fill in every field.');
    if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error('Enter a valid email address.');
    if (password.length < 6) throw new Error('Password needs at least 6 characters.');
    if (findUser(email)) throw new Error('An account with this email already exists. Log in instead.');
    const users = getUsers();
    users.push({
      name, email,
      passHash: await sha256(password),
      created: Date.now(),
      subs: {}            // { langId: expiryTimestamp }
    });
    saveUsers(users);
    save(K.SESSION, email);
    return findUser(email);
  }

  async function login(email, password) {
    const u = findUser(email);
    if (!u) throw new Error('No account found for this email. Sign up first.');
    if (u.passHash !== await sha256(password)) throw new Error('Wrong password. Try again.');
    save(K.SESSION, u.email);
    return u;
  }

  const logout = () => localStorage.removeItem(K.SESSION);
  const currentUser = () => { const e = load(K.SESSION, null); return e ? findUser(e) : null; };

  function updateUser(email, fn) {
    const users = getUsers();
    const u = users.find(x => x.email === email);
    if (!u) return null;
    fn(u); saveUsers(users); return u;
  }

  /* ---------- access control ---------- */
  function hasAccess(user, langId) {
    const lang = getLang(langId);
    if (!lang) return false;
    if (lang.free) return true;
    if (!user) return false;
    const exp = (user.subs || {})[langId];
    return !!exp && exp > Date.now();
  }
  function subDaysLeft(user, langId) {
    const exp = user && user.subs ? user.subs[langId] : 0;
    if (!exp || exp < Date.now()) return 0;
    return Math.ceil((exp - Date.now()) / 86400000);
  }

  /* ---------- hash-chained ledger (tamper-evident record) ----------
     Every payment event is appended as a block:
       hash = SHA-256( prevHash + canonical(payload) )
     Editing any past block breaks every hash after it, which the
     "Verify chain" action in the admin panel will catch.
     NOTE: this gives tamper-EVIDENCE for records. It does not (and
     cannot) make UPI payments anonymous — banks/NPCI always keep
     the real trail. What stays private here is that the site never
     displays the owner's number/VPA as plain text.                */

  const getLedger = () => load(K.LEDGER, []);

  async function appendLedger(type, data) {
    const chain = getLedger();
    const prevHash = chain.length ? chain[chain.length - 1].hash : 'GENESIS';
    const block = { index: chain.length, ts: Date.now(), type, data, prevHash };
    block.hash = await sha256(prevHash + JSON.stringify({ index: block.index, ts: block.ts, type, data }));
    chain.push(block);
    save(K.LEDGER, chain);
    return block;
  }

  async function verifyLedger() {
    const chain = getLedger();
    for (let i = 0; i < chain.length; i++) {
      const b = chain[i];
      const expectPrev = i === 0 ? 'GENESIS' : chain[i - 1].hash;
      if (b.prevHash !== expectPrev) return { ok: false, at: i, reason: 'previous-hash mismatch' };
      const h = await sha256(b.prevHash + JSON.stringify({ index: b.index, ts: b.ts, type: b.type, data: b.data }));
      if (h !== b.hash) return { ok: false, at: i, reason: 'block hash mismatch' };
    }
    return { ok: true, length: chain.length };
  }

  /* ---------- payments ---------- */
  const getPayments = () => load(K.PAYMENTS, []);
  const savePayments = p => save(K.PAYMENTS, p);

  async function submitPayment(userEmail, langId, amount, utr) {
    utr = (utr || '').trim();
    if (!/^\d{12}$/.test(utr)) throw new Error('UTR / transaction ID is the 12-digit number in your UPI app receipt.');
    if (getPayments().some(p => p.utr === utr)) throw new Error('This UTR has already been submitted.');
    const pay = {
      id: rid('pay'), user: userEmail, lang: langId,
      amount, utr, status: 'pending', ts: Date.now()
    };
    const list = getPayments(); list.push(pay); savePayments(list);
    await appendLedger('PAYMENT_SUBMITTED', { id: pay.id, user: userEmail, lang: langId, amount, utr });
    return pay;
  }

  async function approvePayment(payId) {
    const list = getPayments();
    const p = list.find(x => x.id === payId);
    if (!p || p.status !== 'pending') throw new Error('Payment not found or already handled.');
    p.status = 'approved'; p.decidedTs = Date.now();
    savePayments(list);
    const days = getSettings().planDays || 30;
    updateUser(p.user, u => {
      u.subs = u.subs || {};
      const base = Math.max(u.subs[p.lang] || 0, Date.now());
      u.subs[p.lang] = base + days * 86400000;
    });
    await appendLedger('PAYMENT_APPROVED', { id: p.id, user: p.user, lang: p.lang, amount: p.amount, days });
    return p;
  }

  async function rejectPayment(payId, reason) {
    const list = getPayments();
    const p = list.find(x => x.id === payId);
    if (!p || p.status !== 'pending') throw new Error('Payment not found or already handled.');
    p.status = 'rejected'; p.decidedTs = Date.now(); p.reason = reason || '';
    savePayments(list);
    await appendLedger('PAYMENT_REJECTED', { id: p.id, user: p.user, lang: p.lang, reason: p.reason });
    return p;
  }

  async function grantAccess(email, langId, days) {
    const u = updateUser(email, u2 => {
      u2.subs = u2.subs || {};
      const ids = langId === 'ALL' ? getSettings().languages.map(l => l.id) : [langId];
      for (const id of ids) {
        const base = Math.max(u2.subs[id] || 0, Date.now());
        u2.subs[id] = base + days * 86400000;
      }
    });
    if (!u) throw new Error('User not found.');
    await appendLedger('ACCESS_GRANTED', { user: email, lang: langId, days });
    return u;
  }

  async function revokeAccess(email, langId) {
    updateUser(email, u => { if (u.subs) delete u.subs[langId]; });
    await appendLedger('ACCESS_REVOKED', { user: email, lang: langId });
  }

  /* ---------- UPI intent string (encoded into the QR only) ---------- */
  function upiIntent(amount, note) {
    const s = getSettings();
    const q = new URLSearchParams({
      pa: s.upiVpa, pn: s.payeeName, am: String(amount), cu: 'INR', tn: note
    });
    return 'upi://pay?' + q.toString();
  }

  /* ---------- shared UI helpers ---------- */
  function toast(msg) {
    let t = document.getElementById('toast');
    if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); }
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._h);
    t._h = setTimeout(() => t.classList.remove('show'), 2800);
  }
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const inr = n => '₹' + Number(n).toLocaleString('en-IN');
  const fdate = ts => new Date(ts).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  const openModal = id => document.getElementById(id)?.classList.add('open');
  const closeModal = id => document.getElementById(id)?.classList.remove('open');

  /* close modals on backdrop click / Escape */
  document.addEventListener('click', e => {
    if (e.target.classList && e.target.classList.contains('modal-backdrop')) e.target.classList.remove('open');
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') document.querySelectorAll('.modal-backdrop.open').forEach(m => m.classList.remove('open'));
  });

  /* header: reflect auth state (elements are optional per page) */
  function paintHeaderAuth() {
    const u = currentUser();
    const inEls = document.querySelectorAll('[data-auth=in]');
    const outEls = document.querySelectorAll('[data-auth=out]');
    inEls.forEach(el => el.style.display = u ? '' : 'none');
    outEls.forEach(el => el.style.display = u ? 'none' : '');
    const nameEl = document.getElementById('navUserName');
    if (nameEl && u) nameEl.textContent = u.name.split(' ')[0];
  }

  return {
    sha256, rid,
    getSettings, saveSettings, getLang,
    signup, login, logout, currentUser, getUsers, updateUser,
    hasAccess, subDaysLeft,
    getLedger, appendLedger, verifyLedger,
    getPayments, submitPayment, approvePayment, rejectPayment,
    grantAccess, revokeAccess,
    upiIntent,
    toast, esc, inr, fdate, openModal, closeModal, paintHeaderAuth
  };
})();

/* ---------- auth modal wiring (index + ide pages) ---------- */
document.addEventListener('DOMContentLoaded', () => {
  UIDE.paintHeaderAuth();

  const loginForm = document.getElementById('loginForm');
  const signupForm = document.getElementById('signupForm');

  if (loginForm) loginForm.addEventListener('submit', async e => {
    e.preventDefault();
    const err = document.getElementById('loginErr');
    err.textContent = '';
    try {
      await UIDE.login(loginForm.email.value, loginForm.password.value);
      UIDE.closeModal('authModal');
      UIDE.paintHeaderAuth();
      UIDE.toast('Logged in. Happy coding!');
      document.dispatchEvent(new CustomEvent('uide:auth'));
    } catch (ex) { err.textContent = ex.message; }
  });

  if (signupForm) signupForm.addEventListener('submit', async e => {
    e.preventDefault();
    const err = document.getElementById('signupErr');
    err.textContent = '';
    try {
      await UIDE.signup(signupForm.name.value, signupForm.email.value, signupForm.password.value);
      UIDE.closeModal('authModal');
      UIDE.paintHeaderAuth();
      UIDE.toast('Account created. Welcome!');
      document.dispatchEvent(new CustomEvent('uide:auth'));
    } catch (ex) { err.textContent = ex.message; }
  });

  document.querySelectorAll('[data-open-auth]').forEach(b =>
    b.addEventListener('click', () => {
      UIDE.openModal('authModal');
      switchAuthTab(b.dataset.openAuth || 'login');
    }));

  window.switchAuthTab = tab => {
    const l = document.getElementById('loginForm'), s = document.getElementById('signupForm');
    const tl = document.getElementById('tabLogin'), ts = document.getElementById('tabSignup');
    if (!l || !s) return;
    l.style.display = tab === 'login' ? '' : 'none';
    s.style.display = tab === 'signup' ? '' : 'none';
    if (tl && ts) {
      tl.className = tab === 'login' ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm';
      ts.className = tab === 'signup' ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm';
    }
  };

  document.querySelectorAll('[data-logout]').forEach(b =>
    b.addEventListener('click', () => {
      UIDE.logout();
      UIDE.paintHeaderAuth();
      UIDE.toast('Logged out.');
      document.dispatchEvent(new CustomEvent('uide:auth'));
    }));
});
