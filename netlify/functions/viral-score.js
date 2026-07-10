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

// Forced tool-use gives us a GUARANTEED-valid structured object from Claude.
// The old approach parsed free-text JSON, which broke intermittently once the
// `rewrite` field carried real line breaks (unescaped newlines → JSON.parse
// throws → 500). Tool-use has the API validate the shape for us — no parsing.
const SCORECARD_TOOL = {
    name: 'scorecard',
    description: 'Return the viral scorecard for the post, plus specific fixes, stronger hooks, a best caption + alternatives, and recommended hashtags.',
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
            hooks: { type: 'array', items: { type: 'string' }, description: '3 alternative FIRST-LINE hooks, each a scroll-stopper strong enough to score 10/10 on hook strength; vary the angle (curiosity gap, bold claim, relatable pain)' },
            rewrite: { type: 'string', description: 'the single BEST full caption, rewritten to score 9-10, ready to paste (line breaks and hashtags included)' },
            altCaptions: { type: 'array', items: { type: 'string' }, description: '2 alternative full captions, each a DIFFERENT angle from the rewrite; keep each tight (~60-90 words)' },
            recommendedHashtags: { type: 'array', items: { type: 'string' }, description: '10-14 hashtags to actually use — a mix of broad-reach, niche, and branded; each WITHOUT the leading #' }
        },
        required: ['score', 'verdict', 'summary', 'dimensions', 'fixes', 'hooks', 'rewrite', 'altCaptions', 'recommendedHashtags']
    }
};

exports.handler = __wrapErr(async function (event) {
    const isPro = isProRequest(event);
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

    const systemPrompt = [
        "You are a viral content strategist who scores social-media posts BEFORE they're published.",
        "You produce a specific, actionable scorecard — not generic advice.",
        "You score each dimension from 0–100 based on what's in the caption, NOT on what's missing from the question. If the caption has no clear CTA, that's a low CTA score.",
        "",
        "Return your result by calling the `scorecard` tool. Fill EVERY field.",
        "",
        "Dimensions you MUST score (use these exact keys): hook, emotion, cta, hashtags, shareability, platform_fit.",
        "",
        "Per-dimension rubric:",
        "- hook: First 1-2 lines. Does it stop the scroll? Specificity, pattern interrupt, curiosity gap. 80+ = a great hook.",
        "- emotion: What feeling does it trigger? Awe, relief, FOMO, identity-resonance score high; bland/informational scores low.",
        "- cta: Is there a clear action and friction-free path? 'Comment APP for link' scores higher than 'check it out'.",
        "- hashtags: Mix of broad + niche + branded. Too few or all-broad = low. None given when platform expects them = low.",
        "- shareability: Would someone DM or repost this? Identity-statements, lists, before/after, controversial-but-true frames score high.",
        "- platform_fit: Does the format/tone/length match the platform's norms (Instagram caption length, TikTok hook urgency, LinkedIn POV, etc.)?",
        "",
        "fixes: 3-5 highest-leverage, SPECIFIC changes — write the actual replacement words, not advice. 'Open with: \"I quit my $200k job — here's the math\"' NOT 'improve the hook'. Target the lowest-scoring dimensions first.",
        "hooks: 3 alternative FIRST-LINE hooks (opening line only), each a scroll-stopper that would score 10/10 on hook strength. Vary the angle — one curiosity gap, one bold claim/number, one relatable pain.",
        "rewrite: the single BEST full caption — rewrite the ENTIRE post applying every fix so it would genuinely score 9-10 (aim for a 10). Keep the creator's topic and meaning; upgrade the hook, structure, CTA, and hashtags. Ready-to-post text with line breaks. Keep it TIGHT — under ~120 words (longer only if the original is a long spoken script).",
        "altCaptions: 2 alternative full captions, each taking a DIFFERENT angle than the rewrite (e.g. story-led, list-led, contrarian). Keep each tight (~60-90 words), ready to paste.",
        "recommendedHashtags: 10-14 hashtags the creator should actually use — a mix of broad-reach, niche, and branded. No spaces; no leading # needed.",
        "If a <brand_voice> is given, write the hooks, rewrite, and altCaptions in THAT voice.",
        "",
        "Be fast and economical with words: keep each dimension 'comment' to ONE short sentence. Be honest — a truly mid post gets a 4 or 5, not a participation-trophy 7."
    ].join('\n');

    const userPrompt = [
        `Score this ${platform} post.`,
        '',
        '<caption>',
        caption,
        '</caption>',
        hashtags ? '\n<hashtags>\n' + hashtags + '\n</hashtags>' : '',
        voiceContext ? '\n<brand_voice>\n' + voiceContext + '\n</brand_voice>\nWrite the "rewrite" (and the wording inside "fixes") in THIS brand voice — match its tone, vocabulary, and personality so it sounds like this specific creator. Keep the scoring itself objective.' : '',
        '',
        'Score it now and call the scorecard tool — include the fixes, 3 stronger hooks, the best caption ("rewrite") plus 2 alternatives, and recommended hashtags.'
    ].filter(Boolean).join('\n');

    try {
        const resp = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: 'claude-sonnet-4-6',
                max_tokens: 3200,
                temperature: 0.4,
                system: systemPrompt,
                tools: [SCORECARD_TOOL],
                tool_choice: { type: 'tool', name: 'scorecard' },
                messages: [{ role: 'user', content: userPrompt }]
            }),
            signal: AbortSignal.timeout(25000)
        });
        const data = await resp.json();
        if (!resp.ok) {
            console.error('viral-score Claude error:', resp.status, data?.error?.message);
            return { statusCode: 502, headers, body: JSON.stringify({ error: 'Scoring failed. Please try again.' }) };
        }
        // Forced tool-use → the structured object is already valid JSON in the
        // tool_use block's `input`. No text parsing, no newline-escaping bugs.
        const toolUse = Array.isArray(data.content)
            ? data.content.find(c => c && c.type === 'tool_use' && c.name === 'scorecard')
            : null;
        const parsed = (toolUse && toolUse.input) || {};
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
        const hooks = Array.isArray(parsed.hooks)
            ? parsed.hooks.filter(x => typeof x === 'string' && x.trim()).slice(0, 4).map(s => s.trim().slice(0, 300))
            : [];
        const altCaptions = Array.isArray(parsed.altCaptions)
            ? parsed.altCaptions.filter(x => typeof x === 'string' && x.trim()).slice(0, 3).map(s => s.trim().slice(0, 2000))
            : [];
        const recommendedHashtags = Array.isArray(parsed.recommendedHashtags)
            ? parsed.recommendedHashtags.filter(x => typeof x === 'string' && x.trim()).slice(0, 20).map(s => '#' + s.trim().replace(/^#+/, '').replace(/\s+/g, '').slice(0, 60))
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
