// Backend URLs — all endpoints are now Netlify Functions (no external Railway dependency).
const EXTRACT_URL = '/.netlify/functions/extract-and-twist';

// Platform detection patterns
const platformPatterns = {
    instagram: /instagram\.com|instagr\.am/i,
    tiktok: /tiktok\.com|vm\.tiktok|vt\.tiktok/i,
    youtube: /youtube\.com|youtu\.be/i,
    linkedin: /linkedin\.com/i,
    facebook: /facebook\.com|fb\.watch/i,
    x: /twitter\.com|x\.com/,
    threads: /threads\.net/i
};

const platformEmojis = {
    instagram: '\u{1F4F7}',
    tiktok: '\u{1F3B5}',
    youtube: '\u25B6\uFE0F',
    linkedin: '\u{1F4BC}',
    facebook: '\u{1F4F5}',
    x: '\u{1F426}',
    threads: '\u{1F9F5}'
};


// ── ACCESS GATING (FlipItAccess from access.js) ─────────────
// Returns true if user can flip; otherwise shows paywall and returns false.
function gateOrPaywall() {
    if (!window.FlipItAccess) return true; // safety: lib not loaded, allow
    window.FlipItAccess.markFirstUseIfMissing();
    const state = window.FlipItAccess.getState();
    if (state.canFlip) return true;
    showPaywallModal(state);
    return false;
}

function recordFlipSuccess() {
    if (window.FlipItAccess) window.FlipItAccess.recordFlip();
    renderTrialBanner();
}

// Single-tier pricing: $57 lifetime (anchored against $99), one-time, no subs.
// Stripe link VERIFIED 2026-07-05 to charge $57.00 for the "FlipIt Pro"
// product (live checkout page confirmed). Price matches the UI everywhere.
const STRIPE_LIFETIME_LINK = 'https://buy.stripe.com/28EcMY83I1XYd2i5r83Je0q';

// `reason`: 'flip_cap' (default \u2014 used 3/day) | 'pro_feature' (clicked
// Image Prompts / Video Prompts / Vision while on free tier) | 'pro_cap'
// (Pro user hit daily/monthly cap).
function showPaywallModal(state, reason) {
    let modal = document.getElementById('flipit-paywall');
    if (modal) modal.remove();
    modal = document.createElement('div');
    modal.id = 'flipit-paywall';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:9999;padding:20px;overflow-y:auto;';
    const card = document.createElement('div');
    card.style.cssText = 'background:#fff;border-radius:16px;padding:36px 32px;max-width:480px;width:100%;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,0.4);position:relative;';

    const isProCap = reason === 'pro_cap' || (state && state.isPro && (state.proCapHit === 'daily' || state.proCapHit === 'monthly'));
    const isProFeature = reason === 'pro_feature';

    const h3 = document.createElement('h3');
    h3.style.cssText = 'font-size:24px;color:#1a1a2e;margin:0 0 12px;line-height:1.3;';
    const p1 = document.createElement('p');
    p1.style.cssText = 'color:#555;margin:0 0 24px;line-height:1.5;';

    if (isProCap) {
        if (state.proCapHit === 'monthly') {
            h3.textContent = '\u{1F525} You\u2019ve hit this month\u2019s 1,000-flip cap';
            p1.textContent = `You\u2019ve used ${state.proMonthlyCount} of ${state.proMonthlyLimit} flips this month \u2014 you\u2019re in the top 1% of users. Resets next month. Need a custom plan? Reply to your purchase email.`;
        } else {
            h3.textContent = '\u{1F525} You\u2019ve hit today\u2019s 50-flip Pro cap';
            p1.textContent = `You\u2019ve used ${state.proDailyCount} of ${state.proDailyLimit} flips today \u2014 thank you for being a power user! Resets at midnight. Need a higher cap? Reply to your purchase email.`;
        }
    } else if (isProFeature) {
        h3.textContent = '\u{1F512} That\u2019s a Pro tool';
        p1.textContent = 'You found one of the heavy hitters. Unlock the full FlipIt pipeline below \u2014 one payment, yours forever.';
    } else {
        h3.textContent = '\u26A1 Unlock FlipIt to start flipping';
        p1.textContent = 'One payment, yours forever \u2014 every tool below, no subscription.';
    }

    card.appendChild(h3);
    card.appendChild(p1);

    if (isProCap) {
        // Pro user hit a cap \u2014 they already paid, don't show pricing again
        const mail = document.createElement('a');
        mail.href = 'mailto:contact@earnwith-ai.com?subject=FlipIt%20Custom%20Plan';
        mail.style.cssText = 'display:inline-block;background:linear-gradient(135deg,#0d6e66,#0a9b8e);color:#fff;text-decoration:none;padding:14px 32px;border-radius:10px;font-weight:700;font-size:16px;margin-bottom:8px;';
        mail.textContent = '\u{1F4E7} Contact about a custom plan';
        card.appendChild(mail);
    } else {
        // Value stack: sell the transformation + the bonus, not a tab list.
        const stack = document.createElement('ul');
        stack.style.cssText = 'list-style:none;text-align:left;margin:0 auto 20px;max-width:360px;padding:0;';
        [
            ['\u267E\uFE0F', '<strong>Unlimited</strong> flips, rewrites, remixes, transcripts &amp; scores (fair use)'],
            ['\u2B07\uFE0F', '<strong>Download + clean any video</strong> \u2014 no watermarks, erase handles, grab scenes'],
            ['\u26A1', '<strong>ViralScore + Brand Voice</strong> \u2014 score every post, flip it in your own voice'],
            ['\u{1F3A8}', '<strong>Image &amp; video prompts + trending finder</strong> \u2014 the whole toolkit'],
            ['\u{1F381}', '<strong>Creator Vault included</strong> \u2014 100 proven hooks + posting playbook'],
            ['\u{1F6E1}\uFE0F', '<strong>30-day money-back guarantee</strong> \u2014 not for you? Full refund']
        ].forEach(([icon, html]) => {
            const li = document.createElement('li');
            li.style.cssText = 'display:flex;gap:10px;align-items:flex-start;margin-bottom:10px;font-size:14px;color:#444;line-height:1.45;';
            const ic = document.createElement('span');
            ic.textContent = icon;
            const tx = document.createElement('span');
            tx.innerHTML = html; // static strings above, no user input
            li.appendChild(ic);
            li.appendChild(tx);
            stack.appendChild(li);
        });
        card.appendChild(stack);

        // Single CTA: $57 lifetime, one-time payment (anchored against $99)
        const a = document.createElement('a');
        a.href = STRIPE_LIFETIME_LINK;
        a.target = '_blank';
        a.rel = 'noopener';
        a.style.cssText = 'display:inline-block;background:linear-gradient(135deg,#0d6e66,#0a9b8e);color:#fff;text-decoration:none;padding:16px 36px;border-radius:10px;font-weight:700;font-size:17px;margin-bottom:12px;';
        a.innerHTML = '\u26A1 Unlock FlipIt \u2014 <s style="opacity:0.65;font-weight:600;">$99</s> $57 Lifetime';
        card.appendChild(a);
        const trust = document.createElement('p');
        trust.style.cssText = 'color:#888;font-size:13px;margin:8px 0 0;line-height:1.5;';
        trust.textContent = 'One-time payment \u00B7 No subscription \u00B7 All future updates included';
        card.appendChild(trust);
        const restore = document.createElement('p');
        restore.style.cssText = 'color:#aaa;font-size:12px;margin:10px 0 0;';
        restore.innerHTML = 'Already bought? Open the receipt link from your purchase email to restore access, or <a href="mailto:contact@earnwith-ai.com?subject=Restore%20my%20FlipIt%20Pro" style="color:#0d6e66;">email us</a>.';
        card.appendChild(restore);
    }

    const closeBtn = document.createElement('button');
    closeBtn.textContent = '\u2715';
    closeBtn.setAttribute('aria-label', 'Close');
    closeBtn.style.cssText = 'position:absolute;top:12px;right:14px;background:none;border:none;color:#999;font-size:24px;cursor:pointer;line-height:1;padding:4px 8px;';
    closeBtn.addEventListener('click', () => { modal.style.display = 'none'; });
    card.appendChild(closeBtn);
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.style.display = 'none'; });
    modal.appendChild(card);
    document.body.appendChild(modal);
}

// Pro-feature gate: like gateOrPaywall() but ALSO rejects free users
// regardless of their daily-flip count. Used by Image Prompts, Video
// Prompts, and any other paid-tier-only feature.
function gateProFeature() {
    if (!window.FlipItAccess) return true;
    const state = window.FlipItAccess.getState();
    if (state.isPro && state.canFlip) return true;
    if (state.isPro && !state.canFlip) {
        // Pro user hit a cap \u2014 show the cap modal
        showPaywallModal(state, 'pro_cap');
        return false;
    }
    // Free user \u2014 block + show upgrade modal
    showPaywallModal(state, 'pro_feature');
    return false;
}

function renderTrialBanner() {
    if (!window.FlipItAccess) return;
    const state = window.FlipItAccess.getState();
    const existing = document.getElementById('flipit-trial-banner');
    if (existing) existing.remove();
    if (state.isPro) return; // pro users skip banner
    const banner = document.createElement('div');
    banner.id = 'flipit-trial-banner';
    banner.style.cssText = 'background:linear-gradient(135deg,#fff8e1,#fff3c4);border-bottom:1px solid #e8c840;padding:10px 16px;text-align:center;font-size:14px;color:#5a4a00;line-height:1.4;';

    const strongEl = document.createElement('strong');
    const numSpan = document.createElement('span');

    strongEl.textContent = 'FlipIt Pro';
    banner.append(
        '\u26a1 ',
        strongEl,
        ' \u2014 one payment, lifetime access, every tool unlocked. '
    );
    void numSpan;

    const ctaLink = document.createElement('a');
    ctaLink.href = 'https://buy.stripe.com/28EcMY83I1XYd2i5r83Je0q';
    ctaLink.target = '_blank';
    ctaLink.rel = 'noopener';
    ctaLink.style.cssText = 'color:#0d6e66;font-weight:700;text-decoration:none;border-bottom:1px solid #0d6e66;';
    ctaLink.textContent = 'Lock in $57 lifetime \u2192';
    banner.appendChild(ctaLink);

    document.body.insertBefore(banner, document.body.firstChild);
}

// Render banner on page load
if (typeof window !== 'undefined' && document.readyState !== 'loading') {
    renderTrialBanner();
} else if (typeof window !== 'undefined') {
    document.addEventListener('DOMContentLoaded', renderTrialBanner);
}

// Initialize tab navigation
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const tabName = btn.getAttribute('data-tab');
        switchTab(tabName);
    });
});

function switchTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    const content = document.getElementById(tabName);
    if (content) content.classList.add('active');
    const btn = document.querySelector(`[data-tab="${tabName}"]`);
    if (btn) btn.classList.add('active');
    // Two-tier nav: reveal the top-level page that owns this tab, so every
    // path here — tab click, page button, #hash deep-link, or a cross-tab
    // handoff like "Flip This" → url-tab — lands the user on the right page.
    revealPageForTab(tabName);
}

// Maps each tool tab to its top-level page (Flip / Discover / Tools).
const TAB_TO_PAGE = {
    'url-tab': 'flip', 'analyze-tab': 'flip', 'script-tab': 'flip', 'transcribe-tab': 'flip', 'score-tab': 'flip',
    'trending-tab': 'discover', 'instagram-tab': 'discover', 'ideas-tab': 'discover',
    'imgprompt-tab': 'tools', 'eraser-tab': 'tools', 'scenes-tab': 'tools', 'history-tab': 'tools'
};
function revealPageForTab(tabName) {
    const page = TAB_TO_PAGE[tabName];
    if (!page) return;
    document.querySelectorAll('.tool-row').forEach(row => {
        row.style.display = row.getAttribute('data-page-row') === page ? '' : 'none';
    });
    document.querySelectorAll('.page-btn').forEach(pb => {
        pb.classList.toggle('active', pb.getAttribute('data-page') === page);
    });
}

// Page buttons: clicking a page shows its tools and jumps to its first tool.
// We .click() the first tool button (rather than calling switchTab directly)
// so it also fires the hash-router listener and keeps the URL in sync.
document.querySelectorAll('.page-btn').forEach(pb => {
    pb.addEventListener('click', () => {
        const page = pb.getAttribute('data-page');
        const firstTab = document.querySelector(`.tool-row[data-page-row="${page}"] .tab-btn`);
        if (firstTab) firstTab.click();
    });
});

// Detect platform from URL
function detectPlatform(url) {
    for (const [platform, pattern] of Object.entries(platformPatterns)) {
        if (pattern.test(url)) {
            return platform;
        }
    }
    return null;
}

// Show platform badge
// IMPORTANT: never hide #actionButtons. The Flip button is the primary CTA and
// must always be visible so the user knows it exists. Validation on click in
// handleExtractAndTwist handles empty / unrecognized URLs with a friendly error.
function showPlatformBadge(url) {
    const platform = detectPlatform(url);
    const badge = document.getElementById('platformBadge');
    document.getElementById('actionButtons').style.display = 'flex';

    if (platform) {
        badge.textContent = `${platformEmojis[platform]} ${platform.toUpperCase()} detected`;
        badge.style.cssText = 'display:inline-block;background:#e8f4f3;color:#0d6e66;padding:6px 12px;border-radius:8px;font-weight:600;font-size:14px;margin-top:8px;';
        return platform;
    } else {
        // Special-case the owner-only /unlock/ link so the owner doesn't get
        // stuck trying to "Flip" their own Pro unlock URL.
        const isUnlockUrl = /^https?:\/\/[^/]*flipit\.earnwith-ai\.com\/unlock\//i.test(url)
            || url.startsWith('/unlock/');
        if (isUnlockUrl) {
            badge.innerHTML = '⚠️ That\'s your Pro <strong>unlock link</strong> — paste it into your <strong>browser\'s address bar</strong> (top of the window), not here. This box is for Instagram/TikTok/YouTube post URLs.';
            badge.style.cssText = 'display:block;background:#fff4e0;color:#8a5a00;padding:10px 14px;border-radius:8px;font-size:14px;margin-top:8px;line-height:1.5;border-left:3px solid #e0a020;';
        } else {
            badge.innerHTML = 'ℹ️ Paste a post URL from Instagram, TikTok, YouTube, LinkedIn, Facebook, X, or Threads.';
            badge.style.cssText = 'display:block;background:#f3f2ee;color:#666;padding:10px 14px;border-radius:8px;font-size:13px;margin-top:8px;line-height:1.5;';
        }
        return null;
    }
}

// URL Input Event Listener
document.getElementById('urlInput').addEventListener('input', (e) => {
    const url = e.target.value.trim();
    // Always keep the Flip button visible — only adjust the badge/hint.
    document.getElementById('actionButtons').style.display = 'flex';
    if (url) {
        showPlatformBadge(url);
    } else {
        document.getElementById('platformBadge').style.display = 'none';
    }
});

// ── DOWNLOAD MEDIA ──────────────────────────────────────
const DOWNLOAD_URL = '/.netlify/functions/download';

// Sniff a media file's true type from the first bytes. Returns
// { mime, ext } or null if unrecognized.
function sniffMediaType(bytes) {
    if (!bytes || bytes.length < 12) return null;
    if (bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) {
        const brand = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);
        if (brand.startsWith('qt')) return { mime: 'video/quicktime', ext: '.mov' };
        return { mime: 'video/mp4', ext: '.mp4' };
    }
    if (bytes[0] === 0x1A && bytes[1] === 0x45 && bytes[2] === 0xDF && bytes[3] === 0xA3) {
        return { mime: 'video/webm', ext: '.webm' };
    }
    if (bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) return { mime: 'image/jpeg', ext: '.jpg' };
    if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) return { mime: 'image/png', ext: '.png' };
    if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) return { mime: 'image/gif', ext: '.gif' };
    if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
        bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
        return { mime: 'image/webp', ext: '.webp' };
    }
    return null;
}

// iOS Safari ignores <a download> entirely — a programmatic click on a
// download link either navigates to the blob URL (opening the video as a
// page) or silently does nothing. The only reliable way to "save" media on
// iOS is to render it inline so the user can long-press → Save to Photos
// / Save Image. Snaptik, Savefrom, etc. all use this pattern on iPhone.
function isIOS() {
    if (typeof navigator === 'undefined') return false;
    const ua = navigator.userAgent || '';
    // iPadOS 13+ identifies as macOS; detect by touch + platform.
    const iPadOS = /Mac/i.test(navigator.platform || '') && navigator.maxTouchPoints > 1;
    return /iPad|iPhone|iPod/.test(ua) || iPadOS;
}

// Show a modal containing the media (video or image) with explicit
// long-press-to-save instructions. Used on iOS where <a download> is broken.
function showIOSSaveModal(blobUrl, mime, suggestedFilename) {
    const isVideo = /^video\//i.test(mime);
    const isImage = /^image\//i.test(mime);

    let modal = document.getElementById('flipit-ios-save');
    if (modal) modal.remove();
    modal = document.createElement('div');
    modal.id = 'flipit-ios-save';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);display:flex;align-items:center;justify-content:center;z-index:9999;padding:16px;overflow-y:auto;';

    const card = document.createElement('div');
    card.style.cssText = 'background:#fff;border-radius:18px;padding:20px;max-width:420px;width:100%;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,0.5);position:relative;';

    const h3 = document.createElement('h3');
    h3.style.cssText = 'font-size:18px;color:#1a1a2e;margin:0 0 6px;line-height:1.3;';
    h3.textContent = isVideo ? '🎬 Your video is ready' : '🖼️ Your image is ready';
    card.appendChild(h3);

    const tip = document.createElement('p');
    tip.style.cssText = 'color:#555;margin:0 0 16px;font-size:14px;line-height:1.5;';
    tip.innerHTML = isVideo
        ? '<strong>Long-press the video below</strong> → <strong>"Save to Photos"</strong>.<br>iOS blocks one-click downloads — this is the only way.'
        : '<strong>Long-press the image below</strong> → <strong>"Save to Photos"</strong>.';
    card.appendChild(tip);

    if (isVideo) {
        const vid = document.createElement('video');
        vid.src = blobUrl;
        vid.controls = true;
        vid.setAttribute('playsinline', '');
        vid.setAttribute('webkit-playsinline', '');
        vid.style.cssText = 'width:100%;max-width:380px;border-radius:12px;background:#000;margin-bottom:12px;';
        card.appendChild(vid);
    } else if (isImage) {
        const img = document.createElement('img');
        img.src = blobUrl;
        img.alt = 'Tap and hold to save';
        img.style.cssText = 'width:100%;max-width:380px;border-radius:12px;margin-bottom:12px;';
        card.appendChild(img);
    }

    // Fallback: a regular link in case long-press doesn't surface Save (some
    // 3rd party iOS browsers like Firefox iOS). Tapping it at least opens the
    // media so the user can use the browser's own share menu.
    const fallback = document.createElement('a');
    fallback.href = blobUrl;
    fallback.target = '_blank';
    fallback.rel = 'noopener';
    fallback.style.cssText = 'display:inline-block;color:#0d6e66;text-decoration:underline;font-size:13px;margin-bottom:8px;';
    fallback.textContent = isVideo ? 'Or tap here to open the video' : 'Or tap here to open the image';
    card.appendChild(fallback);

    const close = document.createElement('button');
    close.textContent = 'Done';
    close.style.cssText = 'display:block;width:100%;background:linear-gradient(135deg,#0d6e66,#0a9b8e);color:#fff;border:none;padding:14px;border-radius:10px;font-weight:700;font-size:15px;cursor:pointer;margin-top:8px;';
    close.addEventListener('click', () => modal.remove());
    card.appendChild(close);

    modal.appendChild(card);
    document.body.appendChild(modal);
}

