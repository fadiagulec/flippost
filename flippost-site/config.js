/* ═══════════════════════════════════════════════════════════════════════
 * FLIPIT — FRONT-END CONFIG
 *
 * ▶ THIS IS THE ONLY FRONT-END FILE YOU NEED TO EDIT.
 *
 * Everything the browser shows that is specific to YOUR business lives
 * here: your brand name, your price, your support email, your links.
 * No other .js or .html file contains a hardcoded business value.
 *
 * You can edit this by hand, or let the setup wizard write it for you:
 *
 *     npm run setup
 *
 * Server-side settings (API keys, Stripe secret key, backend URL) are NOT
 * here — those are environment variables in your Netlify dashboard, so
 * they never end up in the browser. See .env.example and BUYER_SETUP.md.
 * ═══════════════════════════════════════════════════════════════════════ */

window.FLIPIT_CONFIG = {

    // ── Brand ────────────────────────────────────────────────────────────
    // Shown in buttons, headings and system messages.
    brandName: "FlipIt",

    // Your public site address, no trailing slash.
    // Leave '' to auto-detect from the browser's address bar — correct for
    // almost everyone. Set it explicitly only if you generate share links
    // that must always point at one canonical domain.
    siteUrl: "https://flipit.earnwith-ai.com",

    // ── Money ────────────────────────────────────────────────────────────
    // Checkout destination. '/get' is a server route that redirects to the
    // STRIPE_PAYMENT_LINK environment variable you set in Netlify — so your
    // real Stripe URL is never committed to this repo. Only change this if
    // you want to bypass the env var and hardcode a checkout URL.
    checkoutUrl: '/get',

    // Displayed prices. Purely cosmetic — the amount actually charged is
    // whatever your Stripe Payment Link is configured for. Keep them in
    // sync with Stripe or customers will (rightly) complain.
    price: "$57",          // what they pay
    priceAnchor: "$99",    // crossed-out "was" price; set '' to hide

    // ── Contact ──────────────────────────────────────────────────────────
    // Used for support links, refund requests and legal pages.
    supportEmail: "contact@earnwith-ai.com",

    // Legal entity name + governing law shown on terms/privacy/refund pages.
    legalEntity: "FlipIt",
    legalJurisdiction: "England and Wales",

    // ── Optional extras ──────────────────────────────────────────────────
    // Direct URL of your own deployed /backend service (Railway, Render,
    // Fly.io…). Used as a fast path for large video jobs; when empty, every
    // request routes through your Netlify functions instead, which always
    // works but is slower for big files. Safe to leave ''.
    railwayBase: "https://web-production-8afc3.up.railway.app",

    // Where "Install the Chrome extension" points. Chrome Web Store URL
    // once published; '' hides the link.
    extensionUrl: "",

    // Refund window in days, shown on the refund page and in copy.
    refundDays: 30
};

/* ── Helpers (do not edit below this line) ────────────────────────────── */
(function () {
    'use strict';
    var c = window.FLIPIT_CONFIG;

    // Resolve siteUrl lazily so the default '' means "wherever I'm served".
    c.resolvedSiteUrl = function () {
        if (c.siteUrl) return String(c.siteUrl).replace(/\/+$/, '');
        try { return window.location.origin; } catch (e) { return ''; }
    };

    // mailto: link with an optional subject, pre-encoded.
    c.mailto = function (subject) {
        var base = 'mailto:' + c.supportEmail;
        return subject ? base + '?subject=' + encodeURIComponent(subject) : base;
    };
})();
