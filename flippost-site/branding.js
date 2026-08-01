/* FlipIt branding injector.
 *
 * Applies flippost-site/config.js to any static HTML page, so the legal
 * pages, landing page, thank-you page and vault never hardcode a business
 * value. Runs before paint on DOMContentLoaded.
 *
 * Mark up HTML with data attributes — no inline script needed, which keeps
 * the strict `script-src 'self'` CSP intact:
 *
 *   <span data-flipit="brand"></span>          → brand name
 *   <span data-flipit="price"></span>          → "$57"
 *   <span data-flipit="price-anchor"></span>   → "$99" (hidden when unset)
 *   <span data-flipit="entity"></span>         → legal entity name
 *   <span data-flipit="jurisdiction"></span>   → governing law
 *   <span data-flipit="refund-days"></span>    → "30"
 *   <a    data-flipit="email"></a>             → mailto + visible address
 *   <a    data-flipit="email" data-subject="Refund request"></a>
 *   <a    data-flipit="checkout"></a>          → href = checkout URL
 *   <a    data-flipit="site"></a>              → href + text = site URL
 *   <a    data-flipit="extension"></a>         → Chrome extension link,
 *                                                removed when unset
 */
(function () {
    'use strict';

    var cfg = window.FLIPIT_CONFIG;
    if (!cfg) {
        console.error('[branding] config.js did not load — check the <script> order.');
        return;
    }

    function setText(el, value) {
        if (value == null) return;
        el.textContent = String(value);
    }

    function apply() {
        var nodes = document.querySelectorAll('[data-flipit]');

        for (var i = 0; i < nodes.length; i++) {
            var el = nodes[i];
            var kind = el.getAttribute('data-flipit');

            switch (kind) {
                case 'brand':
                    setText(el, cfg.brandName);
                    break;

                case 'price':
                    setText(el, cfg.price);
                    break;

                case 'price-anchor':
                    // No anchor price configured → remove the strikethrough
                    // entirely rather than render an empty <s>.
                    if (cfg.priceAnchor) setText(el, cfg.priceAnchor);
                    else if (el.parentNode) el.parentNode.removeChild(el);
                    break;

                case 'entity':
                    setText(el, cfg.legalEntity || cfg.brandName);
                    break;

                case 'jurisdiction':
                    setText(el, cfg.legalJurisdiction);
                    break;

                case 'refund-days':
                    setText(el, cfg.refundDays);
                    break;

                case 'email':
                    el.setAttribute('href', cfg.mailto(el.getAttribute('data-subject')));
                    // Only fill the label when the author left it empty, so
                    // "Contact us" style links keep their own wording.
                    if (!el.textContent.trim()) setText(el, cfg.supportEmail);
                    break;

                case 'checkout':
                    el.setAttribute('href', cfg.checkoutUrl);
                    break;

                case 'site':
                    var site = cfg.resolvedSiteUrl();
                    el.setAttribute('href', site || '/');
                    if (!el.textContent.trim()) {
                        setText(el, site.replace(/^https?:\/\//, ''));
                    }
                    break;

                case 'site-host':
                    setText(el, cfg.resolvedSiteUrl().replace(/^https?:\/\//, ''));
                    break;

                case 'extension':
                    if (cfg.extensionUrl) {
                        el.setAttribute('href', cfg.extensionUrl);
                    } else if (el.parentNode) {
                        el.parentNode.removeChild(el);
                    }
                    break;

                case 'year':
                    setText(el, new Date().getFullYear());
                    break;

                // Drag-to-bookmarks-bar shortcut. Built at runtime from the
                // current origin so it points at whatever domain this copy of
                // the app is served from.
                case 'bookmarklet':
                    el.setAttribute(
                        'href',
                        "javascript:(function(){window.open('" + cfg.resolvedSiteUrl() +
                        "/?url='+encodeURIComponent(location.href),'_blank');})();"
                    );
                    break;

                // "Share on X" — text and target URL both follow the config.
                case 'share-x':
                    var msg = (el.getAttribute('data-message') || 'Just got {{brand}}')
                        .replace(/\{\{brand\}\}/g, cfg.brandName);
                    el.setAttribute(
                        'href',
                        'https://twitter.com/intent/tweet?text=' +
                        encodeURIComponent(msg + ' ' + cfg.resolvedSiteUrl() + '/sell')
                    );
                    break;

                default:
                    break;
            }
        }

        // <title> and any element that opted into brand templating.
        if (document.title.indexOf('{{brand}}') !== -1) {
            document.title = document.title.replace(/\{\{brand\}\}/g, cfg.brandName);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', apply);
    } else {
        apply();
    }
})();