// Trigger a save on desktop (programmatic <a download> click) OR on iOS
// (long-press modal). Centralizes the iOS branching so callers don't repeat
// the userAgent check.
function triggerSave(blobUrl, mime, filename) {
    if (isIOS()) {
        showIOSSaveModal(blobUrl, mime, filename);
        return;
    }
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

// Force-download a file from URL. Tries direct fetch first (works for
// CORS-friendly sources like Cobalt tunnels). If that fails (LinkedIn /
// Twitter CDN block CORS), falls back to a same-origin server-side proxy
// that forces Content-Disposition: attachment so the browser actually
// downloads instead of opening the file in a new tab.
async function forceDownload(mediaUrl, filename) {
    // Attempt 1: direct fetch + blob (CORS-friendly URLs)
    try {
        const res = await fetch(mediaUrl);
        if (!res.ok) throw new Error('HTTP ' + res.status);

        const buf = await res.arrayBuffer();
        if (!buf || buf.byteLength < 1024) throw new Error('response too small');

        const bytes = new Uint8Array(buf);
        const sniffed = sniffMediaType(bytes);
        const headerType = (res.headers.get('Content-Type') || '').toLowerCase();

        if (!sniffed && (headerType.startsWith('text/') || headerType.includes('json'))) {
            throw new Error('server returned ' + headerType + ' instead of media');
        }

        const mime = sniffed ? sniffed.mime : (headerType.split(';')[0] || 'application/octet-stream');
        let finalName = filename || 'flipit-media';
        if (sniffed) finalName = finalName.replace(/\.[a-z0-9]{2,4}$/i, '') + sniffed.ext;

        const blob = new Blob([bytes], { type: mime });
        const blobUrl = URL.createObjectURL(blob);
        triggerSave(blobUrl, mime, finalName);
        // Keep blob alive long enough for iOS modal user to long-press save.
        setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
        return true;
    } catch (directErr) {
        console.warn('Direct fetch failed:', directErr.message, '— trying server proxy');
    }

    // Attempt 2: same-origin proxy (forces Content-Disposition: attachment).
    // The proxy fetches the URL server-side and streams it back, so CORS
    // doesn't block us and the browser is forced to download.
    try {
        const proxyUrl = '/.netlify/functions/proxy-download?url=' + encodeURIComponent(mediaUrl) +
                         (filename ? '&filename=' + encodeURIComponent(filename) : '');
        const res = await fetch(proxyUrl);
        if (res.status === 413) throw new Error('File too large to proxy — try a shorter clip');
        if (!res.ok) throw new Error('proxy HTTP ' + res.status);

        const buf = await res.arrayBuffer();
        if (!buf || buf.byteLength < 1024) throw new Error('proxy response too small');

        const bytes = new Uint8Array(buf);
        const sniffed = sniffMediaType(bytes);
        const headerType = (res.headers.get('Content-Type') || '').toLowerCase();
        const mime = sniffed ? sniffed.mime : (headerType.split(';')[0] || 'application/octet-stream');

        let finalName = filename || 'flipit-media';
        if (sniffed) finalName = finalName.replace(/\.[a-z0-9]{2,4}$/i, '') + sniffed.ext;

        const blob = new Blob([bytes], { type: mime });
        const blobUrl = URL.createObjectURL(blob);
        triggerSave(blobUrl, mime, finalName);
        setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
        return true;
    } catch (proxyErr) {
        console.error('Proxy download failed:', proxyErr.message);
        throw proxyErr;
    }
}

document.getElementById('downloadBtn').addEventListener('click', handleDownload);

// ── ERASER TAB: upload a video file directly, no URL needed ───────────
// Same draw-to-erase modal as the post-download flow — we just feed it
// the uploaded file instead of a Railway-returned blob.
(function wireEraserTab() {
    const fileInput = document.getElementById('eraserFile');
    const drop = document.getElementById('eraserDrop');
    const status = document.getElementById('eraserStatus');
    if (!fileInput || !drop || !status) return;

    const MAX_BYTES = 18 * 1024 * 1024; // matches the Railway endpoint cap

    function setStatus(msg, ok) {
        status.textContent = msg || '';
        status.style.color = ok === false ? '#c2185b' : (ok === true ? '#0d6e66' : '#555');
    }

    // Same-origin proxy → Railway. Going through Netlify Functions avoids
    // browser-side failures ("Failed to fetch") that happen when a network
    // or extension blocks *.up.railway.app directly.
    const RAILWAY_PREPARE_URL = '/.netlify/functions/transcode-eraser-video';

    async function handleFile(file) {
        if (!file) return;
        const isImage = /^image\//i.test(file.type) || /\.(jpg|jpeg|png|webp|gif)$/i.test(file.name);
        const isVideo = /^video\//i.test(file.type) || /\.(mp4|mov|m4v|webm)$/i.test(file.name);
        if (!isImage && !isVideo) {
            setStatus('That doesn\'t look like a video or image. Try MP4/MOV/WebM, or JPG/PNG/WebP.', false);
            return;
        }
        if (file.size > MAX_BYTES) {
            setStatus(`File is ${(file.size/1048576).toFixed(1)} MB — please use one under 18 MB.`, false);
            return;
        }
        setStatus(isImage ? '⏳ Reading image…' : '⏳ Reading video…', null);
        try {
            const buf = await file.arrayBuffer();
            const bytes = new Uint8Array(buf);
            // Chunked base64 encode — atob/btoa choke on 18MB strings on
            // some mobile browsers, so we encode 64KB at a time.
            let binStr = '';
            const CHUNK = 0x8000;
            for (let i = 0; i < bytes.length; i += CHUNK) {
                binStr += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
            }
            const rawBase64 = btoa(binStr);
            const baseName = (file.name || 'eraser-input').replace(/\.[a-z0-9]{2,4}$/i, '');

            // ── IMAGE BRANCH ────────────────────────────────────────
            // Images skip the transcode step entirely — every browser
            // already knows how to render JPG/PNG/WebP/GIF, so we go
            // straight to the modal with the raw bytes.
            if (isImage) {
                const mime = file.type || 'image/jpeg';
                window._lastDownloadedVideo = {
                    base64: rawBase64,
                    mime,
                    ext: '.png',
                    filename: baseName + '.png',
                    kind: 'image'
                };
                setStatus('✅ Image loaded · opening eraser…', true);
                openEraseModal();
                return;
            }

            // ── VIDEO BRANCH ────────────────────────────────────────
            // ALWAYS transcode through Railway before opening the modal.
            // iPhone .mov is HEVC which desktop Chrome/Firefox can't decode
            // in <video>, so without this step the preview is black on every
            // non-Safari browser. ffmpeg → H.264 MP4 plays everywhere.
            setStatus('⏳ Converting video for preview (this takes 5–15s, normal)…', null);
            let previewBase64 = rawBase64;
            let previewMime = file.type || 'video/mp4';
            let transcoded = false;
            let transcodeErr = '';
            try {
                const data = await postHeavyJob('/prepare-eraser', RAILWAY_PREPARE_URL, { videoData: rawBase64 });
                if (data.success && data.videoData) {
                    previewBase64 = data.videoData;
                    previewMime = data.mime || 'video/mp4';
                    transcoded = true;
                } else {
                    transcodeErr = data.error || 'unknown';
                    console.warn('Transcode failed, using original:', transcodeErr, data.detail || '');
                }
            } catch (xErr) {
                transcodeErr = xErr.message || 'network error';
                console.warn('Transcode request failed, using original:', transcodeErr);
            }

            window._lastDownloadedVideo = {
                base64: previewBase64,
                mime: previewMime,
                ext: '.mp4',
                filename: baseName + '.mp4',
                kind: 'video'
            };
            if (transcoded) {
                setStatus(`✅ Converted to H.264 · opening eraser…`, true);
            } else {
                setStatus(`⚠️ Couldn't convert (${transcodeErr.slice(0, 80)}) — preview may be black, but erasure still works. Opening…`, false);
            }
            openEraseModal();
        } catch (err) {
            console.error('Eraser file load failed:', err);
            setStatus('❌ Could not read that file. Try a different one.', false);
        }
    }

    fileInput.addEventListener('change', (e) => {
        const f = e.target.files && e.target.files[0];
        // Reset value so picking the same file twice re-fires change.
        fileInput.value = '';
        handleFile(f);
    });

    // Drag & drop support (no-op on touch devices, harmless).
    ['dragenter', 'dragover'].forEach((ev) => {
        drop.addEventListener(ev, (e) => {
            e.preventDefault();
            e.stopPropagation();
            drop.style.background = '#e8f4f3';
        });
    });
    ['dragleave', 'drop'].forEach((ev) => {
        drop.addEventListener(ev, (e) => {
            e.preventDefault();
            e.stopPropagation();
            drop.style.background = '#f7fbfa';
        });
    });
    drop.addEventListener('drop', (e) => {
        const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        handleFile(f);
    });
})();

// ── ERASE AREAS (advanced watermark removal) ──────────────────────────
// After a Railway base64 download succeeds, surface a button that opens a
// modal where the user can drag rectangles over a video preview to mark
// watermarks / handles / logos. Selected boxes are sent to the Railway
// /erase-region endpoint (via postHeavyJob) which runs ffmpeg's delogo
// filter over each.

function showEraseAreasButton() {
    const host = document.getElementById('errorMessage');
    if (!host) return;
    const existing = document.getElementById('eraseAreasBtn');
    if (existing) existing.remove();
    const btn = document.createElement('button');
    btn.id = 'eraseAreasBtn';
    btn.type = 'button';
    btn.textContent = '🎯 Erase watermarks / names from this video';
    btn.style.cssText = 'display:block;margin:10px auto 0;background:#fff;color:#0d6e66;border:2px solid #0d6e66;padding:10px 18px;border-radius:10px;font-weight:700;font-size:14px;cursor:pointer;';
    btn.addEventListener('mouseenter', () => { btn.style.background = '#0d6e66'; btn.style.color = '#fff'; });
    btn.addEventListener('mouseleave', () => { btn.style.background = '#fff'; btn.style.color = '#0d6e66'; });
    btn.addEventListener('click', openEraseModal);
    host.parentNode.insertBefore(btn, host.nextSibling);
}

function openEraseModal() {
    const v = window._lastDownloadedVideo;
    if (!v || !v.base64) {
        showError('No video loaded — download one first.', 'errorMessage');
        return;
    }

    // Reconstruct blob URL for preview from the saved base64
    const byteChars = atob(v.base64);
    const byteArr = new Uint8Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i++) byteArr[i] = byteChars.charCodeAt(i);
    const blob = new Blob([byteArr], { type: v.mime });
    const blobUrl = URL.createObjectURL(blob);

    let modal = document.getElementById('flipit-erase-modal');
    if (modal) modal.remove();
    modal = document.createElement('div');
    modal.id = 'flipit-erase-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.92);display:flex;align-items:center;justify-content:center;z-index:9999;padding:12px;overflow-y:auto;';

    const card = document.createElement('div');
    // Much wider card so the preview is actually usable. min(96vw, 880px)
    // gives a near-full-screen workspace on phone AND room for precise
    // drawing on desktop.
    card.style.cssText = 'background:#fff;border-radius:14px;padding:18px;width:min(96vw,1000px);max-height:96vh;overflow-y:auto;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,0.5);';

    const h3 = document.createElement('h3');
    h3.textContent = '🎯 Draw boxes over what to erase';
    h3.style.cssText = 'font-size:19px;color:#1a1a2e;margin:0 0 4px;';
    const sub = document.createElement('p');
    sub.innerHTML = 'Click and drag (or tap-drag on phone) over each watermark, handle, or burned-in name. You can draw multiple boxes. Tap <strong>Erase & Download</strong> when done.';
    sub.style.cssText = 'color:#555;font-size:14px;margin:0 0 14px;line-height:1.5;';
    card.appendChild(h3);
    card.appendChild(sub);

    // Stage: relatively positioned wrapper that holds the video AND the
    // canvas overlay aligned to the same pixel area. min(800px, 70vh, 96%)
    // keeps the stage big on desktop while never overflowing on phone.
    const isImageMode = v.kind === 'image';
    const stage = document.createElement('div');
    stage.style.cssText = 'position:relative;display:inline-block;width:100%;max-width:900px;max-height:82vh;background:#000;border-radius:10px;overflow:hidden;';
    // Use <img> for images, <video> for videos. Both fill the stage the same
    // way so the canvas-overlay math below works without branching.
    const vid = document.createElement(isImageMode ? 'img' : 'video');
    vid.src = blobUrl;
    if (!isImageMode) {
        vid.muted = true;
        vid.controls = true;
        vid.preload = 'auto';
        vid.setAttribute('playsinline', '');
        vid.setAttribute('webkit-playsinline', '');
    } else {
        vid.alt = 'image to erase';
    }
    vid.style.cssText = 'display:block;width:100%;height:auto;max-height:82vh;background:#000;';
    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;touch-action:none;cursor:crosshair;';
    // Hidden warning we'll surface only if the browser can't decode the
    // uploaded file (very common with iPhone HEVC .mov on desktop Chrome).
    const codecWarn = document.createElement('div');
    codecWarn.style.cssText = 'display:none;position:absolute;inset:0;background:rgba(0,0,0,0.78);color:#fff;padding:24px;text-align:left;font-size:14px;line-height:1.55;border-radius:10px;overflow-y:auto;';
    codecWarn.innerHTML = '⚠️ <strong>Preview not available for this video format</strong> '
        + '<span style="opacity:0.85;">(iPhone HEVC / unsupported codec on this browser).</span>'
        + '<br><br>You can still erase — but you\'ll need to draw boxes blind, using approximate position. '
        + 'For a better experience: open this page in <strong>Safari</strong> (which supports HEVC), or '
        + 'convert your video to <strong>MP4 H.264</strong> first.<br><br>'
        + '<span style="opacity:0.7;font-size:12px;">The erasure itself runs server-side and works with any format your browser uploaded successfully.</span>';
    stage.appendChild(vid);
    stage.appendChild(canvas);
    stage.appendChild(codecWarn);
    card.appendChild(stage);

    vid.addEventListener('error', () => { codecWarn.style.display = 'block'; });
    if (!isImageMode) {
        // Force-seek to first frame so we display SOMETHING instead of black
        // — many browsers don't auto-render frame 0 from a paused video.
        vid.addEventListener('loadedmetadata', () => {
            try { vid.currentTime = 0.05; } catch (e) {}
        });
    }

    const counter = document.createElement('div');
    counter.style.cssText = 'margin-top:8px;font-size:12px;color:#888;';
    counter.textContent = '0 boxes drawn';
    card.appendChild(counter);

    // Region store: each entry is normalized 0–1 against the video's
    // intrinsic dimensions (NOT the canvas pixel size), so the backend can
    // multiply by ffprobe-reported width/height regardless of display zoom.
    const regions = [];
    let drawing = null; // { x0, y0 } in canvas-display coords while dragging
    let dpr = window.devicePixelRatio || 1;

    function sizeCanvasToVideo() {
        const rect = stage.getBoundingClientRect();
        // Internal pixel buffer at devicePixelRatio so lines stay crisp on
        // hi-DPI mobile. Display CSS size is set via the inline style above.
        canvas.width = Math.round(rect.width * dpr);
        canvas.height = Math.round(rect.height * dpr);
        const ctx = canvas.getContext('2d');
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        redraw();
    }

    function redraw() {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const rect = stage.getBoundingClientRect();
        ctx.fillStyle = 'rgba(13,110,102,0.25)';
        ctx.strokeStyle = '#0d6e66';
        ctx.lineWidth = 2;
        for (const r of regions) {
            const x = r.x * rect.width;
            const y = r.y * rect.height;
            const w = r.w * rect.width;
            const h = r.h * rect.height;
            ctx.fillRect(x, y, w, h);
            ctx.strokeRect(x, y, w, h);
        }
        if (drawing && drawing.cur) {
            const x = Math.min(drawing.x0, drawing.cur.x);
            const y = Math.min(drawing.y0, drawing.cur.y);
            const w = Math.abs(drawing.cur.x - drawing.x0);
            const h = Math.abs(drawing.cur.y - drawing.y0);
            ctx.fillStyle = 'rgba(194,24,91,0.30)';
            ctx.strokeStyle = '#c2185b';
            ctx.lineWidth = 2;
            ctx.fillRect(x, y, w, h);
            ctx.strokeRect(x, y, w, h);
        }
    }

    function evToCanvasCoords(ev) {
        const rect = stage.getBoundingClientRect();
        const cx = ev.clientX - rect.left;
        const cy = ev.clientY - rect.top;
        return { x: Math.max(0, Math.min(rect.width, cx)), y: Math.max(0, Math.min(rect.height, cy)) };
    }

    canvas.addEventListener('pointerdown', (ev) => {
        ev.preventDefault();
        canvas.setPointerCapture(ev.pointerId);
        const p = evToCanvasCoords(ev);
        drawing = { x0: p.x, y0: p.y, cur: p };
        redraw();
    });
    canvas.addEventListener('pointermove', (ev) => {
        if (!drawing) return;
        drawing.cur = evToCanvasCoords(ev);
        redraw();
    });
    canvas.addEventListener('pointerup', (ev) => {
        if (!drawing) return;
        try { canvas.releasePointerCapture(ev.pointerId); } catch (e) {}
        const rect = stage.getBoundingClientRect();
        const x = Math.min(drawing.x0, drawing.cur.x) / rect.width;
        const y = Math.min(drawing.y0, drawing.cur.y) / rect.height;
        const w = Math.abs(drawing.cur.x - drawing.x0) / rect.width;
        const h = Math.abs(drawing.cur.y - drawing.y0) / rect.height;
        drawing = null;
        // Ignore micro-taps (drag <2% of frame).
        if (w >= 0.02 && h >= 0.02) {
            regions.push({ x, y, w, h });
            counter.textContent = regions.length + ' box' + (regions.length === 1 ? '' : 'es') + ' drawn';
        }
        redraw();
    });

    // Buttons row
    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:8px;margin-top:14px;flex-wrap:wrap;';
    const clearBtn = document.createElement('button');
    clearBtn.textContent = '↺ Clear';
    clearBtn.style.cssText = 'flex:1;min-width:80px;padding:12px;background:#fff;color:#555;border:1px solid #ccc;border-radius:8px;font-weight:600;font-size:14px;cursor:pointer;';
    clearBtn.addEventListener('click', () => {
        regions.length = 0;
        counter.textContent = '0 boxes drawn';
        redraw();
    });
    const eraseBtn = document.createElement('button');
    eraseBtn.textContent = '✨ Erase & Download';
    eraseBtn.style.cssText = 'flex:2;min-width:140px;padding:12px;background:linear-gradient(135deg,#0d6e66,#0a9b8e);color:#fff;border:none;border-radius:8px;font-weight:700;font-size:14px;cursor:pointer;';
    eraseBtn.addEventListener('click', async () => {
        if (regions.length === 0) {
            counter.textContent = 'Draw at least one box first.';
            counter.style.color = '#c2185b';
            return;
        }
        eraseBtn.disabled = true;
        eraseBtn.textContent = '⏳ Erasing…';
        try {
            // Route to the right endpoint and use the right field names.
            const railwayPath = isImageMode ? '/erase-region-image' : '/erase-region';
            const proxyPath = isImageMode
                ? '/.netlify/functions/erase-region-image'
                : '/.netlify/functions/erase-region-video';
            const payload = isImageMode
                ? { imageData: v.base64, regions }
                : { videoData: v.base64, regions };
            const data = await postHeavyJob(railwayPath, proxyPath, payload);
            const outField = isImageMode ? 'imageData' : 'videoData';
            if (!data.success || !data[outField]) {
                throw new Error(data.error || 'Erase failed.');
            }
            const b = atob(data[outField]);
            const arr = new Uint8Array(b.length);
            for (let i = 0; i < b.length; i++) arr[i] = b.charCodeAt(i);
            const outMime = isImageMode ? (data.mime || 'image/png') : 'video/mp4';
            const outExt = isImageMode ? (data.ext || '.png') : '.mp4';
            const cleanBlob = new Blob([arr], { type: outMime });
            const cleanUrl = URL.createObjectURL(cleanBlob);
            const fallbackBase = isImageMode ? 'flipit-image' : 'flipit-video';
            const baseName = (v.filename || fallbackBase).replace(/\.[a-z0-9]{2,4}$/i, '');
            triggerSave(cleanUrl, outMime, baseName + '-erased' + outExt);
            setTimeout(() => URL.revokeObjectURL(cleanUrl), 60000);
            modal.remove();
            URL.revokeObjectURL(blobUrl);
            const noun = isImageMode ? 'image' : 'video';
            showSuccess(`✅ Erased ${data.regions_applied} area${data.regions_applied === 1 ? '' : 's'} — clean ${noun} downloading (${data.size_mb} MB)`, 'errorMessage');
        } catch (err) {
            counter.textContent = '❌ ' + (err.message || 'Erase failed');
            counter.style.color = '#c2185b';
            eraseBtn.disabled = false;
            eraseBtn.textContent = '✨ Erase & Download';
        }
    });
    const closeBtn = document.createElement('button');
    closeBtn.textContent = 'Cancel';
    closeBtn.style.cssText = 'flex:1;min-width:80px;padding:12px;background:#fff;color:#888;border:1px solid #ddd;border-radius:8px;font-weight:600;font-size:14px;cursor:pointer;';
    closeBtn.addEventListener('click', () => { modal.remove(); URL.revokeObjectURL(blobUrl); });
    btnRow.appendChild(clearBtn);
    btnRow.appendChild(eraseBtn);
    btnRow.appendChild(closeBtn);
    card.appendChild(btnRow);

    modal.appendChild(card);
    document.body.appendChild(modal);

    // Wait for the media to know its intrinsic dimensions so we can size the
    // canvas to match. <video> uses loadedmetadata + readyState; <img> uses
    // load + complete/naturalWidth.
    const isReady = isImageMode
        ? (vid.complete && vid.naturalWidth > 0)
        : (vid.readyState >= 1);
    const readyEvent = isImageMode ? 'load' : 'loadedmetadata';
    if (isReady) {
        sizeCanvasToVideo();
    } else {
        vid.addEventListener(readyEvent, sizeCanvasToVideo, { once: true });
    }
    window.addEventListener('resize', sizeCanvasToVideo);
    modal.addEventListener('remove', () => window.removeEventListener('resize', sizeCanvasToVideo));
}

async function handleDownload() {
    const urlInput = document.getElementById('urlInput');
    const url = urlInput.value.trim();
    if (!url) { showError('Please enter a URL first', 'errorMessage'); return; }
    if (!gateOrPaywall()) return;

    const platform = detectPlatform(url);
    const btn = document.getElementById('downloadBtn');
    const origText = btn.textContent;

    btn.disabled = true;
    btn.textContent = '\u23F3 Finding download link...';

    try {
        const res = await fetch(DOWNLOAD_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url })
        });

        const data = await res.json();

        if (res.ok && data.videoData) {
            // Railway yt-dlp returned base64 video — decode and download directly
            btn.textContent = '⬇️ Downloading...';
            window._lastCarouselCount = 0;
            window._lastCarouselUrls = [];
            try {
                const byteChars = atob(data.videoData);
                const byteArr = new Uint8Array(byteChars.length);
                for (let i = 0; i < byteChars.length; i++) byteArr[i] = byteChars.charCodeAt(i);

                // Sniff actual format from magic bytes — yt-dlp sometimes returns
                // .webm even when it claims .mp4, and the wrong MIME breaks playback.
                const sniffed = sniffMediaType(byteArr);
                const mime = sniffed ? sniffed.mime : 'video/mp4';
                const ext = sniffed ? sniffed.ext : (data.ext || '.mp4');

                const blob = new Blob([byteArr], { type: mime });
                const blobUrl = URL.createObjectURL(blob);
                const finalName = (data.filename || 'flipit-video').replace(/\.[a-z0-9]{2,4}$/i, '') + ext;
                triggerSave(blobUrl, mime, finalName);
                // Keep blob alive long enough for iOS modal user to long-press save.
                setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
                if (isIOS()) {
                    showSuccess(`📱 Video ready — long-press to save (${(byteArr.length / 1048576).toFixed(1)} MB ${ext})`, 'errorMessage');
                } else {
                    showSuccess(`✅ Video download started! (${(byteArr.length / 1048576).toFixed(1)} MB ${ext})`, 'errorMessage');
                }
                // Stash the raw base64 + ext so the "Erase areas" button can
                // re-process this exact clip without re-downloading from IG.
                window._lastDownloadedVideo = { base64: data.videoData, mime, ext, filename: finalName };
                showEraseAreasButton();
            } catch (e) {
                console.error('Video decode failed:', e);
                showError('❌ Could not save video. The file may be corrupted — try a shorter clip.', 'errorMessage');
            }

        } else if (res.ok && data.downloadUrl) {
            btn.textContent = '\u2B07\uFE0F Downloading...';

            // If carousel with multiple images, show download panel
            if (data.carousel && data.carousel.length > 1) {
                window._lastCarouselCount = data.carousel.length;
                window._lastCarouselUrls = data.carousel.map(item => item.url);
                showCarouselDownloads(data.carousel, data.platform);
                showSuccess(`\u{1F3A0} Found ${data.carousel.length} media items! Click each to download.`, 'errorMessage');
            } else {
                window._lastCarouselCount = 0;
                window._lastCarouselUrls = [data.downloadUrl];
                const ext = data.type === 'video' ? '.mp4' : '.jpg';
                const fname = data.filename || `flipit-${platform || 'media'}${ext}`;
                try {
                    await forceDownload(data.downloadUrl, fname);
                    if (data.thumbnailOnly) {
                        // We could only get the cover image, not the video.
                        showError('\u26A0\uFE0F Couldn\u2019t grab the video itself \u2014 only its thumbnail downloaded. This post may be private, region-locked, or need login. Try a different link, or a TikTok URL (most reliable).', 'errorMessage');
                    } else {
                        const mediaType = data.type === 'image' ? '\u{1F5BC}\uFE0F Image' : '\u{1F3AC} Video';
                        showSuccess(`\u2705 ${mediaType} download started!`, 'errorMessage');
                    }
                } catch (dlErr) {
                    showError('\u274C ' + (dlErr.message || 'Download failed') + '. The file may be too large \u2014 try a shorter clip.', 'errorMessage');
                }
            }
        } else {
            showError('❌ ' + (data.instruction || 'Could not download this media. Please try a different URL.'), 'errorMessage');
        }
    } catch (err) {
        console.error('Download error:', err);
        showError('\u274C Network error. Please try again.', 'errorMessage');
    } finally {
        btn.disabled = false;
        btn.textContent = origText;
    }
}

function showCarouselDownloads(items, platform) {
    const container = document.getElementById('resultsContainer');

    const section = document.createElement('div');
    section.className = 'result-section';

    const heading = document.createElement('h3');
    heading.textContent = `\u{1F3A0} Carousel — ${items.length} items found`;
    section.appendChild(heading);

    // Download All button — wired with addEventListener (CSP-safe)
    const downloadAllBtn = document.createElement('button');
    downloadAllBtn.textContent = `\u2B07\uFE0F Download All ${items.length} Items`;
    downloadAllBtn.style.cssText = 'display:inline-flex;align-items:center;gap:8px;padding:14px 24px;background:linear-gradient(135deg,#0d6e66,#0a9b8e);color:#fff;border:none;border-radius:10px;font-weight:700;font-size:16px;cursor:pointer;margin-bottom:12px;width:100%;justify-content:center;';
    section.appendChild(downloadAllBtn);

    const grid = document.createElement('div');
    grid.style.cssText = 'display:flex;flex-wrap:wrap;gap:10px;';
    section.appendChild(grid);

    const individualButtons = [];
    items.forEach((item, i) => {
        const icon = item.type === 'video' ? '\u{1F3AC}' : '\u{1F5BC}\uFE0F';
        const label = item.type === 'video' ? 'Video' : 'Image';
        const ext = item.type === 'video' ? '.mp4' : '.jpg';
        const fname = `flipit-${platform || 'media'}-${i + 1}${ext}`;
        const baseLabel = `${icon} ${label} ${i + 1}`;

        const btn = document.createElement('button');
        btn.className = 'carousel-dl-btn';
        btn.textContent = baseLabel;
        btn.dataset.url = item.url;
        btn.dataset.fname = fname;
        btn.style.cssText = 'display:inline-flex;align-items:center;gap:8px;padding:12px 20px;background:#fff;color:#0d6e66;border:2px solid #0d6e66;border-radius:10px;font-weight:700;font-size:15px;cursor:pointer;transition:all 0.2s;flex:1;min-width:120px;justify-content:center;';
        btn.addEventListener('mouseover', () => { btn.style.background = '#0d6e66'; btn.style.color = '#fff'; });
        btn.addEventListener('mouseout', () => { btn.style.background = '#fff'; btn.style.color = '#0d6e66'; });
        btn.addEventListener('click', () => {
            forceDownload(item.url, fname).then(() => {
                btn.textContent = '\u2705 Done';
                setTimeout(() => { btn.textContent = baseLabel; }, 2000);
            }).catch((err) => {
                btn.textContent = '\u274C Failed';
                btn.title = (err && err.message) || '';
                setTimeout(() => { btn.textContent = baseLabel; }, 2500);
            });
        });
        individualButtons.push(btn);
        grid.appendChild(btn);
    });

    downloadAllBtn.addEventListener('click', async () => {
        for (const btn of individualButtons) {
            const baseLabel = btn.textContent;
            btn.textContent = '\u23F3...';
            try {
                await forceDownload(btn.dataset.url, btn.dataset.fname);
                btn.textContent = '\u2705 Done';
            } catch (err) {
                btn.textContent = '\u274C Failed';
                btn.title = (err && err.message) || '';
            }
            await new Promise((r) => setTimeout(r, 500));
        }
    });

    container.prepend(section);
}

// ── PROMPT CARD HELPER (CSP-safe) ────────────────────────
// Renders an array of {label, prompt} as cards with copy buttons.
// Uses createElement + addEventListener so it works under
// `script-src 'self'` (which blocks inline onclick).
function renderPromptCards(target, prompts, accentColor) {
    if (!target || !Array.isArray(prompts)) return;
    target.innerHTML = '';
    prompts.forEach((p) => {
        const card = document.createElement('div');
        card.style.cssText = 'margin-bottom:14px;padding:14px;background:#faf8f5;border-radius:10px;border:1px solid #e8e4de;';

        const lbl = document.createElement('p');
        lbl.style.cssText = `color:${accentColor};font-weight:700;font-size:14px;margin-bottom:6px;`;
        lbl.textContent = p.label || 'Prompt';
        card.appendChild(lbl);

        const txt = document.createElement('p');
        txt.className = 'result-text';
        txt.style.cssText = 'margin-bottom:8px;white-space:pre-wrap;';
        txt.textContent = p.prompt || '';
        card.appendChild(txt);

        const btn = document.createElement('button');
        btn.className = 'copy-btn';
        btn.style.cssText = `background:${accentColor};color:#fff;margin-top:0;`;
        btn.textContent = '\u{1F4CB} Copy';
        btn.addEventListener('click', () => {
            const text = p.prompt || '';
            const restore = () => setTimeout(() => { btn.textContent = '\u{1F4CB} Copy'; }, 2000);
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(text).then(() => {
                    btn.textContent = '\u2705 Copied!';
                    restore();
                }).catch(() => {
                    fallbackCopy(text, btn, restore);
                });
            } else {
                fallbackCopy(text, btn, restore);
            }
        });
        card.appendChild(btn);

        target.appendChild(card);
    });
}

