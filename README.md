# Universal IDE

A browser-based coding environment for students — write and run **C, C++, Java, Python, JavaScript, HTML, CSS, SQL and MongoDB** in one tab. Free tier + per-language monthly subscriptions paid via **UPI QR**, managed from a built-in **admin console** with a hash-chained payment ledger.

Built as the BCA final project by **Kanak (Coding with Kanak)**.

---

## Folder structure

```
universal-ide/
├── index.html        # Landing page (languages, pricing, payment flow, FAQ)
├── ide.html          # The IDE (editor, run, input, output/preview, paywall)
├── admin.html        # Owner console (login-gated)
├── css/style.css     # Design system
└── js/
    ├── core.js       # Storage, auth, subscriptions, hash-chained ledger, UPI intent
    ├── ide.js        # Editor + all language runners + QR paywall
    └── admin.js      # Admin console logic
```

No build step. No npm. Pure static site.

## Run locally

```bash
cd universal-ide
python3 -m http.server 8000
# open http://localhost:8000
```

## Deploy to Vercel (via GitHub)

1. Create a new GitHub repo and push this folder:
   ```bash
   git init && git add . && git commit -m "Universal IDE v1"
   git branch -M main
   git remote add origin https://github.com/Kanak234/universal-ide.git
   git push -u origin main
   ```
2. On vercel.com → **Add New → Project** → import the repo.
3. Framework preset: **Other** (static). No build command, output dir = root.
4. Deploy. Done — every `git push` auto-redeploys.

## Admin console

- URL: `/admin.html`
- Username: `rishi@323`
- Password: `rishi@323` (stored in source only as a SHA-256 hash)

From the console you can:
- **Languages** — flip any language Free ⇄ Paid, set monthly price (site updates instantly)
- **Payments** — see submitted UTRs, approve (activates the plan) or reject
- **Users** — grant any student free access to any language for any number of days; revoke
- **Ledger** — view the hash chain, one-click *Verify chain integrity*
- **Settings** — set your real **UPI ID**, payee name, and plan duration

> ⚠️ **First thing to do after deploying:** open Admin → Settings and replace the placeholder UPI ID with your real VPA (e.g. `7257864300@ybl`, `name@paytm`). A bare phone number is **not** a valid VPA — check the exact ID in your UPI app.

## How each language runs (all real, nothing faked)

| Language | Engine |
|---|---|
| C, C++, Java, Python | **Piston** public execution API (real GCC / JDK / CPython) with stdin support — needs internet |
| JavaScript | Sandboxed iframe with captured console |
| HTML | Live page preview |
| CSS | Live preview against a sample page |
| SQL | **sql.js** — real SQLite engine compiled to WebAssembly, runs fully in-browser (MySQL-style syntax largely works; vendor-specific Oracle/MySQL extensions don't) |
| MongoDB | In-browser document store implementing core shell commands (`insertOne/Many`, `find`, `updateOne/Many`, `deleteOne/Many`, `countDocuments`, query operators `$gt $lt $in $or` …). Session memory only. |

Piston is a free community API (~5 req/sec fair use). For serious production traffic, self-host Piston or move execution to your own backend.

## Payments — what this build does and doesn't do

**Does:**
- Generates a **UPI intent QR** (`upi://pay?...`) with the amount pre-filled — works with GPay/PhonePe/Paytm/BHIM.
- Keeps your VPA/number **out of all visible text** — it lives only inside the QR and the admin settings.
- Records every payment event in a **SHA-256 hash-chained ledger** → tamper-*evident* records (edit any block and "Verify chain" fails).
- Verification flow: student pays → submits 12-digit **UTR** → you match it in your UPI app → approve → plan activates for N days.

**Doesn't (and can't):**
- Make payments anonymous or untraceable. UPI transfers always carry a bank/NPCI trail — that's a legal requirement and it's what protects *you* as the receiver. The hash chain is for record integrity, not anonymity.
- Auto-verify payments. Automatic confirmation needs a payment gateway (Razorpay/Cashfree UPI, with KYC) or bank webhooks. The manual UTR flow is the standard student-project approach for personal UPI.

## Honest limitations (important for the viva!)

This is a **client-side demo build**: users, subscriptions, payments and the ledger live in the browser's `localStorage`.

- Data is **per browser/device** — an account created on one laptop won't exist on another, and *admin approvals only affect users on the same browser*. Perfect for demoing the full flow on one machine.
- Client-side login/admin checks can be bypassed by anyone who opens DevTools. The password hash prevents casual reading of the password, nothing more.
- **Production path (v2):** move `core.js` logic to a small backend (Node/Express or Flask + SQLite/Postgres, or Firebase/Supabase), keep this exact frontend, and swap `localStorage` calls for API calls. The file is structured so this swap is straightforward.

## Tech

Vanilla JS (no framework) · CodeMirror 5 · Piston API · sql.js (WASM) · qrcodejs · Web Crypto (SHA-256) · IBM Plex + Archivo type.
