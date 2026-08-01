# FlipIt — Setup Guide

Everything you need to take this from a folder of code to a live product
collecting payments, using **your own accounts only**. No part of this app
depends on the previous owner's infrastructure, keys, or domain.

Budget about **60–90 minutes** for a first deploy.

---

## What you're getting

A complete, working AI product:

| Piece | What it is | Where it runs |
|---|---|---|
| **Web app** | The product customers use — paste a social post URL, get a viral score, rewritten script, image/video prompts, downloads | Netlify (static site) |
| **API** | 26 serverless functions — AI calls, payment verification, rate limiting, access tokens | Netlify Functions |
| **Video backend** | Python/Flask service for transcription, scene extraction, watermark eraser, yt-dlp downloads | Railway (or Render/Fly.io) |
| **Sales page** | Conversion-optimised landing page at `/sell` | Netlify |
| **Chrome extension** | One-click "rate this post" button on Instagram/TikTok/YouTube/etc. | Chrome Web Store |
| **Legal pages** | Terms, privacy, refund policy — all auto-filled with your details | Netlify |
| **Owner tools** | `/admin.html` to revoke refunded customers, `/unlock/<code>` to grant yourself Pro | Netlify |

---

## Accounts you'll need

Create these first. All five have free tiers you can start on.

| Service | What for | Free tier | Signup |
|---|---|---|---|
| **GitHub** | Hosts the code, triggers deploys | Yes | github.com |
| **Netlify** | Hosts the site + API | Yes — 125k function calls/mo | netlify.com |
| **Anthropic** | The AI behind every feature | Pay-as-you-go, no minimum | console.anthropic.com |
| **Stripe** | Takes the payments | No monthly fee, ~2.9% + 30¢ | stripe.com |
| **Railway** | Video/transcription backend | ~$5/mo credit | railway.app |
| **OpenAI** *(optional)* | Whisper transcription | Pay-as-you-go | platform.openai.com |

You do **not** need the previous owner's account on any of these.

---

## Step 1 — Get the code into your own GitHub

```bash
git clone <the repo you were given> flipit
cd flipit
rm -rf .git            # drop the previous owner's history
git init
git add -A
git commit -m "Initial commit"
```

Create a new **private** repository on GitHub, then:

```bash
git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPO.git
git push -u origin main
```

---

## Step 2 — Run the setup wizard

```bash
npm install
npm run setup
```

It asks seven questions — your domain, brand name, support email, price,
legal entity, jurisdiction, backend URL — and then:

- writes them into `flippost-site/config.js`
- rewrites the SEO and social-share tags, `sitemap.xml`, `robots.txt`
- points the Chrome extension at your domain
- **generates your two secrets** and prints them

> ⚠️ **Copy the printed secrets somewhere safe before closing the terminal.**
> `FLIPIT_TOKEN_SECRET` is shown once. If you lose it and set a different
> one later, every customer who already paid loses access.

It also prints your private owner unlock link. Bookmark it — it's how you
give yourself full Pro access for free.

Commit the result:

```bash
git add -A && git commit -m "Configure for my business" && git push
```

---

## Step 3 — Deploy the video backend (Railway)

This powers transcription, scene extraction, the watermark eraser, and
TikTok/YouTube downloads. **You can skip it and come back later** — the app
deploys and sells fine without it, those specific features just return a
clear "not configured" message.

1. railway.app → **New Project** → **Deploy from GitHub repo** → pick your repo
2. **Settings → Root Directory** → `backend`
3. **Variables** → add `OPENAI_API_KEY` (from platform.openai.com) — needed
   for transcription only
4. **Settings → Networking → Generate Domain**
5. Copy that URL (e.g. `https://your-app.up.railway.app`)

Then wire it in and redeploy:

```bash
npm run setup -- --backend https://your-app.up.railway.app --yes
git add -A && git commit -m "Point at my backend" && git push
```

> The setup script also adds your backend origin to the Content-Security-Policy
> in `netlify.toml`, which lets large video jobs take the fast direct route
> instead of the slower proxy.

---

## Step 4 — Deploy the site (Netlify)

1. netlify.com → **Add new site** → **Import an existing project** → your repo
2. Build settings are already in `netlify.toml` — accept the defaults
3. Deploy

