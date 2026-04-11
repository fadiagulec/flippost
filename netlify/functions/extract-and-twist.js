// Netlify Function: /extract-and-twist
//
// Replaces the broken Railway /extract-and-twist endpoint which failed with
//   {"debug":"Cobalt exception: [Errno 2] No such file or directory: 'ffmpeg'",...}
// because the Railway container is missing ffmpeg and could not transcribe audio.
//
// Strategy:
//   1. Fetch the public Instagram /embed/ page (or TikTok oEmbed, YouTube
//      oEmbed) to pull the caption/title without needing login or API keys.
//   2. Apply a deterministic "flip" transformation to rewrite the caption
//      into a punchier viral-style script with a proven hook and CTA.
//   3. Return { original, twisted, prompt } - matches the shape app.js expects.
//
// No external AI API key is required. The flip is template-driven but
// content-aware: it reads the caption, strips fluff, picks a hook template
// based on the topic signal, keeps hashtags, and rebuilds a scroll-stopping
// opening plus a clear CTA.

const https = require('https');

// IMPORTANT: Instagram's /embed/ endpoint returns a small server-rendered
// page containing the caption JSON only when the request looks like a link
// preview crawler. A real-browser User-Agent flips it to a full SPA shell
// that has no embedded caption data. We use facebookexternalhit which IG
// explicitly supports for embeds and returns the clean oembed-ready payload.
const UA = 'facebookexternalhit/1.1';