// Legacy clipboard fallback for browsers / contexts where the
// modern API is unavailable (older Safari, non-secure context).
function fallbackCopy(text, btn, restore) {
    try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.cssText = 'position:fixed;top:-1000px;left:-1000px;opacity:0;';
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand && document.execCommand('copy');
        document.body.removeChild(ta);
        btn.textContent = ok ? '\u2705 Copied!' : '\u274C Copy failed';
        restore();
    } catch (e) {
        btn.textContent = '\u274C Copy failed';
        restore();
    }
}

// ── EXTRACT & FLIP ───────────────────────────────────────
document.getElementById('extractBtn').addEventListener('click', handleExtractAndTwist);

async function handleExtractAndTwist() {
    const url = document.getElementById('urlInput').value.trim();
    if (!url) { showError('Please enter a URL', 'errorMessage'); return; }
    if (!gateOrPaywall()) return;

    const platform = detectPlatform(url);
    if (!platform) { showError('URL not recognized.', 'errorMessage'); return; }

    const btn = document.getElementById('extractBtn');
    const orig = btn.textContent;
    btn.disabled = true;
    btn.textContent = '\u23F3 Extracting & Flipping...';

    const container = document.getElementById('resultsContainer');
    container.innerHTML = '<div class="loading">\u{1F504} Processing your content, please wait...</div>';

    try {
        const res = await fetch(EXTRACT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url })
        });

        if (!res.ok) {
            let msg = 'Extraction failed';
            try { const e = await res.json(); msg = e.error || msg; } catch (_) {}
            throw new Error(msg);
        }

        const data = await res.json();

        // Handle graceful fallback when caption extraction failed
        if (data.success === false) {
            container.innerHTML = `
                <div class="result-section" style="border-left:4px solid #ff6b00;padding:16px;">
                    <h3>\u26A0\uFE0F Could Not Extract Caption</h3>
                    <p class="result-text">${escapeHtml(data.message || 'The caption could not be extracted from this post.')}</p>
                    <p style="margin-top:12px;color:#888;font-size:13px;">Tip: Copy the caption text from the post and paste it into the <strong>Script Rewrite</strong> tab for instant flipping.</p>
                </div>`;
            return;
        }

        displayResults(data, platform);
        recordFlipSuccess();
    } catch (err) {
        container.innerHTML = `
            <div class="result-section" style="border-left:4px solid #ff4444;padding:16px;">
                <h3>\u26A0\uFE0F Something went wrong</h3>
                <p class="result-text">${escapeHtml(err.message)}</p>
            </div>`;
        showError(`Error: ${err.message}`, 'errorMessage');
    } finally {
        btn.disabled = false;
        btn.textContent = orig;
    }
}

function displayResults(data, platform) {
    const container = document.getElementById('resultsContainer');
    container.innerHTML = '';

    // Wire backend-extracted source-image URLs (og:image / Apify displayUrl)
    // into the carousel state so the Image Prompt button auto-routes to
    // /analyze-image (Vision-based recreation) instead of the text-only
    // fallback. Without this, the whole IG-extract → faithful Image Prompt
    // chain is silently broken even when extract-and-twist returns images.
    if (Array.isArray(data.sourceImages) && data.sourceImages.length > 0) {
        window._lastCarouselUrls = data.sourceImages.slice();
        window._lastCarouselCount = data.sourceImages.length;
    }

    // Carousel images preview
    if (data.carousel_images && data.carousel_images.length > 0) {
        const wrap = document.createElement('div');
        wrap.className = 'carousel-preview';
        wrap.innerHTML = '<h3>\u{1F5BC} Carousel Images</h3>';
        data.carousel_images.forEach((img, i) => {
            const div = document.createElement('div');
            div.className = 'carousel-image-wrapper';
            const el = document.createElement('img');
            el.src = `data:image/jpeg;base64,${img}`;
            el.alt = `Slide ${i + 1}`;
            div.appendChild(el);
            wrap.appendChild(div);
        });
        container.appendChild(wrap);
    }

    const isCaption = data.original && !data.original.includes('\n') && data.original.length < 500;

    appendSection(container, isCaption ? 'Original Caption' : 'Original Transcript', data.original, false);
    appendSection(container, '\u2728 Flipped Version', data.twisted, true);
    if (data.prompt) appendSection(container, '\u{1F3AF} Proven Hook', data.prompt, true);

    // Prompt buttons row: Video + Image
    if (data.twisted) {
        const carouselCount = window._lastCarouselCount || 0;
        appendPromptButtons(container, data.twisted, data.original, platform, carouselCount);
        appendRateButton(container, {
            original: data.original || '',
            twisted: data.twisted,
            platform: platform || ''
        });
        appendShareButton(container, {
            twisted: data.twisted,
            hook: data.prompt || '',
            platform: platform || ''
        });
        appendRestartButton(container);
    }
}

// ── 📊 RATE THIS POST ─────────────────────────────────────
// Scores the flipped post on 6 dimensions (hook, scroll-stop, niche clarity,
// emotional resonance, CTA, originality) via /rate-post and renders a
// score card with verdict + per-dimension breakdown + improvements.
function appendRateButton(container, payload) {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'margin-top:14px;display:flex;gap:10px;justify-content:center;flex-wrap:wrap;align-items:center;';

    const rateBtn = document.createElement('button');
    rateBtn.className = 'btn-secondary';
    rateBtn.style.cssText = 'background:linear-gradient(135deg,#ffb347,#ff7e5f);color:#fff;border:none;padding:12px 24px;font-weight:700;border-radius:10px;cursor:pointer;font-size:15px;';
    rateBtn.textContent = '\u{1F4CA} Rate This Post';
    wrap.appendChild(rateBtn);
    container.appendChild(wrap);

    // Result card lives below the button, populated on click.
    const cardHolder = document.createElement('div');
    cardHolder.style.cssText = 'margin-top:16px;';
    container.appendChild(cardHolder);

    rateBtn.addEventListener('click', async () => {
        const originalLabel = rateBtn.textContent;
        rateBtn.disabled = true;
        rateBtn.style.opacity = '0.7';
        rateBtn.textContent = '⏳ Analyzing…';
        cardHolder.innerHTML = '';

        try {
            const resp = await fetch('/.netlify/functions/rate-post', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    original: payload.original,
                    twisted: payload.twisted,
                    platform: payload.platform
                })
            });
            if (resp.status === 429) {
                const data = await resp.json().catch(() => ({}));
                const warn = document.createElement('div');
                warn.style.cssText = 'background:#fff3cd;border:1px solid #ffc107;padding:14px;border-radius:10px;color:#664d03;';
                warn.textContent = data.message || 'You’ve hit today’s rate limit.';
                cardHolder.innerHTML = '';
                cardHolder.appendChild(warn);
                return;
            }
            if (!resp.ok) {
                const data = await resp.json().catch(() => ({}));
                const errBox = document.createElement('div');
                errBox.style.cssText = 'background:#f8d7da;border:1px solid #f5c2c7;padding:14px;border-radius:10px;color:#842029;';
                errBox.textContent = data.error || 'Rating failed. Try again.';
                cardHolder.innerHTML = '';
                cardHolder.appendChild(errBox);
                return;
            }
            const rating = await resp.json();
            renderRatingCard(cardHolder, rating);
        } catch (err) {
            console.error('rate-post error', err);
            const errBox = document.createElement('div');
            errBox.style.cssText = 'background:#f8d7da;border:1px solid #f5c2c7;padding:14px;border-radius:10px;color:#842029;';
            errBox.textContent = 'Couldn’t reach the rater. Check your connection and try again.';
            cardHolder.innerHTML = '';
            cardHolder.appendChild(errBox);
        } finally {
            rateBtn.disabled = false;
            rateBtn.style.opacity = '1';
            rateBtn.textContent = originalLabel;
        }
    });
}

function renderRatingCard(host, rating) {
    host.innerHTML = '';
    if (!rating || typeof rating.overall !== 'number') {
        host.innerHTML = '<div style="color:#842029;">Rating response was malformed.</div>';
        return;
    }

    // Overall + verdict header
    const card = document.createElement('div');
    card.style.cssText = 'background:linear-gradient(135deg,#fff8f0,#fffaf3);border:2px solid #ffb347;border-radius:14px;padding:20px;box-shadow:0 4px 16px rgba(0,0,0,0.06);';

    const scoreColor = rating.overall >= 75 ? '#0a9b8e' : rating.overall >= 60 ? '#c79100' : rating.overall >= 40 ? '#cc7a00' : '#b91c1c';

    const header = document.createElement('div');
    header.style.cssText = 'display:flex;align-items:center;gap:16px;flex-wrap:wrap;margin-bottom:16px;';
    header.innerHTML = `
        <div style="font-size:48px;font-weight:900;color:${scoreColor};line-height:1;">${rating.overall}<span style="font-size:18px;color:#999;font-weight:600;">/100</span></div>
        <div style="font-size:20px;font-weight:700;color:#1a1a2e;">${escapeHtml(rating.verdict || '')}</div>
    `;
    card.appendChild(header);

    // 6 dimensions
    if (Array.isArray(rating.dimensions) && rating.dimensions.length) {
        const dimsWrap = document.createElement('div');
        dimsWrap.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px;margin-bottom:18px;';
        for (const d of rating.dimensions) {
            const dColor = d.score >= 75 ? '#0a9b8e' : d.score >= 60 ? '#c79100' : d.score >= 40 ? '#cc7a00' : '#b91c1c';
            const dim = document.createElement('div');
            dim.style.cssText = 'background:#fff;border:1px solid #f0e0c8;padding:12px;border-radius:10px;';
            dim.innerHTML = `
                <div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px;">
                    <strong style="color:#1a1a2e;font-size:14px;">${escapeHtml(d.name)}</strong>
                    <span style="font-weight:800;color:${dColor};font-size:16px;">${d.score}</span>
                </div>
                <div style="margin-top:6px;font-size:13px;color:#555;line-height:1.4;">${escapeHtml(d.why)}</div>
                <div style="margin-top:6px;font-size:12px;color:#0d6e66;line-height:1.4;"><strong>Fix:</strong> ${escapeHtml(d.improve)}</div>
            `;
            dimsWrap.appendChild(dim);
        }
        card.appendChild(dimsWrap);
    }

    // Working / Fix bullets
    const twoCol = document.createElement('div');
    twoCol.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px;';
    if (Array.isArray(rating.working) && rating.working.length) {
        const working = document.createElement('div');
        working.innerHTML = `<h4 style="margin:0 0 8px;color:#0a9b8e;font-size:14px;">✅ What’s working</h4><ul style="margin:0;padding-left:18px;font-size:13px;color:#333;line-height:1.5;">${rating.working.map((w) => `<li>${escapeHtml(w)}</li>`).join('')}</ul>`;
        twoCol.appendChild(working);
    }
    if (Array.isArray(rating.fix) && rating.fix.length) {
        const fix = document.createElement('div');
        fix.innerHTML = `<h4 style="margin:0 0 8px;color:#cc7a00;font-size:14px;">\u{1F527} Fix first</h4><ul style="margin:0;padding-left:18px;font-size:13px;color:#333;line-height:1.5;">${rating.fix.map((w) => `<li>${escapeHtml(w)}</li>`).join('')}</ul>`;
        twoCol.appendChild(fix);
    }
    card.appendChild(twoCol);

    // Copy-paste hook
    if (rating.copy_paste_hook) {
        const hookWrap = document.createElement('div');
        hookWrap.style.cssText = 'margin-top:16px;background:#fff;border:1px dashed #0d6e66;border-radius:10px;padding:12px;';
        hookWrap.innerHTML = `<div style="font-size:12px;color:#0d6e66;font-weight:700;margin-bottom:4px;">\u{1F3AF} Stronger hook (tap to copy)</div><div id="rateCopyHook" style="font-size:14px;color:#1a1a2e;cursor:pointer;line-height:1.4;">${escapeHtml(rating.copy_paste_hook)}</div>`;
        card.appendChild(hookWrap);
        // wire copy on the dynamically inserted element
        setTimeout(() => {
            const el = document.getElementById('rateCopyHook');
            if (!el) return;
            el.addEventListener('click', () => {
                navigator.clipboard.writeText(rating.copy_paste_hook).then(() => {
                    const prev = el.textContent;
                    el.textContent = '✅ Copied!';
                    setTimeout(() => { el.textContent = prev; }, 1400);
                });
            });
        }, 0);
    }

    host.appendChild(card);
}

function escapeHtml(s) {
    return String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// ── 🔄 NEW FLIP / RESTART ────────────────────────────────
// Appears at the bottom of every results card. One click clears the
// results, the URL input, and any carousel state, then scrolls back to
// the URL input so the user can paste a new link without manually
// clearing anything. Works from any tab — switches to URL Extract by
// default since that is the most common entry point.
function appendRestartButton(container) {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'margin-top:24px;padding-top:20px;border-top:1px dashed #ddd;display:flex;flex-direction:column;align-items:center;gap:8px;';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn-tertiary';
    btn.style.cssText = 'background:#fff;color:#0d6e66;border:2px solid #0d6e66;padding:12px 28px;font-weight:700;border-radius:10px;cursor:pointer;font-size:15px;display:inline-flex;align-items:center;gap:8px;';
    btn.textContent = '\u{1F504} New Flip';

    const hint = document.createElement('span');
    hint.textContent = 'Clear this result and start a fresh flip.';
    hint.style.cssText = 'font-size:12px;color:#888;';

    btn.addEventListener('click', () => {
        // Clear all globals that earlier flows may have populated
        window._lastCarouselUrls = [];
        window._lastCarouselCount = 0;

        // Clear the main results container
        const resultsContainer = document.getElementById('resultsContainer');
        if (resultsContainer) resultsContainer.innerHTML = '';

        // Clear the URL input + any platform badge / error caption
        const urlInput = document.getElementById('urlInput');
        if (urlInput) {
            urlInput.value = '';
            urlInput.dispatchEvent(new Event('input'));
        }
        const platformBadge = document.getElementById('platformBadge');
        if (platformBadge) platformBadge.innerHTML = '';
        const errorMessage = document.getElementById('errorMessage');
        if (errorMessage) errorMessage.innerHTML = '';

        // Switch back to URL Extract so the user lands ready to paste
        if (typeof switchTab === 'function') switchTab('url-tab');

        // Scroll the URL input into view, give focus
        setTimeout(() => {
            if (urlInput) {
                urlInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
                urlInput.focus({ preventScroll: true });
            }
        }, 80);
    });

    wrap.appendChild(btn);
    wrap.appendChild(hint);
    container.appendChild(wrap);
}

// ── SHAREABLE FLIP URL ────────────────────────────────────
// Encode the flip into a URL-safe base64 ?d= param so any flip becomes
// a self-contained shareable page at /share.html?d=...
// No server, no DB — every recipient who clicks lands on a page that
// shows the flip + a "Make your own free" CTA.
function encodeSharePayload(payload) {
    const json = JSON.stringify(payload);
    // utf-8 bytes → base64 → url-safe
    const bytes = new TextEncoder().encode(json);
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function buildShareUrl(payload) {
    const trimmed = {
        twisted: (payload.twisted || '').slice(0, 4000),
        hook: (payload.hook || '').slice(0, 500),
        platform: payload.platform || ''
    };
    const data = encodeSharePayload(trimmed);
    return window.location.origin + '/share.html?d=' + data;
}

function appendShareButton(container, payload) {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'margin-top:14px;display:flex;gap:10px;justify-content:center;flex-wrap:wrap;align-items:center;';

    const shareBtn = document.createElement('button');
    shareBtn.className = 'btn-tertiary';
    shareBtn.style.cssText = 'background:#fff;color:#0d6e66;border:2px solid #0d6e66;padding:12px 24px;font-weight:700;border-radius:10px;cursor:pointer;font-size:15px;';
    shareBtn.textContent = '\u{1F517} Share this Flip';

    const note = document.createElement('span');
    note.style.cssText = 'color:#888;font-size:13px;';
    note.textContent = 'Anyone you send the link to lands on a page showing this flip.';

    wrap.appendChild(shareBtn);
    container.appendChild(wrap);
    const noteWrap = document.createElement('div');
    noteWrap.style.cssText = 'text-align:center;margin-top:6px;';
    noteWrap.appendChild(note);
    container.appendChild(noteWrap);

    shareBtn.addEventListener('click', () => {
        const url = buildShareUrl(payload);
        // Try Web Share API first (mobile), fallback to clipboard
        if (navigator.share) {
            navigator.share({
                title: 'A viral flip — Made with FlipIt',
                text: payload.hook || 'See this flipped script',
                url: url
            }).catch(() => copyShareLink(url, shareBtn));
        } else {
            copyShareLink(url, shareBtn);
        }
    });
}

function copyShareLink(url, btn) {
    const restore = () => setTimeout(() => { btn.textContent = '\u{1F517} Share this Flip'; }, 2500);
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(() => {
            btn.textContent = '✅ Link copied! Paste anywhere.';
            restore();
        }).catch(() => {
            // Fallback via textarea
            const ta = document.createElement('textarea');
            ta.value = url;
            ta.style.cssText = 'position:fixed;top:-1000px;left:-1000px;';
            document.body.appendChild(ta);
            ta.select();
            try {
                document.execCommand('copy');
                btn.textContent = '✅ Link copied!';
            } catch (e) {
                btn.textContent = '❌ Copy failed';
            }
            document.body.removeChild(ta);
            restore();
        });
    } else {
        btn.textContent = url;
    }
}

function appendSection(container, title, text, copyable) {
    const div = document.createElement('div');
    div.className = 'result-section';
    div.innerHTML = `<h3>${title}</h3><p class="result-text">${escapeHtml(text || '')}</p>`;
    if (copyable) {
        const btn = document.createElement('button');
        btn.className = 'copy-btn';
        btn.textContent = '\u{1F4CB} Copy';
        btn.onclick = () => copyToClipboard(btn);
        div.appendChild(btn);
    }
    container.appendChild(div);
}

// ── PROMPT BUTTONS (Video + Image) ──────────────────────
function appendPromptButtons(container, flippedScript, originalCaption, platform, carouselCount) {
    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'margin-top:16px;display:flex;gap:12px;justify-content:center;flex-wrap:wrap;';

    // Both Image and Video Prompt are Pro-only \u2014 show \uD83D\uDD12 badge for free users
    // so the upgrade prompt isn't a surprise when they click.
    const isPro = !!(window.FlipItAccess && window.FlipItAccess.getState && window.FlipItAccess.getState().isPro);
    const lockBadge = isPro ? '' : ' \u{1F512}';

    // Video Prompt button
    const videoBtn = document.createElement('button');
    videoBtn.className = 'btn-primary';
    videoBtn.style.cssText = 'background:linear-gradient(135deg,#0d6e66,#0a9b8e);color:#fff;width:auto;padding:14px 28px;font-weight:700;letter-spacing:1px;border:none;border-radius:10px;cursor:pointer;font-size:16px;flex:1;min-width:180px;';
    videoBtn.textContent = '\u{1F3AC} VIDEO PROMPT' + lockBadge;
    if (!isPro) videoBtn.title = 'Pro feature \u2014 unlock with any paid plan';
    btnRow.appendChild(videoBtn);

    // Image Prompt button
    const imageBtn = document.createElement('button');
    imageBtn.className = 'btn-secondary';
    imageBtn.style.cssText = 'background:linear-gradient(135deg,#c2185b,#e8734a);color:#fff;width:auto;padding:14px 28px;font-weight:700;letter-spacing:1px;border:none;border-radius:10px;cursor:pointer;font-size:16px;flex:1;min-width:180px;';
    imageBtn.textContent = '\u{1F5BC}\uFE0F IMAGE PROMPT' + lockBadge;
    if (!isPro) imageBtn.title = 'Pro feature \u2014 unlock with any paid plan';
    btnRow.appendChild(imageBtn);

    container.appendChild(btnRow);

    // Video Prompt click handler — calls Claude via /video-prompts
    videoBtn.addEventListener('click', async () => {
        if (!gateProFeature()) return;
        const existing = container.querySelector('.video-prompt-section');
        if (existing) { existing.style.display = existing.style.display === 'none' ? '' : 'none'; return; }

        const wrap = document.createElement('div');
        wrap.className = 'result-section video-prompt-section';
        wrap.innerHTML = `<h3>\u{1F3AC} Video Creation Prompts</h3><p style="color:#777;font-size:14px;margin-bottom:10px;">AI is writing prompts that match your script. Paste into Runway, Pika, Kling, Sora, or Luma.</p><p class="result-text" style="color:#999;">⏳ Generating prompts…</p>`;
        container.appendChild(wrap);
        wrap.scrollIntoView({ behavior: 'smooth', block: 'start' });

        try {
            // Pass the cover frame from the source post as a visual anchor.
            // Without this, Claude defaults to generic "creator at desk" scenes
            // that ignore what's literally in the source video.
            const referenceImageUrl = (window._lastCarouselUrls && window._lastCarouselUrls[0]) || '';
            const res = await fetch('/.netlify/functions/video-prompts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ flippedScript, platform, referenceImageUrl })
            });
            const data = await res.json();
            if (!res.ok || !data.prompts) throw new Error(data.error || 'Failed to generate');

            wrap.innerHTML = `<h3>\u{1F3AC} Video Creation Prompts</h3><p style="color:#777;font-size:14px;margin-bottom:10px;">Paste each into Runway, Pika, Kling, Sora, or Luma.</p><div data-cards></div>`;
            renderPromptCards(wrap.querySelector('[data-cards]'), data.prompts, '#0d6e66');
            recordFlipSuccess();
        } catch (err) {
            console.error('Video prompt error:', err);
            wrap.querySelector('.result-text').textContent = '❌ ' + (err.message || 'Could not generate video prompts');
            wrap.querySelector('.result-text').style.color = '#c2185b';
        }
    });

    // Image Prompt click handler — AI Vision analyzes actual downloaded images
    imageBtn.addEventListener('click', async () => {
        if (!gateProFeature()) return;
        const existing = container.querySelector('.image-prompt-section');
        if (existing) { existing.style.display = existing.style.display === 'none' ? '' : 'none'; return; }

        const imageUrls = window._lastCarouselUrls || [];

        if (imageUrls.length > 0) {
            imageBtn.disabled = true;
            imageBtn.textContent = '\u23F3 Analyzing images...';

            const div = document.createElement('div');
            div.className = 'result-section image-prompt-section';
            div.style.borderLeftColor = '#c2185b';
            div.innerHTML = `
                <h3>\u{1F5BC}\uFE0F AI Image Prompts \u2014 Analyzing ${imageUrls.length} image${imageUrls.length > 1 ? 's' : ''}...</h3>
                <p style="color:#777;font-size:14px;margin-bottom:14px;">AI Vision is analyzing each image and writing a prompt to recreate it.</p>
                <div id="imagePromptsContainer"></div>
            `;
            container.appendChild(div);
            div.scrollIntoView({ behavior: 'smooth', block: 'start' });

            const promptsContainer = document.getElementById('imagePromptsContainer');
            let done = 0;

            for (let i = 0; i < imageUrls.length; i++) {
                const slideDiv = document.createElement('div');
                slideDiv.style.cssText = 'margin-bottom:16px;padding:14px;background:#faf8f5;border-radius:10px;border:1px solid #e8e4de;';
                slideDiv.innerHTML = `
                    <p style="color:#c2185b;font-weight:700;font-size:14px;margin-bottom:6px;">\u{1F5BC}\uFE0F IMAGE ${i + 1} of ${imageUrls.length}</p>
                    <p class="result-text" style="color:#999;">\u23F3 Analyzing what\u2019s in this image...</p>
                `;
                promptsContainer.appendChild(slideDiv);

                try {
                    const res = await fetch('/.netlify/functions/analyze-image', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ imageUrl: imageUrls[i], slideNumber: i + 1 })
                    });
                    const data = await res.json();

                    if (res.ok && data.prompt) {
                        slideDiv.innerHTML = '';
                        const lbl = document.createElement('p');
                        lbl.style.cssText = 'color:#c2185b;font-weight:700;font-size:14px;margin-bottom:6px;';
                        lbl.textContent = `\u{1F5BC}\uFE0F IMAGE ${i + 1} of ${imageUrls.length}`;
                        const txt = document.createElement('p');
                        txt.className = 'result-text';
                        txt.style.cssText = 'margin-bottom:8px;';
                        txt.textContent = data.prompt;
                        const cBtn = document.createElement('button');
                        cBtn.className = 'copy-btn';
                        cBtn.style.cssText = 'background:#c2185b;color:#fff;margin-top:0;';
                        cBtn.textContent = '\u{1F4CB} Copy';
                        cBtn.addEventListener('click', () => {
                            const t = data.prompt || '';
                            const restore = () => setTimeout(() => { cBtn.textContent = '\u{1F4CB} Copy'; }, 2000);
                            if (navigator.clipboard && navigator.clipboard.writeText) {
                                navigator.clipboard.writeText(t).then(() => { cBtn.textContent = '\u2705 Copied!'; restore(); })
                                    .catch(() => fallbackCopy(t, cBtn, restore));
                            } else { fallbackCopy(t, cBtn, restore); }
                        });
                        slideDiv.appendChild(lbl);
                        slideDiv.appendChild(txt);
                        slideDiv.appendChild(cBtn);
                    } else {
                        slideDiv.querySelector('.result-text').textContent = '\u274C ' + (data.error || 'Could not analyze this image');
                        slideDiv.querySelector('.result-text').style.color = '#c2185b';
                    }
                } catch (err) {
                    slideDiv.querySelector('.result-text').textContent = '\u274C Error: ' + err.message;
                    slideDiv.querySelector('.result-text').style.color = '#c2185b';
                }

                done++;
                div.querySelector('h3').textContent = `\u{1F5BC}\uFE0F AI Image Prompts \u2014 ${done}/${imageUrls.length} done`;
            }

            div.querySelector('h3').textContent = `\u{1F5BC}\uFE0F AI Image Prompts \u2014 ${imageUrls.length} image${imageUrls.length > 1 ? 's' : ''} analyzed \u2705`;
            imageBtn.disabled = false;
            imageBtn.textContent = '\u{1F5BC}\uFE0F IMAGE PROMPT';

        } else {
            // No images downloaded — generate prompts FROM THE SCRIPT via Claude
            imageBtn.disabled = true;
            imageBtn.textContent = '⏳ Generating prompts...';

            const div = document.createElement('div');
            div.className = 'result-section image-prompt-section';
            div.style.borderLeftColor = '#c2185b';
            div.innerHTML = `<h3>\u{1F5BC}️ AI Image Prompts</h3><p style="color:#777;font-size:14px;margin-bottom:14px;">Generating prompts that illustrate your script…</p><p class="result-text" style="color:#999;">⏳ Working on it…</p>`;
            container.appendChild(div);
            div.scrollIntoView({ behavior: 'smooth', block: 'start' });

            try {
                const res = await fetch('/.netlify/functions/image-prompts', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ flippedScript, platform, count: 5 })
                });
                const data = await res.json();
                if (!res.ok || !data.prompts) throw new Error(data.error || 'Failed to generate');

                div.innerHTML = `<h3>\u{1F5BC}️ AI Image Prompts — ${data.prompts.length} ideas</h3><p style="color:#777;font-size:14px;margin-bottom:14px;">Paste each into Midjourney, DALL-E, Ideogram, or Leonardo.</p><div data-cards></div>`;


                renderPromptCards(div.querySelector('[data-cards]'), data.prompts, '#c2185b');
            recordFlipSuccess();
            } catch (err) {
                console.error('Image prompt error:', err);
                div.querySelector('.result-text').textContent = '❌ ' + (err.message || 'Could not generate image prompts');
                div.querySelector('.result-text').style.color = '#c2185b';
            } finally {
                imageBtn.disabled = false;
                imageBtn.textContent = '\u{1F5BC}️ IMAGE PROMPT';
            }
        }
    });
}

