require('./_error_reporter');
const { wrap: __wrapErr } = require('./_error_reporter');
// Netlify Function: /transcribe-video
//
// Proxies a video to Railway's /transcribe-video, which extracts the
// audio track with ffmpeg and pipes it through OpenAI Whisper.
// OPENAI_API_KEY lives on Railway, not here.

const RAILWAY_URL = 'https://web-production-8afc3.up.railway.app/transcribe-video';

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
    if (!event.body || event.body.length < 50) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Empty body' }) };
    }

    try {
        const resp = await fetch(RAILWAY_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: event.body,
            // Whisper on 30-60s clips is fast (~2-4s), but leave headroom for
            // longer clips. Netlify sync-function ceiling is 26s so we stop
            // just short.
            signal: AbortSignal.timeout(24000)
        });
        const text = await resp.text();
        return { statusCode: resp.status, headers, body: text };
    } catch (err) {
        console.error('Transcribe proxy failed:', err?.message || err);
        return {
            statusCode: 502,
            headers,
            body: JSON.stringify({ error: 'Transcribe proxy failed: ' + (err?.message || 'unknown') })
        };
    }
});
