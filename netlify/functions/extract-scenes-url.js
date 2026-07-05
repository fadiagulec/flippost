require('./_error_reporter');
const { wrap: __wrapErr } = require('./_error_reporter');
// Netlify Function: /extract-scenes-url
// Proxies { url } to Railway's /extract-scenes-url, which downloads the video
// server-side and pulls scene-change frames. Tiny request; response stays
// under ~4.5MB (backend budget). Frontend hits Railway directly first; this
// is the fallback for networks that block *.up.railway.app.

const RAILWAY_URL = 'https://web-production-8afc3.up.railway.app/extract-scenes-url';

exports.handler = __wrapErr(async function (event) {
    const allowedOrigins = ['https://flipit.earnwith-ai.com', 'https://flipit-app.netlify.app'];
    const origin = event.headers?.origin || '';
    const corsOrigin = allowedOrigins.includes(origin) ? origin : allowedOrigins[0];
    const headers = {
        'Access-Control-Allow-Origin': corsOrigin,
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Content-Type': 'application/json'
    };
    if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }
    try {
        const resp = await fetch(RAILWAY_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: event.body,
            signal: AbortSignal.timeout(24000)
        });
        const text = await resp.text();
        return { statusCode: resp.status, headers, body: text };
    } catch (err) {
        console.error('extract-scenes-url proxy failed:', err?.message || err);
        return { statusCode: 502, headers, body: JSON.stringify({ error: 'Scene-grabber-url proxy failed: ' + (err?.message || 'unknown') }) };
    }
});