// ── SCRIPT REWRITE ───────────────────────────────────────
const REWRITE_URL = '/.netlify/functions/rewrite-script';

document.getElementById('rewriteBtn').addEventListener('click', handleRewriteScript);

async function handleRewriteScript() {
    const script = document.getElementById('scriptInput').value.trim();
    if (!script) { showError('Please paste a script or caption', 'scriptErrorMessage'); return; }
    if (!gateOrPaywall()) return;

    const btn = document.getElementById('rewriteBtn');
    const orig = btn.textContent;
    btn.disabled = true;
    btn.textContent = '\u23F3 Rewriting...';

    const container = document.getElementById('scriptResultsContainer');
    container.innerHTML = '<div class="loading">\u2728 Creating your flipped version...</div>';

    try {
        const res = await fetch(REWRITE_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ script, tone: 'viral', platform: null })
        });

        if (!res.ok) { const e = await res.json(); throw new Error(e.error || 'Rewrite failed'); }

        const data = await res.json();
        container.innerHTML = '';
        appendSection(container, 'Original Script', script, false);
        appendSection(container, '\u2728 Flipped Version', data.rewritten, true);
        // Tag the Flipped Version section so remix-by-instruction can replace
        // its output in place without disturbing the Original section.
        const flippedSection = container.lastElementChild;
        if (flippedSection) flippedSection.classList.add('remix-flipped-section');
        if (data.hook) appendSection(container, '\u{1F3AF} Proven Hook', data.hook, true);
        if (data.cta) appendSection(container, '\u{1F4E3} Call to Action', data.cta, true);
        // Richer output from the deeper-output backend (optional — only present
        // when the model emitted the extra sections). Rendered defensively.
        if (Array.isArray(data.scenes) && data.scenes.length) {
            appendSection(container, '\u{1F3AC} Scene-by-Scene', data.scenes.join('\n'), true);
        }
        if (data.caption) appendSection(container, '\u{1F4DD} Ready-to-Post Caption', data.caption, true);
        if (data.hashtags) appendSection(container, '#️⃣ Hashtags', data.hashtags, true);
        recordFlipSuccess();

        // Video + Image prompts
        if (data.rewritten) {
            appendPromptButtons(container, data.rewritten, script, null);
            appendShareButton(container, {
                twisted: data.rewritten,
                hook: data.hook || '',
                platform: ''
            });
            // Remix-by-instruction: iterate on the just-generated flipped script
            // with a freeform directive ("make it funnier", "shorten to 30s"\u2026).
            appendRemixControl(container, data.rewritten);
        }
    } catch (err) {
        showError(`Error: ${err.message}`, 'scriptErrorMessage');
        container.innerHTML = '';
    } finally {
        btn.disabled = false;
        btn.textContent = orig;
    }
}

// \u2500\u2500 REMIX BY INSTRUCTION \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
// Takes the just-generated flipped script and regenerates it with a freeform
// instruction. Reuses /rewrite-script (no backend change): the instruction is
// injected as a leading directive line inside the `script` payload, which the
// existing system prompt honors. Voice context is added automatically by the
// fetch wrapper (plumbVoiceIntoFetches). Each remix operates on the LATEST
// version so users can iterate. Gated behind gateOrPaywall like other Pro
// actions. The existing history recorder auto-logs the run (kind 'rewrite').
function appendRemixControl(container, currentFlipped) {
    // Iterative state: always remix the newest version.
    let latest = currentFlipped || '';

    const wrap = document.createElement('div');
    wrap.className = 'result-section remix-control-section';
    wrap.style.cssText = 'margin-top:16px;';

    const heading = document.createElement('h3');
    heading.textContent = '\u{1F504} Remix by instruction';
    wrap.appendChild(heading);

    const sub = document.createElement('p');
    sub.style.cssText = 'color:#777;font-size:14px;margin:0 0 12px;';
    sub.textContent = 'Tell FlipIt how to change the flipped version above \u2014 each remix builds on the latest one.';
    wrap.appendChild(sub);

    // Instruction input + Remix button row.
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:10px;flex-wrap:wrap;align-items:stretch;';

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'remix-instruction-input';
    input.placeholder = 'Tell FlipIt how to change it \u2014 e.g. make it funnier, shorten to 30s, punchier hook';
    input.style.cssText = 'flex:1;min-width:220px;padding:12px 14px;border:1.5px solid #e8e4de;border-radius:10px;font-size:15px;color:#1a1a2e;background:#fff;';

    const remixBtn = document.createElement('button');
    remixBtn.type = 'button';
    remixBtn.className = 'remix-btn';
    remixBtn.textContent = '\u{1F504} Remix';
    remixBtn.style.cssText = 'background:linear-gradient(135deg,#0d6e66,#0a9b8e);color:#fff;border:none;border-radius:10px;padding:12px 24px;font-weight:700;font-size:15px;letter-spacing:0.5px;cursor:pointer;white-space:nowrap;';

    row.appendChild(input);
    row.appendChild(remixBtn);
    wrap.appendChild(row);

    // One-tap chips that fill the input.
    const chipRow = document.createElement('div');
    chipRow.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;margin-top:12px;';
    const CHIPS = ['Funnier', 'Shorter (30s)', 'Punchier hook', 'More emotional'];
    CHIPS.forEach(label => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.textContent = label;
        chip.style.cssText = 'padding:6px 14px;border-radius:999px;font-size:13px;font-weight:600;cursor:pointer;border:1.5px solid #e0dcd5;background:#fff;color:#444;';
        chip.addEventListener('click', () => {
            input.value = label;
            input.focus();
        });
        chipRow.appendChild(chip);
    });
    wrap.appendChild(chipRow);

    const err = document.createElement('div');
    err.className = 'remix-error';
    err.style.cssText = 'color:#c2185b;font-size:13px;margin-top:8px;min-height:0;';
    wrap.appendChild(err);

    container.appendChild(wrap);

    async function runRemix() {
        const instruction = input.value.trim();
        err.textContent = '';
        if (!instruction) {
            err.textContent = 'Type an instruction or tap a chip first.';
            return;
        }
        if (!gateOrPaywall()) return;

        const origLabel = remixBtn.textContent;
        remixBtn.disabled = true;
        input.disabled = true;
        remixBtn.textContent = '\u23f3 Remixing\u2026';

        // Compose the request: a leading directive line the model will follow,
        // then the current flipped script it should transform. Keeping the
        // instruction as line 1 also makes the auto-logged history title
        // informative (e.g. "Remix: make it funnier \u2014 <script start>").
        const composed = '[REMIX INSTRUCTION: ' + instruction + ']\n\n' + latest;

        try {
            const res = await fetch(REWRITE_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ script: composed, tone: 'viral', platform: null })
            });
            if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || 'Remix failed'); }
            const data = await res.json();
            if (!data.rewritten) throw new Error('Remix returned nothing');

            // Replace the flipped-version output in place; Original stays intact.
            const flippedSection = container.querySelector('.remix-flipped-section');
            const textEl = flippedSection && flippedSection.querySelector('.result-text');
            if (textEl) {
                textEl.textContent = data.rewritten;
            } else {
                // Fallback: if the section vanished, append a fresh one.
                appendSection(container, '\u2728 Flipped Version', data.rewritten, true);
                const fresh = container.lastElementChild;
                if (fresh) fresh.classList.add('remix-flipped-section');
            }

            // Iterate on the newest version next time.
            latest = data.rewritten;
            recordFlipSuccess();
        } catch (e) {
            err.textContent = 'Error: ' + e.message;
        } finally {
            remixBtn.disabled = false;
            input.disabled = false;
            remixBtn.textContent = origLabel;
        }
    }

    remixBtn.addEventListener('click', runRemix);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); runRemix(); }
    });
}

// ── NICHE IDEAS ──────────────────────────────────────────
const NICHE_IDEAS_URL = '/.netlify/functions/niche-ideas';

document.getElementById('generateIdeasBtn').addEventListener('click', handleGenerateIdeas);

async function handleGenerateIdeas() {
    const niche = document.getElementById('nicheInput').value.trim();
    const description = document.getElementById('nicheDescription').value.trim();
    if (!niche || !description) { showError('Please fill in both fields', 'ideasErrorMessage'); return; }
    if (!gateOrPaywall()) return;

    const btn = document.getElementById('generateIdeasBtn');
    const orig = btn.textContent;
    btn.disabled = true;
    btn.textContent = '\u23F3 Generating...';

    const container = document.getElementById('ideasResultsContainer');
    container.innerHTML = '<div class="loading">\u{1F680} Creating viral script ideas...</div>';

    try {
        const res = await fetch(NICHE_IDEAS_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ niche, description })
        });

        if (!res.ok) { const e = await res.json(); throw new Error(e.error || 'Generation failed'); }

        const data = await res.json();
        container.innerHTML = '';
        appendSection(container, '\u{1F4A1} Your Viral Content Ideas', data.twisted, true);
        if (data.prompt) appendSection(container, '\u{1F3AF} Pro Tips', data.prompt, true);
        recordFlipSuccess();
    } catch (err) {
        showError(`Error: ${err.message}`, 'ideasErrorMessage');
        container.innerHTML = '';
    } finally {
        btn.disabled = false;
        btn.textContent = orig;
    }
}

// ── UTILITIES ────────────────────────────────────────────
function copyToClipboard(button) {
    // Find the result-text element within the same parent (works regardless
    // of where the copy button is positioned within the section).
    const parent = button.parentElement;
    const target = parent.querySelector('.result-text') || button.previousElementSibling;
    const text = target ? target.textContent : '';
    navigator.clipboard.writeText(text).then(() => {
        const orig = button.textContent;
        button.textContent = '\u2705 Copied!';
        setTimeout(() => { button.textContent = orig; }, 2000);
    });
}

// AI Enhance — only runs when user clicks the button (per-image, on demand)
async function aiEnhancePrompt(btn) {
    const url = btn.dataset.url;
    const targetId = btn.dataset.target;
    const target = document.getElementById(targetId);
    if (!url || !target) return;

    btn.disabled = true;
    btn.textContent = '\u23F3 Analyzing...';

    try {
        const res = await fetch('/.netlify/functions/analyze-image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ imageUrl: url, slideNumber: 1 })
        });
        const data = await res.json();

        if (res.ok && data.prompt) {
            target.textContent = data.prompt;
            btn.textContent = '\u2705 Enhanced!';
            btn.style.background = '#0d6e66';
        } else {
            btn.textContent = '\u274C Failed';
            setTimeout(() => { btn.textContent = '\u2728 AI Enhance'; btn.disabled = false; }, 2000);
        }
    } catch (err) {
        btn.textContent = '\u274C Error';
        setTimeout(() => { btn.textContent = '\u2728 AI Enhance'; btn.disabled = false; }, 2000);
    }
}

function escapeHtml(text) {
    const d = document.createElement('div');
    d.textContent = text;
    return d.innerHTML;
}

function showError(msg, id) {
    const el = document.getElementById(id);
    el.textContent = msg;
    el.style.display = 'block';
    el.style.color = '';
    setTimeout(() => { el.style.display = 'none'; }, 5000);
}

function showSuccess(msg, id) {
    const el = document.getElementById(id);
    el.textContent = msg;
    el.style.display = 'block';
    el.style.color = '#4ade80';
    setTimeout(() => { el.style.display = 'none'; }, 3000);
}

// ── TAB 4: IMAGE PROMPTS WIRING ──────────────────────────
(function wireImagePromptsTab() {
    // Niche cards — single-select. aria-pressed mirrors the .selected class
    // so screen readers announce the toggle state.
    document.querySelectorAll('#nicheGrid .niche-card').forEach(card => {
        card.addEventListener('click', () => {
            document.querySelectorAll('#nicheGrid .niche-card').forEach(c => {
                c.classList.remove('selected');
                c.setAttribute('aria-pressed', 'false');
            });
            card.classList.add('selected');
            card.setAttribute('aria-pressed', 'true');
        });
    });

    // Event pills — single-select toggle (clicking a selected pill deselects).
    document.querySelectorAll('#eventPills .event-pill').forEach(pill => {
        pill.addEventListener('click', () => {
            const wasSelected = pill.classList.contains('selected');
            document.querySelectorAll('#eventPills .event-pill').forEach(p => {
                p.classList.remove('selected');
                p.setAttribute('aria-pressed', 'false');
            });
            if (!wasSelected) {
                pill.classList.add('selected');
                pill.setAttribute('aria-pressed', 'true');
            }
        });
    });

    const btn = document.getElementById('generateImgPromptsBtn');
    if (!btn) return;

    btn.addEventListener('click', async () => {
        if (!gateOrPaywall()) return;
        const selectedNicheEl = document.querySelector('#nicheGrid .niche-card.selected');
        const niche = selectedNicheEl ? selectedNicheEl.getAttribute('data-niche') : '';

        if (!niche) {
            showError('Please select a niche', 'imgErrorMessage');
            return;
        }

        const selectedPillEl = document.querySelector('#eventPills .event-pill.selected');
        const pillEvent = selectedPillEl ? selectedPillEl.getAttribute('data-event') : '';
        const customEvent = (document.getElementById('imgCustomEvent').value || '').trim();
        const style = document.getElementById('imgStyle').value || 'Instagram feed photos';
        const count = parseInt(document.getElementById('imgCount').value || '5', 10);
        const extra = (document.getElementById('imgExtra').value || '').trim();

        const container = document.getElementById('imgResultsContainer');
        container.innerHTML = '<div class="loading">⏳ AI is writing prompts specifically for your niche…</div>';

        const originalText = btn.textContent;
        btn.disabled = true;
        btn.textContent = '⏳ Generating...';

        try {
            const res = await fetch('/.netlify/functions/image-prompts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ niche, event: pillEvent, customEvent, style, count, extra })
            });
            const data = await res.json();
            if (!res.ok || !data.prompts || data.prompts.length === 0) {
                throw new Error(data.error || 'No prompts generated');
            }

            container.innerHTML = '';
            data.prompts.forEach(({ label, prompt }) => {
                const div = document.createElement('div');
                div.className = 'result-section';
                div.innerHTML = `<h3>${escapeHtml(label || 'Prompt')}</h3><p class="result-text" style="white-space:pre-wrap;">${escapeHtml(prompt)}</p>`;
                const copyBtn = document.createElement('button');
                copyBtn.className = 'copy-btn';
                copyBtn.textContent = '\u{1F4CB} Copy';
                copyBtn.onclick = () => copyToClipboard(copyBtn);
                div.appendChild(copyBtn);
                container.appendChild(div);
            });
        } catch (err) {
            console.error('Image prompts error:', err);
            container.innerHTML = '';
            showError('❌ ' + (err.message || 'Could not generate image prompts. Please try again.'), 'imgErrorMessage');
        } finally {
            btn.disabled = false;
            btn.textContent = originalText;
        }
    });
})();

// ── TAB: TRENDING VIRAL FEED (Apify-backed) ───────────────────
// Show top-engagement TikToks for the selected niche/hashtag.
// One-click on a card pastes the URL into Tab 1 (URL Extract) and runs the flip.
(function wireTrendingTab() {
    const btn = document.getElementById('findTrendingBtn');
    if (!btn) return;
    const nicheSelect = document.getElementById('trendingNiche');
    const hashtagInput = document.getElementById('trendingHashtag');
    const container = document.getElementById('trendingResultsContainer');

    function fmtNum(n) {
        if (!Number.isFinite(n)) return '0';
        if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
        if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
        return String(n);
    }

    // Expose so the filter-chips/CSV module appended at the bottom can drive it.
    window._trendingRenderCards = function(results) { renderCards(results); };

    function renderCards(results) {
        container.innerHTML = '';
        if (!results || results.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'result-section';
            empty.innerHTML = '<h3>\u{1F50D} No trending posts found</h3><p class="result-text">Try a different niche or hashtag.</p>';
            container.appendChild(empty);
            return;
        }

        const grid = document.createElement('div');
        grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:14px;margin-top:10px;';
        results.forEach((r, i) => {
            const card = document.createElement('div');
            card.style.cssText = 'background:#fff;border-radius:14px;padding:14px;border:1px solid #e8e4de;display:flex;flex-direction:column;gap:8px;';

            // Thumbnail (proxied to bypass CDN hot-link blocks)
            if (r.thumbnail) {
                const thumb = document.createElement('img');
                thumb.src = '/.netlify/functions/proxy-download?url=' + encodeURIComponent(r.thumbnail);
                thumb.alt = 'Top post by ' + r.author;
                thumb.loading = 'lazy';
                thumb.style.cssText = 'width:100%;height:200px;object-fit:cover;border-radius:10px;background:#f0eee9;';
                thumb.addEventListener('error', () => { thumb.style.display = 'none'; });
                card.appendChild(thumb);
            }

            // Author + rank
            const head = document.createElement('div');
            head.style.cssText = 'display:flex;justify-content:space-between;align-items:center;font-size:13px;color:#0d6e66;font-weight:700;';
            const author = document.createElement('span');
            author.textContent = r.author || '@unknown';
            const rank = document.createElement('span');
            rank.style.cssText = 'background:linear-gradient(135deg,#0d6e66,#0a9b8e);color:#fff;padding:2px 10px;border-radius:999px;font-size:11px;';
            rank.textContent = '#' + (i + 1) + ' viral';
            head.appendChild(author);
            head.appendChild(rank);
            card.appendChild(head);

            // Caption snippet
            const cap = document.createElement('p');
            cap.style.cssText = 'color:#444;font-size:14px;line-height:1.4;margin:0;max-height:4.2em;overflow:hidden;';
            cap.textContent = r.caption || '(no caption)';
            card.appendChild(cap);

            // Engagement stats
            const stats = document.createElement('div');
            stats.style.cssText = 'display:flex;gap:14px;font-size:12px;color:#888;flex-wrap:wrap;';
            stats.innerHTML =
                '<span>❤️ ' + fmtNum(r.likes) + '</span>' +
                '<span>\u{1F441}️ ' + fmtNum(r.views) + '</span>' +
                '<span>\u{1F4AC} ' + fmtNum(r.comments) + '</span>' +
                '<span>\u{1F501} ' + fmtNum(r.shares) + '</span>';
            card.appendChild(stats);

            // "Example" badge for curated/fallback items so users know
            // this isn't live trending and the URL is illustrative only.
            if (r.curated) {
                const badge = document.createElement('div');
                badge.style.cssText = 'display:inline-block;background:#fff8e1;color:#5a4a00;border:1px solid #e8c840;padding:2px 8px;border-radius:6px;font-size:11px;font-weight:600;align-self:flex-start;';
                badge.textContent = '💡 Example (curated)';
                card.appendChild(badge);
            }

            // Actions
            const actions = document.createElement('div');
            actions.style.cssText = 'display:flex;gap:8px;margin-top:auto;';
            const flipBtn = document.createElement('button');
            flipBtn.textContent = '⚡ Flip This';
            flipBtn.style.cssText = 'flex:1;background:linear-gradient(135deg,#0d6e66,#0a9b8e);color:#fff;border:none;padding:10px 14px;border-radius:8px;font-weight:700;font-size:14px;cursor:pointer;';
            flipBtn.addEventListener('click', () => flipFromTrendingCard(r));
            const openBtn = document.createElement('a');
            openBtn.textContent = '↗ Open';
            openBtn.href = r.url;
            openBtn.target = '_blank';
            openBtn.rel = 'noopener';
            // Hide the Open button on curated items — their URLs don't resolve.
            if (r.curated) openBtn.style.display = 'none';
            openBtn.style.cssText = (r.curated ? 'display:none;' : '') + 'background:#fff;color:#0d6e66;border:1.5px solid #0d6e66;padding:10px 14px;border-radius:8px;font-weight:700;font-size:14px;text-decoration:none;text-align:center;';
            actions.appendChild(flipBtn);
            actions.appendChild(openBtn);
            card.appendChild(actions);

            grid.appendChild(card);
        });
        container.appendChild(grid);
    }

    function flipFromTrendingCard(item) {
        // Curated fallback items have placeholder URLs that don't resolve —
        // sending them through URL Extract produces empty/garbage output.
        // Route those to Script Rewrite using the caption directly.
        if (item && item.curated) {
            if (typeof switchTab === 'function') switchTab('script-tab');
            const scriptInput = document.getElementById('scriptInput');
            if (scriptInput) {
                scriptInput.value = item.caption || '';
                scriptInput.dispatchEvent(new Event('input'));
            }
            const rewriteBtn = document.getElementById('rewriteBtn');
            if (rewriteBtn) {
                rewriteBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
                setTimeout(() => rewriteBtn.click(), 250);
            }
            return;
        }
        // Live trending result: paste URL, run extract+flip.
        if (typeof switchTab === 'function') switchTab('url-tab');
        const urlInput = document.getElementById('urlInput');
        if (urlInput) {
            urlInput.value = (item && item.url) || '';
            urlInput.dispatchEvent(new Event('input'));
        }
        const extractBtn = document.getElementById('extractBtn');
        if (extractBtn) {
            extractBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
            setTimeout(() => extractBtn.click(), 250);
        }
    }

    btn.addEventListener('click', async () => {
        const niche = (nicheSelect && nicheSelect.value) || '';
        const hashtag = (hashtagInput && hashtagInput.value.trim()) || '';
        if (!niche && !hashtag) {
            showError('Pick a niche or type a hashtag first.', 'trendingErrorMessage');
            return;
        }
        if (!gateOrPaywall()) return;

        const original = btn.textContent;
        btn.disabled = true;
        btn.textContent = '⏳ Fetching trending posts…';
        container.innerHTML = '<div class="loading">\u{1F525} Pulling the day’s top viral posts…</div>';

        try {
            const res = await fetch('/.netlify/functions/trending', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ niche, hashtag, count: 10 })
            });
            const data = await res.json();

            if (res.status === 429) {
                container.innerHTML = '';
                showError('⚠️ ' + (data.error || 'Daily flip limit reached.'), 'trendingErrorMessage');
                return;
            }
            if (!res.ok || !Array.isArray(data.results)) {
                throw new Error(data.error || 'Trending fetch failed');
            }

            // Stash for filter-chip re-rendering & CSV export (#4).
            window._trendingState = window._trendingState || { sort: 'views', window: 'all' };
            window._trendingState.raw = data.results;
            window._trendingState.niche = niche;
            window._trendingState.hashtag = hashtag;
            const bar = document.getElementById('trendingFilterBar');
            if (bar) bar.style.display = 'block';
            if (typeof window._renderTrendingFiltered === 'function') {
                window._renderTrendingFiltered();
            } else {
                renderCards(data.results);
            }
            recordFlipSuccess();
        } catch (err) {
            container.innerHTML = '';
            console.error('Trending error:', err);
            showError('❌ ' + (err.message || 'Could not fetch trending posts. Please try again.'), 'trendingErrorMessage');
        } finally {
            btn.disabled = false;
            btn.textContent = original;
        }
    });
})();

