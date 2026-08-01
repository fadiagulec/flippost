require('./_error_reporter');
const { wrap: __wrapErr } = require('./_error_reporter');
// Netlify function: /profile-top
// Paste an Instagram profile/page link (or @handle) → returns that account's
// TOP 5 most-viral recent posts, ranked by likes + comments. Uses Apify's
// instagram-scraper the same cookie-free way as instagram-browse, but ASYNC
// (start + poll): the profile scrape takes ~30-40s, longer than a Netlify
// function can stay alive, which is why the synchronous browse 502s on bigger
// profiles. Same pattern as resolve-ig.js.
//   START: { url }              → { runId, datasetId }
//   POLL:  { runId, datasetId } → { posts:[...top5], account } | { status:'running' } | { error }
const { corsHeaders } = require('./_config');

const { isProRequest } = require('./_pro_verify');
const { enforceAiQuota, rateLimitResponse } = require('./_rate_limit');
const { assertPublicUrl } = require('./_ssrf_guard');

const APIFY_ACTOR = 'apify~instagram-scraper';
const SCRAPE_LIMIT = 36; // pull ~36 recent posts to rank from
const TOP_N = 6;         // top 6 by engagement + 6 most recent

exports.handler = __wrapErr(async (event) => {
  const isPro = isProRequest(event);
  const headers = corsHeaders(event, { methods: 'POST, OPTIONS' });
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  const apifyToken = process.env.APIFY_TOKEN;
  if (!apifyToken) {
    return { statusCode: 503, headers, body: JSON.stringify({ error: 'Profile lookup is not configured (missing APIFY_TOKEN).' }) };
  }

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid request body' }) }; }

  // ── POLL mode: { runId, datasetId } — cheap, NOT quota-gated ──
  if (body.runId) {
    try {
      const out = await pollRun(apifyToken, String(body.runId), String(body.datasetId || ''));
      return { statusCode: 200, headers, body: JSON.stringify(out) };
    } catch (e) {
      console.log('profile-top poll failed:', e.message);
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'Lost track of the lookup — please retry.' }) };
    }
  }

  // ── START mode: { url } — one Apify run = one quota hit ──
  const parsed = toProfile(String(body.url || ''));
  if (!parsed) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Paste an Instagram profile link or @handle (e.g. instagram.com/username).' }) };
  }
  if (parsed.notIG) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Instagram profiles are supported for now — paste an Instagram profile link or @handle.' }) };
  }
  if (parsed.isPost) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "That's a single post link — paste the profile/page link instead (e.g. instagram.com/username)." }) };
  }
  try {
    await assertPublicUrl(parsed.url);
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid or blocked URL' }) };
  }

  const quota = await enforceAiQuota(event, isPro);
  if (!quota.allowed) return rateLimitResponse(headers, quota);

  try {
    const started = await startRun(apifyToken, parsed.url);
    return { statusCode: 200, headers, body: JSON.stringify({ ...started, account: '@' + parsed.user }) };
  } catch (e) {
    console.log('profile-top start failed:', e.message);
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'Could not start the lookup — try again in a moment.' }) };
  }
});

// Normalize input → { user, url } for a profile, or { notIG } / { isPost } / null.
function toProfile(raw) {
  const q = (raw || '').trim();
  if (!q) return null;

  // @handle or bare handle
  const handle = q.match(/^@?([A-Za-z0-9._]{1,40})$/);
  if (handle) return { user: handle[1], url: 'https://www.instagram.com/' + handle[1] + '/' };

  // URL form
  if (/^https?:\/\//i.test(q)) {
    let u;
    try { u = new URL(q); } catch { return null; }
    if (u.username || u.password) return null; // reject basic-auth smuggling
    if (!/(?:^|\.)(instagram\.com|instagr\.am)$/i.test(u.hostname)) return { notIG: true };
    const seg = u.pathname.split('/').filter(Boolean);
    if (!seg.length) return null;
    const first = seg[0].toLowerCase();
    if (['p', 'reel', 'reels', 'tv', 'explore', 'stories', 's'].includes(first)) return { isPost: true };
    const user = seg[0].replace(/[^A-Za-z0-9._]/g, '');
    if (!user) return null;
    return { user, url: 'https://www.instagram.com/' + user + '/' };
  }
  return null;
}

