require('./_error_reporter');
const { wrap: __wrapErr } = require('./_error_reporter');
// Netlify Function: /viral-score
//
// Scores a finished social-media post (caption + optional thumbnail URL)
// across six virality dimensions and returns specific, actionable
// suggestions per dimension. Modelled on ViralFlip's ViralScore — flagship
// feature for "is this post ready to ship?" before publishing.
//
// Request body:
//   { caption: string, platform?: 'instagram'|'tiktok'|'linkedin'|'x'|'youtube',
//     thumbnailUrl?: string, hashtags?: string }
// Returns:
//   { score: 0-10, verdict: string, summary: string,
//     dimensions: [{ key, label, score: 0-100, comment }] }
const { corsHeaders } = require('./_config');
const { humanVoiceFor, HUMAN_HASHTAG_RULES } = require('./_human_voice');

const { isProRequest } = require('./_pro_verify');
const { enforceAiQuota, rateLimitResponse } = require('./_rate_limit');

const DIMENSIONS = [
    { key: 'hook',       label: 'Hook Strength' },
    { key: 'emotion',    label: 'Emotional Resonance' },
    { key: 'cta',        label: 'CTA & Engagement' },
    { key: 'hashtags',   label: 'Hashtag Strategy' },
    { key: 'shareability', label: 'Shareability' },
    { key: 'platform_fit', label: 'Platform Fit' }
];

// Forced tool-use gives us a GUARANTEED-valid structured object from Claude
// (no free-text JSON parsing, no newline-escaping bugs).
//
// The work is split across TWO parallel Claude calls so neither exceeds
// Netlify's ~26s function cap. One big call generating the scorecard + fixes +
// rewrite + 3 hooks + 2 alt captions + hashtags ran ~26-27s and 500'd. Run in
// parallel, the function's wall-clock is bounded by the SLOWER call (~18s), not
// the sum. The response shape is identical to before, so the frontend is
// unchanged. If the extras call fails, the core scorecard still returns.
const SCORECARD_TOOL = {
    name: 'scorecard',
    description: 'Return the viral scorecard for the post, plus specific fixes and the single best rewritten caption.',
    input_schema: {
        type: 'object',
        properties: {
            score: { type: 'number', description: '0-10 overall (average of the six dimension scores, rescaled to 0-10)' },
            verdict: { type: 'string', description: 'One of: Needs Work | Decent | Good — Minor Tweaks | Strong | Viral-Ready' },
            summary: { type: 'string', description: '2-3 sentence overall take' },
            dimensions: {
                type: 'array',
                description: 'Exactly the six dimensions in order: hook, emotion, cta, hashtags, shareability, platform_fit',
                items: {
                    type: 'object',
                    properties: {
                        key: { type: 'string' },
                        label: { type: 'string' },
                        score: { type: 'number', description: '0-100' },
                        comment: { type: 'string', description: 'one short specific sentence' }
                    },
                    required: ['key', 'score', 'comment']
                }
            },
            fixes: { type: 'array', items: { type: 'string' }, description: '3-5 specific, copy-pasteable changes (actual replacement words, not advice)' },
            rewrite: { type: 'string', description: 'the single BEST full caption, rewritten to score 9-10, ready to paste (line breaks and hashtags included)' }
        },
        required: ['score', 'verdict', 'summary', 'dimensions', 'fixes', 'rewrite']
    }
};

// Second, smaller call: the "upgrade assets" (kept separate so both calls stay
// fast enough to run inside the function's time budget).
const EXTRAS_TOOL = {
    name: 'extras',
    description: 'Return upgrade assets for the post: stronger hooks, alternative captions, and recommended hashtags.',
    input_schema: {
        type: 'object',
        properties: {
            hooks: { type: 'array', items: { type: 'string' }, description: '3 alternative FIRST-LINE hooks (opening line only), each a scroll-stopper strong enough to score 10/10; vary the angle (curiosity gap, bold claim, relatable pain)' },
            altCaptions: { type: 'array', items: { type: 'string' }, description: '2 alternative full captions, each a DIFFERENT angle (story-led, list-led, contrarian); keep each tight (~60-90 words)' },
            recommendedHashtags: { type: 'array', items: { type: 'string' }, description: '10-14 hashtags to actually use — a mix of broad-reach, niche, and branded; each WITHOUT the leading #' }
        },
        required: ['hooks', 'altCaptions', 'recommendedHashtags']
    }
};

