// Backend URL
const BACKEND_URL = 'https://web-production-8afc3.up.railway.app';

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
    instagram: '📷',
    tiktok: '🎵',
    youtube: '▶️',
    linkedin: '💼',
    facebook: '👥',
    x: '𝕏',
    threads: '🧵'
};

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
    document.getElementById(tabName).classList.add('active');
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
}

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
function showPlatformBadge(url) {
    const platform = detectPlatform(url);
    const badge = document.getElementById('platformBadge');

    if (platform) {
        badge.textContent = `${platformEmojis[platform]} ${platform.toUpperCase()} detected`;
        badge.style.display = 'inline-block';
        document.getElementById('actionButtons').style.display = 'flex';
        return platform;
    } else {
        badge.style.display = 'none';
        document.getElementById('actionButtons').style.display = 'none';
        return null;
    }
}

// URL Input Event Listener
document.getElementById('urlInput').addEventListener('input', (e) => {
    const url = e.target.value.trim();
    if (url) {
        showPlatformBadge(url);
    } else {
        document.getElementById('platformBadge').style.display = 'none';
        document.getElementById('actionButtons').style.display = 'none';
    }
});

// ── DOWNLOAD ──────────────────────────────────────────────
document.getElementById('downloadBtn').addEventListener('click', handleDownload);

async function handleDownload() {
    const url = document.getElementById('urlInput').value.trim();
    if (!url) { showError('Please enter a URL', 'errorMessage'); return; }

    const platform = detectPlatform(url);
    if (!platform) { showError('URL not recognized.', 'errorMessage'); return; }

    const btn = document.getElementById('downloadBtn');
    const orig = btn.textContent;
    btn.disabled = true;
    btn.textContent = '⏳ Downloading...';

    try {
        const res = await fetch(`${BACKEND_URL}/download`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url })
        });

        if (!res.ok) { const e = await res.json(); throw new Error(e.error || 'Download failed'); }

        const data = await res.json();

        if (data.items && Array.isArray(data.items)) {
            data.items.forEach((item, idx) => triggerDownload(item, `${platform}-item-${idx}`));
        } else if (data.video) {
            downloadBase64(data.video, `${platform}-video.mp4`, 'video/mp4');
        } else if (data.image) {
            downloadBase64(data.image, `${platform}-image.jpg`, 'image/jpeg');
        } else {
            throw new Error('No downloadable content found');
        }

        showSuccess('✅ Download started!', 'errorMessage');
    } catch (err) {
        showError(`Download error: ${err.message}`, 'errorMessage');
    } finally {
        btn.disabled = false;
        btn.textContent = orig;
    }
}

function triggerDownload(item, filename) {
    if (item.video) downloadBase64(item.video, `${filename}.mp4`, 'video/mp4');
    else if (item.image) downloadBase64(item.image, `${filename}.jpg`, 'image/jpeg');
}

function downloadBase64(base64Data, filename, mimeType = 'application/octet-stream') {
    try {
        const bytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
        const blob = new Blob([bytes], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = filename;
        document.body.appendChild(a); a.click();
        document.body.removeChild(a); URL.revokeObjectURL(url);
    } catch (e) { console.error('Download error:', e); }
}

// ── EXTRACT & FLIP ─────────────────────────────────────────
document.getElementById('extractBtn').addEventListener('click', handleExtractAndTwist);

async function handleExtractAndTwist() {
    const url = document.getElementById('urlInput').value.trim();
    if (!url) { showError('Please enter a URL', 'errorMessage'); return; }

    const platform = detectPlatform(url);
    if (!platform) { showError('URL not recognized.', 'errorMessage'); return; }

    const btn = document.getElementById('extractBtn');
    const orig = btn.textContent;
    btn.disabled = true;
    btn.textContent = '⏳ Extracting & Flipping...';

    const container = document.getElementById('resultsContainer');
    container.innerHTML = '<div class="loading">🔄 Processing your content, please wait...</div>';

    try {
        const res = await fetch(`${BACKEND_URL}/extract-and-twist`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url })
        });

        if (!res.ok) { const e = await res.json(); throw new Error(e.error || 'Extraction failed'); }

        const data = await res.json();
        displayResults(data, platform);
    } catch (err) {
        showError(`Error: ${err.message}`, 'errorMessage');
        container.innerHTML = '';
    } finally {
        btn.disabled = false;
        btn.textContent = orig;
    }
}

