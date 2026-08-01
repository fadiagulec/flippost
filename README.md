# FlipIt

**See It. Flip It. Post It. Go Viral.**

Paste any social media post URL — Instagram, TikTok, YouTube, LinkedIn,
Facebook, X, Threads — and get back a viral score, a rewritten script in your
own voice, AI image and video prompts, hooks, captions, and watermark-free
downloads.

A complete, sellable AI product: web app, API, payment gate, sales page,
legal pages, browser extension.

---

## 🚀 New owner? Start here

```bash
npm install
npm run setup      # asks 7 questions, configures everything
npm run check      # confirms you're ready to launch
```

Then follow **[BUYER_SETUP.md](BUYER_SETUP.md)** — the full deploy
walkthrough, from empty accounts to taking payments.

Nothing in this repo is tied to a previous owner's domain, keys, or Stripe
account. `npm run check` fails loudly if anything ever is.

---

## Architecture

```
flippost-site/          Static front-end (no build step, no framework)
  config.js             ← the only front-end file with your business values
  app.js                The product
  flipit-landing-page   Sales page, served at /sell
  admin.html            Owner tools: revoke a refunded customer

netlify/functions/      Serverless API
  _config.js            ← all deployment values, read from env vars
  _pro_verify.js        HMAC token verification
  _rate_limit.js        Per-IP quotas backed by Netlify Blobs
  _ssrf_guard.js        Blocks internal-network URLs
  issue-pro-token.js    Verifies a Stripe payment, mints access
  go-checkout.js        /get → your Stripe Payment Link

backend/                Python/Flask: yt-dlp, ffmpeg, Whisper
chrome-extension/       One-click "rate this post" button
scripts/                setup.js (wizard) · check.js (preflight)
```

**Stack:** vanilla JS front-end (no framework, no build), Netlify Functions,
Claude for the AI, Flask on Railway for video work, Stripe for payments.

---

## Local development

```bash
npm install -g netlify-cli
netlify dev
```

Serves the site and functions at `http://localhost:8888`, which is already in
the CORS allowlist during development. Put your keys in a local `.env` — see
[`.env.example`](.env.example) for the full list and what each one does.

---

## Configuration

| Where | What lives there |
|---|---|
| `flippost-site/config.js` | Brand, price, support email, legal entity — everything the browser displays |
| Netlify environment variables | API keys, Stripe secrets, backend URL |
| `chrome-extension/config.js` | Your domain, for the extension |

Nothing else needs editing. `npm run setup` writes all three.

---

## Commands

| Command | Does |
|---|---|
| `npm run setup` | Configure the app for your business |
| `npm run check` | Preflight: config, syntax, leftover placeholders, env vars |
| `netlify dev` | Run locally |

---

## License

Proprietary. All rights reserved by the current owner.