// ── TAB: 📱 INSTAGRAM BROWSE (Apify-backed) ─────────────────
// Browse posts by @creator, #hashtag, or a direct post URL — and
// one-click "Flip & Rate" any of them without leaving FlipIt.
(function wireInstagramBrowseTab() {
    const btn = document.getElementById('instagramBrowseBtn');
    if (!btn) return;
    const queryInput = document.getElementById('instagramQuery');
    const container = document.getElementById('instagramResults');

    function fmtNum(n) {
        n = Number(n) || 0;
        if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
        if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
        return String(n);
    }

    function fmtDate(iso) {
        if (!iso) return '';
        const d = new Date(iso);
        if (isNaN(d.getTime())) return '';
        const now = new Date();
        const diffDays = Math.floor((now - d) / 86400000);
        if (diffDays < 1) return 'today';
        if (diffDays === 1) return '1d ago';
        if (diffDays < 7) return diffDays + 'd ago';
        if (diffDays < 30) return Math.floor(diffDays / 7) + 'w ago';
        if (diffDays < 365) return Math.floor(diffDays / 30) + 'mo ago';
        return Math.floor(diffDays / 365) + 'y ago';
    }

    function renderPosts(posts) {
        container.innerHTML = '';
        if (!posts || posts.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'result-section';
            empty.innerHTML = '<h3>🔍 No posts found</h3><p class="result-text">No posts found. Try a different name, @handle, or #hashtag.</p>';
            container.appendChild(empty);
            return;
        }

        const grid = document.createElement('div');
        grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:16px;margin-top:10px;';

        posts.forEach((p) => {
            const card = document.createElement('div');
            card.style.cssText = 'background:#fff;border-radius:14px;border:1px solid #e8e4de;display:flex;flex-direction:column;gap:8px;overflow:hidden;';

            // Thumbnail
            if (p.thumbnail) {
                const thumb = document.createElement('img');
                thumb.src = '/.netlify/functions/proxy-download?url=' + encodeURIComponent(p.thumbnail);
                thumb.alt = 'Instagram post by ' + (p.owner || 'unknown');
                thumb.loading = 'lazy';
                thumb.style.cssText = 'width:100%;max-height:280px;height:280px;object-fit:cover;background:#f0eee9;display:block;';
                thumb.addEventListener('error', () => { thumb.style.display = 'none'; });
                card.appendChild(thumb);
            }

            const padded = document.createElement('div');
            padded.style.cssText = 'padding:12px 14px 14px;display:flex;flex-direction:column;gap:8px;flex:1;';

            // Owner + date row
            const head = document.createElement('div');
            head.style.cssText = 'display:flex;justify-content:space-between;align-items:center;font-size:13px;color:#0d6e66;font-weight:700;gap:8px;';
            const owner = document.createElement('span');
            owner.textContent = p.owner || '@unknown';
            owner.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
            const dateEl = document.createElement('span');
            dateEl.style.cssText = 'color:#888;font-weight:500;font-size:12px;flex-shrink:0;';
            dateEl.textContent = fmtDate(p.postedAt);
            head.appendChild(owner);
            head.appendChild(dateEl);
            padded.appendChild(head);

            // Type badges (carousel / video)
            if (p.isCarousel || p.isVideo) {
                const badges = document.createElement('div');
                badges.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;';
                if (p.isVideo) {
                    const b = document.createElement('span');
                    b.style.cssText = 'background:#eef9f7;color:#0a9b8e;border:1px solid #c8ecea;padding:1px 8px;border-radius:6px;font-size:11px;font-weight:600;';
                    b.textContent = '▶ Video';
                    badges.appendChild(b);
                }
                if (p.isCarousel) {
                    const b = document.createElement('span');
                    b.style.cssText = 'background:#fff4e6;color:#a85b00;border:1px solid #f0d8b5;padding:1px 8px;border-radius:6px;font-size:11px;font-weight:600;';
                    b.textContent = '🖼 Carousel';
                    badges.appendChild(b);
                }
                padded.appendChild(badges);
            }

            // Caption preview (first 120 chars)
            const rawCap = (p.caption || '').toString();
            const capText = rawCap.length > 120 ? rawCap.slice(0, 120) + '…' : rawCap;
            const cap = document.createElement('p');
            cap.style.cssText = 'color:#444;font-size:14px;line-height:1.4;margin:0;';
            cap.textContent = capText || '(no caption)';
            padded.appendChild(cap);

            // Engagement
            const stats = document.createElement('div');
            stats.style.cssText = 'display:flex;gap:14px;font-size:12px;color:#888;flex-wrap:wrap;';
            stats.innerHTML =
                '<span>❤️ ' + fmtNum(p.likes) + '</span>' +
                '<span>💬 ' + fmtNum(p.comments) + '</span>';
            padded.appendChild(stats);

            // Actions row
            const actions = document.createElement('div');
            actions.style.cssText = 'display:flex;gap:8px;margin-top:auto;padding-top:6px;';

            const flipBtn = document.createElement('button');
            flipBtn.textContent = '🎯 Flip & Rate';
            flipBtn.style.cssText = 'flex:1;background:linear-gradient(135deg,#0d6e66,#0a9b8e);color:#fff;border:none;padding:10px 12px;border-radius:8px;font-weight:700;font-size:14px;cursor:pointer;';
            flipBtn.addEventListener('click', () => flipAndRate(p));

            const openBtn = document.createElement('a');
            openBtn.textContent = '🔗 Open Post';
            openBtn.href = p.url;
            openBtn.target = '_blank';
            openBtn.rel = 'noopener';
            openBtn.style.cssText = 'background:#fff;color:#0d6e66;border:1.5px solid #0d6e66;padding:10px 12px;border-radius:8px;font-weight:700;font-size:14px;text-decoration:none;text-align:center;flex:1;';

            actions.appendChild(flipBtn);
            actions.appendChild(openBtn);
            padded.appendChild(actions);

            card.appendChild(padded);
            grid.appendChild(card);
        });

        container.appendChild(grid);
    }

    // Switch to URL Extract tab, drop the post URL in, click Extract, then
    // wait for the rendered flip output and auto-click "Rate This Post".
    function flipAndRate(post) {
        if (!post || !post.url) return;
        if (typeof switchTab === 'function') switchTab('url-tab');
        const urlInput = document.getElementById('urlInput');
        if (urlInput) {
            urlInput.value = post.url;
            urlInput.dispatchEvent(new Event('input'));
        }
        const extractBtn = document.getElementById('extractBtn');
        const resultsContainer = document.getElementById('resultsContainer');
        if (!extractBtn) return;
        extractBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });

        // Click Extract. The Trending tab uses a 250ms delay so the tab swap
        // settles before the click — mirror that.
        setTimeout(() => extractBtn.click(), 250);

        // Poll for the "Rate This Post" button to appear in the results, then
        // auto-click it. Bail after ~90s so we don't poll forever on errors.
        const startedAt = Date.now();
        const TIMEOUT_MS = 90000;
        const tick = () => {
            if (Date.now() - startedAt > TIMEOUT_MS) return;
            // Find the rate button by its visible text (it's appended to the
            // results container after a successful flip).
            const candidates = resultsContainer
                ? resultsContainer.querySelectorAll('button')
                : document.querySelectorAll('button');
            for (const b of candidates) {
                const t = (b.textContent || '').trim();
                if (t.indexOf('Rate This Post') !== -1) {
                    if (!b.dataset.flipitAutoRated) {
                        b.dataset.flipitAutoRated = '1';
                        b.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        setTimeout(() => b.click(), 200);
                    }
                    return;
                }
            }
            setTimeout(tick, 500);
        };
        setTimeout(tick, 1500);
    }

    btn.addEventListener('click', async () => {
        const query = (queryInput && queryInput.value.trim()) || '';
        if (!query) {
            showError('Enter a creator name, @handle, #hashtag, or Instagram post URL.', 'instagramErrorMessage');
            return;
        }
        if (!gateOrPaywall()) return;

        const originalLabel = btn.textContent;
        btn.disabled = true;
        btn.textContent = '⏳ Searching Instagram…';
        container.innerHTML = '<div class="loading">⏳ Searching Instagram…</div>';

        try {
            const res = await fetch('/.netlify/functions/instagram-browse', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query, limit: 12 })
            });
            const data = await res.json().catch(() => ({}));

            if (res.status === 429) {
                container.innerHTML = '';
                showError('⚠️ ' + (data.error || 'Daily flip limit reached.'), 'instagramErrorMessage');
                return;
            }
            if (!res.ok || !Array.isArray(data.posts)) {
                container.innerHTML = '';
                showError('❌ ' + (data.error || 'Browse failed. Please try again.'), 'instagramErrorMessage');
                return;
            }

            renderPosts(data.posts);
            if (data.posts.length > 0 && typeof recordFlipSuccess === 'function') {
                recordFlipSuccess();
            }
        } catch (err) {
            console.error('Instagram browse error:', err);
            container.innerHTML = '';
            showError('❌ ' + (err.message || 'Could not browse Instagram. Please try again.'), 'instagramErrorMessage');
        } finally {
            btn.disabled = false;
            btn.textContent = originalLabel;
        }
    });
})();

// ── 🔗 AUTO-FLIP FROM URL PARAM ───────────────────────────
// Honors ?url= or ?u= in the page URL so the Chrome extension /
// bookmarklet / share buttons / any external referrer can deep-link
// directly into a flip. Example:
//   https://flipit.earnwith-ai.com/?url=https%3A%2F%2Finstagram.com%2Fp%2FXYZ
// Validates the inbound URL (must be http(s) and on a known social
// platform) before auto-clicking Extract — prevents abuse where a
// random page redirects users into running flips on attacker URLs.
(function autoFlipFromQuery() {
    try {
        const params = new URLSearchParams(window.location.search || '');
        const raw = (params.get('url') || params.get('u') || '').trim();
        if (!raw) return;
        let parsed;
        try { parsed = new URL(raw); } catch { return; }
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return;
        const allowedHosts = /(?:^|\.)(instagram\.com|instagr\.am|tiktok\.com|youtube\.com|youtu\.be|linkedin\.com|facebook\.com|fb\.watch|twitter\.com|x\.com|threads\.net)$/i;
        if (!allowedHosts.test(parsed.hostname)) return;

        const fire = () => {
            if (typeof switchTab === 'function') switchTab('url-tab');
            const urlInput = document.getElementById('urlInput');
            if (urlInput) {
                urlInput.value = raw;
                urlInput.dispatchEvent(new Event('input'));
            }
            const extractBtn = document.getElementById('extractBtn');
            if (extractBtn) {
                extractBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
                setTimeout(() => extractBtn.click(), 300);
            }
        };

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', fire);
        } else {
            fire();
        }
    } catch (e) {
        console.warn('autoFlipFromQuery failed:', e);
    }
})();

// ── BRAND VOICE PROFILES ──────────────────────────────────────────
// Saved voice presets the creator can switch between. Stored in
// localStorage. Active voice's description is injected into the Script
// Rewrite and Image Prompts backend calls as a STYLE input — backend
// treats it as data, never as instructions.
(function brandVoiceModule() {
    const STORAGE_KEY = 'flipit_voices_v1';
    const ACTIVE_KEY = 'flipit_voices_active_v1';
    const DEFAULT_VOICES = [
        { id: 'generic', name: 'Generic', description: 'Clear, direct, professional. No persona — neutral viral copy.' }
    ];

    function loadVoices() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return DEFAULT_VOICES.slice();
            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed) || parsed.length === 0) return DEFAULT_VOICES.slice();
            return parsed;
        } catch { return DEFAULT_VOICES.slice(); }
    }
    function saveVoices(list) {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); } catch {}
    }
    function getActiveId() {
        try { return localStorage.getItem(ACTIVE_KEY) || 'generic'; } catch { return 'generic'; }
    }
    function setActiveId(id) {
        try { localStorage.setItem(ACTIVE_KEY, id); } catch {}
    }
    function getActive() {
        const voices = loadVoices();
        const id = getActiveId();
        return voices.find(v => v.id === id) || voices[0];
    }
    function getActiveContext() {
        const v = getActive();
        if (!v) return '';
        // Generic voice = pass nothing so the backend uses its default behavior.
        if (v.id === 'generic') return '';
        const lines = [];
        if (v.name) lines.push('Voice name: ' + v.name);
        if (v.description) lines.push('Description: ' + v.description);
        return lines.join('\n');
    }

    function renderInto(host) {
        host.innerHTML = '';
        host.style.cssText = 'background:#faf8f5;border:1px solid #e8e4de;border-radius:10px;padding:12px;margin-bottom:14px;';

        const headerRow = document.createElement('div');
        headerRow.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;gap:8px;flex-wrap:wrap;';
        const label = document.createElement('div');
        label.style.cssText = 'font-weight:700;color:#1a1a2e;font-size:13px;letter-spacing:0.04em;text-transform:uppercase;';
        label.textContent = '🎭 Brand Voice';
        const newBtn = document.createElement('button');
        newBtn.type = 'button';
        newBtn.textContent = '+ New voice';
        newBtn.style.cssText = 'background:#fff;color:#0d6e66;border:1.5px solid #0d6e66;padding:6px 12px;border-radius:8px;font-weight:700;font-size:12px;cursor:pointer;';
        newBtn.addEventListener('click', () => openVoiceModal(null));
        headerRow.appendChild(label);
        headerRow.appendChild(newBtn);
        host.appendChild(headerRow);

        const chipRow = document.createElement('div');
        chipRow.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;';
        const voices = loadVoices();
        const activeId = getActiveId();
        voices.forEach(v => {
            const chip = document.createElement('button');
            chip.type = 'button';
            const isActive = v.id === activeId;
            chip.style.cssText = 'padding:6px 12px;border-radius:999px;font-size:13px;font-weight:600;cursor:pointer;border:1.5px solid ' +
                (isActive ? '#0d6e66' : '#e0dcd5') +
                ';background:' + (isActive ? '#0d6e66' : '#fff') +
                ';color:' + (isActive ? '#fff' : '#444') + ';';
            chip.textContent = v.name;
            chip.addEventListener('click', () => {
                setActiveId(v.id);
                document.querySelectorAll('.brand-voice-bar').forEach(renderInto);
            });
            // Right-click / long-press to edit. On mobile, also expose an edit affordance.
            if (v.id !== 'generic') {
                chip.title = 'Click to use · double-click to edit';
                chip.addEventListener('dblclick', (e) => { e.preventDefault(); openVoiceModal(v); });
            }
            chipRow.appendChild(chip);
        });
        host.appendChild(chipRow);

        const desc = document.createElement('div');
        desc.style.cssText = 'margin-top:8px;font-size:12px;color:#666;line-height:1.4;';
        const active = getActive();
        desc.textContent = active && active.description ? active.description : '';
        host.appendChild(desc);
    }

    function openVoiceModal(existing) {
        // Remove any open modal
        const old = document.getElementById('flipit-voice-modal');
        if (old) old.remove();
        const modal = document.createElement('div');
        modal.id = 'flipit-voice-modal';
        modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:9999;padding:16px;';
        const card = document.createElement('div');
        card.style.cssText = 'background:#fff;border-radius:14px;padding:20px;width:min(94vw,520px);box-shadow:0 20px 60px rgba(0,0,0,0.4);';
        const h3 = document.createElement('h3');
        h3.style.cssText = 'margin:0 0 14px;font-size:19px;color:#1a1a2e;';
        h3.textContent = existing ? '✏️ Edit voice' : '➕ New brand voice';
        card.appendChild(h3);

        const nameLbl = document.createElement('label');
        nameLbl.style.cssText = 'display:block;font-size:13px;font-weight:600;color:#444;margin-bottom:4px;';
        nameLbl.textContent = 'Voice name (short)';
        card.appendChild(nameLbl);
        const nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.maxLength = 30;
        nameInput.placeholder = 'e.g. Empower Her';
        nameInput.value = existing ? existing.name : '';
        nameInput.style.cssText = 'width:100%;padding:10px;border:1.5px solid #e0dcd5;border-radius:8px;font-size:14px;margin-bottom:14px;box-sizing:border-box;';
        card.appendChild(nameInput);

        const descLbl = document.createElement('label');
        descLbl.style.cssText = 'display:block;font-size:13px;font-weight:600;color:#444;margin-bottom:4px;';
        descLbl.textContent = 'Voice description — tone, audience, signature phrases, what to never say';
        card.appendChild(descLbl);
        const descInput = document.createElement('textarea');
        descInput.rows = 6;
        descInput.maxLength = 2000;
        descInput.placeholder = "e.g. Confident female-founder voice. Speaks to ambitious women in their 30s building service businesses. Confronts then invites — never opens with a soft story. Never uses corporate-speak. Signature: 'Here's the part nobody tells you…'";
        descInput.value = existing ? existing.description : '';
        descInput.style.cssText = 'width:100%;padding:10px;border:1.5px solid #e0dcd5;border-radius:8px;font-size:14px;line-height:1.5;margin-bottom:14px;box-sizing:border-box;resize:vertical;';
        card.appendChild(descInput);

        const btnRow = document.createElement('div');
        btnRow.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;';
        const saveBtn = document.createElement('button');
        saveBtn.type = 'button';
        saveBtn.textContent = '💾 Save';
        saveBtn.style.cssText = 'flex:1;padding:11px;background:linear-gradient(135deg,#0d6e66,#0a9b8e);color:#fff;border:none;border-radius:8px;font-weight:700;font-size:14px;cursor:pointer;';
        saveBtn.addEventListener('click', () => {
            const name = nameInput.value.trim().slice(0, 30);
            const description = descInput.value.trim().slice(0, 2000);
            if (!name || !description) { alert('Add both a name and a description.'); return; }
            const voices = loadVoices();
            if (existing) {
                const idx = voices.findIndex(v => v.id === existing.id);
                if (idx >= 0) voices[idx] = { ...existing, name, description };
            } else {
                const id = 'v_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
                voices.push({ id, name, description });
                setActiveId(id);
            }
            saveVoices(voices);
            modal.remove();
            document.querySelectorAll('.brand-voice-bar').forEach(renderInto);
        });
        btnRow.appendChild(saveBtn);

        if (existing && existing.id !== 'generic') {
            const delBtn = document.createElement('button');
            delBtn.type = 'button';
            delBtn.textContent = '🗑️ Delete';
            delBtn.style.cssText = 'padding:11px 14px;background:#fff;color:#c2185b;border:1.5px solid #c2185b;border-radius:8px;font-weight:700;font-size:14px;cursor:pointer;';
            delBtn.addEventListener('click', () => {
                if (!confirm('Delete this voice?')) return;
                const voices = loadVoices().filter(v => v.id !== existing.id);
                saveVoices(voices);
                if (getActiveId() === existing.id) setActiveId('generic');
                modal.remove();
                document.querySelectorAll('.brand-voice-bar').forEach(renderInto);
            });
            btnRow.appendChild(delBtn);
        }

        const cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.textContent = 'Cancel';
        cancelBtn.style.cssText = 'padding:11px 14px;background:#fff;color:#888;border:1.5px solid #ddd;border-radius:8px;font-weight:700;font-size:14px;cursor:pointer;';
        cancelBtn.addEventListener('click', () => modal.remove());
        btnRow.appendChild(cancelBtn);

        card.appendChild(btnRow);
        modal.appendChild(card);
        document.body.appendChild(modal);
        setTimeout(() => nameInput.focus(), 50);
    }

    function renderAll() {
        document.querySelectorAll('.brand-voice-bar').forEach(renderInto);
    }

    window.FlipItVoice = { getActive, getActiveContext, renderAll };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', renderAll);
    } else {
        renderAll();
    }
})();

