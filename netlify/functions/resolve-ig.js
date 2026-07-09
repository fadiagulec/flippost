require('./_error_reporter');
const { wrap: __wrapErr } = require('./_error_reporter');
// Netlify function: /resolve-ig
// Resolves a public Instagram reel/post URL to a DIRECT CDN video URL using
// Apify's instagram-scraper — the SAME cookie-free path (and APIFY_TOKEN) that
// /download and the Instagram Browse tab already use. The Transcribe and Scene
// Grabber "paste a link" flows call this first for IG links, then hand the
// plain CDN url to Railway. Railway's yt-dlp can't log in to Instagram, but it
// downloads a direct CDN file fine — so this makes IG work with no cookies.
// Returns: { videoUrl, filename }

const { isProRequest } = require('./_pro_verify');
const { enforceAiQuota, rateLimitResponse } = require('./_rate_limit');
const { assertPublicUrl } = require('./_ssrf_guard');

exports.handler = __wrapErr(async (event) => {
  const isPro = isProRequest(event);
  // Origin-allowlist CORS, mirroring download.js — this endpoint spends the
  // paid Apify token, so it must not be wildcard-callable from any site.
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
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  // Rate-limit gate: an IG resolve spends an Apify actor run, so it counts
  // against the same daily quota as a download (weighted the same way).
  const quota = await enforceAiQuota(event, isPro);
  if (!quota.allowed) return rateLimitResponse(headers, quota);

  let url;
  try {
    const body = JSON.parse(event.body || '{}');
    url = (body.url || '').trim();
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid request body' }) };
  }
  if (!url) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing url parameter' }) };
  if (!/instagram\.com|instagr\.am/i.test(url)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Not an Instagram URL' }) };
  }

  // SSRF gate (same as download.js): reject private/link-local/loopback and
  // DNS-rebinding before we hand the URL to any fetch.
  try {
    await assertPublicUrl(url);
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid or blocked URL' }) };
  }

  try {
    const v = await resolveInstagramVideo(url);
    if (v && v.videoUrl) {
      return { statusCode: 200, headers, body: JSON.stringify(v) };
    }
    return {
      statusCode: 400, headers,
      body: JSON.stringify({ error: 'No video found in that Instagram post — it may be image-only, a private account, or removed.' })
    };
  } catch (e) {
    console.log('resolve-ig failed:', e.message);
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'Instagram resolver is busy — try again in a moment.', detail: String(e && e.message || e) }) };
  }
});

// Mirror of download.js's tryApifyInstagram, trimmed to just the direct video
// URL (Reel or first video child of a carousel). No cookies required.
async function resolveInstagramVideo(url) {
  const apifyToken = process.env.APIFY_TOKEN;
  if (!apifyToken) throw new Error('APIFY_TOKEN not set');

  // Netlify Functions hard-cap at 26s; bound the Apify sync run at 18s + a 20s
  // client abort so a slow scrape aborts cleanly instead of killing the call.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const apifyUrl = 'https://api.apify.com/v2/acts/apify~instagram-scraper/run-sync-get-dataset-items?timeout=18';
    const resp = await fetch(apifyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apifyToken },
      body: JSON.stringify({
        directUrls: [url],
        resultsType: 'posts',
        resultsLimit: 1,
        addParentData: false,
        enhanceUserSearchWithFacebookPage: false
      }),
      signal: controller.signal
    });
    if (!resp.ok) {
      const errBody = await resp.text().catch(() => '');
      throw new Error('Apify status ' + resp.status + ' :: ' + errBody.slice(0, 200));
    }
    const raw = await resp.json();
    const item = Array.isArray(raw) ? raw[0] : null;
    if (!item) return null;

    const shortcode = (typeof item.shortCode === 'string' && item.shortCode) || 'instagram';
    const fnameBase = 'instagram_' + shortcode;

    // Reel / single video post.
    if (typeof item.videoUrl === 'string' && item.videoUrl.startsWith('http')) {
      return { videoUrl: item.videoUrl, filename: fnameBase + '.mp4' };
    }
    // Carousel: use the first child that actually has a video track.
    if (Array.isArray(item.childPosts)) {
      for (const cp of item.childPosts) {
        if (cp && typeof cp.videoUrl === 'string' && cp.videoUrl.startsWith('http')) {
          return { videoUrl: cp.videoUrl, filename: fnameBase + '.mp4' };
        }
      }
    }
    return null;
  } finally { clearTimeout(timeout); }
}