// Kick off an async Apify run scraping the profile's recent posts.
async function startRun(apifyToken, profileUrl) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const runUrl = 'https://api.apify.com/v2/acts/' + APIFY_ACTOR + '/runs?timeout=120&memory=1024';
    const resp = await fetch(runUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apifyToken },
      body: JSON.stringify({
        directUrls: [profileUrl],
        resultsType: 'posts',
        resultsLimit: SCRAPE_LIMIT,
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

// Check the run. When SUCCEEDED, read the dataset, rank by engagement, return top 5.
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
      return { error: 'Could not read that profile — it may be private, mistyped, or have no public posts.' };
    }

    const dsId = datasetId || run.defaultDatasetId;
    if (!dsId) return { error: 'Lookup finished but returned nothing — try again.' };
    const dsResp = await fetch('https://api.apify.com/v2/datasets/' + encodeURIComponent(dsId) + '/items?clean=true&limit=50', {
      headers: { 'Authorization': 'Bearer ' + apifyToken },
      signal: controller.signal
    });
    if (!dsResp.ok) throw new Error('dataset status ' + dsResp.status);
    const items = await dsResp.json();
    if (!Array.isArray(items) || !items.length) {
      return { error: 'That profile returned no posts — it may be private or removed.' };
    }
    // The scraper returns an error record (not posts) when IG won't serve it.
    if (items[0] && (items[0].error || items[0].errorDescription) && !items[0].url && !items[0].shortCode) {
      const d = String(items[0].errorDescription || items[0].error || '').toLowerCase();
      if (d.includes('private')) return { error: 'That account is private, so its posts can’t be pulled.' };
      if (d.includes('not found') || d.includes('not exist')) return { error: 'Couldn’t find that profile — check the handle and try again.' };
      return { error: 'Instagram wouldn’t open that profile — try another public account.' };
    }

    const posts = items.map(normalizePost).filter(Boolean);
    if (!posts.length) return { error: 'No usable posts found on that profile.' };
    // Top by engagement (all-time within the scraped window)…
    const topViral = [...posts].sort((a, b) => (b.likes + b.comments) - (a.likes + a.comments)).slice(0, TOP_N);
    // …and the most recent, so the picture stays current/relevant.
    const mostRecent = [...posts].sort((a, b) => (b.ts || 0) - (a.ts || 0)).slice(0, TOP_N);
    return { posts: topViral, recent: mostRecent };
  } finally { clearTimeout(timeout); }
}

// Mirror of instagram-browse.js normalizeApifyPost — the fields the UI needs.
function normalizePost(item) {
  if (!item || typeof item !== 'object') return null;
  const url = typeof item.url === 'string' && item.url.startsWith('http')
    ? item.url
    : (typeof item.shortCode === 'string' ? 'https://www.instagram.com/p/' + item.shortCode + '/' : null);
  if (!url) return null;

  const thumbnail = typeof item.displayUrl === 'string' && item.displayUrl.startsWith('http')
    ? item.displayUrl
    : (Array.isArray(item.images) && typeof item.images[0] === 'string' && item.images[0].startsWith('http') ? item.images[0] : null);

  const rawCaption = typeof item.caption === 'string' ? item.caption : (typeof item.text === 'string' ? item.text : '');
  const owner = item.ownerUsername || item.owner || '';
  const type = String(item.type || '').toLowerCase();

  // Posted-at → epoch ms, for the "most recent" sort + a date label.
  let postedAt = null, ts = 0;
  if (typeof item.timestamp === 'string') { postedAt = item.timestamp; ts = Date.parse(item.timestamp) || 0; }
  else if (typeof item.takenAt === 'string') { postedAt = item.takenAt; ts = Date.parse(item.takenAt) || 0; }
  else if (typeof item.takenAtTimestamp === 'number' && item.takenAtTimestamp > 0) { ts = item.takenAtTimestamp * 1000; postedAt = new Date(ts).toISOString(); }

  return {
    url,
    thumbnail,
    caption: rawCaption.slice(0, 220),
    owner: owner ? '@' + String(owner).replace(/^@/, '') : '',
    likes: Number(item.likesCount || item.likes || 0) || 0,
    comments: Number(item.commentsCount || item.comments || 0) || 0,
    isVideo: type === 'video' || !!item.videoUrl,
    isCarousel: type === 'sidecar' || (Array.isArray(item.childPosts) && item.childPosts.length > 0),
    postedAt,
    ts
  };
}
