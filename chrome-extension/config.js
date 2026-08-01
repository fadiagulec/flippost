/* ═══════════════════════════════════════════════════════════════════════
 * CHROME EXTENSION CONFIG — edit this one line, nothing else.
 *
 * Point it at your own deployed FlipIt site (no trailing slash).
 * `npm run setup` in the repo root fills this in for you automatically.
 * ═══════════════════════════════════════════════════════════════════════ */

var FLIPIT_EXT_CONFIG = {
    // Your live app, e.g. 'https://flipit.mydomain.com'
    siteUrl: 'https://your-domain.com',

    // Shown in the popup header.
    brandName: 'FlipIt'
};

// Available to both the popup (classic script) and the content script
// (declared before content.js in manifest.json's content_scripts).
if (typeof window !== 'undefined') window.FLIPIT_EXT_CONFIG = FLIPIT_EXT_CONFIG;