// ── VIRALSCORE TAB ────────────────────────────────────────────────
// Posts caption + platform to /viral-score and renders the scorecard.
(function viralScoreModule() {
    const btn = document.getElementById('runScoreBtn');
    if (!btn) return;

    function colorFor(score) {
        if (score >= 80) return '#0d6e66';
        if (score >= 60) return '#d97706';
        return '#c2185b';
    }
    function verdictColor(score10) {
        if (score10 >= 8) return '#0d6e66';
        if (score10 >= 6) return '#d97706';
        return '#c2185b';
    }

    function renderScorecard(data) {
        const host = document.getElementById('scoreResultsContainer');
        host.innerHTML = '';

        const section = document.createElement('div');
        section.className = 'result-section';

        const ringWrap = document.createElement('div');
        ringWrap.style.cssText = 'display:flex;justify-content:center;margin-bottom:14px;';
        const ring = document.createElement('div');
        const score10 = Math.round(Number(data.score) * 10) / 10;
        const color = verdictColor(score10);
        ring.style.cssText = 'width:140px;height:140px;border-radius:50%;border:8px solid ' + color + ';display:flex;flex-direction:column;align-items:center;justify-content:center;background:#fff;';
        const big = document.createElement('div');
        big.style.cssText = 'font-size:44px;font-weight:800;color:' + color + ';line-height:1;';
        big.textContent = String(score10);
        const small = document.createElement('div');
        small.style.cssText = 'font-size:13px;color:#888;margin-top:2px;';
        small.textContent = '/10';
        ring.appendChild(big);
        ring.appendChild(small);
        ringWrap.appendChild(ring);
        section.appendChild(ringWrap);

        const verdict = document.createElement('div');
        verdict.style.cssText = 'text-align:center;padding:10px;border-radius:10px;background:' + color + '14;color:' + color + ';font-weight:700;font-size:16px;margin-bottom:10px;border:1px solid ' + color + '40;';
        verdict.textContent = data.verdict || '';
        section.appendChild(verdict);

        if (data.summary) {
            const sum = document.createElement('p');
            sum.style.cssText = 'color:#444;font-size:14px;line-height:1.55;text-align:center;margin:0 8px 16px;';
            sum.textContent = data.summary;
            section.appendChild(sum);
        }

        // Prominent hook — the single strongest opener, right under the score
        // (the full set of alternatives still shows in "Make it a 9–10" below).
        if (Array.isArray(data.hooks) && data.hooks.length) {
            const hookWrap = document.createElement('div');
            hookWrap.style.cssText = 'background:#fff7ed;border:1.5px solid #fed7aa;border-radius:12px;padding:14px;margin:0 0 16px;';
            const hl = document.createElement('div');
            hl.style.cssText = 'font-weight:800;color:#c2410c;font-size:13px;letter-spacing:0.03em;text-transform:uppercase;margin-bottom:7px;';
            hl.textContent = '🪝 Hook to open with';
            hookWrap.appendChild(hl);
            const ht = document.createElement('div');
            ht.style.cssText = 'font-size:16px;line-height:1.5;color:#1a1a2e;font-weight:600;';
            ht.textContent = data.hooks[0];
            hookWrap.appendChild(ht);
            const hc = document.createElement('button');
            hc.textContent = '📋 Copy hook';
            hc.style.cssText = 'margin-top:9px;padding:8px 13px;background:#c2410c;color:#fff;border:none;border-radius:8px;font-weight:600;font-size:13px;cursor:pointer;';
            hc.addEventListener('click', () => {
                navigator.clipboard.writeText(data.hooks[0]).then(() => { hc.textContent = '✅ Copied'; setTimeout(() => { hc.textContent = '📋 Copy hook'; }, 1500); }).catch(() => {});
            });
            hookWrap.appendChild(hc);
            if (data.hooks.length > 1) {
                const more = document.createElement('div');
                more.style.cssText = 'font-size:12px;color:#9a3412;margin-top:8px;';
                more.textContent = '+ ' + (data.hooks.length - 1) + ' more hooks in "Make it a 9–10" below.';
                hookWrap.appendChild(more);
            }
            section.appendChild(hookWrap);
        }

        const dimHeader = document.createElement('h4');
        dimHeader.style.cssText = 'font-size:15px;color:#1a1a2e;margin:14px 0 10px;';
        dimHeader.textContent = '📊 Dimension Breakdown';
        section.appendChild(dimHeader);

        (data.dimensions || []).forEach(dim => {
            const card = document.createElement('div');
            card.style.cssText = 'background:#faf8f5;border:1px solid #e8e4de;border-radius:10px;padding:12px;margin-bottom:10px;';
            const row = document.createElement('div');
            row.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;';
            const lbl = document.createElement('div');
            lbl.style.cssText = 'font-weight:700;color:#1a1a2e;font-size:14px;';
            lbl.textContent = dim.label;
            const num = document.createElement('div');
            const c = colorFor(dim.score);
            num.style.cssText = 'font-weight:800;color:' + c + ';font-size:16px;';
            num.textContent = String(dim.score);
            row.appendChild(lbl);
            row.appendChild(num);
            card.appendChild(row);
            const bar = document.createElement('div');
            bar.style.cssText = 'height:6px;background:#e8e4de;border-radius:999px;overflow:hidden;margin-bottom:8px;';
            const fill = document.createElement('div');
            fill.style.cssText = 'height:100%;background:' + c + ';width:' + Math.max(0, Math.min(100, dim.score)) + '%;transition:width 0.3s;';
            bar.appendChild(fill);
            card.appendChild(bar);
            if (dim.comment) {
                const cm = document.createElement('p');
                cm.style.cssText = 'color:#555;font-size:13px;line-height:1.5;margin:0;';
                cm.textContent = dim.comment;
                card.appendChild(cm);
            }
            section.appendChild(card);
        });

        // ── Make it a 9-10: fixes, stronger hooks, best caption + alts, hashtags ──
        const A = (x) => Array.isArray(x) ? x : [];
        const hasUpgrade = A(data.fixes).length || data.rewrite || A(data.hooks).length
            || A(data.altCaptions).length || A(data.recommendedHashtags).length;
        if (hasUpgrade) {
            const up = document.createElement('div');
            up.style.cssText = 'margin-top:18px;padding-top:16px;border-top:2px dashed #e8e4de;';
            const uh = document.createElement('h4');
            uh.style.cssText = 'font-size:16px;color:#0d6e66;margin:0 0 10px;';
            uh.textContent = '🔧 Make it a 9–10';
            up.appendChild(uh);

            // A labeled box with its own Copy button.
            const copyBox = (label, text, bg) => {
                if (label) {
                    const l = document.createElement('div');
                    l.style.cssText = 'font-weight:700;color:#1a1a2e;font-size:14px;margin:14px 0 6px;';
                    l.textContent = label;
                    up.appendChild(l);
                }
                const box = document.createElement('div');
                box.style.cssText = 'white-space:pre-wrap;background:' + (bg || '#f0faf8') + ';border:1px solid #bfe3dd;border-radius:10px;padding:12px;font-size:14px;line-height:1.6;color:#124;';
                box.textContent = text;
                up.appendChild(box);
                const c = document.createElement('button');
                c.textContent = '📋 Copy';
                c.style.cssText = 'margin-top:6px;padding:8px 13px;background:#0d6e66;color:#fff;border:none;border-radius:8px;font-weight:600;font-size:13px;cursor:pointer;';
                c.addEventListener('click', () => {
                    navigator.clipboard.writeText(text).then(() => { c.textContent = '✅ Copied'; setTimeout(() => { c.textContent = '📋 Copy'; }, 1500); }).catch(() => {});
                });
                up.appendChild(c);
            };

            // Fixes
            if (A(data.fixes).length) {
                const ul = document.createElement('ul');
                ul.style.cssText = 'margin:0 0 8px;padding-left:20px;';
                data.fixes.forEach(f => {
                    const li = document.createElement('li');
                    li.style.cssText = 'color:#333;font-size:14px;line-height:1.55;margin-bottom:7px;';
                    li.textContent = f;
                    ul.appendChild(li);
                });
                up.appendChild(ul);
            }

            // Stronger hooks — each copyable
            if (A(data.hooks).length) {
                const l = document.createElement('div');
                l.style.cssText = 'font-weight:700;color:#1a1a2e;font-size:14px;margin:14px 0 6px;';
                l.textContent = '🪝 Stronger hooks (10/10 openers)';
                up.appendChild(l);
                data.hooks.forEach(h => {
                    const row = document.createElement('div');
                    row.style.cssText = 'display:flex;gap:8px;align-items:flex-start;background:#faf8f5;border:1px solid #e8e4de;border-radius:8px;padding:9px 10px;margin-bottom:6px;';
                    const t = document.createElement('div');
                    t.style.cssText = 'flex:1;font-size:14px;color:#222;line-height:1.45;';
                    t.textContent = h;
                    const cp = document.createElement('button');
                    cp.textContent = '📋'; cp.title = 'Copy hook';
                    cp.style.cssText = 'flex:0 0 auto;padding:5px 9px;background:#fff;color:#0d6e66;border:1.5px solid #0d6e66;border-radius:7px;font-size:12px;cursor:pointer;';
                    cp.addEventListener('click', () => { navigator.clipboard.writeText(h).then(() => { cp.textContent = '✅'; setTimeout(() => { cp.textContent = '📋'; }, 1200); }).catch(() => {}); });
                    row.appendChild(t); row.appendChild(cp);
                    up.appendChild(row);
                });
            }

            // Best caption (the rewrite) + alternatives
            if (data.rewrite) copyBox('✅ Best caption — post this', data.rewrite);
            A(data.altCaptions).forEach((c, i) => copyBox('✍️ Alternative caption ' + (i + 1), c, '#f7f9fb'));

            // Recommended hashtags
            if (A(data.recommendedHashtags).length) {
                copyBox('🔖 Recommended hashtags', data.recommendedHashtags.join(' '), '#f7f9fb');
            }

            section.appendChild(up);
        }

        host.appendChild(section);
    }

    btn.addEventListener('click', async () => {
        const caption = document.getElementById('scoreCaption').value.trim();
        const platform = document.getElementById('scorePlatform').value || 'instagram';
        const hashtags = document.getElementById('scoreHashtags').value.trim();
        if (!caption || caption.length < 10) {
            showError('Paste at least 10 characters of caption to score.', 'scoreErrorMessage');
            return;
        }
        if (typeof gateOrPaywall === 'function' && !gateOrPaywall()) return;

        const origText = btn.textContent;
        btn.disabled = true;
        btn.textContent = '⏳ Scoring…';
        const host = document.getElementById('scoreResultsContainer');
        host.innerHTML = '<div class="loading">⚡ Reading the post & scoring 6 dimensions…</div>';
        try {
            const res = await fetch('/.netlify/functions/viral-score', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ caption, platform, hashtags })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || ('Server returned ' + res.status));
            renderScorecard(data);
        } catch (err) {
            host.innerHTML = '';
            showError('❌ ' + (err.message || 'Scoring failed'), 'scoreErrorMessage');
        } finally {
            btn.disabled = false;
            btn.textContent = origText;
        }
    });
})();

// ── PLUMB BRAND VOICE INTO EXISTING FETCHES ───────────────────────
// Wraps window.fetch for the backend functions that take voiceContext
// (rewrite-script, image-prompts, viral-score). Adds the active voice's
// context to the JSON body if not already set. viral-score uses it only for
// the 9-10 rewrite; scoring stays objective. Leaves every other fetch alone.
(function plumbVoiceIntoFetches() {
    const originalFetch = window.fetch;
    const VOICE_ROUTES = [
        '/.netlify/functions/rewrite-script',
        '/.netlify/functions/image-prompts',
        '/.netlify/functions/viral-score'
    ];
    window.fetch = function (input, init) {
        try {
            const url = typeof input === 'string' ? input : (input && input.url) || '';
            if (init && init.method === 'POST' && VOICE_ROUTES.some(r => url.includes(r))) {
                const ctx = (window.FlipItVoice && window.FlipItVoice.getActiveContext)
                    ? window.FlipItVoice.getActiveContext()
                    : '';
                if (ctx) {
                    try {
                        const parsed = JSON.parse(init.body || '{}');
                        if (typeof parsed === 'object' && parsed && !parsed.voiceContext) {
                            parsed.voiceContext = ctx;
                            init = Object.assign({}, init, { body: JSON.stringify(parsed) });
                        }
                    } catch {}
                }
            }
        } catch {}
        return originalFetch.call(this, input, init);
    };
})();

// ── TRENDING FILTER CHIPS + CSV (#4) ──────────────────────────────
(function trendingFiltersModule() {
    const sortChips = document.getElementById('trendingSortChips');
    const windowChips = document.getElementById('trendingWindowChips');
    const csvBtn = document.getElementById('trendingCsvBtn');
    if (!sortChips || !windowChips || !csvBtn) return;

    const SORT_OPTIONS = [
        { key: 'views',    label: 'Views' },
        { key: 'likes',    label: 'Likes' },
        { key: 'comments', label: 'Comments' },
        { key: 'recent',   label: 'Recent' }
    ];
    const WINDOW_OPTIONS = [
        { key: 'all',  label: 'All Time' },
        { key: 'week', label: 'Last Week' },
        { key: 'month', label: 'Last Month' },
        { key: '3mo',  label: 'Last 3 Months' }
    ];

    function buildChips(host, options, kind) {
        host.innerHTML = '';
        const state = window._trendingState = window._trendingState || { sort: 'views', window: 'all' };
        options.forEach(opt => {
            const chip = document.createElement('button');
            chip.type = 'button';
            const active = state[kind] === opt.key;
            chip.style.cssText = 'padding:6px 14px;border-radius:999px;font-size:13px;font-weight:600;cursor:pointer;border:1.5px solid ' +
                (active ? '#0d6e66' : '#e0dcd5') +
                ';background:' + (active ? '#0d6e66' : '#fff') +
                ';color:' + (active ? '#fff' : '#444') + ';';
            chip.textContent = opt.label;
            chip.addEventListener('click', () => {
                state[kind] = opt.key;
                window._renderTrendingFiltered();
                buildChips(sortChips, SORT_OPTIONS, 'sort');
                buildChips(windowChips, WINDOW_OPTIONS, 'window');
            });
            host.appendChild(chip);
        });
    }

    function withinWindow(item, windowKey) {
        if (windowKey === 'all') return true;
        const ts = item.ts || item.created || item.posted_at || null;
        if (!ts) return true; // backend doesn't return timestamps reliably — don't filter out everything
        const ms = typeof ts === 'number' ? (ts < 1e12 ? ts * 1000 : ts) : Date.parse(ts);
        if (!Number.isFinite(ms)) return true;
        const now = Date.now();
        const day = 86400 * 1000;
        const limits = { week: 7 * day, month: 30 * day, '3mo': 90 * day };
        return (now - ms) <= (limits[windowKey] || Infinity);
    }

    function sortFiltered(results) {
        const state = window._trendingState || { sort: 'views', window: 'all' };
        const filtered = results.filter(r => withinWindow(r, state.window));
        const keyMap = { views: 'views', likes: 'likes', comments: 'comments' };
        if (state.sort === 'recent') {
            return filtered.slice().sort((a, b) => {
                const at = Date.parse(a.ts || a.created || 0) || 0;
                const bt = Date.parse(b.ts || b.created || 0) || 0;
                return bt - at;
            });
        }
        const field = keyMap[state.sort] || 'views';
        return filtered.slice().sort((a, b) => (Number(b[field]) || 0) - (Number(a[field]) || 0));
    }

    window._renderTrendingFiltered = function () {
        const raw = (window._trendingState && window._trendingState.raw) || [];
        const sorted = sortFiltered(raw);
        if (typeof window._trendingRenderCards === 'function') {
            window._trendingRenderCards(sorted);
        }
    };

    csvBtn.addEventListener('click', () => {
        const raw = (window._trendingState && window._trendingState.raw) || [];
        const sorted = sortFiltered(raw);
        if (sorted.length === 0) { alert('Find some trending posts first.'); return; }
        const cols = ['rank','author','caption','url','views','likes','comments','shares'];
        const esc = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
        const lines = [cols.join(',')];
        sorted.forEach((r, i) => {
            lines.push([
                i + 1, r.author || '', r.caption || '', r.url || '',
                r.views || 0, r.likes || 0, r.comments || 0, r.shares || 0
            ].map(esc).join(','));
        });
        const csv = lines.join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const niche = (window._trendingState && (window._trendingState.niche || window._trendingState.hashtag)) || 'flipit';
        const a = document.createElement('a');
        a.href = url;
        a.download = 'flipit-trending-' + niche + '-' + new Date().toISOString().slice(0, 10) + '.csv';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 5000);
    });

    buildChips(sortChips, SORT_OPTIONS, 'sort');
    buildChips(windowChips, WINDOW_OPTIONS, 'window');
})();

// ── HISTORY (#5) ──────────────────────────────────────────────────
// Persist every successful flip/score/prompt-batch into localStorage
// and surface them on a tab. Each entry has { id, kind, title, ts, payload }.
(function historyModule() {
    const STORAGE_KEY = 'flipit_history_v1';
    const CAP = 100;

    function load() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return [];
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : [];
        } catch { return []; }
    }
    function save(list) {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, CAP))); } catch {}
    }
    function add(entry) {
        if (!entry || !entry.kind) return;
        const list = load();
        list.unshift({
            id: 'h_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6),
            ts: Date.now(),
            ...entry
        });
        save(list);
        if (document.getElementById('history-tab').classList.contains('active')) render();
    }
    function remove(id) {
        save(load().filter(e => e.id !== id));
        render();
    }
    function fmtAgo(ts) {
        const d = Math.max(0, Date.now() - ts);
        const s = Math.floor(d / 1000);
        if (s < 60) return s + 's ago';
        const m = Math.floor(s / 60); if (m < 60) return m + 'm ago';
        const h = Math.floor(m / 60); if (h < 24) return h + 'h ago';
        return Math.floor(h / 24) + 'd ago';
    }

    function restore(entry) {
        try {
            if (entry.kind === 'rewrite' && entry.payload) {
                if (typeof switchTab === 'function') switchTab('script-tab');
                const ta = document.getElementById('scriptInput');
                if (ta) { ta.value = entry.payload.original || entry.payload.rewritten || ''; ta.dispatchEvent(new Event('input')); }
            } else if (entry.kind === 'score' && entry.payload) {
                if (typeof switchTab === 'function') switchTab('score-tab');
                const cap = document.getElementById('scoreCaption');
                const plat = document.getElementById('scorePlatform');
                const hash = document.getElementById('scoreHashtags');
                if (cap) cap.value = entry.payload.caption || '';
                if (plat) plat.value = entry.payload.platform || 'instagram';
                if (hash) hash.value = entry.payload.hashtags || '';
            } else if (entry.kind === 'imgprompts' && entry.payload) {
                if (typeof switchTab === 'function') switchTab('imgprompt-tab');
                // Just switch to the tab so the user can regenerate — full restore of every input is brittle.
            }
        } catch (e) { console.warn('history restore failed:', e); }
    }

    function render() {
        const host = document.getElementById('historyResultsContainer');
        if (!host) return;
        host.innerHTML = '';
        const list = load();
        if (list.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'result-section';
            empty.innerHTML = '<h3>📭 Nothing here yet</h3><p class="result-text">Run a flip, score a post, or generate prompts — they\'ll show up here.</p>';
            host.appendChild(empty);
            return;
        }
        const kindIcon = { rewrite: '✍️', score: '⚡', imgprompts: '📸', flip: '🎯' };
        const kindLabel = { rewrite: 'Script Rewrite', score: 'ViralScore', imgprompts: 'Image Prompts', flip: 'URL Flip' };
        list.forEach(entry => {
            const card = document.createElement('div');
            card.style.cssText = 'background:#fff;border:1px solid #e8e4de;border-radius:12px;padding:14px;margin-bottom:10px;display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap;';
            const left = document.createElement('div');
            left.style.cssText = 'flex:1;min-width:200px;';
            const meta = document.createElement('div');
            meta.style.cssText = 'font-size:12px;color:#888;margin-bottom:4px;';
            meta.textContent = (kindIcon[entry.kind] || '•') + ' ' + (kindLabel[entry.kind] || entry.kind) + ' · ' + fmtAgo(entry.ts);
            left.appendChild(meta);
            const title = document.createElement('div');
            title.style.cssText = 'font-weight:700;color:#1a1a2e;font-size:14px;line-height:1.4;';
            title.textContent = entry.title || '(untitled)';
            left.appendChild(title);
            if (entry.kind === 'score' && entry.payload && typeof entry.payload.score === 'number') {
                const sc = document.createElement('div');
                sc.style.cssText = 'margin-top:4px;font-size:13px;color:#0d6e66;font-weight:700;';
                sc.textContent = 'Score: ' + entry.payload.score + '/10 — ' + (entry.payload.verdict || '');
                left.appendChild(sc);
            }
            card.appendChild(left);
            const actions = document.createElement('div');
            actions.style.cssText = 'display:flex;gap:6px;';
            const open = document.createElement('button');
            open.type = 'button';
            open.textContent = '↗ Open';
            open.style.cssText = 'background:#0d6e66;color:#fff;border:none;padding:8px 12px;border-radius:8px;font-weight:700;font-size:12px;cursor:pointer;';
            open.addEventListener('click', () => restore(entry));
            const del = document.createElement('button');
            del.type = 'button';
            del.textContent = '🗑️';
            del.style.cssText = 'background:#fff;color:#888;border:1px solid #ddd;padding:8px 10px;border-radius:8px;font-size:12px;cursor:pointer;';
            del.addEventListener('click', () => remove(entry.id));
            actions.appendChild(open);
            actions.appendChild(del);
            card.appendChild(actions);
            host.appendChild(card);
        });
    }

    const clearBtn = document.getElementById('clearHistoryBtn');
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            if (!confirm('Delete all history on this device?')) return;
            save([]);
            render();
        });
    }

    // Re-render when the History tab becomes visible.
    document.querySelectorAll('[data-tab="history-tab"]').forEach(btn => {
        btn.addEventListener('click', render);
    });

    window.FlipItHistory = { add, render };
    render();
})();

// Auto-record successful runs in History. Hook into the same fetches we
// already plumb. Records ONLY successful responses with useful payloads.
(function historyRecorder() {
    const HOOKS = {
        '/.netlify/functions/rewrite-script': async (reqBody, data) => {
            window.FlipItHistory && window.FlipItHistory.add({
                kind: 'rewrite',
                title: (reqBody.script || '').slice(0, 80) || 'Rewrite',
                payload: { original: reqBody.script, rewritten: data.rewritten, hook: data.hook, cta: data.cta }
            });
        },
        '/.netlify/functions/viral-score': async (reqBody, data) => {
            window.FlipItHistory && window.FlipItHistory.add({
                kind: 'score',
                title: (reqBody.caption || '').slice(0, 80) || 'ViralScore',
                payload: { caption: reqBody.caption, platform: reqBody.platform, hashtags: reqBody.hashtags, score: data.score, verdict: data.verdict }
            });
        },
        '/.netlify/functions/image-prompts': async (reqBody, data) => {
            window.FlipItHistory && window.FlipItHistory.add({
                kind: 'imgprompts',
                title: (reqBody.flippedScript || reqBody.niche || 'Image prompts').slice(0, 80),
                payload: { count: Array.isArray(data.prompts) ? data.prompts.length : 0 }
            });
        }
    };
    const originalFetch = window.fetch;
    window.fetch = function (input, init) {
        const url = typeof input === 'string' ? input : (input && input.url) || '';
        const hookKey = Object.keys(HOOKS).find(k => url.includes(k));
        if (!hookKey || !init || init.method !== 'POST') {
            return originalFetch.call(this, input, init);
        }
        let reqBody = {};
        try { reqBody = JSON.parse(init.body || '{}'); } catch {}
        const p = originalFetch.call(this, input, init);
        // Clone the response so the original handler still gets to read it.
        p.then(resp => {
            if (!resp || !resp.ok) return;
            resp.clone().json().then(data => HOOKS[hookKey](reqBody, data)).catch(() => {});
        }).catch(() => {});
        return p;
    };
})();

// ── PDF EXPORT (#6) ───────────────────────────────────────────────
// Adds a "📄 Export PDF" button to the three main result containers
// after content lands. Uses native window.print() with the @media
// print stylesheet that hides everything outside .pdf-export-target.
(function pdfExportModule() {
    const TARGETS = [
        { selector: '#scriptResultsContainer', label: 'rewrite' },
        { selector: '#scoreResultsContainer', label: 'score' },
        { selector: '#resultsContainer', label: 'flip' }
    ];

    function ensurePdfButton(container) {
        if (!container || container.querySelector('.pdf-export-btn')) return;
        if (!container.querySelector('.result-section')) return;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'pdf-export-btn pdf-hide';
        btn.textContent = '📄 Export PDF';
        btn.style.cssText = 'background:#fff;color:#0d6e66;border:1.5px solid #0d6e66;padding:8px 14px;border-radius:8px;font-weight:700;font-size:13px;cursor:pointer;margin:6px 0 12px;';
        btn.addEventListener('click', () => {
            container.classList.add('pdf-export-target');
            const cleanup = () => { container.classList.remove('pdf-export-target'); window.removeEventListener('afterprint', cleanup); };
            window.addEventListener('afterprint', cleanup);
            window.print();
            // Safari sometimes doesn't fire afterprint — clean up on a timer too.
            setTimeout(cleanup, 8000);
        });
        container.insertBefore(btn, container.firstChild);
    }

    // Watch each target for new children and inject the button.
    TARGETS.forEach(t => {
        const c = document.querySelector(t.selector);
        if (!c) return;
        const mo = new MutationObserver(() => ensurePdfButton(c));
        mo.observe(c, { childList: true, subtree: false });
        ensurePdfButton(c);
    });
})();

// ── CLIENT-SIDE ROUTING (#7) ──────────────────────────────────────
// Tab clicks sync to location.hash so each tab feels like its own page,
// URLs are shareable, and back/forward buttons work. Zero structural
// change to the markup — keeps the single-page architecture.
(function routingModule() {
    const TAB_TO_HASH = {
        'url-tab': '#extract',
        'analyze-tab': '#analyze',
        'trending-tab': '#discover',
        'instagram-tab': '#instagram',
        'script-tab': '#rewrite',
        'ideas-tab': '#ideas',
        'imgprompt-tab': '#image-prompts',
        'eraser-tab': '#eraser',
        'score-tab': '#score',
        'scenes-tab': '#scenes',
        'transcribe-tab': '#transcribe',
        'history-tab': '#history'
    };
    const HASH_TO_TAB = Object.fromEntries(Object.entries(TAB_TO_HASH).map(([k, v]) => [v, k]));

    function syncHashFromTab() {
        const active = document.querySelector('.tab-content.active');
        if (!active) return;
        const hash = TAB_TO_HASH[active.id];
        if (hash && location.hash !== hash) {
            history.replaceState(null, '', hash);
        }
    }
    function applyHash() {
        const tab = HASH_TO_TAB[location.hash];
        if (tab && typeof switchTab === 'function') {
            switchTab(tab);
        }
    }
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tab = btn.dataset.tab;
            const hash = TAB_TO_HASH[tab];
            if (hash) history.pushState(null, '', hash);
        });
    });
    window.addEventListener('hashchange', applyHash);
    applyHash();
    syncHashFromTab();
})();

