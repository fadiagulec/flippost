require('./_error_reporter');
const { wrap: __wrapErr } = require('./_error_reporter');
// Netlify Function: /whisper-transcribe
//
// Transcribes a video by sending it STRAIGHT to OpenAI Whisper — no Railway,
// no ffmpeg. Whisper natively accepts mp4/webm/m4a/mp3/wav and extracts the
// audio itself, so we can skip the audio-extraction step the Railway route
// did. This makes Transcribe independent of the Railway backend.
//
// Trade-off: Netlify Functions cap the request body at ~6MB, so the video
// (base64 in JSON) must be under ~4.5MB binary. The frontend guards for this
// and tells the user to use a shorter clip. For big videos, the Railway
// route (once redeployed) has no such cap.
//
// Request:  POST { videoData: base64, mime?: string }
// Returns:  { success, transcript, segments:[{start,end,text}], duration, language }
//
// Requires OPENAI_API_KEY on the *Netlify* environment (separate from Railway).
const { corsHeaders } = require('./_config');

const { isProRequest } = require('./_pro_verify');
const { enforceAiQuota, rateLimitResponse } = require('./_rate_limit');

exports.handler = __wrapErr(async function (event) {
    const isPro = isProRequest(event);
    const headers = corsHeaders(event, { methods: 'POST, OPTIONS' });

    if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }

    // Rate-limit gate (transcribe counts as one flip).
    const quota = await enforceAiQuota(event, isPro, 1);
    if (!quota.allowed) return rateLimitResponse(headers, quota);

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        return { statusCode: 503, headers, body: JSON.stringify({ error: 'Transcription isn’t configured yet (OPENAI_API_KEY missing on Netlify).' }) };
    }

    let body;
    try { body = JSON.parse(event.body || '{}'); } catch {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid request' }) };
    }
    const videoData = String(body.videoData || '');
    if (!videoData || videoData.length < 100) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'No video data received.' }) };
    }

    let buffer;
    try {
        buffer = Buffer.from(videoData, 'base64');
    } catch {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Could not decode the video.' }) };
    }
    if (buffer.length < 1024) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Video too small / empty.' }) };
    }
    // Whisper hard cap is 25MB; Netlify caps the request well below that, but
    // guard anyway.
    if (buffer.length > 24 * 1024 * 1024) {
        return { statusCode: 413, headers, body: JSON.stringify({ error: 'Clip is too long — try one under ~4 MB / a shorter section.' }) };
    }

    // Pick a filename extension Whisper understands, from the mime type.
    const mime = String(body.mime || 'video/mp4').toLowerCase();
    let fname = 'clip.mp4';
    if (mime.includes('webm')) fname = 'clip.webm';
    else if (mime.includes('m4a') || mime.includes('mp4a')) fname = 'clip.m4a';
    else if (mime.includes('mpeg') || mime.includes('mp3')) fname = 'clip.mp3';
    else if (mime.includes('wav')) fname = 'clip.wav';
    // .mov/quicktime isn't a Whisper format — send as .mp4 (usually still decodes).

    try {
        // Node 18+ (Netlify runtime) has global FormData/Blob/fetch.
        const form = new FormData();
        form.append('file', new Blob([buffer], { type: mime }), fname);
        form.append('model', 'whisper-1');
        form.append('response_format', 'verbose_json');

        const resp = await fetch('https://api.openai.com/v1/audio/transcriptions', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + apiKey },
            body: form,
            signal: AbortSignal.timeout(24000)
        });
        const text = await resp.text();
        if (!resp.ok) {
            console.error('Whisper error', resp.status, text.slice(0, 300));
            let msg = 'Transcription failed.';
            if (resp.status === 401) msg = 'OpenAI rejected the key — check OPENAI_API_KEY on Netlify.';
            else if (resp.status === 429) msg = 'OpenAI rate limit / out of credits — check your OpenAI balance.';
            else if (/format|decode|invalid file/i.test(text)) msg = 'Couldn’t read this video’s audio — try an MP4 clip.';
            return { statusCode: 502, headers, body: JSON.stringify({ error: msg }) };
        }
        const result = JSON.parse(text);
        const segments = (result.segments || []).map(s => ({
            start: Number(s.start || 0),
            end: Number(s.end || 0),
            text: String(s.text || '').trim()
        }));
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                transcript: (result.text || '').trim(),
                segments,
                duration: Number(result.duration || 0),
                language: result.language || ''
            })
        };
    } catch (err) {
        console.error('whisper-transcribe failed:', err?.message || err);
        const msg = /timeout|abort/i.test(err?.message || '')
            ? 'Transcription timed out — try a shorter clip.'
            : 'Transcription failed. Please try again.';
        return { statusCode: 500, headers, body: JSON.stringify({ error: msg }) };
    }
});