Then **Site configuration → Environment variables**, and add:

| Variable | Value |
|---|---|
| `ANTHROPIC_API_KEY` | Your key from console.anthropic.com |
| `STRIPE_SECRET_KEY` | Stripe → Developers → API keys → Secret key |
| `STRIPE_PAYMENT_LINK` | Created in Step 5 — come back for this |
| `FLIPIT_TOKEN_SECRET` | Printed by `npm run setup` |
| `FLIPIT_CREATOR_CODE` | Printed by `npm run setup` |
| `SUPPORT_EMAIL` | Your support address |
| `RAILWAY_URL` | Your Railway URL from Step 3 (skip if you skipped it) |

Full list with explanations: [`.env.example`](.env.example).

**After adding env vars, redeploy** (Deploys → Trigger deploy → Deploy site).
Functions only pick up new variables on a fresh build.

### Your own domain

Netlify → **Domain management** → **Add a domain** → follow the DNS steps.
CORS updates itself automatically — Netlify sets the `URL` variable and the
API reads it, so there is nothing to change in code.

---

## Step 5 — Set up Stripe

1. **Products** → **Add product** → name it, set your price (one-time, not
   recurring — this app sells lifetime access)
2. **Payment Links** → **New** → select that product
3. Under **After payment** → **Show a confirmation page** → **Custom URL**,
   paste — with your real domain:

   ```
   https://YOUR-DOMAIN.com/thank-you.html?session_id={CHECKOUT_SESSION_ID}
   ```

   > `{CHECKOUT_SESSION_ID}` is a literal Stripe template. Type it exactly —
   > Stripe swaps in the real ID at redirect time. **This step is not
   > optional**: without it, buyers land on the thank-you page with no proof
   > of payment and never receive access.

4. Copy the Payment Link URL → paste it into Netlify as `STRIPE_PAYMENT_LINK`
5. Redeploy

Every "Buy" button on the site points at `/get`, which reads that variable —
so your checkout URL lives in exactly one place and is never committed to
the repo.

---

## Step 6 — Test before you announce

Run the automated check first:

```bash
npm run check
```

Then test the real flow:

- [ ] Site loads at your domain
- [ ] `/sell` shows the sales page; every CTA reaches Stripe checkout
- [ ] Paste an Instagram or TikTok URL → viral score comes back
- [ ] Visit `/thank-you.html` **without** `?session_id=` → shows "could not be
      activated" and grants nothing *(this is the paywall working)*
- [ ] Switch Stripe to **test mode**, buy with card `4242 4242 4242 4242` →
      lands on thank-you → "Pro access activated" → app unlocks
- [ ] Visit your `/unlock/<creator-code>` link → you get Pro on that device
- [ ] `/admin.html` accepts your creator code
- [ ] `/privacy.html`, `/terms.html`, `/refund.html` show **your** email and
      entity, not placeholders
- [ ] Paste your site link into a WhatsApp or Slack message → preview shows
      your domain and image

When the test purchase works, switch Stripe out of test mode, swap
`STRIPE_SECRET_KEY` to the `sk_live_...` key, redeploy, and you're live.

---

## Running costs

Roughly, at low volume:

| | Cost |
|---|---|
| Netlify | £0 until ~125k function calls/month |
| Anthropic | ~$0.01–0.05 per flip, pay-as-you-go |
| Railway | ~$5/month |
| OpenAI Whisper | ~$0.006/minute of audio, only if transcription is used |
| Stripe | ~2.9% + 30¢ per sale |

The built-in rate limits (3 free flips/day, 50/day and 1000/month for Pro)
exist to keep AI costs below your margin. Tune them with the
`FREE_DAILY_LIMIT` / `PRO_DAILY_LIMIT` / `PRO_MONTHLY_LIMIT` variables — no
code changes needed.

**Set a spend cap in the Anthropic console before you launch.** It's the one
protection that isn't in this codebase.

---

## Where things live

Only three files hold anything specific to your business:

| File | Holds |
|---|---|
| `flippost-site/config.js` | Brand, price, support email, legal entity — everything the browser shows |
| Netlify environment variables | All secrets and API keys |
| `chrome-extension/config.js` | Your domain, for the extension |

Everything else is generic. `npm run setup` writes all three; `npm run check`
tells you if any placeholder is left.

