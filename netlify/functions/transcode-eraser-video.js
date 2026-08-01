require('./_error_reporter');
const { wrap: __wrapErr } = require('./_error_reporter');
// Netlify Function: /transcode-eraser-video
//
// Proxies the eraser upload to the Railway backend's /prepare-eraser.
// Browser fetches against external Railway URLs sometimes fail with
// "Failed to fetch" (corporate proxies, mobile carrier filters, browser
// extensions blocking *.up.railway.app, etc.). Routing through Netlify
// keeps the browser talking to the same origin it loaded the page from,
// so those edge networks can't block the request.
const { corsHeaders, buildRailwayUrl, requireRailway } = require('./_config');

const RAILWAY_PREPARE_URL = buildRailwayUrl("/prepare-eraser");

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

    // The body is already JSON-stringified base64. Just pass it through —
    // no need to parse + re-stringify, which costs CPU for nothing on a
    // multi-MB string.
    if (!event.body || event.body.length < 50) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Empty body' }) };
    }

    try {
        const resp = await fetch(RAILWAY_PREPARE_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: event.body,
            // Hard timeout below Netlify's 26s function cap so we never get
            // killed mid-request. Railway transcode is typically 5-15s.
            signal: AbortSignal.timeout(24000)
        });
        const text = await resp.text();
        return { statusCode: resp.status, headers, body: text };
    } catch (err) {
        console.error('Transcode proxy failed:', err?.message || err);
        return {
            statusCode: 502,
            headers,
            body: JSON.stringify({ error: 'Transcode proxy failed: ' + (err?.message || 'unknown') })
        };
    }
});
