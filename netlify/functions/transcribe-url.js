require('./_error_reporter');
const { wrap: __wrapErr } = require('./_error_reporter');
// Netlify Function: /transcribe-url
// Proxies { url } to Railway's /transcribe-url, which downloads the audio
// server-side and runs Whisper. Tiny request body (just a URL), so no size
// cap concerns. Direct-to-Railway is the primary path in the frontend; this
// proxy is the fallback for networks that block *.up.railway.app.
const { corsHeaders, buildRailwayUrl, requireRailway } = require('./_config');

const RAILWAY_URL = buildRailwayUrl("/transcribe-url");

exports.handler = __wrapErr(async function (event) {
    const headers = corsHeaders(event, { methods: 'POST, OPTIONS' });

    // Self-hosted video backend is required for this endpoint. Returns a
    // clear 503 (instead of a confusing fetch error) when RAILWAY_URL is unset.
    const __noBackend = requireRailway(headers);
    if (__noBackend) return __noBackend;
    if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }
    try {
        const resp = await fetch(RAILWAY_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: event.body,
            // Stay under Netlify's 26s function cap; the direct-to-Railway path
            // (frontend) has a longer window for slow downloads.
            signal: AbortSignal.timeout(24000)
        });
        const text = await resp.text();
        return { statusCode: resp.status, headers, body: text };
    } catch (err) {
        console.error('transcribe-url proxy failed:', err?.message || err);
        return { statusCode: 502, headers, body: JSON.stringify({ error: 'Transcribe-url proxy failed: ' + (err?.message || 'unknown') }) };
    }
});