function displayResults(data, platform) {
    const container = document.getElementById('resultsContainer');
    container.innerHTML = '';

    // Carousel images preview
    if (data.carousel_images && data.carousel_images.length > 0) {
        const wrap = document.createElement('div');
        wrap.className = 'carousel-preview';
        wrap.innerHTML = '<h3>📸 Carousel Images</h3>';
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
    appendSection(container, '✨ Flipped Version', data.twisted, true);
    if (data.prompt) appendSection(container, '🎯 Proven Hook', data.prompt, true);
}

function appendSection(container, title, text, copyable) {
    const div = document.createElement('div');
    div.className = 'result-section';
    div.innerHTML = `<h3>${title}</h3><p class="result-text">${escapeHtml(text || '')}</p>`;
    if (copyable) {
        const btn = document.createElement('button');
        btn.className = 'copy-btn';
        btn.textContent = '📋 Copy';
        btn.onclick = () => copyToClipboard(btn);
        div.appendChild(btn);
    }
    container.appendChild(div);
}

// ── SCRIPT REWRITE ─────────────────────────────────────────
document.getElementById('rewriteBtn').addEventListener('click', handleRewriteScript);

async function handleRewriteScript() {
    const script = document.getElementById('scriptInput').value.trim();
    if (!script) { showError('Please paste a script or caption', 'scriptErrorMessage'); return; }

    const btn = document.getElementById('rewriteBtn');
    const orig = btn.textContent;
    btn.disabled = true;
    btn.textContent = '⏳ Rewriting...';

    const container = document.getElementById('scriptResultsContainer');
    container.innerHTML = '<div class="loading">✨ Creating your flipped version...</div>';

    try {
        const res = await fetch(`${BACKEND_URL}/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ script })
        });

        if (!res.ok) { const e = await res.json(); throw new Error(e.error || 'Rewrite failed'); }

        const data = await res.json();
        container.innerHTML = '';
        appendSection(container, 'Original Script', script, false);
        appendSection(container, '✨ Flipped Version', data.twisted, true);
        if (data.prompt) appendSection(container, '🎯 Proven Hook', data.prompt, true);
    } catch (err) {
        showError(`Error: ${err.message}`, 'scriptErrorMessage');
        container.innerHTML = '';
    } finally {
        btn.disabled = false;
        btn.textContent = orig;
    }
}

// ── NICHE IDEAS ─────────────────────────────────────────────
document.getElementById('generateIdeasBtn').addEventListener('click', handleGenerateIdeas);

async function handleGenerateIdeas() {
    const niche = document.getElementById('nicheInput').value.trim();
    const description = document.getElementById('nicheDescription').value.trim();
    if (!niche || !description) { showError('Please fill in both fields', 'ideasErrorMessage'); return; }

    const btn = document.getElementById('generateIdeasBtn');
    const orig = btn.textContent;
    btn.disabled = true;
    btn.textContent = '⏳ Generating...';

    const container = document.getElementById('ideasResultsContainer');
    container.innerHTML = '<div class="loading">🚀 Creating viral script ideas...</div>';

    try {
        const res = await fetch(`${BACKEND_URL}/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ script: `Generate 3 viral script ideas for the niche: ${niche}\n\nDetails: ${description}` })
        });

        if (!res.ok) { const e = await res.json(); throw new Error(e.error || 'Generation failed'); }

        const data = await res.json();
        container.innerHTML = '';
        appendSection(container, '💡 Your 3 Viral Script Ideas', data.twisted, true);
        if (data.prompt) appendSection(container, '🎯 Pro Tips', data.prompt, true);
    } catch (err) {
        showError(`Error: ${err.message}`, 'ideasErrorMessage');
        container.innerHTML = '';
    } finally {
        btn.disabled = false;
        btn.textContent = orig;
    }
}

// ── UTILITIES ───────────────────────────────────────────────
function copyToClipboard(button) {
    const text = button.previousElementSibling.textContent;
    navigator.clipboard.writeText(text).then(() => {
        const orig = button.textContent;
        button.textContent = '✅ Copied!';
        setTimeout(() => { button.textContent = orig; }, 2000);
    });
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
