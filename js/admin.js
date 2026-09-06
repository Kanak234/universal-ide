/* ============================================================
   UNIVERSAL IDE — admin.js
   Owner console: pricing & free toggles, payment verification,
   user grants, tamper-evident ledger, UPI settings.
   ============================================================ */

(() => {
  const $ = id => document.getElementById(id);

  const ADMIN_USER = 'rishi@323';
  // SHA-256 of the admin password (not stored as plain text in source)
  const ADMIN_PASS_HASH = '05bb97a17759b90c0f9271b207a69033ab30513fca52daab24106cbe3d83b502';
  const SKEY = 'uide_admin_session';

  const isAdmin = () => sessionStorage.getItem(SKEY) === '1';

  document.addEventListener('DOMContentLoaded', () => {
    $('adminLoginForm').addEventListener('submit', doLogin);
    $('adminLogout').addEventListener('click', () => {
      sessionStorage.removeItem(SKEY); paint();
    });
    document.querySelectorAll('.admin-nav button[data-tab]').forEach(b =>
      b.addEventListener('click', () => showTab(b.dataset.tab)));
    $('settingsForm').addEventListener('submit', saveSettingsForm);
    $('grantForm').addEventListener('submit', doGrant);
    $('verifyChainBtn').addEventListener('click', doVerify);
    paint();
  });

  async function doLogin(e) {
    e.preventDefault();
    const f = e.target, err = $('adminErr');
    err.textContent = '';
    const okUser = f.username.value.trim() === ADMIN_USER;
    const okPass = (await UIDE.sha256(f.password.value)) === ADMIN_PASS_HASH;
    if (okUser && okPass) {
      sessionStorage.setItem(SKEY, '1');
      paint();
      UIDE.toast('Welcome back, admin.');
    } else {
      err.textContent = 'Wrong admin username or password.';
    }
  }

  function paint() {
    const on = isAdmin();
    $('adminLoginWrap').style.display = on ? 'none' : '';
    $('adminShell').style.display = on ? '' : 'none';
    if (on) showTab('dash');
  }

  function showTab(tab) {
    document.querySelectorAll('.admin-nav button[data-tab]').forEach(b =>
      b.classList.toggle('active', b.dataset.tab === tab));
    document.querySelectorAll('.admin-tab').forEach(t =>
      t.style.display = t.id === 'tab-' + tab ? '' : 'none');
    ({ dash: renderDash, langs: renderLangs, pays: renderPays,
       users: renderUsers, ledger: renderLedger, settings: renderSettings }[tab] || (() => {}))();
  }

  /* ---------------- dashboard ---------------- */
  function renderDash() {
    const users = UIDE.getUsers();
    const pays = UIDE.getPayments();
    const pending = pays.filter(p => p.status === 'pending');
    const approved = pays.filter(p => p.status === 'approved');
    const revenue = approved.reduce((n, p) => n + Number(p.amount || 0), 0);
    const activeSubs = users.reduce((n, u) =>
      n + Object.values(u.subs || {}).filter(e => e > Date.now()).length, 0);

    $('stUsers').textContent = users.length;
    $('stSubs').textContent = activeSubs;
    $('stPending').textContent = pending.length;
    $('stRevenue').textContent = UIDE.inr(revenue);

    const rows = pays.slice(-6).reverse().map(p => `
      <tr>
        <td>${UIDE.esc(p.user)}</td>
        <td>${UIDE.esc(UIDE.getLang(p.lang)?.name || p.lang)}</td>
        <td class="mono">${UIDE.inr(p.amount)}</td>
        <td>${statusChip(p.status)}</td>
        <td class="mono">${UIDE.fdate(p.ts)}</td>
      </tr>`).join('');
    $('dashRecent').innerHTML = rows || `<tr><td colspan="5" class="mono">No payments yet — share the site with students to get started.</td></tr>`;
  }

  const statusChip = s => s === 'pending'
    ? '<span class="chip chip-pending">Pending</span>'
    : s === 'approved'
      ? '<span class="chip chip-ok">Approved</span>'
      : '<span class="chip chip-bad">Rejected</span>';

  /* ---------------- languages ---------------- */
  function renderLangs() {
    const s = UIDE.getSettings();
    $('langRows').innerHTML = s.languages.map(l => `
      <tr>
        <td><b>${UIDE.esc(l.name)}</b> <span class="mono">(${UIDE.esc(l.id)})</span></td>
        <td>
          <label class="switch">
            <input type="checkbox" ${l.free ? 'checked' : ''} data-free="${l.id}">
            <span class="track"></span>
          </label>
        </td>
        <td><input type="number" min="0" value="${l.price}" data-price="${l.id}"></td>
        <td class="mono">${l.free ? 'Open to everyone' : UIDE.inr(l.price) + ' / ' + (s.planDays || 30) + ' days'}</td>
      </tr>`).join('');

    document.querySelectorAll('[data-free]').forEach(el =>
      el.addEventListener('change', () => {
        const st = UIDE.getSettings();
        st.languages.find(x => x.id === el.dataset.free).free = el.checked;
        UIDE.saveSettings(st);
        UIDE.toast((el.checked ? 'Now FREE: ' : 'Now PAID: ') + el.dataset.free);
        renderLangs();
      }));
    document.querySelectorAll('[data-price]').forEach(el =>
      el.addEventListener('change', () => {
        const v = Math.max(0, Number(el.value) || 0);
        const st = UIDE.getSettings();
        st.languages.find(x => x.id === el.dataset.price).price = v;
        UIDE.saveSettings(st);
        UIDE.toast('Price updated: ' + el.dataset.price + ' → ' + UIDE.inr(v));
        renderLangs();
      }));
  }

  /* ---------------- payments ---------------- */
  function renderPays() {
    const pays = UIDE.getPayments().slice().reverse();
    $('payRows').innerHTML = pays.map(p => `
      <tr>
        <td>${UIDE.esc(p.user)}</td>
        <td>${UIDE.esc(UIDE.getLang(p.lang)?.name || p.lang)}</td>
        <td class="mono">${UIDE.inr(p.amount)}</td>
        <td class="mono">${UIDE.esc(p.utr)}</td>
        <td class="mono">${UIDE.fdate(p.ts)}</td>
        <td>${statusChip(p.status)}</td>
        <td>${p.status === 'pending' ? `
          <button class="btn btn-run btn-sm" data-approve="${p.id}">Approve</button>
          <button class="btn btn-danger btn-sm" data-reject="${p.id}">Reject</button>` : ''}
        </td>
      </tr>`).join('') ||
      `<tr><td colspan="7" class="mono">No payment submissions yet.</td></tr>`;

    document.querySelectorAll('[data-approve]').forEach(b =>
      b.addEventListener('click', async () => {
        try {
          const p = await UIDE.approvePayment(b.dataset.approve);
          UIDE.toast('Approved — access granted to ' + p.user);
          renderPays();
        } catch (ex) { UIDE.toast(ex.message); }
      }));
    document.querySelectorAll('[data-reject]').forEach(b =>
      b.addEventListener('click', async () => {
        const reason = prompt('Reason for rejecting (shown in ledger):', 'Payment not found');
        if (reason === null) return;
        try {
          await UIDE.rejectPayment(b.dataset.reject, reason);
          UIDE.toast('Payment rejected.');
          renderPays();
        } catch (ex) { UIDE.toast(ex.message); }
      }));
  }

  /* ---------------- users ---------------- */
  function renderUsers() {
    const users = UIDE.getUsers();
    const s = UIDE.getSettings();

    // grant form language options
    $('grantLang').innerHTML = '<option value="ALL">All languages</option>' +
      s.languages.map(l => `<option value="${l.id}">${UIDE.esc(l.name)}</option>`).join('');
    $('grantUser').innerHTML = users.map(u => `<option value="${UIDE.esc(u.email)}">${UIDE.esc(u.email)}</option>`).join('');

    $('userRows').innerHTML = users.map(u => {
      const active = Object.entries(u.subs || {})
        .filter(([, e]) => e > Date.now())
        .map(([id, e]) => `${UIDE.esc(UIDE.getLang(id)?.name || id)} · ${Math.ceil((e - Date.now()) / 86400000)}d`)
        .join('<br>') || '<span class="mono">—</span>';
      return `
      <tr>
        <td><b>${UIDE.esc(u.name)}</b><br><span class="mono">${UIDE.esc(u.email)}</span></td>
        <td class="mono">${UIDE.fdate(u.created)}</td>
        <td>${active}</td>
        <td>
          ${Object.entries(u.subs || {}).filter(([, e]) => e > Date.now()).map(([id]) =>
            `<button class="btn btn-danger btn-sm" data-revoke="${UIDE.esc(u.email)}|${id}">Revoke ${UIDE.esc(id)}</button>`).join(' ')}
        </td>
      </tr>`;
    }).join('') || `<tr><td colspan="4" class="mono">No students have signed up yet.</td></tr>`;

    document.querySelectorAll('[data-revoke]').forEach(b =>
      b.addEventListener('click', async () => {
        const [email, lang] = b.dataset.revoke.split('|');
        await UIDE.revokeAccess(email, lang);
        UIDE.toast('Revoked ' + lang + ' for ' + email);
        renderUsers();
      }));
  }

  async function doGrant(e) {
    e.preventDefault();
    const email = $('grantUser').value;
    const lang = $('grantLang').value;
    const days = Math.max(1, Number($('grantDays').value) || 0);
    if (!email) { UIDE.toast('No users to grant yet.'); return; }
    try {
      await UIDE.grantAccess(email, lang, days);
      UIDE.toast(`Granted ${lang} to ${email} for ${days} day(s).`);
      renderUsers();
    } catch (ex) { UIDE.toast(ex.message); }
  }

  /* ---------------- ledger ---------------- */
  function renderLedger() {
    const chain = UIDE.getLedger().slice().reverse();
    $('chainCount').textContent = chain.length;
    $('chainBlocks').innerHTML = chain.map(b => `
      <div class="chain-block">
        <div><b>#${b.index}</b> · ${UIDE.esc(b.type)} · ${UIDE.fdate(b.ts)}</div>
        <div>${UIDE.esc(JSON.stringify(b.data))}</div>
        <div class="ph">prev: ${UIDE.esc(b.prevHash)}</div>
        <div class="h">hash: ${UIDE.esc(b.hash)}</div>
      </div>`).join('') ||
      '<p class="mono">Ledger is empty — blocks appear as payments and grants happen.</p>';
    $('verifyResult').innerHTML = '';
  }

  async function doVerify() {
    $('verifyResult').innerHTML = '<span class="mono">Recomputing every hash…</span>';
    const r = await UIDE.verifyLedger();
    $('verifyResult').innerHTML = r.ok
      ? `<span class="verify-ok">✓ Chain intact — all ${r.length} block(s) verified. Records have not been tampered with.</span>`
      : `<span class="verify-bad">✗ Tampering detected at block #${r.at} (${r.reason}).</span>`;
  }

  /* ---------------- settings ---------------- */
  function renderSettings() {
    const s = UIDE.getSettings();
    const f = $('settingsForm');
    f.upiVpa.value = s.upiVpa;
    f.payeeName.value = s.payeeName;
    f.planDays.value = s.planDays;
  }

  function saveSettingsForm(e) {
    e.preventDefault();
    const f = e.target;
    const s = UIDE.getSettings();
    s.upiVpa = f.upiVpa.value.trim();
    s.payeeName = f.payeeName.value.trim() || 'Universal IDE';
    s.planDays = Math.max(1, Number(f.planDays.value) || 30);
    UIDE.saveSettings(s);
    UIDE.toast('Settings saved. New QR codes will use the updated UPI ID.');
  }
})();
