require('./_error_reporter');
const { wrap: __wrapErr } = require('./_error_reporter');
// Netlify function: /transcribe-async
// Thin proxy to Railway's ASYNC transcribe endpoints. The browser can't hold a
// long connection to Railway (or hits this proxy's ~24s cap) on long videos, so
// transcription now runs as a background job: START kicks it off, then the
// browser POLLs for the result. Both calls here are fast (<1-2s) — Railway
// spawns the work off-thread and returns immediately — so the cap is never hit.
//   START:  POST { url }    → { jobId, status:'running' }
//   POLL:   POST { jobId }  → { status:'running' } | { status:'done', result } | { status:'unknown', error }
const { corsHeaders, buildRailwayUrl, requireRailway } = require('./_config');

const RAILWAY = buildRailwayUrl("");

exports.handler = __wrapErr(async (event) => {
  const headers = corsHeaders(event, { methods: 'POST, OPTIONS' });

  // Self-hosted video backend is required for this endpoint. Returns a
  // clear 503 (instead of a confusing fetch error) when RAILWAY_URL is unset.
  const __noBackend = requireRailway(headers);
  if (__noBackend) return __noBackend;
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid request body' }) }; }

  // jobId present → poll the result; otherwise → start a new job.
  const isPoll = !!body.jobId;
  const target = RAILWAY + (isPoll ? '/transcribe-async/result' : '/transcribe-async/start');
  const payload = isPoll ? { jobId: String(body.jobId) } : { url: String(body.url || '') };

  try {
    const resp = await fetch(target, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(20000)
    });
    const text = await resp.text();
    // Pass Railway's JSON + status straight through.
    return { statusCode: resp.status, headers, body: text };
  } catch (e) {
    console.log('transcribe-async proxy failed:', e && e.message);
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'Transcribe service is unreachable — please try again.' }) };
  }
});