// ── SCENE GRABBER (#A) ────────────────────────────────────────────
// Takes a video upload, POSTs to /extract-scenes, renders a grid of
// scene-change frames with individual + Download-All buttons.
(function sceneGrabberModule() {
    const fileInput = document.getElementById('scenesFile');
    const drop = document.getElementById('scenesDrop');
    const status = document.getElementById('scenesStatus');
    const results = document.getElementById('scenesResultsContainer');
    if (!fileInput || !drop || !status || !results) return;

    const MAX_BYTES = 18 * 1024 * 1024;

    function setStatus(msg, ok) {
        status.textContent = msg || '';
        status.style.color = ok === false ? '#c2185b' : (ok === true ? '#0d6e66' : '#555');
    }

    async function handleFile(file) {
        if (!file) return;
        if (!/^video\//i.test(file.type) && !/\.(mp4|mov|m4v|webm)$/i.test(file.name)) {
            setStatus("That doesn't look like a video. Try MP4, MOV, or WebM.", false);
            return;
        }
        if (file.size > MAX_BYTES) {
            setStatus(`File is ${(file.size/1048576).toFixed(1)} MB — please use one under 18 MB.`, false);
            return;
        }
        if (typeof gateOrPaywall === 'function' && !gateOrPaywall()) return;

        setStatus('⏳ Reading video…', null);
        try {
            const buf = await file.arrayBuffer();
            const bytes = new Uint8Array(buf);
            let binStr = '';
            const CHUNK = 0x8000;
            for (let i = 0; i < bytes.length; i += CHUNK) {
                binStr += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
            }
            const rawBase64 = btoa(binStr);
            const baseName = (file.name || 'flipit-scenes').replace(/\.[a-z0-9]{2,4}$/i, '');

            setStatus('⏳ Detecting scene changes (5–15s, normal)…', null);
            const modeSel = document.getElementById('scenesMode');
            const data = await postHeavyJob(
                '/extract-scenes',
                '/.netlify/functions/extract-scenes',
                { videoData: rawBase64, mode: (modeSel && modeSel.value) || 'scene' }
            );
            if (!data.success || !Array.isArray(data.scenes) || data.scenes.length === 0) {
                throw new Error(data.error || 'No scenes detected.');
            }
            const note = data.truncated ? ` (showing first ${data.count} of ${data.detected})` : '';
            setStatus(`✅ Found ${data.count} scene${data.count === 1 ? '' : 's'}${note}.`, true);
            renderScenes(data.scenes, baseName);
        } catch (err) {
            console.error('Scene grabber failed:', err);
            setStatus('❌ ' + (err.message || 'Could not extract scenes.'), false);
        }
    }

    function jpegToBlob(b64) {
        const bin = atob(b64);
        const arr = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
        return new Blob([arr], { type: 'image/jpeg' });
    }

    function renderScenes(scenes, baseName) {
        results.innerHTML = '';
        const section = document.createElement('div');
        section.className = 'result-section';

        const heading = document.createElement('h3');
        heading.textContent = `🎞️ ${scenes.length} scene${scenes.length === 1 ? '' : 's'} detected`;
        section.appendChild(heading);

        const dlAll = document.createElement('button');
        dlAll.type = 'button';
        dlAll.textContent = `⬇️ Download all ${scenes.length}`;
        dlAll.style.cssText = 'display:inline-flex;align-items:center;gap:8px;padding:14px 24px;background:linear-gradient(135deg,#0d6e66,#0a9b8e);color:#fff;border:none;border-radius:10px;font-weight:700;font-size:16px;cursor:pointer;margin-bottom:12px;width:100%;justify-content:center;';
        section.appendChild(dlAll);

        const grid = document.createElement('div');
        grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px;';
        section.appendChild(grid);

        const perCardBtns = [];
        scenes.forEach(sc => {
            const card = document.createElement('div');
            card.style.cssText = 'background:#fff;border:1px solid #e8e4de;border-radius:12px;padding:10px;display:flex;flex-direction:column;gap:8px;';
            const img = document.createElement('img');
            img.src = 'data:image/jpeg;base64,' + sc.base64;
            img.alt = 'Scene ' + sc.index;
            img.loading = 'lazy';
            img.style.cssText = 'width:100%;height:auto;border-radius:8px;display:block;background:#f0eee9;';
            card.appendChild(img);

            const btn = document.createElement('button');
            btn.type = 'button';
            btn.textContent = '⬇️ Scene ' + sc.index;
            btn.style.cssText = 'background:#fff;color:#0d6e66;border:1.5px solid #0d6e66;padding:8px 12px;border-radius:8px;font-weight:700;font-size:13px;cursor:pointer;';
            btn.addEventListener('click', () => downloadOne(sc, baseName));
            card.appendChild(btn);
            grid.appendChild(card);
            perCardBtns.push({ sc, btn });
        });

        results.appendChild(section);

        dlAll.addEventListener('click', async () => {
            for (const { sc, btn } of perCardBtns) {
                const old = btn.textContent;
                btn.textContent = '⏳…';
                try {
                    downloadOne(sc, baseName);
                    btn.textContent = '✅ Saved';
                } catch (e) {
                    btn.textContent = '❌ Failed';
                }
                // Small stagger so browsers don't drop rapid-fire downloads.
                await new Promise(r => setTimeout(r, 400));
                btn.textContent = old;
            }
        });
    }

    function downloadOne(sc, baseName) {
        const blob = jpegToBlob(sc.base64);
        if (!blob || blob.size < 64) throw new Error('empty image');
        const url = URL.createObjectURL(blob);
        const fname = baseName + '-scene-' + String(sc.index).padStart(2, '0') + '.jpg';
        // Use the app-wide saver: it handles iOS (long-press modal) where a
        // raw anchor download silently saves an empty file, and falls back to
        // an anchor click on desktop.
        if (typeof triggerSave === 'function') {
            triggerSave(url, 'image/jpeg', fname);
        } else {
            const a = document.createElement('a');
            a.href = url;
            a.download = fname;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        }
        setTimeout(() => URL.revokeObjectURL(url), 60000);
    }

    fileInput.addEventListener('change', (e) => {
        const f = e.target.files && e.target.files[0];
        fileInput.value = '';
        handleFile(f);
    });
    ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, (e) => {
        e.preventDefault(); e.stopPropagation();
        drop.style.background = '#e8f4f3';
    }));
    ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, (e) => {
        e.preventDefault(); e.stopPropagation();
        drop.style.background = '#f7fbfa';
    }));
    drop.addEventListener('drop', (e) => {
        const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        handleFile(f);
    });

    // Paste-a-link scene grab: server downloads the video + pulls scenes, so
    // there's no upload and no size limit. Tiny request → direct to Railway
    // (90s window for download+ffmpeg), Netlify proxy as fallback.
    const urlInput = document.getElementById('scenesUrl');
    const urlBtn = document.getElementById('scenesUrlBtn');
    if (urlBtn && urlInput) {
        const runUrl = async () => {
            const link = urlInput.value.trim();
            if (!/^https?:\/\//i.test(link)) {
                setStatus('Paste a valid video link (TikTok, YouTube, Instagram).', false);
                return;
            }
            if (typeof gateOrPaywall === 'function' && !gateOrPaywall()) return;
            urlBtn.disabled = true;
            const orig = urlBtn.textContent;
            urlBtn.textContent = '⏳ Downloading + grabbing scenes…';
            setStatus('⏳ Fetching video + detecting scenes (10–40s)…', null);
            try {
                if (/instagram\.com|instagr\.am/i.test(link)) setStatus('⏳ Finding the Instagram video…', null);
                const fetchUrl = await resolveMediaLink(link);   // IG → direct CDN url; else unchanged
                const modeSel = document.getElementById('scenesMode');
                const data = await postHeavyJob(
                    '/extract-scenes-url',
                    '/.netlify/functions/extract-scenes-url',
                    { url: fetchUrl, mode: (modeSel && modeSel.value) || 'scene' }
                );
                if (!data.success || !Array.isArray(data.scenes) || data.scenes.length === 0) {
                    throw new Error(data.error || 'No scenes detected.');
                }
                const note = data.truncated ? ` (showing first ${data.count} of ${data.detected})` : '';
                setStatus(`✅ Found ${data.count} scene${data.count === 1 ? '' : 's'}${note}.`, true);
                const base = (link.split('/').filter(Boolean).pop() || 'flipit-scenes').replace(/[^a-z0-9]+/gi, '-').slice(0, 40);
                renderScenes(data.scenes, base);
            } catch (err) {
                console.error('Scenes-url failed:', err);
                setStatus('❌ ' + (err.message || 'Could not grab scenes from that link.'), false);
            } finally {
                urlBtn.disabled = false;
                urlBtn.textContent = orig;
            }
        };
        urlBtn.addEventListener('click', runUrl);
        urlInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') runUrl(); });
    }
})();

// ── TRANSCRIBE (Whisper) ──────────────────────────────────────────
// Uploads a video to Railway (/transcribe-video) which extracts the audio
// with ffmpeg then calls OpenAI Whisper — no size cap. Shows the full spoken
// transcript + timestamped segments, with Copy + Flip This Script buttons.
(function transcribeModule() {
    const fileInput = document.getElementById('transcribeFile');
    const drop = document.getElementById('transcribeDrop');
    const status = document.getElementById('transcribeStatus');
    const results = document.getElementById('transcribeResultsContainer');
    if (!fileInput || !drop || !status || !results) return;

    // Transcribe goes direct to Railway, which extracts the audio before
    // Whisper — so the full 18MB video cap applies (no small-file limit).
    const MAX_BYTES = 18 * 1024 * 1024;

    function setStatus(msg, ok) {
        status.textContent = msg || '';
        status.style.color = ok === false ? '#c2185b' : (ok === true ? '#0d6e66' : '#555');
    }

    function fmtTime(sec) {
        const s = Math.max(0, Math.round(sec));
        const m = Math.floor(s / 60);
        const r = s % 60;
        return m + ':' + String(r).padStart(2, '0');
    }

    async function handleFile(file) {
        if (!file) return;
        if (!/^video\//i.test(file.type) && !/\.(mp4|mov|m4v|webm)$/i.test(file.name)) {
            setStatus("That doesn't look like a video. Try MP4, MOV, or WebM.", false);
            return;
        }
        if (file.size > MAX_BYTES) {
            setStatus(`That clip is ${(file.size/1048576).toFixed(1)} MB — please use one under 18 MB.`, false);
            return;
        }
        if (typeof gateOrPaywall === 'function' && !gateOrPaywall()) return;

        setStatus('⏳ Reading video…', null);
        try {
            const buf = await file.arrayBuffer();
            const bytes = new Uint8Array(buf);
            let binStr = '';
            const CHUNK = 0x8000;
            for (let i = 0; i < bytes.length; i += CHUNK) {
                binStr += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
            }
            const rawBase64 = btoa(binStr);

            setStatus('⏳ Extracting audio + transcribing (5–20s)…', null);
            // Railway extracts the audio (shrinks 16MB → ~0.5MB) then calls
            // Whisper, so there's no size cap. Direct-to-Railway first, with the
            // Netlify proxy as a fallback. The Netlify whisper-transcribe path
            // stays available for tiny clips if Railway is ever down.
            const data = await postHeavyJob(
                '/transcribe-video',
                '/.netlify/functions/transcribe-video',
                { videoData: rawBase64 }
            );
            if (!data.success || !data.transcript) {
                throw new Error(data.error || 'No transcript returned.');
            }
            setStatus(`✅ Transcribed ${Math.round(data.duration || 0)}s of ${data.language || 'audio'}.`, true);
            renderTranscript(data);
        } catch (err) {
            console.error('Transcribe failed:', err);
            setStatus('❌ ' + (err.message || 'Transcription failed.'), false);
        }
    }

    function renderTranscript(data) {
        results.innerHTML = '';
        const section = document.createElement('div');
        section.className = 'result-section';

        const heading = document.createElement('h3');
        heading.textContent = '🎙️ Spoken Transcript';
        section.appendChild(heading);

        const full = document.createElement('div');
        full.style.cssText = 'background:#faf8f5;border:1px solid #e8e4de;border-radius:10px;padding:14px;line-height:1.6;color:#1a1a2e;font-size:15px;white-space:pre-wrap;margin-bottom:12px;';
        full.textContent = data.transcript;
        section.appendChild(full);

        const actions = document.createElement('div');
        actions.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px;';

        const copyBtn = document.createElement('button');
        copyBtn.type = 'button';
        copyBtn.textContent = '📋 Copy transcript';
        copyBtn.style.cssText = 'flex:1;min-width:140px;padding:12px;background:#fff;color:#0d6e66;border:1.5px solid #0d6e66;border-radius:8px;font-weight:700;font-size:14px;cursor:pointer;';
        copyBtn.addEventListener('click', () => {
            navigator.clipboard.writeText(data.transcript).then(() => {
                const old = copyBtn.textContent;
                copyBtn.textContent = '✅ Copied';
                setTimeout(() => { copyBtn.textContent = old; }, 1500);
            }).catch(() => {});
        });
        actions.appendChild(copyBtn);

        const flipBtn = document.createElement('button');
        flipBtn.type = 'button';
        flipBtn.textContent = '✨ Flip this script';
        flipBtn.style.cssText = 'flex:2;min-width:160px;padding:12px;background:linear-gradient(135deg,#0d6e66,#0a9b8e);color:#fff;border:none;border-radius:8px;font-weight:700;font-size:14px;cursor:pointer;';
        flipBtn.addEventListener('click', () => {
            if (typeof switchTab === 'function') switchTab('script-tab');
            const ta = document.getElementById('scriptInput');
            if (ta) { ta.value = data.transcript; ta.dispatchEvent(new Event('input')); }
            const rewriteBtn = document.getElementById('rewriteBtn');
            if (rewriteBtn) {
                rewriteBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
                setTimeout(() => rewriteBtn.click(), 250);
            }
        });
        actions.appendChild(flipBtn);

        section.appendChild(actions);

        if (Array.isArray(data.segments) && data.segments.length > 0) {
            const details = document.createElement('details');
            details.style.cssText = 'background:#fff;border:1px solid #e8e4de;border-radius:10px;padding:10px 14px;';
            const summary = document.createElement('summary');
            summary.textContent = `⏱️ ${data.segments.length} timestamped segments`;
            summary.style.cssText = 'cursor:pointer;font-weight:700;color:#1a1a2e;font-size:14px;';
            details.appendChild(summary);
            const list = document.createElement('div');
            list.style.cssText = 'margin-top:10px;';
            data.segments.forEach(seg => {
                const row = document.createElement('div');
                row.style.cssText = 'display:flex;gap:10px;padding:6px 0;border-top:1px dashed #eee;';
                const t = document.createElement('div');
                t.style.cssText = 'color:#0d6e66;font-weight:700;font-size:13px;min-width:80px;font-variant-numeric:tabular-nums;';
                t.textContent = fmtTime(seg.start) + ' – ' + fmtTime(seg.end);
                const txt = document.createElement('div');
                txt.style.cssText = 'flex:1;color:#444;font-size:14px;line-height:1.5;';
                txt.textContent = seg.text;
                row.appendChild(t);
                row.appendChild(txt);
                list.appendChild(row);
            });
            details.appendChild(list);
            section.appendChild(details);
        }

        results.appendChild(section);

        if (window.FlipItHistory && window.FlipItHistory.add) {
            window.FlipItHistory.add({
                kind: 'rewrite',
                title: '🎙️ ' + data.transcript.slice(0, 80),
                payload: { original: data.transcript }
            });
        }
    }

    fileInput.addEventListener('change', (e) => {
        const f = e.target.files && e.target.files[0];
        fileInput.value = '';
        handleFile(f);
    });
    ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, (e) => {
        e.preventDefault(); e.stopPropagation();
        drop.style.background = '#e8f4f3';
    }));
    ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, (e) => {
        e.preventDefault(); e.stopPropagation();
        drop.style.background = '#f7fbfa';
    }));
    drop.addEventListener('drop', (e) => {
        const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        handleFile(f);
    });

    // Paste-a-link transcribe: server downloads the audio + runs Whisper, so
    // there's no upload and no size limit. Tiny request → direct to Railway
    // (90s window for the download+transcribe), Netlify proxy as fallback.
    const urlInput = document.getElementById('transcribeUrl');
    const urlBtn = document.getElementById('transcribeUrlBtn');
    if (urlBtn && urlInput) {
        const runUrl = async () => {
            const link = urlInput.value.trim();
            if (!/^https?:\/\//i.test(link)) {
                setStatus('Paste a valid video link (TikTok, YouTube, Instagram).', false);
                return;
            }
            if (typeof gateOrPaywall === 'function' && !gateOrPaywall()) return;
            urlBtn.disabled = true;
            const orig = urlBtn.textContent;
            urlBtn.textContent = '⏳ Downloading + transcribing…';
            setStatus('⏳ Fetching audio + transcribing — a few seconds for short clips, up to ~2 min for long videos…', null);
            try {
                if (/instagram\.com|instagr\.am/i.test(link)) setStatus('⏳ Finding the Instagram video…', null);
                const fetchUrl = await resolveMediaLink(link);   // IG → direct CDN url; else unchanged
                const data = await transcribeViaPoll(fetchUrl, (n) => {
                    if (n === 3) setStatus('⏳ Still transcribing — long videos can take 1–2 min…', null);
                });
                if (!data.success || !data.transcript) {
                    throw new Error(data.error || 'No transcript returned.');
                }
                setStatus(`✅ Transcribed ${Math.round(data.duration || 0)}s of ${data.language || 'audio'}.`, true);
                renderTranscript(data);
            } catch (err) {
                console.error('Transcribe-url failed:', err);
                setStatus('❌ ' + (err.message || 'Could not transcribe that link.'), false);
            } finally {
                urlBtn.disabled = false;
                urlBtn.textContent = orig;
            }
        };
        urlBtn.addEventListener('click', runUrl);
        urlInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') runUrl(); });
    }
})();

// ── ANALYZE ALL (one link → transcript + scenes + viral score) ────
// Paste a link once; run Transcribe, Scene Grabber and ViralScore together and
// stack all three results so the user reviews everything in one place. Reuses
// the global transports: resolveMediaLink() (IG → direct url), postHeavyJob()
// (heavy Railway jobs), triggerSave() (iOS-safe image save). ViralScore has no
// URL input, so it scores the TRANSCRIPT (the spoken script) once we have it.
(function analyzeAllModule() {
    const btn = document.getElementById('analyzeAllBtn');
    if (!btn) return;
    const urlInput = document.getElementById('analyzeUrl');
    const modeSel = document.getElementById('analyzeMode');
    const statusEl = document.getElementById('analyzeStatus');
    const results = document.getElementById('analyzeResults');

    function setStatus(msg, ok) {
        statusEl.textContent = msg || '';
        statusEl.style.color = ok === false ? '#c2185b' : (ok === true ? '#0d6e66' : '#555');
    }
    function platformFromUrl(u) {
        if (/tiktok\.com|vm\.tiktok|vt\.tiktok/i.test(u)) return 'tiktok';
        if (/youtube\.com|youtu\.be/i.test(u)) return 'youtube';
        if (/instagram\.com|instagr\.am/i.test(u)) return 'instagram';
        if (/twitter\.com|x\.com/i.test(u)) return 'x';
        return 'instagram';
    }
    // Pre-create a titled card and return its body element to fill. All three
    // cards appear immediately (with spinners) then fill in as each job
    // finishes — so completion order never scrambles the layout.
    function card(title) {
        const c = document.createElement('div');
        c.className = 'result-section';
        c.style.cssText = 'margin-bottom:16px;';
        const h = document.createElement('h4');
        h.style.cssText = 'font-size:16px;color:#1a1a2e;margin:0 0 10px;';
        h.textContent = title;
        const body = document.createElement('div');
        body.innerHTML = '<div class="loading">⏳ Working…</div>';
        c.appendChild(h); c.appendChild(body);
        results.appendChild(c);
        return body;
    }
    function fail(body, msg) {
        body.innerHTML = '';
        const p = document.createElement('p');
        p.style.cssText = 'color:#c2185b;font-size:14px;margin:0;';
        p.textContent = '❌ ' + msg;
        body.appendChild(p);
    }
    function renderTranscript(body, data) {
        body.innerHTML = '';
        const meta = document.createElement('div');
        meta.style.cssText = 'font-size:12px;color:#888;margin-bottom:8px;';
        meta.textContent = Math.round(data.duration || 0) + 's · ' + (data.language || 'audio');
        const pre = document.createElement('div');
        pre.style.cssText = 'white-space:pre-wrap;background:#faf8f5;border:1px solid #e8e4de;border-radius:10px;padding:12px;font-size:14px;line-height:1.6;color:#222;max-height:320px;overflow:auto;';
        pre.textContent = data.transcript || '';
        const copy = document.createElement('button');
        copy.textContent = '📋 Copy script';
        copy.style.cssText = 'margin-top:8px;padding:9px 14px;background:#0d6e66;color:#fff;border:none;border-radius:8px;font-weight:600;font-size:13px;cursor:pointer;';
        copy.addEventListener('click', () => {
            navigator.clipboard.writeText(data.transcript || '').then(() => {
                copy.textContent = '✅ Copied'; setTimeout(() => { copy.textContent = '📋 Copy script'; }, 1500);
            }).catch(() => {});
        });
        body.appendChild(meta); body.appendChild(pre); body.appendChild(copy);
    }
    function renderScenes(body, scenes, base) {
        body.innerHTML = '';
        const grid = document.createElement('div');
        grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px;';
        scenes.forEach(sc => {
            const cell = document.createElement('div');
            const img = document.createElement('img');
            img.src = 'data:image/jpeg;base64,' + sc.base64;
            img.style.cssText = 'width:100%;border-radius:8px;display:block;';
            const dl = document.createElement('button');
            dl.textContent = '⬇ Save';
            dl.style.cssText = 'width:100%;margin-top:4px;padding:6px;background:#0d6e66;color:#fff;border:none;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;';
            dl.addEventListener('click', () => {
                try {
                    const bin = atob(sc.base64);
                    const arr = new Uint8Array(bin.length);
                    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
                    const blob = new Blob([arr], { type: 'image/jpeg' });
                    if (blob.size < 64) return;
                    const u = URL.createObjectURL(blob);
                    const fn = base + '-scene-' + String(sc.index).padStart(2, '0') + '.jpg';
                    if (typeof triggerSave === 'function') triggerSave(u, 'image/jpeg', fn);
                    else { const a = document.createElement('a'); a.href = u; a.download = fn; document.body.appendChild(a); a.click(); a.remove(); }
                    setTimeout(() => URL.revokeObjectURL(u), 60000);
                } catch (e) { /* ignore a single bad frame */ }
            });
            cell.appendChild(img); cell.appendChild(dl);
            grid.appendChild(cell);
        });
        body.appendChild(grid);
    }
    function renderScore(body, data) {
        body.innerHTML = '';
        const s10 = Math.round(Number(data.score) * 10) / 10;
        const col = s10 >= 8 ? '#0d6e66' : (s10 >= 6 ? '#d97706' : '#c2185b');
        const top = document.createElement('div');
        top.style.cssText = 'text-align:center;margin-bottom:10px;';
        top.innerHTML = '<div style="font-size:40px;font-weight:800;color:' + col + ';line-height:1;">' + s10 + '<span style="font-size:16px;color:#888;">/10</span></div><div style="font-weight:700;color:' + col + ';margin-top:4px;"></div>';
        top.lastChild.textContent = data.verdict || '';
        body.appendChild(top);
        if (data.summary) {
            const sum = document.createElement('p');
            sum.style.cssText = 'color:#444;font-size:13px;line-height:1.5;text-align:center;margin:0 0 12px;';
            sum.textContent = data.summary;
            body.appendChild(sum);
        }
        // Prominent hook right under the score.
        if (Array.isArray(data.hooks) && data.hooks.length) {
            const hw = document.createElement('div');
            hw.style.cssText = 'background:#fff7ed;border:1.5px solid #fed7aa;border-radius:10px;padding:11px;margin:0 0 12px;';
            const hl = document.createElement('div');
            hl.style.cssText = 'font-weight:800;color:#c2410c;font-size:12px;letter-spacing:0.03em;text-transform:uppercase;margin-bottom:5px;';
            hl.textContent = '🪝 Hook to open with';
            const ht = document.createElement('div');
            ht.style.cssText = 'font-size:14px;line-height:1.45;color:#1a1a2e;font-weight:600;';
            ht.textContent = data.hooks[0];
            const hc = document.createElement('button');
            hc.textContent = '📋 Copy hook';
            hc.style.cssText = 'margin-top:7px;padding:6px 11px;background:#c2410c;color:#fff;border:none;border-radius:8px;font-weight:600;font-size:12px;cursor:pointer;';
            hc.addEventListener('click', () => { navigator.clipboard.writeText(data.hooks[0]).then(() => { hc.textContent = '✅ Copied'; setTimeout(() => { hc.textContent = '📋 Copy hook'; }, 1500); }).catch(() => {}); });
            hw.appendChild(hl); hw.appendChild(ht); hw.appendChild(hc);
            body.appendChild(hw);
        }
        (data.dimensions || []).forEach(d => {
            const c = d.score >= 80 ? '#0d6e66' : (d.score >= 60 ? '#d97706' : '#c2185b');
            const row = document.createElement('div');
            row.style.cssText = 'margin-bottom:8px;';
            const head = document.createElement('div');
            head.style.cssText = 'display:flex;justify-content:space-between;font-size:13px;font-weight:600;color:#1a1a2e;';
            const lbl = document.createElement('span'); lbl.textContent = d.label;
            const val = document.createElement('span'); val.style.color = c; val.textContent = String(d.score);
            head.appendChild(lbl); head.appendChild(val);
            const barWrap = document.createElement('div');
            barWrap.style.cssText = 'height:5px;background:#e8e4de;border-radius:999px;margin:4px 0;overflow:hidden;';
            const bar = document.createElement('div');
            bar.style.cssText = 'height:100%;background:' + c + ';width:' + Math.max(0, Math.min(100, d.score)) + '%;';
            barWrap.appendChild(bar);
            row.appendChild(head); row.appendChild(barWrap);
            if (d.comment) {
                const cm = document.createElement('div');
                cm.style.cssText = 'font-size:12px;color:#555;line-height:1.45;';
                cm.textContent = d.comment;
                row.appendChild(cm);
            }
            body.appendChild(row);
        });

        // Make it a 9-10: fixes, stronger hooks, best caption + alts, hashtags.
        const A = (x) => Array.isArray(x) ? x : [];
        if (A(data.fixes).length || data.rewrite || A(data.hooks).length || A(data.altCaptions).length || A(data.recommendedHashtags).length) {
            const up = document.createElement('div');
            up.style.cssText = 'margin-top:14px;padding-top:12px;border-top:2px dashed #e8e4de;';
            const uh = document.createElement('div');
            uh.style.cssText = 'font-weight:800;color:#0d6e66;font-size:14px;margin-bottom:8px;';
            uh.textContent = '🔧 Make it a 9–10';
            up.appendChild(uh);

            const copyBox = (label, text, bg) => {
                if (label) {
                    const l = document.createElement('div');
                    l.style.cssText = 'font-weight:700;color:#1a1a2e;font-size:13px;margin:12px 0 5px;';
                    l.textContent = label;
                    up.appendChild(l);
                }
                const box = document.createElement('div');
                box.style.cssText = 'white-space:pre-wrap;background:' + (bg || '#f0faf8') + ';border:1px solid #bfe3dd;border-radius:10px;padding:11px;font-size:13px;line-height:1.55;color:#124;';
                box.textContent = text;
                up.appendChild(box);
                const c = document.createElement('button');
                c.textContent = '📋 Copy';
                c.style.cssText = 'margin-top:6px;padding:7px 12px;background:#0d6e66;color:#fff;border:none;border-radius:8px;font-weight:600;font-size:12px;cursor:pointer;';
                c.addEventListener('click', () => { navigator.clipboard.writeText(text).then(() => { c.textContent = '✅ Copied'; setTimeout(() => { c.textContent = '📋 Copy'; }, 1500); }).catch(() => {}); });
                up.appendChild(c);
            };

            if (A(data.fixes).length) {
                const ul = document.createElement('ul');
                ul.style.cssText = 'margin:0 0 8px;padding-left:18px;';
                data.fixes.forEach(f => {
                    const li = document.createElement('li');
                    li.style.cssText = 'color:#333;font-size:13px;line-height:1.5;margin-bottom:6px;';
                    li.textContent = f;
                    ul.appendChild(li);
                });
                up.appendChild(ul);
            }
            if (A(data.hooks).length) {
                const l = document.createElement('div');
                l.style.cssText = 'font-weight:700;color:#1a1a2e;font-size:13px;margin:12px 0 5px;';
                l.textContent = '🪝 Stronger hooks';
                up.appendChild(l);
                data.hooks.forEach(h => {
                    const row = document.createElement('div');
                    row.style.cssText = 'display:flex;gap:8px;align-items:flex-start;background:#faf8f5;border:1px solid #e8e4de;border-radius:8px;padding:8px 9px;margin-bottom:5px;';
                    const t = document.createElement('div'); t.style.cssText = 'flex:1;font-size:13px;color:#222;line-height:1.4;'; t.textContent = h;
                    const cp = document.createElement('button'); cp.textContent = '📋'; cp.title = 'Copy hook';
                    cp.style.cssText = 'flex:0 0 auto;padding:4px 8px;background:#fff;color:#0d6e66;border:1.5px solid #0d6e66;border-radius:7px;font-size:11px;cursor:pointer;';
                    cp.addEventListener('click', () => { navigator.clipboard.writeText(h).then(() => { cp.textContent = '✅'; setTimeout(() => { cp.textContent = '📋'; }, 1200); }).catch(() => {}); });
                    row.appendChild(t); row.appendChild(cp); up.appendChild(row);
                });
            }
            if (data.rewrite) copyBox('✅ Best caption — post this', data.rewrite);
            A(data.altCaptions).forEach((c, i) => copyBox('✍️ Alternative caption ' + (i + 1), c, '#f7f9fb'));
            if (A(data.recommendedHashtags).length) copyBox('🔖 Recommended hashtags', data.recommendedHashtags.join(' '), '#f7f9fb');

            body.appendChild(up);
        }
    }

    async function run() {
        const link = (urlInput.value || '').trim();
        if (!/^https?:\/\//i.test(link)) { setStatus('Paste a valid video link (TikTok, YouTube, Instagram).', false); return; }
        if (typeof gateOrPaywall === 'function' && !gateOrPaywall()) return;
        btn.disabled = true;
        const orig = btn.textContent;
        btn.textContent = '⏳ Analyzing…';
        results.innerHTML = '';
        const tBody = card('🎙️ Spoken Script');
        const scBody = card('🎞️ Scenes');
        const vBody = card('🔥 Viral Score (of the script)');

        // Resolve Instagram ONCE so all three jobs reuse the same direct url
        // (one Apify run, not three). Non-IG links pass straight through.
        let url = link;
        try {
            if (/instagram\.com|instagr\.am/i.test(link)) setStatus('⏳ Finding the Instagram video…', null);
            url = await resolveMediaLink(link);
        } catch (e) {
            const msg = e.message || 'Could not fetch that link.';
            fail(tBody, msg); fail(scBody, msg); fail(vBody, msg);
            setStatus('❌ ' + msg, false);
            btn.disabled = false; btn.textContent = orig; return;
        }

        setStatus('⏳ Transcribing, grabbing scenes & scoring…', null);
        const mode = (modeSel && modeSel.value) || 'scene';
        const base = (link.split('/').filter(Boolean).pop() || 'flipit').replace(/[^a-z0-9]+/gi, '-').slice(0, 40);

        // Scenes — independent job, runs in parallel with transcribe.
        const scenesP = postHeavyJob('/extract-scenes-url', '/.netlify/functions/extract-scenes-url', { url, mode })
            .then(d => {
                if (!d.success || !Array.isArray(d.scenes) || !d.scenes.length) throw new Error(d.error || 'No scenes detected.');
                renderScenes(scBody, d.scenes, base);
            })
            .catch(e => fail(scBody, e.message || 'Scene grab failed.'));

        // Transcript — then score the spoken script it produces.
        const transP = transcribeViaPoll(url)
            .then(async d => {
                if (!d.success || !d.transcript) throw new Error(d.error || 'No transcript returned.');
                renderTranscript(tBody, d);
                try {
                    const res = await fetch('/.netlify/functions/viral-score', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ caption: d.transcript, platform: platformFromUrl(link), hashtags: '' })
                    });
                    const sd = await res.json();
                    if (!res.ok) throw new Error(sd.error || ('Server returned ' + res.status));
                    renderScore(vBody, sd);
                } catch (e) { fail(vBody, e.message || 'Scoring failed.'); }
            })
            .catch(e => { fail(tBody, e.message || 'Transcribe failed.'); fail(vBody, 'Needs the script first — transcription failed.'); });

        await Promise.allSettled([scenesP, transP]);
        setStatus('✅ Done — review each section below and keep what you want.', true);
        btn.disabled = false; btn.textContent = orig;
    }

    btn.addEventListener('click', run);
    urlInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') run(); });
})();