function httpsGet(targetUrl, timeoutMs = 15000, extraHeaders = null) {
    return new Promise((resolve, reject) => {
        const u = new URL(targetUrl);
        const req = https.request({
            method: 'GET',
            hostname: u.hostname,
            port: u.port || 443,
            path: u.pathname + u.search,
            headers: extraHeaders || { 'User-Agent': UA },
            timeout: timeoutMs
        }, (res) => {
            // Follow redirects
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                const next = new URL(res.headers.location, targetUrl).toString();
                res.resume();
                httpsGet(next, timeoutMs, extraHeaders).then(resolve).catch(reject);
                return;
            }
            const chunks = [];
            res.on('data', (c) => chunks.push(c));
            res.on('end', () => {
                resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') });
            });
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
        req.end();
    });
}

// ── PLATFORM DETECTION ───────────────────────────────────
function detectPlatform(url) {
    if (/instagram\.com|instagr\.am/i.test(url)) return 'instagram';
    if (/tiktok\.com|vm\.tiktok|vt\.tiktok/i.test(url)) return 'tiktok';
    if (/youtube\.com|youtu\.be/i.test(url)) return 'youtube';
    if (/twitter\.com|x\.com/i.test(url)) return 'x';
    if (/linkedin\.com/i.test(url)) return 'linkedin';
    if (/facebook\.com|fb\.watch/i.test(url)) return 'facebook';
    if (/threads\.net/i.test(url)) return 'threads';
    return null;
}

// ── CAPTION EXTRACTORS ───────────────────────────────────
// Decode a JSON-escaped string like "hello\\nworld" to "hello\nworld".
function decodeJsonStringLiteral(s) {
    try {
        return JSON.parse('"' + s + '"');
    } catch (e) {
        return s;
    }
}

// Parse Instagram /embed/ HTML to pull the post caption. The caption lives
// inside a nested JSON blob that is itself a JSON-string, so it's double-
// escaped. We scan for `edge_media_to_caption\":{\"edges\":[{\"node\":{\"text\":\"...\"}`.
function extractInstagramCaption(html) {
    if (!html) return null;

    // The content is escaped twice: raw form looks like
    //   edge_media_to_caption\":{\"edges\":[{\"node\":{\"text\":\"...caption body...\"}
    // where the closing \" marks the end of the text value.
    const marker = 'edge_media_to_caption\\":{\\"edges\\":[{\\"node\\":{\\"text\\":\\"';
    const start = html.indexOf(marker);
    if (start < 0) {
        // Fallback: look for a simpler single-escaped form.
        const m = html.match(/"edge_media_to_caption":\{"edges":\[\{"node":\{"text":"((?:[^"\\]|\\.)*)"/);
        if (m) {
            return decodeJsonStringLiteral(m[1]);
        }
        return null;
    }
    const textStart = start + marker.length;
    // Walk forward until an unescaped \" (which in the raw HTML is \\")
    let i = textStart;
    let buf = '';
    while (i < html.length) {
        const ch = html[i];
        if (ch === '\\' && html[i + 1] === '\\') {
            // literal backslash-backslash in raw html means one backslash in
            // the outer JSON; keep walking so escapes are handled by decode.
            buf += html.substr(i, 2);
            i += 2;
            continue;
        }
        if (ch === '\\' && html[i + 1] === '"') {
            // This is the closing quote of the text value.
            break;
        }
        buf += ch;
        i++;
        if (buf.length > 8000) break;
    }
    // buf still has one layer of escaping (from the outer JSON). Unescape it
    // twice: first to collapse \\n -> \n in JS string sense, then again if
    // unicode escapes remain.
    let decoded = buf
        .replace(/\\\\"/g, '\\"')
        .replace(/\\\\n/g, '\\n')
        .replace(/\\\\t/g, '\\t')
        .replace(/\\\\u/g, '\\u')
        .replace(/\\\\\//g, '\\/');
    decoded = decodeJsonStringLiteral(decoded);
    // One more pass handles \u0040 etc that survived the first decode.
    if (/\\u[0-9a-fA-F]{4}/.test(decoded)) {
        decoded = decodeJsonStringLiteral(decoded);
    }
    return decoded ? decoded.trim() : null;
}

async function fetchInstagramCaption(url) {
    // Normalise to /p/{code}/embed/ or /reel/{code}/embed/
    const cleaned = url.split('?')[0].replace(/\/$/, '');
    const embedUrl = cleaned + '/embed/';
    const res = await httpsGet(embedUrl, 20000);
    if (res.status !== 200) throw new Error(`instagram embed ${res.status}`);
    const caption = extractInstagramCaption(res.body);
    if (!caption) throw new Error('no-caption-found');
    return caption;
}

async function fetchTikTokCaption(url) {
    const o = await httpsGet(`https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`, 15000);
    if (o.status === 200) {
        try {
            const j = JSON.parse(o.body);
            const parts = [j.title, j.author_name ? `by @${j.author_name}` : ''].filter(Boolean);
            if (parts.length) return parts.join(' ');
        } catch (e) {}
    }
    throw new Error('tiktok-oembed-failed');
}

async function fetchYoutubeCaption(url) {
    const o = await httpsGet(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`, 15000);
    if (o.status === 200) {
        try {
            const j = JSON.parse(o.body);
            if (j.title) return j.title;
        } catch (e) {}
    }
    throw new Error('youtube-oembed-failed');
}

async function fetchCaption(url, platform) {
    if (platform === 'instagram') return fetchInstagramCaption(url);
    if (platform === 'tiktok') return fetchTikTokCaption(url);
    if (platform === 'youtube') return fetchYoutubeCaption(url);
    // Generic fallback: just grab the page <title> / og:description.
    const r = await httpsGet(url, 15000);
    const m = r.body.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i)
           || r.body.match(/<title>([^<]+)<\/title>/i);
    if (m) return m[1];
    throw new Error('no-caption');
}

// ── FLIP ENGINE ──────────────────────────────────────────
// A content-aware template-based rewriter that turns a source caption into a
// punchier viral-style script. Produces an Original / Flipped / Hook trio.

const HOOK_TEMPLATES = {
    howto:   [
        'Stop scrolling - this is how to {topic} in under 60 seconds.',
        'Nobody tells you this about {topic}, but it changes everything.',
        'The fastest way to {topic} (most people get this wrong).'
    ],
    story:   [
        'I wasn\'t going to share this, but someone needs to hear it.',
        'This one decision changed everything for me.',
        'What happened next completely flipped the script.'
    ],
    list:    [
        'Here are {n} things nobody told you about {topic}.',
        '{n} mistakes you\'re making with {topic} right now.',
        'Save this: {n} moves that actually work for {topic}.'
    ],
    opinion: [
        'Unpopular opinion: {topic} isn\'t what you think it is.',
        'Hot take - everyone is wrong about {topic}.',
        'I\'m going to say what nobody else will about {topic}.'
    ],
    announce:[
        'This is the thing I wish existed a year ago.',
        'I just dropped something and I had to show you.',
        'If you\'ve been waiting for a sign, this is it.'
    ],
    generic: [
        'If you scroll past this you\'ll regret it later.',
        'Wait - you need to see this before it disappears.',
        'This is your sign to finally take action.'
    ]
};

function classifyCaption(caption) {
    const t = caption.toLowerCase();
    if (/(how to|step[- ]by[- ]step|tutorial|guide|tips?)/.test(t)) return 'howto';
    if (/(story|happened|i was|when i|yesterday|last (week|year|month))/.test(t)) return 'story';
    if (/\b\d+\s+(ways|things|reasons|mistakes|steps|tips|secrets|hacks)\b/.test(t)) return 'list';
    if (/(unpopular|hot take|truth|nobody|everyone is wrong)/.test(t)) return 'opinion';
    if (/(drop(ped)?|launch(ed)?|announce|new|just released|available now|free guide)/.test(t)) return 'announce';
    return 'generic';
}

function stripHashtags(text) {
    return text.replace(/#\w+/g, '').replace(/\s+/g, ' ').trim();
}

function extractHashtags(text) {
    const tags = text.match(/#\w+/g) || [];
    // Dedupe while preserving order.
    return [...new Set(tags)];
}

function guessTopic(captionNoTags) {
    // Prefer nouny phrases: scan the first sentence, drop stopwords, and
    // stitch together 2-4 content words so the resulting hook reads
    // naturally ("create influencer videos" rather than "put together FREE").
    const firstSent = (captionNoTags.split(/[.!?\n]/)[0] || captionNoTags).trim();
    const clean = firstSent
        .replace(/[\uD83C-\uDBFF\uDC00-\uDFFF]+/g, '')
        .replace(/[^\w\s']/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
    if (!clean) return 'this';
    const stop = new Set([
        'i','you','we','they','he','she','it','the','a','an','my','your','our','their','this','that',
        'these','those','and','or','but','so','if','to','of','in','on','at','by','for','with','as',
        'is','am','are','was','were','be','been','being','have','has','had','do','does','did','will',
        'would','should','could','may','might','can','just','really','very','im','ill','its','put',
        'get','got','go','going','went','make','made','here','there','now','then','some','all','any',
        'me','us','them','about','into','up','down','out','over','under','off','from','than','too',
        'free','new','step','together'
    ]);
    const words = clean.split(' ').filter(Boolean);
    // Walk the sentence and find the longest contiguous run of content words
    // (length > 2 and not in stoplist). This yields readable noun chunks
    // like "create influencer videos" instead of dropping stopwords globally
    // and stitching unrelated words together.
    let best = [];
    let cur = [];
    for (const w of words) {
        if (w.length > 2 && !stop.has(w)) {
            cur.push(w);
            if (cur.length > best.length) best = cur.slice();
        } else {
            cur = [];
        }
        if (best.length >= 4) break;
    }
    if (best.length === 0) {
        return words.slice(0, 3).join(' ') || 'this';
    }
    return best.slice(0, 4).join(' ');
}

function pickHook(category, topic, captionNoTags) {
    const pool = HOOK_TEMPLATES[category] || HOOK_TEMPLATES.generic;
    // Deterministic pick based on caption length so tests are stable.
    const hook = pool[captionNoTags.length % pool.length];
    const n = ((captionNoTags.length % 4) + 3); // 3..6
    return hook.replace(/\{topic\}/g, topic).replace(/\{n\}/g, n);
}

function firstSentence(text) {
    const m = text.match(/[^.!?\n]+[.!?]?/);
    return m ? m[0].trim() : text.slice(0, 160);
}

function compressBody(captionNoTags) {
    // Keep the first 2-3 sentences, trimmed.
    const sentences = captionNoTags
        .split(/(?<=[.!?])\s+|\n+/)
        .map(s => s.trim())
        .filter(Boolean);
    return sentences.slice(0, 3).join(' ');
}

function buildFlip(caption) {
    const tags = extractHashtags(caption);
    const noTags = stripHashtags(caption) || caption;
    const category = classifyCaption(noTags);
    const topic = guessTopic(noTags);
    const hook = pickHook(category, topic, noTags);
    const body = compressBody(noTags);
    const cta = 'Comment "SEND ME" and I\'ll DM you the full breakdown - save this so you don\'t lose it.';

    const flipped = [
        hook,
        '',
        body,
        '',
        cta,
        tags.length ? '\n' + tags.slice(0, 8).join(' ') : ''
    ].filter(x => x !== undefined).join('\n').trim();

    const provenHook = `HOOK FORMULA: "${hook}"\n\nWhy it works: pattern-interrupt first line, specificity, implicit promise, and a reason to keep watching. Pair it with a 1-second visual twist on frame 1 (zoom, whip-pan, or bold text flash) so the algorithm registers a watch-past-hook signal.`;

    return { flipped, hook, provenHook, category, topic };
}

// ── HANDLER ──────────────────────────────────────────────
exports.handler = async (event) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Content-Type': 'application/json'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    try {
        const { url } = JSON.parse(event.body || '{}');
        if (!url) {
            return { statusCode: 400, headers, body: JSON.stringify({ error: 'URL required' }) };
        }

        const platform = detectPlatform(url);
        if (!platform) {
            return { statusCode: 400, headers, body: JSON.stringify({ error: 'Unsupported platform' }) };
        }

        let caption;
        try {
            caption = await fetchCaption(url, platform);
        } catch (e) {
            return {
                statusCode: 502,
                headers,
                body: JSON.stringify({
                    error: 'Could not extract caption from this post. Make sure the post is public.',
                    debug: e.message
                })
            };
        }

        if (!caption || caption.length < 5) {
            return {
                statusCode: 502,
                headers,
                body: JSON.stringify({ error: 'Caption was empty - post may be private or video-only.' })
            };
        }

        const flip = buildFlip(caption);

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                original: caption,
                twisted: flip.flipped,
                prompt: flip.provenHook,
                platform
            })
        };
    } catch (err) {
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: err.message || 'server error' })
        };
    }
};
