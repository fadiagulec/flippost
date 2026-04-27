// share.js — public viewer for shared FlipIt outputs.
// Reads { twisted, hook, original?, platform? } from the ?d= URL param
// (base64-encoded JSON), renders it cleanly, and pushes a "make your own"
// CTA at the bottom. Stateless — no server, no DB.

(function () {
    'use strict';

    const PLATFORM_EMOJI = {
        instagram: '\u{1F4F7}',
        tiktok: '\u{1F3B5}',
        youtube: '▶️',
        linkedin: '\u{1F4BC}',
        facebook: '\u{1F4F5}',
        x: '\u{1F426}',
        twitter: '\u{1F426}',
        threads: '\u{1F9F5}'
    };

    function escapeHtml(text) {
        const d = document.createElement('div');
        d.textContent = text == null ? '' : String(text);
        return d.innerHTML;
    }

    // URL-safe base64 → bytes → utf-8 string → JSON
    function decodePayload(b64) {
        try {
            // url-safe → standard base64
            let s = b64.replace(/-/g, '+').replace(/_/g, '/');
            const pad = s.length % 4;
            if (pad) s += '='.repeat(4 - pad);
            const bin = atob(s);
            const bytes = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
            const json = new TextDecoder('utf-8').decode(bytes);
            return JSON.parse(json);
        } catch (e) {
            console.error('Decode failed:', e);
            return null;
        }
    }

    function renderError(reason) {
        const container = document.getElementById('shareContainer');
        if (!container) return;
        container.innerHTML = '';
        const box = document.createElement('div');
        box.className = 'error-box';
        const h2 = document.createElement('h2');
        h2.textContent = '❔ This flip link is broken';
        box.appendChild(h2);
        const p = document.createElement('p');
        p.textContent = reason || 'The link is missing data or has been corrupted.';
        box.appendChild(p);
        const a = document.createElement('a');
        a.href = '/';
        a.textContent = '→ Make your own viral flip free';
        box.appendChild(a);
        container.appendChild(box);
    }

    function buildReshareLinks(shareUrl, hook) {
        const text = encodeURIComponent((hook || 'A viral flip made with FlipIt') + ' ' + shareUrl);
        const urlEnc = encodeURIComponent(shareUrl);
        return [
            {
                label: '\u{1D54F} Share on X',
                href: 'https://twitter.com/intent/tweet?text=' + text
            },
            {
                label: '\u{1F4F1} Share on Threads',
                href: 'https://threads.net/intent/post?text=' + text
            },
            {
                label: '\u{1F4BC} Share on LinkedIn',
                href: 'https://www.linkedin.com/sharing/share-offsite/?url=' + urlEnc
            },
            {
                label: '\u{1F4CB} Copy link',
                href: '#',
                copy: shareUrl
            }
        ];
    }

    function render(payload) {
        const container = document.getElementById('shareContainer');
        if (!container) return;
        container.innerHTML = '';

        const platformLabel = payload.platform && PLATFORM_EMOJI[payload.platform.toLowerCase()]
            ? PLATFORM_EMOJI[payload.platform.toLowerCase()] + ' ' + payload.platform.toUpperCase()
            : '';

        // Hero
        const hero = document.createElement('div');
        hero.className = 'share-hero';
        const badge = document.createElement('span');
        badge.className = 'badge';
        badge.textContent = '\u{1F525} Made with FlipIt';
        hero.appendChild(badge);
        const h1 = document.createElement('h1');
        h1.textContent = 'A viral flip, ready to post';
        hero.appendChild(h1);
        const sub = document.createElement('p');
        sub.textContent = 'Someone used FlipIt to turn a viral post into this scroll-stopping script. You can make your own free.';
        hero.appendChild(sub);
        container.appendChild(hero);

        // Card with the flip
        const card = document.createElement('div');
        card.className = 'share-card';

        if (payload.hook) {
            const hookHeader = document.createElement('h3');
            hookHeader.textContent = '\u{1F3AF} The Hook';
            card.appendChild(hookHeader);
            const hookEl = document.createElement('div');
            hookEl.className = 'flip-hook';
            hookEl.textContent = payload.hook;
            card.appendChild(hookEl);
        }

        if (payload.twisted) {
            const flipHeader = document.createElement('h3');
            flipHeader.textContent = '✨ The Flipped Script';
            card.appendChild(flipHeader);
            const flipEl = document.createElement('div');
            flipEl.className = 'flip-text';
            flipEl.textContent = payload.twisted;
            card.appendChild(flipEl);
        }

        if (platformLabel) {
            const tag = document.createElement('div');
            tag.className = 'platform-tag';
            tag.textContent = 'Original platform: ' + platformLabel;
            card.appendChild(tag);
        }

        container.appendChild(card);

        // CTA
        const cta = document.createElement('div');
        cta.className = 'cta-section';
        const h2 = document.createElement('h2');
        h2.textContent = 'Make your own viral flip';
        cta.appendChild(h2);
        const p = document.createElement('p');
        p.textContent = 'Paste any social media URL and FlipIt rewrites it with a fresh angle in 60 seconds. 7 days free, no signup.';
        cta.appendChild(p);
        const btn = document.createElement('a');
        btn.href = '/?ref=share';
        btn.className = 'cta-btn';
        btn.textContent = '\u{1F680} Try FlipIt Free';
        cta.appendChild(btn);

        const reshareWrap = document.createElement('div');
        reshareWrap.className = 'reshare';
        const shareUrl = window.location.href;
        const reshares = buildReshareLinks(shareUrl, payload.hook || payload.twisted);
        reshares.forEach(r => {
            const a = document.createElement('a');
            a.textContent = r.label;
            if (r.copy) {
                a.href = '#';
                a.addEventListener('click', (e) => {
                    e.preventDefault();
                    if (navigator.clipboard && navigator.clipboard.writeText) {
                        navigator.clipboard.writeText(r.copy).then(() => {
                            a.textContent = '✅ Copied!';
                            setTimeout(() => { a.textContent = r.label; }, 2000);
                        }).catch(() => {});
                    }
                });
            } else {
                a.href = r.href;
                a.target = '_blank';
                a.rel = 'noopener';
            }
            reshareWrap.appendChild(a);
        });
        cta.appendChild(reshareWrap);

        container.appendChild(cta);
    }

    // ── Boot ──────────────────────────────────────────────
    function boot() {
        const params = new URLSearchParams(window.location.search);
        const data = params.get('d');
        if (!data) {
            renderError('No flip data in the URL.');
            return;
        }
        const payload = decodePayload(data);
        if (!payload || (typeof payload.twisted !== 'string' && typeof payload.hook !== 'string')) {
            renderError('Could not decode this flip — the link may be truncated.');
            return;
        }
        render(payload);

        // Update document title with hook if available
        if (payload.hook) {
            const t = payload.hook.length > 60 ? payload.hook.slice(0, 57) + '...' : payload.hook;
            document.title = t + ' — FlipIt';
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();
