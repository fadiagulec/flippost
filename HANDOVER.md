# Seller's handover checklist

For **you**, the current owner, when you sell this app. The buyer never
needs this file — theirs is `BUYER_SETUP.md`.

The goal: the buyer runs the product entirely on their own accounts, and
you can shut yours down without breaking anything of theirs.

---

## What you hand over

- [ ] The repository (a fresh copy — see below)
- [ ] `BUYER_SETUP.md` — they follow it start to finish
- [ ] The Chrome extension source in `chrome-extension/` plus its
      `SUBMISSION-GUIDE.md`
- [ ] Any marketing assets you're including: the sales-page copy is already
      in the repo, plus `og-share.png` and `proof-viralscore.png`
- [ ] Optionally, a short walkthrough call or Loom — this is what makes a
      "plug and play" sale feel worth the price

## What you must NOT hand over

None of this is in the repo, and none of it should be sent separately:

- ❌ Your `ANTHROPIC_API_KEY` — they create their own
- ❌ Your `STRIPE_SECRET_KEY` or Stripe account access
- ❌ Your `FLIPIT_TOKEN_SECRET` — if they use yours, tokens you issued would
      unlock their app, and vice versa
- ❌ Your `FLIPIT_CREATOR_CODE` — it's a permanent free-Pro backdoor
- ❌ Your Netlify or Railway account, or a "team member" invite to either
- ❌ Your domain, unless you're explicitly transferring it as part of the sale
- ❌ Your `INSTAGRAM_COOKIES_B64` — those are your logged-in session

Everything above is read from environment variables, so simply not sending
them is enough. Nothing is baked into the code.

---

## Preparing the copy you send

**1. Verify the repo is clean.**

```bash
npm run check
```

The "no previous-owner values anywhere in the repo" line must pass. It scans
every file for the old domain, email, backend URL, and any hardcoded Stripe
link.

**2. Strip your git history.** The working tree is clean, but old commits
still contain your domain and email:

```bash
rm -rf .git
git init
git add -A
git commit -m "Initial commit"
```

Then hand over that folder (or push it to a private repo and transfer it).

**3. Reset the config to placeholders**, so the buyer's first `npm run check`
tells them exactly what to fill in rather than silently shipping your brand:

```bash
node scripts/setup.js --site https://your-domain.com \
  --email support@example.com --brand FlipIt --price '$57' --anchor '$99' \
  --entity FlipIt --jurisdiction "England and Wales" --backend '' --yes
```

**4. Confirm it looks right.** `npm run check` should now report the
placeholder-domain warning and the placeholder-email error — that's the
correct state for a fresh copy. The buyer clears both by running
`npm run setup`.

---

## After the sale

- [ ] Rotate your own `FLIPIT_TOKEN_SECRET` and `FLIPIT_CREATOR_CODE` if you
      keep running your instance — assume anything you showed during the sale
      is now known
- [ ] Deactivate any Stripe Payment Link you used for demos
- [ ] Decide what happens to existing customers of your instance, and tell
      them — the buyer is not obliged to support them
- [ ] If you're transferring the domain, do it *after* the buyer's own deploy
      is confirmed working, so there's no window where the product is down

---

## Answering the buyer's likely questions

**"Does anything break if you disappear?"**
No. Once they've run `npm run setup` and set their own environment
variables, no request touches anything of yours.

**"What are the running costs?"**
Covered in `BUYER_SETUP.md` — roughly Netlify free tier, ~$5/mo Railway, and
per-use Anthropic charges of about $0.01–0.05 per flip.

**"Is there a database to migrate?"**
No. Access is a signed token in the customer's browser; rate-limit counters
live in Netlify Blobs and rebuild themselves. Nothing to migrate.

**"What's not perfect?"**
Be straight about these — they're documented in `BUYER_SETUP.md` too:
- Access tokens can be shared between browsers by a determined customer
- The free tier is per-IP, so it resets on a new network
- Instagram downloads depend on `yt-dlp`, which platforms break periodically
  and which needs occasional dependency updates
