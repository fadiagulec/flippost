// FlipIt popup script — opens the current tab's URL in FlipIt.
// Site URL comes from config.js (loaded first in popup.html).
const FLIPIT_SITE = ((typeof FLIPIT_EXT_CONFIG !== 'undefined'
    && FLIPIT_EXT_CONFIG.siteUrl) || '').replace(/\/+$/, '');

// Header links follow the same config, so nothing here is hardcoded.
document.querySelectorAll('[data-flipit-path]').forEach((a) => {
    a.href = FLIPIT_SITE + a.getAttribute('data-flipit-path');
});

document.getElementById('openBtn').addEventListener('click', async () => {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        const targetUrl = (tab && tab.url) || '';
        chrome.tabs.create({ url: FLIPIT_SITE + '/?url=' + encodeURIComponent(targetUrl) });
    } catch (e) {
        chrome.tabs.create({ url: FLIPIT_SITE + '/' });
    }
});
