// Shared "write like a human" rules for every generative endpoint.
// NOT a Netlify function endpoint (filename starts with `_`), but Netlify
// bundles every .js in this directory, so it exports a benign handler too.
//
// WHY THIS EXISTS
// Default model output has a recognisable texture — em-dash pile-ups, the
// "it's not X, it's Y" flip, tidy rule-of-three lists, words like unlock /
// elevate / game-changer, and a neat summary line that bows everything off.
// Audiences on TikTok and Instagram clock that instantly, and a caption that
// reads as AI-written kills the trust the hook just earned.
//
// These rules are appended to the system prompt of anything that writes
// audience-facing copy (captions, hooks, scripts). Keep them here rather
// than duplicating per endpoint so the voice stays consistent everywhere.
//
// USAGE:
//   const { HUMAN_VOICE_RULES, humanVoiceFor } = require('./_human_voice');
//   const system = [ ...existingLines, HUMAN_VOICE_RULES ].join('\n');

'use strict';

// ── Core rules — apply to all audience-facing copy ───────────────────────
const HUMAN_VOICE_RULES = [
    '',
    'WRITE LIKE A PERSON, NOT LIKE AN AI. This is a hard requirement, not a',
    'stylistic preference — copy that reads as machine-written gets scrolled',
    'past, and the creator will not post it.',
    '',
    'NEVER use these. They are the tells that give AI writing away:',
    '- Em dashes as a rhythm device. Use a full stop, a comma, or start a new line.',
    '- The "it\'s not X, it\'s Y" flip, and its cousins ("this isn\'t a Z. it\'s a W.").',
    '- Rule-of-three lists where the items are the same length and shape',
    '  ("faster, cleaner, smarter" / "no fluff, no filler, no excuses").',
    '- Hype vocabulary: unlock, unleash, elevate, transform, supercharge,',
    '  game-changer, revolutionize, harness, leverage, seamless, robust,',
    '  empower, dive in, delve, navigate, tapestry, testament, realm.',
    '- Throat-clearing openers: "Here\'s the thing", "Let\'s be real",',
    '  "The truth is", "In today\'s world", "Ever wondered", "Picture this".',
    '- A closing line that summarises what you just said, or ties a bow on it',
    '  ("And that\'s how you..."). Stop at the last real point.',
    '- Decorative emoji sprinkled for texture (🚀 ✨ 💡 🔥 at line ends), and',
    '  one-emoji-per-line bullet lists.',
    '- Title Case On Ordinary Phrases.',
    '- Rhetorical questions as an opening line.',
    '',
    'DO write this way instead:',
    '- Uneven rhythm. Mix a long sentence with a three-word one. Fragments are fine.',
    '- Contractions everywhere a person would use them.',
    '- Concrete specifics pulled from the actual source — a real number, a real',
    '  product name, a real timeframe. Specific beats clever.',
    '- Say one thing per line. Let the reader connect them.',
    '- An aside in parentheses, or a mid-thought correction, where it sounds natural.',
    '- Plain words. If a shorter word works, it is the right word.',
    '- End on the sharpest line, even if it feels abrupt. Abrupt reads confident.',
    '',
    'Read your caption back before returning it. If it sounds like a brand',
    'account or a LinkedIn thought-leader, rewrite it in the voice of one',
    'person talking to one other person.'
].join('\n');

// ── Platform nuance ──────────────────────────────────────────────────────
// The rules above hold everywhere; casing and register do not. Lowercase
// reads native on TikTok and dismissive on LinkedIn.
const PLATFORM_VOICE = {
    tiktok:
        'TikTok: lowercase is native — do not capitalise every sentence unless the ' +
        'creator\'s own caption did. Write how someone talks to camera, mid-thought.',
    instagram:
        'Instagram: conversational, first person, light punctuation. Line breaks do ' +
        'the work that punctuation would. Sentence case, not Title Case.',
    youtube:
        'YouTube: plain and direct. The caption supports the video rather than ' +
        'performing on its own.',
    linkedin:
        'LinkedIn: still human, still contractions — but full sentence case and no ' +
        'slang. Earn credibility with one specific detail, not with adjectives. ' +
        'Avoid the one-line-per-paragraph "broetry" cadence; it reads as a template.',
    facebook:
        'Facebook: warm and story-led. Longer sentences are fine. Write it the way ' +
        'you would tell it to a friend.',
    x:
        'X: compressed. Every word carries weight. No hashtags unless one genuinely ' +
        'belongs. Lowercase is common and fine.',
    threads:
        'Threads: opinionated and casual, like a message you would actually send. ' +
        'Invite a reply by leaving something arguable, not by asking for comments.'
};

/**
 * Full voice block for a given platform.
 * @param {string} [platform]  'tiktok' | 'instagram' | 'linkedin' | ...
 * @returns {string}
 */
function humanVoiceFor(platform) {
    const key = String(platform || '').trim().toLowerCase();
    const nuance = PLATFORM_VOICE[key];
    return nuance ? HUMAN_VOICE_RULES + '\n\n' + nuance : HUMAN_VOICE_RULES;
}

// ── Hashtag rules ────────────────────────────────────────────────────────
// Generic hashtag walls (#viral #fyp #explore) are their own kind of tell,
// and they actively hurt reach on Instagram.
const HUMAN_HASHTAG_RULES = [
    'Hashtags: pick tags a real creator in this niche would actually use.',
    'Skip the dead generics — #viral, #fyp, #explorepage, #foryou, #trending,',
    '#instagood, #love — they signal spam and do not drive reach.',
    'Weight toward specific niche tags over broad ones; a few precise tags',
    'outperform a wall of vague ones.'
].join(' ');

module.exports = {
    HUMAN_VOICE_RULES,
    PLATFORM_VOICE,
    humanVoiceFor,
    HUMAN_HASHTAG_RULES,
    handler: async function handler() {
        return {
            statusCode: 404,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: 'Not found' })
        };
    }
};