```
flippost-site/          The web app + sales page + legal pages
netlify/functions/      The API (26 serverless functions)
  _config.js            ← all deployment values, read from env vars
  _rate_limit.js        Per-IP quotas, backed by Netlify Blobs
  _pro_verify.js        HMAC token verification
backend/                Python service: yt-dlp, ffmpeg, Whisper
chrome-extension/       Browser extension (see its SUBMISSION-GUIDE.md)
scripts/setup.js        The wizard
scripts/check.js        The preflight check
```

---

## How the paywall actually works

Worth understanding before you change anything:

1. Customer pays through your Stripe Payment Link
2. Stripe redirects to `/thank-you.html?session_id=cs_live_...`
3. The page POSTs that session ID to `issue-pro-token`
4. That function **asks Stripe's API directly** whether the session was paid
5. Only if Stripe says yes does it mint an HMAC-signed token
6. The token is stored in the browser and sent as `X-Flipit-Pro` on every
   gated request; each function re-verifies the signature server-side

There is no user database and no login. That's deliberate — it means no
password resets, no GDPR data store, no auth bugs. The trade-off is that a
determined customer could share their token. For a one-time purchase at this
price, that leakage is cheaper than running accounts.

**Refunds:** refund in Stripe, copy the `cs_live_...` session ID from the
payment, paste it into `/admin.html` with your creator code, click Revoke.
Their access drops to free-tier limits immediately.

---

## Known limitations

Stated plainly so nothing surprises you after launch. None of these block
selling — they're the deliberate trade-offs of a no-login product.

- **Tokens are shareable.** A customer could copy their access token into
  another browser and give it to a friend. There is no login to prevent it.
  For a one-time purchase this leaks less revenue than running accounts
  would cost to build and support. If it ever becomes visible, revoke that
  session ID in `/admin.html`.
- **The free tier is per-IP.** Someone switching networks or using a VPN
  gets a fresh daily allowance. Server-side counters make casual abuse
  annoying, not impossible. Set `FREE_DAILY_LIMIT=0` to sell paid-only.
- **`yt-dlp` needs occasional updates.** Instagram, TikTok and YouTube change
  their internals regularly and break extraction. `backend/requirements.txt`
  pins a minimum, not an exact version, so redeploying Railway pulls the
  newest release — that's usually the whole fix.
- **Instagram downloads are best-effort.** Private and some region-locked
  posts won't resolve. `INSTAGRAM_COOKIES_B64` improves the hit rate.
- **Netlify functions cap responses at 6MB.** Large video files route through
  your backend instead; setting `RAILWAY_URL` is what makes that path fast.

---

## Troubleshooting

**Every AI feature errors** → `ANTHROPIC_API_KEY` missing, or you set it and
didn't redeploy. Netlify → Deploys → Trigger deploy.

**Buyers pay but don't get access** → the Stripe success URL is missing
`?session_id={CHECKOUT_SESSION_ID}` (Step 5), or `STRIPE_SECRET_KEY` /
`FLIPIT_TOKEN_SECRET` isn't set in Netlify.

**"Backend not configured"** → `RAILWAY_URL` isn't set, or Railway is asleep.
Check the Railway deploy logs.

**CORS errors in the browser console** → almost always a stale deploy.
Redeploy; the allowlist rebuilds from Netlify's `URL` automatically. If you
serve from a domain Netlify doesn't know about, set `SITE_URL` explicitly.

**Transcription says not configured** → `OPENAI_API_KEY` goes on **Railway**,
not Netlify.

**Downloads fail on Instagram** → expected for some private/blocked posts.
Adding `INSTAGRAM_COOKIES_B64` on Railway improves the hit rate.

**Legal pages show blanks** → run `npm run setup`, then `npm run check`.

---

## Before you sell to customers

- [ ] Set a **spend cap** in the Anthropic console
- [ ] Read `terms.html`, `privacy.html`, `refund.html` end to end. They are a
      sensible starting point, not legal advice — have them reviewed if you
      trade in a regulated market or at volume.
- [ ] Confirm the price in `config.js` matches what Stripe actually charges
- [ ] Do one real (non-test-mode) purchase yourself and refund it
- [ ] Set `ERROR_WEBHOOK_URL` so you hear about breakage before customers do
