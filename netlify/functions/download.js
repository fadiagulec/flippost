// Netlify function: /download
// Reliable video download — uses Microlink API (best free option)
// Works great for YouTube. For Instagram/TikTok/X, these platforms
// block server-side extraction, so we provide direct links to save.

const fetch = require('node-fetch');

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

  const platform = detectPlatform(url);

  // Strategy 1: Microlink API — works reliably for YouTube and some others
  try {
    const result = await tryMicrolink(url);
    if (result) {
      return { statusCode: 200, headers, body: JSON.stringify({ ...result, source: 'microlink', platform }) };
    }
  } catch (e) {
    console.log('Microlink failed:', e.message);
  }

  // Strategy 2: Twitter syndication API — for X/Twitter videos
  if (platform === 'x') {
    try {
      const result = await tryTwitter(url);
      if (result) {
        return { statusCode: 200, headers, body: JSON.stringify({ ...result, source: 'twitter', platform }) };
      }
    } catch (e) {
      console.log('Twitter syndication failed:', e.message);
    }
  }

  // Strategy 3: OG video meta tags from page HTML
  try {
    const result = await tryOgVideo(url);
    if (result) {
      return { statusCode: 200, headers, body: JSON.stringify({ ...result, source: 'og-meta', platform }) };
    }
  } catch (e) {
    console.log('OG video failed:', e.message);
  }

  // No download found — return platform-specific save instructions
  const instructions = {
    instagram: 'Open the reel in Instagram app → tap ••• → Save → Video will save to your camera roll',
    tiktok: 'Open in TikTok app → tap Share arrow → tap "Save video"',
    youtube: 'Use YouTube app download button or YouTube Premium',
    x: 'Open in X app → tap Share → tap "Bookmark" or use screen recording',
    facebook: 'Open in Facebook app → tap ••• → Save video',
    linkedin: 'Open in LinkedIn app → tap ••• → Save',
    threads: 'Open in Threads app → tap Share → Save'
  };

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      downloadUrl: null,
      openUrl: url,
      platform,
      instruction: instructions[platform] || 'Open the post and use the app\'s built-in save option',
      source: 'manual'
    })
  };
};

function detectPlatform(url) {
  if (/instagram\.com|instagr\.am/i.test(url)) return 'instagram';
  if (/tiktok\.com|vm\.tiktok|vt\.tiktok/i.test(url)) return 'tiktok';
  if (/youtube\.com|youtu\.be/i.test(url)) return 'youtube';
  if (/twitter\.com|x\.com/i.test(url)) return 'x';
  if (/facebook\.com|fb\.watch/i.test(url)) return 'facebook';
  if (/linkedin\.com/i.test(url)) return 'linkedin';
  if (/threads\.net/i.test(url)) return 'threads';
  return 'other';
}

async function tryMicrolink(url) {
  const apiUrl = `https://api.microlink.io?url=${encodeURIComponent(url)}&video=true`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch(apiUrl, { signal: controller.signal });
    const data = await res.json();

    if (data.status === 'success' && data.data && data.data.video && data.data.video.url) {
      return { downloadUrl: data.data.video.url, filename: null };
    }
  } finally {
    clearTimeout(timeout);
  }
  return null;
}

async function tryTwitter(url) {
  const match = url.match(/status\/(\d+)/);
  if (!match) return null;

  const tweetId = match[1];
  // Try multiple syndication endpoints
  const endpoints = [
    `https://cdn.syndication.twimg.com/tweet-result?id=${tweetId}&lang=en&token=x`,
    `https://cdn.syndication.twimg.com/tweet-result?id=${tweetId}&token=a`
  ];

  for (const endpoint of endpoints) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const res = await fetch(endpoint, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        signal: controller.signal
      });
      clearTimeout(timeout);

      const text = await res.text();
      if (!text || text.startsWith('<!')) continue;

      const data = JSON.parse(text);

      if (data.mediaDetails) {
        for (const media of data.mediaDetails) {
          if (media.video_info && media.video_info.variants) {
            const mp4s = media.video_info.variants
              .filter(v => v.content_type === 'video/mp4')
              .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
            if (mp4s.length > 0) {
              return { downloadUrl: mp4s[0].url, filename: `twitter_${tweetId}.mp4` };
            }
          }
        }
      }
    } catch (e) {
      continue;
    }
  }
  return null;
}

async function tryOgVideo(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
        'Accept': 'text/html'
      },
      redirect: 'follow',
      signal: controller.signal
    });

    const html = await res.text();

    // Look for video in meta tags
    const patterns = [
      /property="og:video:secure_url"\s+content="([^"]+)"/,
      /content="([^"]+)"\s+property="og:video:secure_url"/,
      /property="og:video"\s+content="([^"]+)"/,
      /content="([^"]+)"\s+property="og:video"/,
      /name="twitter:player:stream"\s+content="([^"]+)"/
    ];

    for (const pattern of patterns) {
      const m = html.match(pattern);
      if (m && m[1] && m[1].startsWith('http') && (m[1].includes('.mp4') || m[1].includes('video'))) {
        return { downloadUrl: m[1].replace(/&amp;/g, '&'), filename: 'video.mp4' };
      }
    }
  } finally {
    clearTimeout(timeout);
  }
  return null;
}
