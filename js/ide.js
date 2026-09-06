/* ============================================================
   UNIVERSAL IDE — ide.js
   Editor + runners:
     C / C++ / Java / Python  → Piston public API (real compile & run)
     JavaScript               → sandboxed iframe with console capture
     HTML / CSS               → live preview
     SQL                      → sql.js (real SQLite engine, WASM)
     MongoDB                  → in-browser document store (core commands)
   ============================================================ */

(() => {
  const $ = id => document.getElementById(id);

  /* ---------------- language definitions ---------------- */
  const DEFS = {
    c: {
      mode: 'text/x-csrc', file: 'main.c', piston: { language: 'c', version: '*' }, stdin: true,
      template: `#include <stdio.h>

int main() {
    int a, b;
    printf("Enter two numbers: ");
    scanf("%d %d", &a, &b);
    printf("Sum = %d\\n", a + b);
    return 0;
}
`
    },
    cpp: {
      mode: 'text/x-c++src', file: 'main.cpp', piston: { language: 'c++', version: '*' }, stdin: true,
      template: `#include <iostream>
using namespace std;

int main() {
    string name;
    cout << "Enter your name: ";
    getline(cin, name);
    cout << "Hello, " << name << "!" << endl;
    return 0;
}
`
    },
    java: {
      mode: 'text/x-java', file: 'Main.java', piston: { language: 'java', version: '*' }, stdin: true,
      template: `import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        System.out.print("Enter a number: ");
        int n = sc.nextInt();
        System.out.println("Square = " + (n * n));
    }
}
`
    },
    python: {
      mode: 'python', file: 'main.py', piston: { language: 'python', version: '*' }, stdin: true,
      template: `name = input("Enter your name: ")
marks = int(input("Enter your marks: "))

if marks >= 40:
    print(f"{name}, you passed!")
else:
    print(f"{name}, better luck next time.")
`
    },
    js: {
      mode: 'javascript', file: 'script.js',
      template: `// Runs in a sandbox — output appears in the console panel.
const students = [
  { name: "Aman",  marks: 82 },
  { name: "Priya", marks: 91 },
  { name: "Ravi",  marks: 67 }
];

const toppers = students.filter(s => s.marks > 80);
console.log("Toppers:", toppers.map(s => s.name).join(", "));
`
    },
    html: {
      mode: 'htmlmixed', file: 'index.html', preview: true,
      template: `<!DOCTYPE html>
<html>
<head>
  <title>My First Page</title>
  <style>
    body { font-family: sans-serif; padding: 32px; background: #f7f7f2; }
    h1   { color: #14306b; }
    .card{ background: #fff; border-radius: 10px; padding: 18px;
           box-shadow: 0 4px 14px rgba(0,0,0,.08); max-width: 360px; }
  </style>
</head>
<body>
  <h1>Hello, Web!</h1>
  <div class="card">
    <p>Edit the code on the left — this preview updates when you press <b>Run</b>.</p>
  </div>
</body>
</html>
`
    },
    css: {
      mode: 'css', file: 'style.css', preview: true,
      template: `/* Style the sample page shown in the preview → */
body   { font-family: Georgia, serif; background: #fffdf5; padding: 30px; }
h1     { color: #b3541e; letter-spacing: 1px; }
.card  { border: 2px solid #b3541e; border-radius: 12px; padding: 16px;
         max-width: 340px; background: white; }
button { background: #b3541e; color: white; border: none;
         padding: 10px 18px; border-radius: 8px; font-size: 15px; }
button:hover { opacity: .85; cursor: pointer; }
`
    },
    sql: {
      mode: 'text/x-sql', file: 'query.sql',
      template: `-- Real SQL engine (SQLite) running in your browser.
CREATE TABLE students (
  roll   INTEGER PRIMARY KEY,
  name   TEXT,
  course TEXT,
  marks  INTEGER
);

INSERT INTO students VALUES
  (1, 'Kanak',  'BCA', 92),
  (2, 'Sachin', 'BCA', 78),
  (3, 'Roshan', 'BCA', 85);

SELECT name, marks FROM students
WHERE marks > 80
ORDER BY marks DESC;
`
    },
    mongodb: {
      mode: 'javascript', file: 'shell.mongo.js',
      template: `// In-browser Mongo-style shell (core commands).
// Data lives in memory for this session.

db.students.insertMany([
  { name: "Kanak",  course: "BCA", marks: 92 },
  { name: "Sachin", course: "BCA", marks: 78 },
  { name: "Roshan", course: "BCA", marks: 85 }
]);

printjson( db.students.find({ marks: { $gt: 80 } }) );

db.students.updateOne({ name: "Sachin" }, { $inc: { marks: 5 } });
print("Total students:", db.students.countDocuments({}));
`
    }
  };

  /* ---------------- state ---------------- */
  let editor = null;
  let activeLang = null;
  let sqlDbPromise = null;         // lazy sql.js init
  const mongoStore = {};           // session-only document store
  let jsFrameCleanup = null;

  /* ---------------- boot ---------------- */
  document.addEventListener('DOMContentLoaded', () => {
    editor = CodeMirror.fromTextArea($('codeArea'), {
      mode: 'python', theme: 'dracula',
      lineNumbers: true, matchBrackets: true, autoCloseBrackets: true,
      indentUnit: 4, tabSize: 4, viewportMargin: Infinity
    });
    editor.on('change', () => saveDraft());

    renderSidebar();
    const first = firstAccessible() || UIDE.getSettings().languages[0].id;
    selectLang(first);

    $('runBtn').addEventListener('click', run);
    $('saveBtn').addEventListener('click', () => { saveDraft(true); });
    $('downloadBtn').addEventListener('click', downloadFile);
    $('resetBtn').addEventListener('click', () => {
      editor.setValue(DEFS[activeLang].template);
      UIDE.toast('Template restored.');
    });
    document.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); run(); }
    });
    document.addEventListener('uide:auth', () => { renderSidebar(); selectLang(activeLang); });

    $('utrForm').addEventListener('submit', submitUtr);
  });

  function firstAccessible() {
    const u = UIDE.currentUser();
    const l = UIDE.getSettings().languages.find(x => UIDE.hasAccess(u, x.id));
    return l && l.id;
  }

  /* ---------------- sidebar ---------------- */
  function renderSidebar() {
    const u = UIDE.currentUser();
    const wrap = $('langList');
    wrap.innerHTML = '';
    for (const l of UIDE.getSettings().languages) {
      const open = UIDE.hasAccess(u, l.id);
      const days = u ? UIDE.subDaysLeft(u, l.id) : 0;
      const btn = document.createElement('button');
      btn.className = 'lang-item' + (l.id === activeLang ? ' active' : '');
      btn.innerHTML = `
        <span class="nm"><span class="glyph">${UIDE.esc(l.glyph)}</span>${UIDE.esc(l.name)}</span>
        <span class="lock">${l.free ? '<span class="chip chip-free">Free</span>'
          : open ? `<span class="chip chip-ok">${days}d</span>`
                 : '<span class="chip chip-pro">Pro</span>'}</span>`;
      btn.addEventListener('click', () => selectLang(l.id));
      wrap.appendChild(btn);
    }
  }

  /* ---------------- language switching ---------------- */
  function selectLang(id) {
    activeLang = id;
    const def = DEFS[id];
    const lang = UIDE.getLang(id);
    const u = UIDE.currentUser();

    document.querySelectorAll('.lang-item').forEach(b => b.classList.remove('active'));
    renderSidebar();

    editor.setOption('mode', def.mode);
    editor.setValue(loadDraft(id) ?? def.template);
    $('fileName').textContent = def.file;
    $('stdinWrap').style.display = def.stdin ? '' : 'none';

    // output panel mode
    $('previewFrame').style.display = 'none';
    $('output').style.display = '';
    $('outLabel').textContent = def.preview ? 'Preview' : 'Output';
    setOut('<span class="dim">Press Run (or Ctrl+Enter) to execute.</span>');

    // lock overlay
    const locked = !UIDE.hasAccess(u, id);
    $('lockOverlay').style.display = locked ? 'flex' : 'none';
    if (locked) {
      $('lockName').textContent = lang.name;
      $('lockPrice').textContent = UIDE.inr(lang.price) + ' / month';
      $('unlockBtn').onclick = () => openPaywall(id);
    }
  }

  /* ---------------- drafts ---------------- */
  const draftKey = id => {
    const u = UIDE.currentUser();
    return 'uide_code_' + (u ? u.email : 'guest') + '_' + id;
  };
  function saveDraft(announce) {
    if (!activeLang) return;
    localStorage.setItem(draftKey(activeLang), editor.getValue());
    if (announce) UIDE.toast('Code saved in this browser.');
  }
  const loadDraft = id => localStorage.getItem(draftKey(id));

  function downloadFile() {
    const blob = new Blob([editor.getValue()], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = DEFS[activeLang].file;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  /* ---------------- output helpers ---------------- */
  const setOut = html => { $('output').innerHTML = html; };
  const addOut = html => { $('output').innerHTML += html; };
  const line = (txt, cls) => `<span class="${cls || ''}">${UIDE.esc(txt)}</span>\n`;

  /* ---------------- run dispatcher ---------------- */
  async function run() {
    const u = UIDE.currentUser();
    if (!UIDE.hasAccess(u, activeLang)) { openPaywall(activeLang); return; }
    saveDraft();
    if (jsFrameCleanup) { jsFrameCleanup(); jsFrameCleanup = null; }

    const def = DEFS[activeLang];
    const code = editor.getValue();

    if (def.piston)            return runPiston(def, code);
    if (activeLang === 'js')   return runJS(code);
    if (activeLang === 'html') return runPreview(code);
    if (activeLang === 'css')  return runPreview(cssSample(code));
    if (activeLang === 'sql')  return runSQL(code);
    if (activeLang === 'mongodb') return runMongo(code);
  }

  /* ---------------- Piston (C / C++ / Java / Python) ---------------- */
  async function runPiston(def, code) {
    $('previewFrame').style.display = 'none';
    $('output').style.display = '';
    setOut(line('Compiling & running on the execution server…', 'dim'));
    const started = performance.now();
    try {
      const res = await fetch('https://emkc.org/api/v2/piston/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          language: def.piston.language,
          version: def.piston.version,
          files: [{ name: def.file, content: code }],
          stdin: $('stdin').value || ''
        })
      });
      if (!res.ok) throw new Error('Execution server returned ' + res.status + '. Try again in a few seconds.');
      const data = await res.json();
      const ms = Math.round(performance.now() - started);
      let html = '';
      if (data.compile && data.compile.stderr) html += line(data.compile.stderr, 'err');
      if (data.run) {
        if (data.run.stdout) html += line(data.run.stdout);
        if (data.run.stderr) html += line(data.run.stderr, 'err');
        html += line(`— exit code ${data.run.code} · ${ms} ms`, 'dim');
      }
      setOut(html || line('(no output)', 'dim'));
    } catch (ex) {
      setOut(line('Could not run the program: ' + ex.message, 'err') +
             line('This language runs on a free public execution API (Piston) and needs internet.', 'dim'));
    }
  }

  /* ---------------- JavaScript sandbox ---------------- */
  function runJS(code) {
    $('previewFrame').style.display = 'none';
    $('output').style.display = '';
    setOut(line('Running in sandbox…', 'dim'));

    const frame = document.createElement('iframe');
    frame.style.display = 'none';
    frame.setAttribute('sandbox', 'allow-scripts');
    const token = UIDE.rid('run');

    const handler = e => {
      const m = e.data && e.data.uideLog;
      if (!m || m.token !== token) return;
      if (m.first) setOut('');
      addOut(line(m.text, m.kind === 'err' ? 'err' : ''));
    };
    window.addEventListener('message', handler);
    jsFrameCleanup = () => { window.removeEventListener('message', handler); frame.remove(); };

    frame.srcdoc = `<script>
      const T=${JSON.stringify(token)};let first=true;
      const send=(kind,args)=>{parent.postMessage({uideLog:{token:T,kind,first,
        text:args.map(a=>{try{return typeof a==='object'?JSON.stringify(a,null,2):String(a)}catch(e){return String(a)}}).join(' ')}},'*');first=false;};
      console.log=(...a)=>send('log',a);
      console.error=(...a)=>send('err',a);
      console.warn=(...a)=>send('log',a);
      window.onerror=(m,s,l)=>{send('err',['Error: '+m+' (line '+l+')']);return true;};
      try{ ${code} }catch(e){send('err',[e.name+': '+e.message]);}
      setTimeout(()=>send('log',['— finished —']),0);
    <\/script>`;
    document.body.appendChild(frame);

    setTimeout(() => {
      if ($('output').textContent.includes('Running in sandbox')) setOut(line('(no console output)', 'dim'));
    }, 1500);
  }

  /* ---------------- HTML / CSS preview ---------------- */
  function runPreview(doc) {
    $('output').style.display = 'none';
    const f = $('previewFrame');
    f.style.display = 'block';
    f.srcdoc = doc;
  }
  const cssSample = css => `<!DOCTYPE html><html><head><style>${css}</style></head><body>
    <h1>Sample Heading</h1>
    <p>This sample page is styled by <b>your CSS</b>.</p>
    <div class="card"><h3>A card</h3><p>Style me with the <code>.card</code> selector.</p>
      <button>A button</button></div>
    <ul><li>List item one</li><li>List item two</li></ul>
  </body></html>`;

  /* ---------------- SQL via sql.js (SQLite WASM) ---------------- */
  function ensureSql() {
    if (!sqlDbPromise) {
      sqlDbPromise = initSqlJs({
        locateFile: f => 'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/' + f
      }).then(SQL => new SQL.Database());
    }
    return sqlDbPromise;
  }
  async function runSQL(code) {
    $('previewFrame').style.display = 'none';
    $('output').style.display = '';
    setOut(line('Loading SQL engine…', 'dim'));
    try {
      const db = await ensureSql();
      const results = db.exec(code);
      if (!results.length) { setOut(line('OK — statement(s) executed. (No rows returned)', 'ok')); return; }
      let html = '';
      for (const r of results) {
        html += '<table><tr>' + r.columns.map(c => `<th>${UIDE.esc(c)}</th>`).join('') + '</tr>';
        for (const row of r.values)
          html += '<tr>' + row.map(v => `<td>${UIDE.esc(v === null ? 'NULL' : v)}</td>`).join('') + '</tr>';
        html += '</table>';
      }
      html += line(`${results.reduce((n, r) => n + r.values.length, 0)} row(s) returned.`, 'dim');
      setOut(html);
    } catch (ex) {
      setOut(line('SQL error: ' + ex.message, 'err') +
             line('Engine: SQLite (standard SQL — MySQL-style syntax largely works; vendor-specific extensions may not).', 'dim'));
    }
  }

  /* ---------------- Mongo-style shell (in-browser subset) ---------------- */
  function runMongo(code) {
    $('previewFrame').style.display = 'none';
    $('output').style.display = '';
    const logs = [];
    const fmt = v => typeof v === 'object' ? JSON.stringify(v, null, 2) : String(v);
    const print = (...a) => logs.push(a.map(fmt).join(' '));

    const matches = (doc, q) => Object.entries(q || {}).every(([k, v]) => {
      if (k === '$or') return Array.isArray(v) && v.some(sub => matches(doc, sub));
      if (k === '$and') return Array.isArray(v) && v.every(sub => matches(doc, sub));
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        return Object.entries(v).every(([op, val]) => {
          const d = doc[k];
          switch (op) {
            case '$gt': return d > val;   case '$gte': return d >= val;
            case '$lt': return d < val;   case '$lte': return d <= val;
            case '$ne': return d !== val; case '$eq': return d === val;
            case '$in': return Array.isArray(val) && val.includes(d);
            case '$nin': return Array.isArray(val) && !val.includes(d);
            case '$exists': return (k in doc) === !!val;
            default: return false;
          }
        });
      }
      return doc[k] === v;
    });

    const coll = name => {
      mongoStore[name] = mongoStore[name] || [];
      const data = mongoStore[name];
      return {
        insertOne(doc) { const d = { _id: UIDE.rid('oid'), ...doc }; data.push(d); return { acknowledged: true, insertedId: d._id }; },
        insertMany(arr) { const ids = arr.map(o => this.insertOne(o).insertedId); return { acknowledged: true, insertedCount: ids.length, insertedIds: ids }; },
        find(q) { return data.filter(d => matches(d, q)); },
        findOne(q) { return data.find(d => matches(d, q)) || null; },
        countDocuments(q) { return data.filter(d => matches(d, q)).length; },
        updateOne(q, u) {
          const d = data.find(x => matches(x, q));
          if (!d) return { matchedCount: 0, modifiedCount: 0 };
          if (u.$set) Object.assign(d, u.$set);
          if (u.$inc) for (const [k, v] of Object.entries(u.$inc)) d[k] = (d[k] || 0) + v;
          if (u.$unset) for (const k of Object.keys(u.$unset)) delete d[k];
          return { matchedCount: 1, modifiedCount: 1 };
        },
        updateMany(q, u) {
          let n = 0;
          for (const d of data) if (matches(d, q)) {
            if (u.$set) Object.assign(d, u.$set);
            if (u.$inc) for (const [k, v] of Object.entries(u.$inc)) d[k] = (d[k] || 0) + v;
            n++;
          }
          return { matchedCount: n, modifiedCount: n };
        },
        deleteOne(q) { const i = data.findIndex(x => matches(x, q)); if (i < 0) return { deletedCount: 0 }; data.splice(i, 1); return { deletedCount: 1 }; },
        deleteMany(q) { const b = data.length; for (let i = data.length - 1; i >= 0; i--) if (matches(data[i], q)) data.splice(i, 1); return { deletedCount: b - data.length }; },
        drop() { mongoStore[name] = []; return true; }
      };
    };
    const db = new Proxy({}, { get: (_, name) => coll(String(name)) });

    try {
      new Function('db', 'print', 'printjson', '"use strict";\n' + code)(db, print, print);
      setOut(logs.length
        ? logs.map(l => line(l)).join('') + line('— finished —', 'dim')
        : line('Executed. Use print() / printjson() to see results.', 'ok'));
      addOut(line('Engine: in-browser document store (core Mongo shell commands). Data resets on page reload.', 'dim'));
    } catch (ex) {
      setOut(line('Mongo shell error: ' + ex.message, 'err'));
    }
  }

  /* ---------------- paywall ---------------- */
  let payLang = null;

  function openPaywall(langId) {
    const u = UIDE.currentUser();
    if (!u) { UIDE.toast('Log in first to subscribe.'); UIDE.openModal('authModal'); return; }
    payLang = langId;
    const lang = UIDE.getLang(langId);

    $('payLangName').textContent = lang.name;
    $('payPrice').textContent = UIDE.inr(lang.price);
    $('payDays').textContent = UIDE.getSettings().planDays || 30;
    $('utr').value = '';
    $('utrErr').textContent = '';
    $('utrOk').textContent = '';

    // pending state note
    const pending = UIDE.getPayments().find(p => p.user === u.email && p.lang === langId && p.status === 'pending');
    $('payPendingNote').style.display = pending ? '' : 'none';

    // QR encodes the UPI intent — the VPA / number is never shown as text
    const box = $('qrBox');
    box.innerHTML = '';
    new QRCode(box, {
      text: UIDE.upiIntent(lang.price, 'UniversalIDE ' + lang.name),
      width: 184, height: 184,
      colorDark: '#0C1830', colorLight: '#ffffff',
      correctLevel: QRCode.CorrectLevel.M
    });

    UIDE.openModal('payModal');
  }

  async function submitUtr(e) {
    e.preventDefault();
    const u = UIDE.currentUser();
    if (!u || !payLang) return;
    const err = $('utrErr'), ok = $('utrOk');
    err.textContent = ''; ok.textContent = '';
    try {
      const lang = UIDE.getLang(payLang);
      await UIDE.submitPayment(u.email, payLang, lang.price, $('utr').value);
      ok.textContent = 'Submitted! Your access activates as soon as the payment is verified (usually within a few hours).';
      $('utr').value = '';
      $('payPendingNote').style.display = '';
      UIDE.toast('Payment submitted for verification.');
    } catch (ex) { err.textContent = ex.message; }
  }
})();