// One forced-tool Claude call → returns the tool_use input object (or throws).
async function callClaudeTool(apiKey, system, user, tool, maxTokens) {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
            model: 'claude-sonnet-4-6',
            max_tokens: maxTokens,
            temperature: 0.4,
            system,
            tools: [tool],
            tool_choice: { type: 'tool', name: tool.name },
            messages: [{ role: 'user', content: user }]
        }),
        signal: AbortSignal.timeout(24000)
    });
    if (!resp.ok) {
        const t = await resp.text().catch(() => '');
        throw new Error('claude ' + resp.status + ' ' + t.slice(0, 140));
    }
    const data = await resp.json();
    const tu = Array.isArray(data.content) ? data.content.find(c => c && c.type === 'tool_use' && c.name === tool.name) : null;
    return (tu && tu.input) || {};
}

exports.handler = __wrapErr(async function (event) {
    const isPro = isProRequest(event);
    const headers = corsHeaders(event, { methods: 'POST, OPTIONS' });

    if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }

    const quota = await enforceAiQuota(event, isPro);
    if (!quota.allowed) return rateLimitResponse(headers, quota);

    let body;
    try { body = JSON.parse(event.body || '{}'); } catch {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid request' }) };
    }

    const caption = String(body.caption || '').trim().slice(0, 8000);
    if (!caption || caption.length < 10) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Paste the post caption (at least 10 characters) so we can score it.' }) };
    }
    const platform = (typeof body.platform === 'string' && body.platform.trim())
        ? body.platform.trim().toLowerCase()
        : 'instagram';
    const hashtags = String(body.hashtags || '').trim().slice(0, 2000);
    // Optional brand voice — plumbed in by the frontend (FlipItVoice). When
    // present, the REWRITE is written in this voice; scoring stays objective.
    const voiceContext = String(body.voiceContext || '').trim().slice(0, 2000);

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
        return { statusCode: 503, headers, body: JSON.stringify({ error: 'Service temporarily unavailable.' }) };
    }

    // Shared context block both calls see.
    const contextBlock = [
        '<caption>',
        caption,
        '</caption>',
        hashtags ? '\n<hashtags>\n' + hashtags + '\n</hashtags>' : '',
        voiceContext ? '\n<brand_voice>\n' + voiceContext + '\n</brand_voice>' : ''
    ].filter(Boolean).join('\n');

    // ── Call 1: the scorecard (score + dimensions + fixes + best caption) ──
    const systemScore = [
        "You are a viral content strategist who scores social-media posts BEFORE they're published.",
        "Produce a specific, actionable scorecard — not generic advice.",
        "Score each dimension 0–100 based on what's IN the caption, not what's missing. No clear CTA → low CTA score.",
        "",
        "Call the `scorecard` tool. Fill EVERY field.",
        "Dimensions (exact keys): hook, emotion, cta, hashtags, shareability, platform_fit.",
        "Rubric — hook: first 1-2 lines, does it stop the scroll? 80+ = great. emotion: awe/relief/FOMO/identity score high, bland low. cta: clear friction-free action scores high. hashtags: broad+niche+branded mix; too few/all-broad = low. shareability: would someone DM/repost it? platform_fit: matches the platform's norms?",
        "",
        "fixes: 3-5 SPECIFIC changes — the actual replacement words, not advice ('Open with: \"I quit my $200k job — here's the math\"' NOT 'improve the hook'). Target the weakest dimensions first.",
        "rewrite: the single BEST full caption — rewrite the whole post so it scores 9-10 (aim for 10). Ready to paste, with line breaks. Keep it TIGHT — under ~120 words (longer only for a long spoken script).",
        voiceContext ? "If a <brand_voice> is given, write the rewrite and fixes wording in THAT voice; keep scoring objective." : "",
        "",
        "Be economical: each dimension 'comment' is ONE short sentence. Be honest — a mid post gets a 4-5, not a participation-trophy 7.",
        // The rewrite is copy the creator will actually post, so it has to
        // pass as human. The scorecard prose is internal and unaffected.
        humanVoiceFor(platform)
    ].filter(Boolean).join('\n');
    const userScore = `Score this ${platform} post.\n\n${contextBlock}\n\nCall the scorecard tool now.`;

    // ── Call 2: the upgrade assets (hooks + alt captions + hashtags) ──
    const systemExtras = [
        "You are a viral content strategist. For the given post, produce upgrade assets by calling the `extras` tool. Fill EVERY field.",
        "hooks: 3 alternative FIRST-LINE hooks (opening line only), each a scroll-stopper strong enough to score 10/10. Vary the angle — one curiosity gap, one bold claim/number, one relatable pain.",
        "altCaptions: 2 alternative FULL captions, each a DIFFERENT angle (story-led, list-led, contrarian). Keep each tight (~60-90 words), ready to paste.",
        "recommendedHashtags: 10-14 hashtags to actually use — a mix of broad-reach, niche, and branded. No spaces; no leading # needed.",
        voiceContext ? "If a <brand_voice> is given, write the hooks and altCaptions in THAT voice." : "",
        HUMAN_HASHTAG_RULES,
        humanVoiceFor(platform)
    ].filter(Boolean).join('\n');
    const userExtras = `For this ${platform} post, generate stronger hooks, 2 alternative captions, and recommended hashtags.\n\n${contextBlock}\n\nCall the extras tool now.`;

    try {
        // Both calls run in parallel — wall-clock is the slower one (~18s), so
        // the function finishes well under the ~26s cap.
        const [scoreRes, extrasRes] = await Promise.allSettled([
            callClaudeTool(apiKey, systemScore, userScore, SCORECARD_TOOL, 2000),
            callClaudeTool(apiKey, systemExtras, userExtras, EXTRAS_TOOL, 1400)
        ]);
        if (scoreRes.status !== 'fulfilled') {
            console.error('viral-score scorecard failed:', scoreRes.reason && scoreRes.reason.message);
            return { statusCode: 502, headers, body: JSON.stringify({ error: 'Scoring failed. Please try again.' }) };
        }
        const parsed = scoreRes.value || {};
        // Extras are a bonus — if that call failed, still return the scorecard.
        const extras = (extrasRes.status === 'fulfilled' && extrasRes.value) ? extrasRes.value : {};
        if (extrasRes.status !== 'fulfilled') {
            console.warn('viral-score extras failed:', extrasRes.reason && extrasRes.reason.message);
        }
        // Light validation so the UI never crashes on a malformed response.
        const score = Number(parsed.score);
        const verdict = String(parsed.verdict || '').slice(0, 80);
        const summary = String(parsed.summary || '').slice(0, 1000);
        const dims = Array.isArray(parsed.dimensions) ? parsed.dimensions : [];
        const cleanDims = DIMENSIONS.map(d => {
            const found = dims.find(x => x && x.key === d.key) || {};
            return {
                key: d.key,
                label: d.label,
                score: Math.max(0, Math.min(100, Number(found.score) || 0)),
                comment: String(found.comment || '').slice(0, 400)
            };
        });
        const fixes = Array.isArray(parsed.fixes)
            ? parsed.fixes.filter(x => typeof x === 'string' && x.trim()).slice(0, 6).map(s => s.trim().slice(0, 400))
            : [];
        const rewrite = String(parsed.rewrite || '').trim().slice(0, 4000);
        const hooks = Array.isArray(extras.hooks)
            ? extras.hooks.filter(x => typeof x === 'string' && x.trim()).slice(0, 4).map(s => s.trim().slice(0, 300))
            : [];
        const altCaptions = Array.isArray(extras.altCaptions)
            ? extras.altCaptions.filter(x => typeof x === 'string' && x.trim()).slice(0, 3).map(s => s.trim().slice(0, 2000))
            : [];
        const recommendedHashtags = Array.isArray(extras.recommendedHashtags)
            ? extras.recommendedHashtags.filter(x => typeof x === 'string' && x.trim()).slice(0, 20).map(s => '#' + s.trim().replace(/^#+/, '').replace(/\s+/g, '').slice(0, 60))
            : [];
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                score: Math.max(0, Math.min(10, Number.isFinite(score) ? score : 5)),
                verdict: verdict || 'Decent',
                summary,
                dimensions: cleanDims,
                fixes,
                hooks,
                rewrite,
                altCaptions,
                recommendedHashtags
            })
        };
    } catch (err) {
        console.error('viral-score failed:', err?.message || err);
        return { statusCode: 500, headers, body: JSON.stringify({ error: 'Scoring failed. Please try again.' }) };
    }
});
