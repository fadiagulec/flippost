require('./_error_reporter');
const { wrap: __wrapErr } = require('./_error_reporter');
// Netlify function: /resolve-ig
// Resolves a public Instagram reel/post URL to a DIRECT CDN video URL using
// Apify's instagram-scraper — the SAME cookie-free path (and APIFY_TOKEN) the
// Download tab uses. Railway's yt-dlp can't log in to Instagram, but it fetches
// a direct CDN file fine, so this makes IG Transcribe / Scene Grabber work with
// no login cookies.
//
// The scraper actor needs ~30-40s (Docker cold-start + scrape), which is longer
// than a Netlify Function can stay alive (~26s). So we DON'T run it
// synchronously. Two modes, both fast:
//   START:  POST { url }                → kicks off an async Apify run,
//                                          returns { runId, datasetId }
//   POLL:   POST { runId, datasetId }   → checks the run; returns
//                                          { videoUrl } when done,
//                                          { status:'running' } meanwhile,
//                                          or { error } on failure.
// The browser starts once then polls every few seconds until it gets a URL.

const { isProRequest } = require('./_pro_verify');
const { enforceAiQuota, rateLimitResponse } = require('./_rate_limit');
const { assertPublicUrl } = require('./_ssrf_guard');

const APIFY_ACTOR = 'apify~instagram-scraper';

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

  const apifyToken = process.env.APIFY_TOKEN;
  if (!apifyToken) {
    return { statusCode: 503, headers, body: JSON.stringify({ error: 'Instagram support is not configured (missing APIFY_TOKEN).' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid request body' }) };
  }

  // ── POLL mode: { runId, datasetId } — cheap, NOT quota-gated ──
  if (body.runId) {
    try {
      const out = await pollRun(apifyToken, String(body.runId), String(body.datasetId || ''));
      return { statusCode: 200, headers, body: JSON.stringify(out) };
    } catch (e) {
      console.log('resolve-ig poll failed:', e.message);
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'Lost track of the Instagram fetch — please retry.' }) };
    }
  }

  // ── START mode: { url } — one Apify run = one quota hit ──
  const url = (body.url || '').trim();
  if (!url) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing url parameter' }) };
  if (!/instagram\.com|instagr\.am/i.test(url)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Not an Instagram URL' }) };
  }
  try {
    await assertPublicUrl(url);
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid or blocked URL' }) };
  }

  const quota = await enforceAiQuota(event, isPro);
  if (!quota.allowed) return rateLimitResponse(headers, quota);

  try {
    const started = await startRun(apifyToken, url);
    return { statusCode: 200, headers, body: JSON.stringify(started) };
  } catch (e) {
    console.log('resolve-ig start failed:', e.message);
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'Could not start the Instagram fetch — try again in a moment.' }) };
  }
});

// Kick off an async Apify actor run. Returns { runId, datasetId } immediately;
// the actor keeps running server-side while the browser polls.
async function startRun(apifyToken, url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    // timeout=120 caps the actor's own run time; memory keeps the cold-start
    // reasonable. This returns as soon as the run is CREATED, not finished.
    const runUrl = 'https://api.apify.com/v2/acts/' + APIFY_ACTOR + '/runs?timeout=120&memory=1024';
    const resp = await fetch(runUrl, {
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
      const t = await resp.text().catch(() => '');
      throw new Error('start status ' + resp.status + ' ' + t.slice(0, 120));
    }
    const j = await resp.json();
    const data = j && j.data;
    if (!data || !data.id) throw new Error('no run id in start response');
    return { runId: data.id, datasetId: data.defaultDatasetId || '', status: 'running' };
  } finally { clearTimeout(timeout); }
}

// Check a run. When it's SUCCEEDED, read the dataset and pull the direct video
// URL. While it's still going, report { status:'running' }. On any terminal
// failure, report a friendly { error }.
async function pollRun(apifyToken, runId, datasetId) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const runResp = await fetch('https://api.apify.com/v2/actor-runs/' + encodeURIComponent(runId), {
      headers: { 'Authorization': 'Bearer ' + apifyToken },
      signal: controller.signal
    });
    if (!runResp.ok) throw new Error('run status ' + runResp.status);
    const runJ = await runResp.json();
    const run = (runJ && runJ.data) || {};
    const status = run.status || 'UNKNOWN';

    if (status === 'READY' || status === 'RUNNING') return { status: 'running' };
    if (status !== 'SUCCEEDED') {
      return { error: 'Instagram could not fetch that video (it may be private, image-only, or removed).' };
    }

    // SUCCEEDED — read the one item from the dataset.
    const dsId = datasetId || run.defaultDatasetId;
    if (!dsId) return { error: 'Instagram fetch finished but returned nothing — try again.' };
    const dsResp = await fetch('https://api.apify.com/v2/datasets/' + encodeURIComponent(dsId) + '/items?clean=true&limit=1', {
      headers: { 'Authorization': 'Bearer ' + apifyToken },
      signal: controller.signal
    });
    if (!dsResp.ok) throw new Error('dataset status ' + dsResp.status);
    const items = await dsResp.json();
    const item = Array.isArray(items) ? items[0] : null;
    if (!item) return { error: 'That Instagram post returned no media — it may be private or removed.' };

    const shortcode = (typeof item.shortCode === 'string' && item.shortCode) || 'instagram';
    const fnameBase = 'instagram_' + shortcode;

    // Reel / single video post.
    if (typeof item.videoUrl === 'string' && item.videoUrl.startsWith('http')) {
      return { videoUrl: item.videoUrl, filename: fnameBase + '.mp4' };
    }
    // Carousel: first child that actually has a video track.
    if (Array.isArray(item.childPosts)) {
      for (const cp of item.childPosts) {
        if (cp && typeof cp.videoUrl === 'string' && cp.videoUrl.startsWith('http')) {
          return { videoUrl: cp.videoUrl, filename: fnameBase + '.mp4' };
        }
      }
    }
    return { error: 'No video found in that Instagram post — it may be image-only.' };
  } finally { clearTimeout(timeout); }
}
