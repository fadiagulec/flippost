// Netlify function: /download
// Proxies media download requests through cobalt.tools API (and fallbacks)
// so the frontend can trigger actual file downloads.

const fetch = require('node-fetch');

const COBALT_ENDPOINTS = [
  'https://api.cobalt.tools/',
  'https://api.cobalt.tools/api/json',
  'https://co.wuk.sh/api/json'
];

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let url;
  try {
    const body = JSON.parse(event.body || '{}');
    url = (body.url || '').trim();
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid request body' }) };
  }

  if (!url) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing url parameter' }) };
  }

  // --- Try cobalt.tools API (multiple endpoints) ---
  for (const endpoint of COBALT_ENDPOINTS) {
    try {
      const result = await tryCobalt(endpoint, url);
      if (result) {
        return { statusCode: 200, headers, body: JSON.stringify(result) };
      }
    } catch (e) {
      console.log(`Cobalt endpoint ${endpoint} failed:`, e.message);
    }
  }

  // --- Fallback: TikTok via tikwm.com ---
  if (/tiktok\.com/i.test(url)) {
    try {
      const result = await tryTikwm(url);
      if (result) {
        return { statusCode: 200, headers, body: JSON.stringify(result) };
      }
    } catch (e) {
      console.log('TikWM fallback failed:', e.message);
    }
  }

  // --- All methods failed ---
  return {
    statusCode: 422,
    headers,
    body: JSON.stringify({
      error: 'Could not extract download link. Try saving directly from the app.',
      fallback: true
    })
  };
};

async function tryCobalt(endpoint, url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({ url, vQuality: 'max', filenamePattern: 'basic' }),
      signal: controller.signal
    });

    const data = await res.json();

    // cobalt v7+ response format
    if (data.url) {
      return { downloadUrl: data.url, filename: data.filename || null, source: 'cobalt' };
    }

    // cobalt legacy response format
    if (data.status === 'stream' || data.status === 'redirect') {
      const dlUrl = data.url || data.audio;
      if (dlUrl) {
        return { downloadUrl: dlUrl, filename: data.filename || null, source: 'cobalt' };
      }
    }

    // cobalt picker response (multiple items, e.g. carousel)
    if (data.status === 'picker' && data.picker && data.picker.length > 0) {
      return {
        downloadUrl: data.picker[0].url,
        picker: data.picker.map(p => ({ url: p.url, thumb: p.thumb })),
        filename: null,
        source: 'cobalt'
      };
    }

    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function tryTikwm(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const apiUrl = `https://www.tikwm.com/api/?url=${encodeURIComponent(url)}`;
    const res = await fetch(apiUrl, { signal: controller.signal });
    const data = await res.json();

    if (data.code === 0 && data.data) {
      // Prefer no-watermark video, fall back to watermarked
      const dlUrl = data.data.play || data.data.wmplay || data.data.hdplay;
      if (dlUrl) {
        return { downloadUrl: dlUrl, filename: null, source: 'tikwm' };
      }
    }

    return null;
  } finally {
    clearTimeout(timeout);
  }
}
