#!/usr/bin/env node
/**
 * FlipIt preflight check.
 *
 *     npm run check
 *
 * Verifies the repo is fully configured for YOUR business and that no
 * previous owner's values are left behind. Exits non-zero on any error, so
 * it also works as a CI gate.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const SITE_DIR = path.join(ROOT, 'flippost-site');
const FN_DIR = path.join(ROOT, 'netlify', 'functions');

const errors = [];
const warnings = [];
const passes = [];

const err = (m) => errors.push(m);
const warn = (m) => warnings.push(m);
const pass = (m) => passes.push(m);

// Directories that are caches or build output, not source. `.netlify` in
// particular holds a stale copy of a previous build's netlify.toml, which
// would otherwise be reported as a problem in files you never edit.
const SKIP_DIRS = new Set(['.git', 'node_modules', '.netlify', 'dist', 'build',
                           '.next', '.cache', 'submission-assets']);

function walk(dir, out) {
    out = out || [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (SKIP_DIRS.has(entry.name)) continue;
        const p = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(p, out);
        else out.push(p);
    }
    return out;
}

// Always compare paths with forward slashes. path.relative() returns
// backslashes on Windows, so a plain === against 'scripts/check.js' silently
// never matched there and this file flagged itself.
function relPath(f) {
    return path.relative(ROOT, f).split(path.sep).join('/');
}

const TEXT_EXT = new Set(['.js', '.mts', '.html', '.json', '.md', '.toml',
                          '.xml', '.txt', '.py', '.yml', '.yaml']);
const files = walk(ROOT).filter((f) => TEXT_EXT.has(path.extname(f)));

// ── 1. every .js file parses ─────────────────────────────────────────────
let syntaxBad = 0;
for (const f of files.filter((f) => f.endsWith('.js'))) {
    const src = fs.readFileSync(f, 'utf8');
    try {
        new vm.Script(src, { filename: f });
    } catch (e) {
        // ES-module-only syntax is expected in a few places; flag the rest.
        if (/import\s|export\s/.test(src)) continue;
        syntaxBad++;
        err(`Syntax error in ${relPath(f)}: ${e.message}`);
    }
}
if (!syntaxBad) pass('All JavaScript files parse');

// ── 2. load the front-end config ─────────────────────────────────────────
// Loaded before the stale scan because "is this value stale?" depends on
// what the current owner has actually configured.
const cfgPath = path.join(SITE_DIR, 'config.js');
let cfg = null;
try {
    const sandbox = { window: {}, console };
    vm.createContext(sandbox);
    vm.runInContext(fs.readFileSync(cfgPath, 'utf8'), sandbox);
    cfg = sandbox.window.FLIPIT_CONFIG;
} catch (e) {
    err('Could not load flippost-site/config.js: ' + e.message);
}

// ── 3. no leftover values from a PREVIOUS owner ──────────────────────────
// The markers below identify the owner this codebase shipped from. They are
// only a problem when they DON'T match what's configured now — on the
// original owner's own deploy, their domain and backend are correct and must
// not be reported. If you bought this app and see failures here, the fix is
// `npm run setup`.
const host = (u) => {
    try { return new URL(String(u || '')).hostname.toLowerCase(); }
    catch { return ''; }
};
const configuredHost = host(cfg && cfg.siteUrl);
const configuredBackend = host(cfg && cfg.railwayBase);
const configuredEmail = String((cfg && cfg.supportEmail) || '').toLowerCase();

const STALE = [
    {
        re: /earnwith-ai\.com/i,
        what: "a previous owner's domain",
        // Owned when it IS the configured site or support-email domain.
        owned: () => configuredHost.endsWith('earnwith-ai.com')
                  || configuredEmail.endsWith('earnwith-ai.com')
    },
    {
        re: /fadiagulec/i,
        what: "a previous owner's email/GitHub handle",
        owned: () => configuredEmail.includes('fadiagulec')
    },
    {
        re: /web-production-8afc3\.up\.railway\.app/i,
        what: "a previous owner's backend URL",
        owned: () => configuredBackend === 'web-production-8afc3.up.railway.app'
    },
    {
        // Payment links belong in the STRIPE_PAYMENT_LINK env var, never in
        // the repo — so this one is always a problem, for any owner.
        re: /buy\.stripe\.com\/[A-Za-z0-9]{10,}/,
        what: 'a hardcoded Stripe payment link (it belongs in STRIPE_PAYMENT_LINK)',
        owned: () => false
    }
];

let staleHits = 0;
for (const f of files) {
    const rel = relPath(f);
    if (rel === 'scripts/check.js') continue;           // this file lists them on purpose
    const src = fs.readFileSync(f, 'utf8');
    for (const { re, what, owned } of STALE) {
        if (re.test(src) && !owned()) {
            staleHits++;
            err(`${rel} still contains ${what}`);
        }
    }
}
if (!staleHits) pass('No previous-owner values anywhere in the repo');

// ── 4. front-end config is filled in ─────────────────────────────────────
if (cfg) {
    if (!cfg.supportEmail || /example\.com$/i.test(cfg.supportEmail)) {
        err('config.js supportEmail is still a placeholder — customers cannot reach you.');
    } else {
        pass('Support email set: ' + cfg.supportEmail);
    }

    if (!cfg.brandName) err('config.js brandName is empty.');
    if (!cfg.price) warn('config.js price is empty — pricing copy will render blank.');
    if (!cfg.checkoutUrl) err('config.js checkoutUrl is empty — nobody can buy.');

    if (cfg.legalEntity && cfg.legalJurisdiction) {
        pass(`Legal: ${cfg.legalEntity} · ${cfg.legalJurisdiction}`);
    } else {
        warn('config.js legalEntity / legalJurisdiction not set — terms page will show blanks.');
    }
}

// ── 5. crawler-visible URLs ──────────────────────────────────────────────
const seoFiles = ['index.html', 'share.html', 'flipit-landing-page.html',
                  'sitemap.xml', 'robots.txt'];
const seoStale = seoFiles.filter((f) => {
    const p = path.join(SITE_DIR, f);
    return fs.existsSync(p) && fs.readFileSync(p, 'utf8').includes('your-domain.com');
});
if (seoStale.length) {
    warn('Placeholder domain still in: ' + seoStale.join(', ') +
         ' — run `npm run setup` with your real domain so link previews and SEO work.');
} else {
    pass('SEO / share tags point at a real domain');
}

// ── 6. every page loads the config before the code that reads it ─────────
for (const f of fs.readdirSync(SITE_DIR).filter((f) => f.endsWith('.html'))) {
    const src = fs.readFileSync(path.join(SITE_DIR, f), 'utf8');
    if (!src.includes('config.js')) {
        err(`flippost-site/${f} does not load config.js — branded values will not render.`);
        continue;
    }
    const iCfg = src.indexOf('src="config.js"');
    const iBrand = src.indexOf('src="branding.js"');
    if (iBrand !== -1 && iBrand < iCfg) {
        err(`flippost-site/${f} loads branding.js before config.js.`);
    }
}
pass('All pages load config.js first');

// ── 7. functions use the shared config, not hardcoded origins ────────────
const hardcodedCors = fs.readdirSync(FN_DIR)
    .filter((f) => f.endsWith('.js'))
    .filter((f) => /allowedOrigins\s*=\s*\[/.test(fs.readFileSync(path.join(FN_DIR, f), 'utf8')));
if (hardcodedCors.length) {
    err('Functions with a hardcoded CORS allowlist: ' + hardcodedCors.join(', '));
} else {
    pass('All functions read CORS origins from _config.js');
}

// ── 8. env vars, when running somewhere they exist ───────────────────────
const REQUIRED_ENV = [
    ['ANTHROPIC_API_KEY', 'every AI feature returns an error'],
    ['STRIPE_SECRET_KEY', 'purchases cannot be verified — buyers get no access'],
    ['FLIPIT_TOKEN_SECRET', 'Pro access cannot be granted at all'],
    ['STRIPE_PAYMENT_LINK', 'the /get checkout link falls back to the sales page']
];
const OPTIONAL_ENV = [
    ['FLIPIT_CREATOR_CODE', 'owner unlock + refund revocation disabled'],
    ['RAILWAY_URL', 'transcription, scene extraction and the eraser are disabled'],
    ['SUPPORT_EMAIL', 'limit messages omit a contact address']
];

const anyEnv = REQUIRED_ENV.some(([k]) => process.env[k]);
if (anyEnv) {
    for (const [k, effect] of REQUIRED_ENV) {
        if (!process.env[k]) err(`Missing env var ${k} — ${effect}.`);
    }
    for (const [k, effect] of OPTIONAL_ENV) {
        if (!process.env[k]) warn(`Optional env var ${k} not set — ${effect}.`);
    }
} else {
    warn('No environment variables found here — that is normal on a laptop. ' +
         'Check them in your Netlify dashboard instead (see BUYER_SETUP.md).');
}

// ── report ───────────────────────────────────────────────────────────────
console.log('\n  FlipIt preflight\n  ' + '─'.repeat(52));
passes.forEach((m) => console.log('  ✅ ' + m));
warnings.forEach((m) => console.log('  ⚠️  ' + m));
errors.forEach((m) => console.log('  ❌ ' + m));

console.log('\n  ' + '─'.repeat(52));
if (errors.length) {
    console.log(`  ${errors.length} problem(s) to fix before launch.`);
    console.log('  Most are fixed by running:  npm run setup\n');
    process.exit(1);
}
console.log(`  Ready to launch${warnings.length ? ` (${warnings.length} warning(s))` : ''}.\n`);