// ── PROFILE → TOP 5 VIRAL POSTS (Discover) ────────────────────────
// Paste an Instagram profile/page link (or @handle) → that account's top 5
// posts ranked by likes + comments. Backed by /profile-top, which scrapes the
// profile via Apify ASYNC (start + poll) so it doesn't 502 like a sync browse.
(function profileTopModule() {
    const btn = document.getElementById('profileTopBtn');
    if (!btn) return;
    const input = document.getElementById('profileTopUrl');
    const statusEl = document.getElementById('profileTopStatus');
    const results = document.getElementById('profileTopResults');

    function setStatus(msg, ok) {
        statusEl.textContent = msg || '';
        statusEl.style.color = ok === false ? '#c2185b' : (ok === true ? '#0d6e66' : '#555');
    }
    function fmt(n) {
        n = Number(n) || 0;
        if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
        if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
        return String(n);
    }
    async function call(payload) {
        let resp;
        try {
            resp = await fetch('/.netlify/functions/profile-top', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                signal: AbortSignal.timeout(20000)
            });
        } catch (e) {
            throw new Error('Could not reach the lookup — check your connection and retry.');
        }
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) throw new Error(data.error || ('Lookup error (' + resp.status + ').'));
        return data;
    }
    function dateLabel(iso) {
        if (!iso) return '';
        const t = Date.parse(iso);
        if (!t) return '';
        try { return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); }
        catch (e) { return ''; }
    }
    function buildCard(p, i) {
        const card = document.createElement('div');
        card.style.cssText = 'display:flex;gap:12px;background:#faf8f5;border:1px solid #e8e4de;border-radius:12px;padding:12px;margin-bottom:10px;';
        const left = document.createElement('div');
        left.style.cssText = 'flex:0 0 88px;position:relative;';
        const rank = document.createElement('div');
        rank.style.cssText = 'position:absolute;top:4px;left:4px;background:#0d6e66;color:#fff;font-weight:800;font-size:12px;padding:2px 7px;border-radius:999px;z-index:1;';
        rank.textContent = '#' + (i + 1);
        left.appendChild(rank);
        if (p.thumbnail) {
            const img = document.createElement('img');
            img.src = p.thumbnail; img.loading = 'lazy'; img.referrerPolicy = 'no-referrer';
            img.style.cssText = 'width:88px;height:88px;object-fit:cover;border-radius:8px;display:block;background:#eee;';
            img.onerror = function () { this.style.display = 'none'; };
            left.appendChild(img);
        }
        card.appendChild(left);
        const bd = document.createElement('div');
        bd.style.cssText = 'flex:1;min-width:0;';
        const eng = document.createElement('div');
        eng.style.cssText = 'font-weight:700;color:#1a1a2e;font-size:14px;margin-bottom:2px;';
        eng.textContent = '❤️ ' + fmt(p.likes) + '   💬 ' + fmt(p.comments) + (p.isVideo ? '   🎬 Reel' : '');
        bd.appendChild(eng);
        const dl = dateLabel(p.postedAt);
        if (dl) {
            const dt = document.createElement('div');
            dt.style.cssText = 'font-size:11px;color:#999;margin-bottom:6px;';
            dt.textContent = '📅 ' + dl;
            bd.appendChild(dt);
        }
        if (p.caption) {
            const cap = document.createElement('div');
            cap.style.cssText = 'color:#555;font-size:13px;line-height:1.45;margin-bottom:8px;max-height:56px;overflow:hidden;';
            cap.textContent = p.caption;
            bd.appendChild(cap);
        }
        const actions = document.createElement('div');
        actions.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;';
        const open = document.createElement('a');
        open.href = p.url; open.target = '_blank'; open.rel = 'noopener';
        open.textContent = 'Open ↗';
        open.style.cssText = 'text-decoration:none;padding:7px 12px;background:#fff;color:#0d6e66;border:1.5px solid #0d6e66;border-radius:8px;font-weight:700;font-size:12px;';
        actions.appendChild(open);
        const analyze = document.createElement('button');
        analyze.type = 'button'; analyze.textContent = '🎯 Analyze';
        analyze.style.cssText = 'padding:7px 12px;background:#0d6e66;color:#fff;border:none;border-radius:8px;font-weight:700;font-size:12px;cursor:pointer;';
        analyze.addEventListener('click', () => {
            const a = document.getElementById('analyzeUrl');
            if (a) a.value = p.url;
            if (typeof switchTab === 'function') switchTab('analyze-tab');
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
        actions.appendChild(analyze);
        bd.appendChild(actions);
        card.appendChild(bd);
        return card;
    }
    function renderList(title, posts) {
        const wrap = document.createElement('div');
        wrap.className = 'result-section';
        wrap.style.cssText = 'margin-bottom:18px;';
        const h = document.createElement('h4');
        h.style.cssText = 'font-size:16px;color:#1a1a2e;margin:0 0 12px;';
        h.textContent = title;
        wrap.appendChild(h);
        posts.forEach((p, i) => wrap.appendChild(buildCard(p, i)));
        return wrap;
    }
    // ── Saved scrapes: persist across reloads, each with its own delete ──
    // Kept in localStorage so results stay on the page after a reload and
    // accumulate (scrape several accounts, keep the ones you want). Thumbnails
    // are signed CDN urls that expire, so an old card may lose its image — the
    // links, captions, counts and dates still work (img onerror hides broken).
    const LS_KEY = 'flipit_profile_scrapes';
    const MAX_SAVED = 15;
    function loadSaved() {
        try { const a = JSON.parse(localStorage.getItem(LS_KEY) || '[]'); return Array.isArray(a) ? a : []; }
        catch (e) { return []; }
    }
    function persist(arr) {
        try { localStorage.setItem(LS_KEY, JSON.stringify(arr.slice(0, MAX_SAVED))); } catch (e) { /* quota — stays in memory */ }
    }
    let saved = loadSaved();

    function savedStamp(ms) {
        if (!ms) return '';
        try {
            const d = new Date(ms);
            return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' ' +
                   d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
        } catch (e) { return ''; }
    }
    function renderScrapeBlock(entry) {
        const block = document.createElement('div');
        block.style.cssText = 'border:1px solid #e0dcd5;border-radius:14px;padding:14px;margin-bottom:16px;background:#fff;';
        const head = document.createElement('div');
        head.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:12px;flex-wrap:wrap;';
        const title = document.createElement('div');
        title.style.cssText = 'font-weight:800;color:#1a1a2e;font-size:15px;';
        title.textContent = (entry.account || 'Profile') + ' — top viral + recent';
        const meta = document.createElement('div');
        meta.style.cssText = 'display:flex;align-items:center;gap:10px;';
        const when = document.createElement('span');
        when.style.cssText = 'font-size:11px;color:#999;';
        when.textContent = entry.savedAt ? 'saved ' + savedStamp(entry.savedAt) : '';
        const del = document.createElement('button');
        del.type = 'button';
        del.textContent = '✕ Delete';
        del.style.cssText = 'padding:6px 11px;background:#fff;color:#c2185b;border:1.5px solid #f0c0d0;border-radius:8px;font-weight:700;font-size:12px;cursor:pointer;';
        del.addEventListener('click', () => deleteScrape(entry.id));
        meta.appendChild(when); meta.appendChild(del);
        head.appendChild(title); head.appendChild(meta);
        block.appendChild(head);
        block.appendChild(renderList('🏆 Top ' + (entry.posts || []).length + ' viral', entry.posts || []));
        if (Array.isArray(entry.recent) && entry.recent.length) {
            block.appendChild(renderList('🆕 Most recent', entry.recent));
        }
        return block;
    }
    function renderAll() {
        results.innerHTML = '';
        if (!saved.length) return;
        if (saved.length > 1) {
            const bar = document.createElement('div');
            bar.style.cssText = 'display:flex;justify-content:flex-end;margin-bottom:8px;';
            const clear = document.createElement('button');
            clear.type = 'button';
            clear.textContent = '🗑 Clear all (' + saved.length + ')';
            clear.style.cssText = 'padding:6px 12px;background:#fff;color:#c2185b;border:1.5px solid #f0c0d0;border-radius:8px;font-weight:700;font-size:12px;cursor:pointer;';
            clear.addEventListener('click', () => { saved = []; persist(saved); renderAll(); });
            bar.appendChild(clear);
            results.appendChild(bar);
        }
        saved.forEach(entry => results.appendChild(renderScrapeBlock(entry)));
    }
    function deleteScrape(id) {
        saved = saved.filter(e => e.id !== id);
        persist(saved);
        renderAll();
    }
    function saveScrape(account, posts, recent) {
        const entry = {
            id: 'ps_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
            account, savedAt: Date.now(), posts, recent
        };
        saved.unshift(entry);
        if (saved.length > MAX_SAVED) saved = saved.slice(0, MAX_SAVED);
        persist(saved);
        renderAll();
    }
    // Shared core: start the run + poll until posts arrive. Returns
    // { account, posts, recent } or throws a friendly error.
    async function pullProfile(link) {
        const started = await call({ url: link });
        if (!started.runId) throw new Error(started.error || 'Could not start the lookup.');
        const account = started.account || '';
        const sleep = (ms) => new Promise(r => setTimeout(r, ms));
        for (let i = 0; i < 20; i++) {
            await sleep(3000);
            const p = await call({ runId: started.runId, datasetId: started.datasetId });
            if (Array.isArray(p.posts)) return { account, posts: p.posts, recent: Array.isArray(p.recent) ? p.recent : [] };
            if (p.error) throw new Error(p.error);
        }
        throw new Error('Taking too long — try again, or check the handle.');
    }
    async function run() {
        const link = (input.value || '').trim();
        if (!link) { setStatus('Paste an Instagram profile link or @handle.', false); return; }
        if (typeof gateOrPaywall === 'function' && !gateOrPaywall()) return;
        btn.disabled = true;
        const orig = btn.textContent;
        btn.textContent = '⏳ Finding…';
        // Note: do NOT clear results here — previously-saved scrapes stay on the page.
        setStatus('⏳ Pulling their posts — top viral + most recent (~30s)…', null);
        try {
            const r = await pullProfile(link);
            if (!r.posts.length) throw new Error('No public posts found for that profile.');
            saveScrape(r.account, r.posts, r.recent);   // persists + renders; stays on the page
            setStatus('✅ Saved to the page — hit ✕ Delete on any set when you\'re done.', true);
            if (input) input.value = '';
        } catch (e) {
            setStatus('❌ ' + (e.message || 'Lookup failed.'), false);
        } finally {
            btn.disabled = false;
            btn.textContent = orig;
        }
    }

    // ── Watchlist: save creators, pull their top 4 viral in one tap ──
    const WL_KEY = 'flipit_watchlist';
    const WL_MAX = 12;
    const addBtn = document.getElementById('watchlistAddBtn');
    const pullBtn = document.getElementById('watchlistPullBtn');
    const chipsEl = document.getElementById('watchlistChips');
    function loadWatchlist() {
        try { const a = JSON.parse(localStorage.getItem(WL_KEY) || '[]'); return Array.isArray(a) ? a : []; }
        catch (e) { return []; }
    }
    function saveWatchlist(a) { try { localStorage.setItem(WL_KEY, JSON.stringify(a.slice(0, WL_MAX))); } catch (e) { /* quota */ } }
    let watchlist = loadWatchlist();
    function normalizeHandle(raw) {
        const q = (raw || '').trim();
        if (!q) return '';
        const m = q.match(/instagram\.com\/([A-Za-z0-9._]+)/i);
        const h = m ? m[1] : q.replace(/^@/, '');
        return h.replace(/[^A-Za-z0-9._]/g, '').toLowerCase().slice(0, 40);
    }
    function renderChips() {
        if (!chipsEl) return;
        chipsEl.innerHTML = '';
        if (!watchlist.length) {
            const empty = document.createElement('span');
            empty.style.cssText = 'font-size:12px;color:#aaa;';
            empty.textContent = 'No creators yet — add some above.';
            chipsEl.appendChild(empty);
            return;
        }
        watchlist.forEach(h => {
            const chip = document.createElement('span');
            chip.style.cssText = 'display:inline-flex;align-items:center;gap:6px;background:#f0faf8;border:1px solid #bfe3dd;border-radius:999px;padding:5px 8px 5px 11px;font-size:13px;color:#124;';
            const t = document.createElement('span'); t.textContent = '@' + h;
            const x = document.createElement('button');
            x.type = 'button'; x.textContent = '✕'; x.title = 'Remove';
            x.style.cssText = 'border:none;background:transparent;color:#0d6e66;font-size:13px;line-height:1;cursor:pointer;padding:0 2px;';
            x.addEventListener('click', () => { watchlist = watchlist.filter(w => w !== h); saveWatchlist(watchlist); renderChips(); });
            chip.appendChild(t); chip.appendChild(x);
            chipsEl.appendChild(chip);
        });
    }
    function addToWatchlist() {
        const h = normalizeHandle(input.value);
        if (!h) { setStatus('Type a creator handle or profile link to add.', false); return; }
        if (watchlist.includes(h)) { setStatus('@' + h + ' is already on your watchlist.', null); if (input) input.value = ''; return; }
        if (watchlist.length >= WL_MAX) { setStatus('Watchlist is full (' + WL_MAX + '). Remove one first.', false); return; }
        watchlist.push(h); saveWatchlist(watchlist); renderChips();
        setStatus('⭐ Added @' + h + ' to your watchlist.', true);
        if (input) input.value = '';
    }
    async function pullWatchlist() {
        if (!watchlist.length) { setStatus('Add creators to your watchlist first.', false); return; }
        if (typeof gateOrPaywall === 'function' && !gateOrPaywall()) return;
        const list = watchlist.slice();
        pullBtn.disabled = true; btn.disabled = true;
        let done = 0, failed = 0;
        const tick = () => setStatus('🗓️ Pulling ' + list.length + ' creator' + (list.length === 1 ? '' : 's') + '… ' + done + '/' + list.length + ' done (~40s)', null);
        tick();
        // Pull all in parallel; each saves its top-4 block as it finishes.
        await Promise.allSettled(list.map(h =>
            pullProfile('@' + h)
                .then(r => { if (r.posts && r.posts.length) saveScrape(r.account || ('@' + h), r.posts.slice(0, 4), []); done++; tick(); })
                .catch(() => { failed++; done++; tick(); })
        ));
        pullBtn.disabled = false; btn.disabled = false;
        setStatus('✅ Watchlist pulled — top 4 viral each' + (failed ? ' (' + failed + ' couldn\'t load)' : '') + '. Tap 🎯 Analyze on any post to prep it.', failed ? null : true);
    }

    if (addBtn) addBtn.addEventListener('click', addToWatchlist);
    if (pullBtn) pullBtn.addEventListener('click', pullWatchlist);
    btn.addEventListener('click', run);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') run(); });
    renderChips();      // show saved watchlist
    renderAll();        // restore previously-saved scrapes on page load
})();

// ── HEAVY VIDEO JOB TRANSPORT ─────────────────────────────────────
// Scene-grab / transcribe / erase / transcode all POST multi-MB base64
// bodies. Netlify Functions HARD-CAP both request and response at 6MB,
// so routing a real-sized video through the proxy returns a non-JSON 400
// before our code even runs (the "Server error 400 / Unexpected token"
// the user hit). Railway (plain Flask, CORS-enabled) has no such cap, so
// we POST directly there first and only fall back to the Netlify proxy
// when the direct call fails at the NETWORK level — the original
// "Failed to fetch" case where a corporate/mobile network blocks
// *.up.railway.app. Big files work; blocked networks still degrade.
const FLIPIT_RAILWAY_BASE = 'https://web-production-8afc3.up.railway.app';

async function readHeavyJobResponse(resp) {
    const text = await resp.text();
    let data;
    try {
        data = JSON.parse(text);
    } catch {
        if (resp.status === 413 || /too large|payload too/i.test(text)) {
            throw new Error('That file is too large — try one under ~15 MB or a shorter clip.');
        }
        throw new Error('Server error (' + resp.status + '). Try a shorter or smaller file.');
    }
    if (!resp.ok) throw new Error(data.error || ('Server returned ' + resp.status));
    return data;
}

// Instagram links can't be downloaded server-side by Railway's yt-dlp without
// login cookies — that's the "Whisper API error / Could not fetch" IG users
// hit. Resolve IG links to a DIRECT CDN video URL first (via /resolve-ig, the
// same cookie-free Apify path the Download tab uses), then hand that plain URL
// to Railway, which fetches direct CDN files fine. Non-IG links pass straight
// through. Throws a friendly message the caller surfaces on failure.
//
// The Apify scraper takes ~30-40s — longer than a Netlify Function can live —
// so /resolve-ig starts the run and we POLL it here: start once, then check
// every 3s (up to ~60s) until it returns the direct URL.
async function resolveMediaLink(link) {
    if (!/instagram\.com|instagr\.am/i.test(link)) return link;
    const call = async (payload) => {
        let resp;
        try {
            resp = await fetch('/.netlify/functions/resolve-ig', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                signal: AbortSignal.timeout(20000)
            });
        } catch (e) {
            throw new Error('Could not reach the Instagram resolver — check your connection and retry.');
        }
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) throw new Error(data.error || ('Instagram resolver error (' + resp.status + ').'));
        return data;
    };
    // Start the async Apify run.
    const started = await call({ url: link });
    if (started.videoUrl) return started.videoUrl;       // fast path (unlikely)
    if (!started.runId) throw new Error(started.error || 'Could not start the Instagram fetch — try again.');
    // Poll until the run finishes (~30-40s typical; give it up to 60s).
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    for (let i = 0; i < 20; i++) {
        await sleep(3000);
        const p = await call({ runId: started.runId, datasetId: started.datasetId });
        if (p.videoUrl) return p.videoUrl;
        if (p.error) throw new Error(p.error);
        // else status:'running' — keep waiting
    }
    throw new Error('Instagram is taking too long to respond — try again, or use a TikTok/YouTube link.');
}

// Transcription runs as a background job (start → poll) so long videos work:
// the old single-request approach died on the Netlify proxy's ~24s cap and on
// networks that drop a long-held direct connection to Railway. Every call here
// is short and goes through the Netlify proxy (reliably reachable) → Railway.
async function transcribeViaPoll(fetchUrl, onTick) {
    const call = async (payload) => {
        let resp;
        try {
            resp = await fetch('/.netlify/functions/transcribe-async', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                signal: AbortSignal.timeout(20000)
            });
        } catch (e) {
            throw new Error('Could not reach the transcriber — check your connection and retry.');
        }
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok && !data.status) throw new Error(data.error || ('Transcribe error (' + resp.status + ').'));
        return data;
    };
    const started = await call({ url: fetchUrl });
    if (started.result && started.result.success) return started.result;   // fast path
    if (!started.jobId) throw new Error(started.error || 'Could not start transcription.');
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    for (let i = 0; i < 90; i++) {   // poll ~4.5 min max
        await sleep(3000);
        const p = await call({ jobId: started.jobId });
        if (p.status === 'done') {
            const r = p.result || {};
            if (!r.success) throw new Error(r.error || 'No transcript returned.');
            return r;
        }
        if (p.status === 'unknown') throw new Error(p.error || 'That transcription expired — please try again.');
        if (typeof onTick === 'function') onTick(i + 1);
        // else status:'running' — keep polling
    }
    throw new Error('Transcription is taking too long — try a shorter clip (under ~25 min).');
}

async function postHeavyJob(railwayPath, netlifyProxyPath, payloadObj, timeoutMs) {
    const body = JSON.stringify(payloadObj);
    const ceiling = timeoutMs || 120000;   // callers pass more for long jobs (e.g. transcribe)
    // 1) Direct to Railway — no 6MB cap. Ceiling covers slow ffmpeg/Whisper jobs.
    try {
        const resp = await fetch(FLIPIT_RAILWAY_BASE + railwayPath, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body,
            signal: AbortSignal.timeout(ceiling)
        });
        return await readHeavyJobResponse(resp);
    } catch (directErr) {
        const nm = (directErr && directErr.name) || '';
        const ms = (directErr && directErr.message) || '';
        // A TIMEOUT means the job is just slow/large (e.g. a long video). The
        // Netlify proxy caps at 6MB + ~26s, so it would only fail worse and
        // return the confusing "proxy failed: aborted due to timeout". Don't
        // mask the real cause — surface a clear message instead.
        const isTimeout = nm === 'TimeoutError' || nm === 'AbortError' || /abort|timed?\s?out/i.test(ms);
        // A genuine NETWORK failure (blocked *.up.railway.app) is the only case
        // worth the proxy fallback — the original "Failed to fetch" case.
        const isNetwork = nm === 'TypeError' || /failed to fetch|load failed|networkerror/i.test(ms);
        if (isTimeout && !isNetwork) {
            throw new Error('That video is taking too long — it may be very long. Try a shorter clip (roughly under ~20 min), or try again.');
        }
        if (!isNetwork) throw directErr;
        const resp = await fetch(netlifyProxyPath, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body
        });
        return await readHeavyJobResponse(resp);
    }
}
