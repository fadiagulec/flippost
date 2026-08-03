require('./_error_reporter');
const { wrap: __wrapErr } = require('./_error_reporter');
// Netlify function: /humanize
// Rewrites a caption/script so it reads like a real person wrote it — strips the
// AI tells (em-dashes, "it's not X it's Y", hype words, bow-on-top closers) using
// the shared HUMAN_VOICE_RULES. On-demand version of the humanisation that's now
// baked into every generator. Keeps the meaning, hook and CTA.
//   Request:  { text, platform?, voiceContext? }
//   Returns:  { text: "<humanized>" }

const { corsHeaders } = require('./_config');
const { HUMAN_VOICE_RULES, humanVoiceFor } = require('./_human_voice');
const { isProRequest } = require('./_pro_verify');
const { enforceAiQuota, rateLimitResponse } = require('./_rate_limit');

exports.handler = __wrapErr(async function (event) {
    const isPro = isProRequest(event);
    const headers = corsHeaders(event, { methods: 'POST, OPTIONS' });

    if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
    if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };

    const quota = await enforceAiQuota(event, isPro);
    if (!quota.allowed) return rateLimitResponse(headers, quota);

    let body;
    try { body = JSON.parse(event.body || '{}'); } catch {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid request' }) };
    }
    const text = String(body.text || '').trim().slice(0, 6000);
    if (!text || text.length < 5) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Paste some text to humanize.' }) };
    }
    const platform = (typeof body.platform === 'string' && body.platform.trim()) ? body.platform.trim().toLowerCase() : 'instagram';
    const voiceContext = String(body.voiceContext || '').trim().slice(0, 2000);

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return { statusCode: 503, headers, body: JSON.stringify({ error: 'Service temporarily unavailable.' }) };

    const system = [
        'You rewrite social-media copy so it reads like a real person wrote it — never like AI.',
        'Keep the core message, the hook, and any CTA. Keep it roughly the same length. Do NOT add new claims or invent facts.',
        'Output ONLY the rewritten text — no preamble, no quotes, no explanation.',
        humanVoiceFor(platform),
        HUMAN_VOICE_RULES
    ].join('\n');

    const user = [
        `Rewrite this ${platform} caption so it sounds human and natural — strip every AI tell:`,
        '',
        text,
        voiceContext ? '\n<brand_voice>\n' + voiceContext + '\n</brand_voice>\nMatch this brand voice.' : ''
    ].filter(Boolean).join('\n');

    try {
        const resp = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
            body: JSON.stringify({
                model: 'claude-sonnet-4-6',
                max_tokens: 1400,
                temperature: 0.75,
                system,
                messages: [{ role: 'user', content: user }]
            }),
            signal: AbortSignal.timeout(22000)
        });
        const data = await resp.json();
        if (!resp.ok) {
            console.error('humanize Claude error:', resp.status, data && data.error && data.error.message);
            return { statusCode: 502, headers, body: JSON.stringify({ error: 'Humanize failed. Please try again.' }) };
        }
        const out = ((data.content && data.content[0] && data.content[0].text) || '').trim();
        if (!out) return { statusCode: 502, headers, body: JSON.stringify({ error: 'Humanize returned nothing — try again.' }) };
        return { statusCode: 200, headers, body: JSON.stringify({ text: out }) };
    } catch (err) {
        console.error('humanize failed:', err && err.message || err);
        return { statusCode: 500, headers, body: JSON.stringify({ error: 'Humanize failed. Please try again.' }) };
    }
});
