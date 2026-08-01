#!/usr/bin/env node
/**
 * FlipIt setup wizard.
 *
 *     npm run setup
 *
 * Asks a handful of questions, then writes every branded value into the
 * files that can't read config at runtime (SEO meta tags, sitemap, robots,
 * the Chrome extension) and generates the random secrets you'll paste into
 * Netlify. Nothing here touches your API keys — those stay in the Netlify
 * dashboard and never enter this repo.
 *
 * Non-interactive (CI, or re-running with the same answers):
 *
 *     node scripts/setup.js --site https://flipit.example.com \
 *                           --email support@example.com \
 *                           --brand FlipIt --price '$57' --anchor '$99' \
 *                           --entity "Example Ltd" --jurisdiction "England and Wales" \
 *                           --backend https://my-backend.up.railway.app \
 *                           --yes
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const readline = require('readline');

const ROOT = path.resolve(__dirname, '..');
const SITE_DIR = path.join(ROOT, 'flippost-site');
const EXT_DIR = path.join(ROOT, 'chrome-extension');
const PLACEHOLDER = 'https://your-domain.com';

// ── tiny arg parser ──────────────────────────────────────────────────────
const argv = process.argv.slice(2);
function flag(name) {
    const i = argv.indexOf('--' + name);
    return i !== -1 && i + 1 < argv.length ? argv[i + 1] : null;
}
const NON_INTERACTIVE = argv.includes('--yes') || argv.includes('-y');

// ── prompts ──────────────────────────────────────────────────────────────
const rl = process.stdin.isTTY && !NON_INTERACTIVE
    ? readline.createInterface({ input: process.stdin, output: process.stdout })
    : null;

function ask(question, fallback) {
    if (!rl) return Promise.resolve(fallback);
    const suffix = fallback ? ` [${fallback}]` : '';
    return new Promise((resolve) => {
        rl.question(`${question}${suffix}: `, (a) => resolve((a || '').trim() || fallback));
    });
}

function normaliseUrl(u) {
    if (!u) return '';
    let s = String(u).trim().replace(/\/+$/, '');
    if (s && !/^https?:\/\//i.test(s)) s = 'https://' + s;
    return s;
}

// ── file helpers ─────────────────────────────────────────────────────────
function rewrite(file, pairs) {
    if (!fs.existsSync(file)) return false;
    const before = fs.readFileSync(file, 'utf8');
    let after = before;
    for (const [from, to] of pairs) after = after.split(from).join(to);
    if (after === before) return false;
    fs.writeFileSync(file, after);
    return true;
}

function jsString(v) {
    return JSON.stringify(String(v == null ? '' : v));
}

// ─────────────────────────────────────────────────────────────────────────
async function main() {
    console.log('\n  FlipIt setup\n  ' + '─'.repeat(52));
    console.log('  Answers get written into this repo. API keys are NOT asked');
    console.log('  for here — those go in your Netlify dashboard.\n');

    const site = normaliseUrl(
        flag('site') || await ask('  Your site URL (where you will deploy)', PLACEHOLDER));
    const brand = flag('brand') || await ask('  Brand name', 'FlipIt');
    const email = flag('email') || await ask('  Support email', 'support@example.com');
    const price = flag('price') || await ask('  Price customers pay', '$57');
    const anchor = flag('anchor') !== null
        ? flag('anchor')
        : await ask('  Crossed-out "was" price (blank for none)', '$99');
    const entity = flag('entity') || await ask('  Legal entity name (for terms/privacy)', brand);
    const jurisdiction = flag('jurisdiction')
        || await ask('  Governing law / jurisdiction', 'England and Wales');
    const backend = normaliseUrl(
        flag('backend') !== null
            ? flag('backend')
            : await ask('  Your deployed /backend URL (blank = route via Netlify)', ''));
    const extension = flag('extension') || '';
    const refundDays = flag('refund-days') || '30';

    if (rl) rl.close();

    if (!site || site === PLACEHOLDER) {
        console.log('\n  ⚠️  No site URL given — SEO tags keep the placeholder.');
        console.log('     Re-run this once your domain is live.\n');
    }

    const changed = [];

    // ── 1. front-end runtime config ─────────────────────────────────────
    const cfgPath = path.join(SITE_DIR, 'config.js');
    let cfg = fs.readFileSync(cfgPath, 'utf8');
    const setField = (key, value) => {
        const re = new RegExp(`(\\n\\s*${key}:\\s*)('[^']*'|"[^"]*"|\\d+)`);
        if (!re.test(cfg)) {
            console.log(`     (could not find "${key}" in config.js — left alone)`);
            return;
        }
        cfg = cfg.replace(re, (m, lead) => lead + value);
    };
    setField('brandName', jsString(brand));
    setField('siteUrl', jsString(site === PLACEHOLDER ? '' : site));
    setField('price', jsString(price));
    setField('priceAnchor', jsString(anchor));
    setField('supportEmail', jsString(email));
    setField('legalEntity', jsString(entity));
    setField('legalJurisdiction', jsString(jurisdiction));
    setField('railwayBase', jsString(backend));
    setField('extensionUrl', jsString(extension));
    setField('refundDays', String(parseInt(refundDays, 10) || 30));
    fs.writeFileSync(cfgPath, cfg);
    changed.push('flippost-site/config.js');

    // ── 2. crawler-visible files (JS can't fix these) ────────────────────
    if (site && site !== PLACEHOLDER) {
        for (const f of ['index.html', 'share.html', 'flipit-landing-page.html',
                         'sitemap.xml', 'robots.txt']) {
            if (rewrite(path.join(SITE_DIR, f), [[PLACEHOLDER, site]])) {
                changed.push('flippost-site/' + f);
            }
        }
        // ── 3. Chrome extension ─────────────────────────────────────────
        if (rewrite(path.join(EXT_DIR, 'config.js'),
                    [[PLACEHOLDER, site], ["brandName: 'FlipIt'", `brandName: ${jsString(brand)}`]])) {
            changed.push('chrome-extension/config.js');
        }
        if (rewrite(path.join(EXT_DIR, 'manifest.json'), [[PLACEHOLDER, site]])) {
            changed.push('chrome-extension/manifest.json');
        }
    }

    // ── 4. CSP: let the browser talk to your own backend directly ────────
    // Without this the strict connect-src blocks the fast path and every
    // large video job takes the slower Netlify proxy route.
    if (backend) {
        const tomlPath = path.join(ROOT, 'netlify.toml');
        let toml = fs.readFileSync(tomlPath, 'utf8');
        const origin = new URL(backend).origin;
        if (!toml.includes(origin)) {
            toml = toml.replace(/connect-src 'self'([^;"]*)/,
                (m, rest) => `connect-src 'self'${rest} ${origin}`);
            fs.writeFileSync(tomlPath, toml);
            changed.push('netlify.toml (CSP connect-src)');
        }
    }

    // ── 5. secrets you paste into Netlify ────────────────────────────────
    const tokenSecret = crypto.randomBytes(48).toString('hex');
    const creatorCode = crypto.randomBytes(24).toString('hex');

    console.log('\n  ✅ Updated ' + changed.length + ' file(s):');
    changed.forEach((f) => console.log('     · ' + f));

    console.log('\n  ' + '─'.repeat(52));
    console.log('  NEXT: paste these into Netlify →');
    console.log('  Site settings → Environment variables\n');
    console.log('  ANTHROPIC_API_KEY     = sk-ant-...        (from console.anthropic.com)');
    console.log('  STRIPE_SECRET_KEY     = sk_live_...       (Stripe → Developers → API keys)');
    console.log('  STRIPE_PAYMENT_LINK   = https://buy.stripe.com/...  (Stripe → Payment Links)');
    console.log('  FLIPIT_TOKEN_SECRET   = ' + tokenSecret);
    console.log('  FLIPIT_CREATOR_CODE   = ' + creatorCode);
    if (email)   console.log('  SUPPORT_EMAIL         = ' + email);
    if (brand)   console.log('  BRAND_NAME            = ' + brand);
    if (price)   console.log('  PRICE_LABEL           = ' + price);
    if (backend) console.log('  RAILWAY_URL           = ' + backend);
    console.log('  OPENAI_API_KEY        = sk-...            (on your BACKEND host, for transcription)');
    console.log('\n  ⚠️  FLIPIT_TOKEN_SECRET is shown once. Save it somewhere safe —');
    console.log('     changing it later invalidates every customer\'s Pro access.');
    console.log('\n  Your private owner unlock link (bookmark it, never share it):');
    console.log('     ' + (site || PLACEHOLDER) + '/unlock/' + creatorCode);
    console.log('\n  Full walkthrough: BUYER_SETUP.md');
    console.log('  Verify your config any time:  npm run check\n');
}

main().catch((err) => {
    console.error('\n  Setup failed:', err && err.message);
    process.exit(1);
});
