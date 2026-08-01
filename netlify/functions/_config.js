// ─────────────────────────────────────────────────────────────────────────
// SHARED SERVER CONFIG — the ONLY place backend deployment values live.
//
// Everything here is read from environment variables, so a new owner can
// deploy this app to their own Netlify site, their own Railway backend and
// their own Stripe account WITHOUT editing a single line of code.
//
// NOT a Netlify function endpoint (filename starts with `_`), but Netlify
// bundles every .js in this directory, so it still exports a benign handler.
//
// ── Env vars this file reads ────────────────────────────────────────────
//   URL                  (auto-set by Netlify)  Your site's primary URL.
//   DEPLOY_PRIME_URL     (auto-set by Netlify)  Branch/preview deploy URL.
//   SITE_URL             (optional)  Overrides URL. Use if you serve the
//                                    app from a custom domain that differs
//                                    from Netlify's primary URL.
//   ALLOWED_ORIGINS      (optional)  Extra comma-separated origins allowed
//                                    to call the API (e.g. a staging site).
//   RAILWAY_URL          (required for video features) Base URL of your own
//                                    deployed /backend Flask service, no
//                                    trailing slash.
//   COBALT_URL           (optional)  Base URL of a Cobalt API instance used
//                                    as a download fallback.
//   SUPPORT_EMAIL        (optional)  Shown in rate-limit + error messages.
//   BRAND_NAME           (optional)  Product name in user-facing strings.
//   PRICE_LABEL          (optional)  e.g. "$57" — used in upgrade messages.
//   STRIPE_PAYMENT_LINK  (required for selling) Your Stripe Payment Link.
// ─────────────────────────────────────────────────────────────────────────

'use strict';

function envStr(name, fallback) {
    const v = process.env[name];
    if (typeof v !== 'string') return fallback;
    const trimmed = v.trim();
    return trimmed === '' ? fallback : trimmed;
}

// Strip any trailing slash so callers can safely do BASE + '/path'.
function stripSlash(u) {
    return typeof u === 'string' ? u.replace(/\/+$/, '') : u;
}

// ── Site identity ────────────────────────────────────────────────────────
// Netlify injects URL on every build/function invocation, so in the common
// case the owner sets NOTHING and CORS just works on their own domain.
const SITE_URL = stripSlash(envStr('SITE_URL', envStr('URL', '')));
const DEPLOY_URL = stripSlash(envStr('DEPLOY_PRIME_URL', ''));

const BRAND_NAME = envStr('BRAND_NAME', 'FlipIt');
const SUPPORT_EMAIL = envStr('SUPPORT_EMAIL', '');
const PRICE_LABEL = envStr('PRICE_LABEL', '$57');
const STRIPE_PAYMENT_LINK = envStr('STRIPE_PAYMENT_LINK', '');

// ── Downstream services (the buyer's own deployments) ────────────────────
const RAILWAY_URL = stripSlash(envStr('RAILWAY_URL', ''));
const COBALT_URL = stripSlash(envStr('COBALT_URL', ''));

// ── CORS ─────────────────────────────────────────────────────────────────
// Origin allowlist, built from (in order):
//   1. SITE_URL / Netlify's URL          — the production site
//   2. DEPLOY_PRIME_URL                  — branch + deploy-preview URLs
//   3. ALLOWED_ORIGINS                   — anything else the owner adds
// Requests from an unlisted origin get the first entry echoed back, which
// the browser then rejects — same deny behaviour as before, no wildcard.
function allowedOrigins() {
    const list = [];
    const push = (u) => {
        const clean = stripSlash(u);
        if (clean && !list.includes(clean)) list.push(clean);
    };

    push(SITE_URL);
    push(DEPLOY_URL);
    envStr('ALLOWED_ORIGINS', '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .forEach(push);

    // Local development against `netlify dev`.
    if (envStr('NETLIFY_DEV', '') || envStr('NODE_ENV', '') === 'development') {
        push('http://localhost:8888');
        push('http://localhost:3000');
    }

    return list;
}

/**
 * Build the CORS + content-type headers every function returns.
 *
 * @param {object} event   Netlify function event
 * @param {object} [opts]  { methods, headers } overrides
 */
function corsHeaders(event, opts) {
    const options = opts || {};
    const list = allowedOrigins();
    const origin = (event && event.headers && (event.headers.origin || event.headers.Origin)) || '';

    // If nothing is configured at all (first deploy before env vars are set)
    // fall back to the request's own origin so the owner can still see the
    // app working while they finish setup. Never falls back to '*'.
    const corsOrigin = list.includes(stripSlash(origin))
        ? origin
        : (list[0] || origin || 'null');

    return {
        'Access-Control-Allow-Origin': corsOrigin,
        'Access-Control-Allow-Headers': options.headers || 'Content-Type, X-Flipit-Pro',
        'Access-Control-Allow-Methods': options.methods || 'POST, OPTIONS',
        'Vary': 'Origin',
        'Content-Type': 'application/json'
    };
}

/**
 * Guard for endpoints that need the self-hosted Railway backend.
 * Returns a ready-to-return 503 when RAILWAY_URL isn't configured, so a
 * fresh install fails with a clear instruction instead of a mystery error.
 *
 * @returns {null|object} null when configured, else a function response
 */
function requireRailway(headers) {
    if (RAILWAY_URL) return null;
    console.error('[config] RAILWAY_URL is not set — video/transcribe/eraser features are disabled.');
    return {
        statusCode: 503,
        headers: headers || { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            error:
                'Video backend is not configured yet. Deploy the /backend folder ' +
                '(Railway, Render, Fly.io — anything that runs Python + ffmpeg) and ' +
                'set the RAILWAY_URL environment variable in Netlify.',
            code: 'backend_not_configured'
        })
    };
}

/** Build a Railway endpoint URL: railwayUrl('/download') */
function railwayUrl(path) {
    if (!RAILWAY_URL) return '';
    const p = path ? (path.startsWith('/') ? path : '/' + path) : '';
    return RAILWAY_URL + p;
}

/** Support-email sentence appended to user-facing limit messages. */
function supportSuffix(prefix) {
    if (!SUPPORT_EMAIL) return '';
    return (prefix || ' or email ') + SUPPORT_EMAIL;
}

module.exports = {
    SITE_URL,
    DEPLOY_URL,
    BRAND_NAME,
    SUPPORT_EMAIL,
    PRICE_LABEL,
    STRIPE_PAYMENT_LINK,
    RAILWAY_URL,
    COBALT_URL,
    allowedOrigins,
    corsHeaders,
    requireRailway,
    railwayUrl,
    supportSuffix,
    // Netlify bundles this file as a function; return a clean 404 on probes.
    handler: async function handler() {
        return {
            statusCode: 404,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: 'Not found' })
        };
    }
};
