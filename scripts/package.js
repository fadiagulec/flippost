#!/usr/bin/env node
/**
 * Build a clean, buyer-ready copy of this app.
 *
 *     npm run package
 *     npm run package -- --out "C:\\Users\\me\\Desktop\\flipit-for-sale"
 *
 * Produces a folder you can zip and hand to a buyer. It:
 *
 *   1. Copies the source, skipping git history, node_modules, build caches,
 *      local env files and any stray media.
 *   2. Resets the config to neutral placeholders, so the buyer's first
 *      `npm run check` tells them exactly what to fill in rather than
 *      silently shipping your brand and your domain.
 *   3. Verifies the result contains none of your values.
 *   4. Writes a START-HERE.txt so the buyer knows what to open first.
 *
 * Your own working copy is never modified.
 *
 * NOTE: this deliberately produces a folder with NO .git directory. Old
 * commits contain your domain and email even after the working tree is
 * clean, so shipping history would leak exactly what this is meant to strip.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');

function flag(name, fallback) {
    const i = process.argv.indexOf('--' + name);
    return i !== -1 && i + 1 < process.argv.length ? process.argv[i + 1] : fallback;
}

const OUT = path.resolve(flag('out', path.join(ROOT, '..', 'flipit-for-sale')));

// Never copied. Caches and history are regenerable; env files and media are
// either secret or simply not part of the product.
const SKIP_DIRS = new Set(['.git', 'node_modules', '.netlify', 'dist', 'build',
                           '.next', '.cache', 'submission-assets', '.claude']);
const SKIP_FILES = new Set(['.env', '.env.local', '.env.production', 'AUDIT.md']);
const SKIP_EXT = new Set(['.mp4', '.mov', '.avi', '.mkv', '.webm', '.zip', '.log']);

function shouldSkip(srcPath, isDir) {
    const base = path.basename(srcPath);
    if (isDir) return SKIP_DIRS.has(base);
    if (SKIP_FILES.has(base)) return true;
    if (base.startsWith('.env') && base !== '.env.example') return true;
    return SKIP_EXT.has(path.extname(base).toLowerCase());
}

let copied = 0;
function copyTree(src, dest) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
        const s = path.join(src, entry.name);
        const d = path.join(dest, entry.name);
        if (shouldSkip(s, entry.isDirectory())) continue;
        if (entry.isDirectory()) copyTree(s, d);
        else { fs.copyFileSync(s, d); copied++; }
    }
}

function run(script, args, cwd) {
    return execFileSync(process.execPath, [script, ...args], {
        cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']
    });
}

// ─────────────────────────────────────────────────────────────────────────
console.log('\n  Building sellable package\n  ' + '─'.repeat(52));

if (fs.existsSync(OUT)) {
    // Refuse rather than clobber — the output path is user-supplied and a
    // silent recursive delete of the wrong folder is unrecoverable.
    console.error(`  ❌ ${OUT} already exists.\n     Delete or rename it first, or pass --out <other path>.\n`);
    process.exit(1);
}

copyTree(ROOT, OUT);
console.log(`  ✅ Copied ${copied} files → ${OUT}`);

// ── Reset to placeholders ────────────────────────────────────────────────
try {
    run(path.join(OUT, 'scripts', 'setup.js'), [
        '--site', 'https://your-domain.com',
        '--email', 'support@example.com',
        '--brand', 'FlipIt',
        '--price', '$57',
        '--anchor', '$99',
        '--entity', 'FlipIt',
        '--jurisdiction', 'England and Wales',
        '--backend', '',
        '--yes'
    ], OUT);
    console.log('  ✅ Config reset to placeholders');
} catch (e) {
    console.error('  ❌ Could not reset config:', e.message);
    process.exit(1);
}

// The env-var fallback to a live backend is a convenience for the current
// owner; in a sold copy it would silently bill the seller's infrastructure.
const cfgPath = path.join(OUT, 'netlify', 'functions', '_config.js');
let cfgSrc = fs.readFileSync(cfgPath, 'utf8');
const fallback = cfgSrc.match(/envStr\('RAILWAY_URL',\s*'(https?:\/\/[^']+)'\)/);
if (fallback) {
    cfgSrc = cfgSrc.replace(fallback[0], "envStr('RAILWAY_URL', '')");
    fs.writeFileSync(cfgPath, cfgSrc);
    console.log('  ✅ Removed the hardcoded backend fallback (' + fallback[1] + ')');
}

// ── Buyer's first-contact note ───────────────────────────────────────────
fs.writeFileSync(path.join(OUT, 'START-HERE.txt'),
`FlipIt — start here
===================

Everything you need is in this folder. Nothing is tied to the previous
owner's accounts, domain, or keys.

  1. Install Node.js (nodejs.org) if you don't have it.
  2. Open a terminal in this folder and run:

         npm install
         npm run setup      <- asks 8 questions, configures everything
         npm run check      <- confirms you're ready

  3. Follow BUYER_SETUP.md for the full deploy walkthrough.

BUYER_SETUP.md covers: which accounts to create, how to deploy, how to wire
up Stripe, what it costs to run, and the known limitations.

If "npm run check" reports a problem, run "npm run setup" — that fixes
almost everything it flags.
`);
console.log('  ✅ Wrote START-HERE.txt');

// ── Verify ───────────────────────────────────────────────────────────────
let checkOut = '';
let checkFailed = false;
try {
    checkOut = run(path.join(OUT, 'scripts', 'check.js'), [], OUT);
} catch (e) {
    checkFailed = true;
    checkOut = (e.stdout || '') + (e.stderr || '');
}

// The ONLY failure a fresh package should have is the placeholder email —
// that's intentional, it's what tells the buyer where to start. Anything
// else means something of yours leaked through.
const leaks = checkOut.split('\n')
    .filter((l) => l.includes('❌'))
    .filter((l) => !l.includes('supportEmail is still a placeholder'));

console.log('\n  ' + '─'.repeat(52));
if (leaks.length) {
    console.log('  ❌ The package still contains values that should not ship:\n');
    leaks.forEach((l) => console.log('   ' + l.trim()));
    console.log('\n  Do NOT send this to a buyer. Fix the above and re-run.\n');
    process.exit(1);
}

console.log('  ✅ Package is clean — no previous-owner values remain.');
console.log('     (The one expected "supportEmail is still a placeholder"');
console.log('      error is intentional: it tells the buyer where to start.)');
console.log(`\n  Ready:  ${OUT}`);
console.log('\n  Before you send it:');
console.log('   · Right-click the folder → Send to → Compressed (zipped) folder');
console.log('   · Do NOT include your ANTHROPIC_API_KEY, STRIPE_SECRET_KEY,');
console.log('     FLIPIT_TOKEN_SECRET or FLIPIT_CREATOR_CODE — the buyer');
console.log('     generates their own. See HANDOVER.md.');
console.log('');
void checkFailed;
