// Netlify function: /download
// Multi-strategy media download with self-hosted Cobalt on Railway
// Priority: Cobalt (YouTube, Reddit, Pinterest, etc) → Twitter API → OG meta → Save instructions

const fetch = require('node-fetch');

// Your self-hosted Cobalt instance on Railway
const COBALT_URL = 'https://cobalt-api-production-4129.up.railway.app/';

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

  // Strategy 1: Cobalt API (self-hosted) — works for YouTube, Reddit, Pinterest, Vimeo, etc.
  try {
    const result = await tryCobalt(url);
    if (result) {
      return { statusCode: 200, headers, body: JSON.stringify({ ...result, source: 'cobalt', platform }) };
    }
  } catch (e) {
    console.log('Cobalt failed:', e.message);
  }

  // Strategy 2: Twitter syndication API — videos + images + carousels
  if (platform === 'x') {
    try {
      const result = await tryTwitter(url);
      if (result) {
        return { statusCode: 200, headers, body: JSON.stringify({ ...result, source: 'twitter', platform }) };
      }
    } catch (e) {
      console.log('Twitter failed:', e.message);
    }
  }

  // Strategy 3: Microlink — good for images and some videos
  try {
    const result = await tryMicrolink(url);
    if (result) {
      return { statusCode: 200, headers, body: JSON.stringify({ ...result, source: 'microlink', platform }) };
    }
  } catch (e) {
    console.log('Microlink failed:', e.message);
  }

  // Strategy 4: OG meta tags
  try {
    const result = await tryOgMeta(url);
    if (result) {
      return { statusCode: 200, headers, body: JSON.stringify({ ...result, source: 'og-meta', platform }) };
    }
  } catch (e) {
    console.log('OG meta failed:', e.message);
  }

  // Fallback: save instructions
  const instructions = {
    instagram: 'Open in Instagram app → tap ••• → Save. For carousels, swipe to each image and screenshot or "Save to Collection".',
    tiktok: 'Open in TikTok app → tap Share → "Save video". For photos, long-press → Save.',
    youtube: 'Use YouTube app download button (Premium) or save to Watch Later.',
    x: 'Open in X → tap image to fullscreen → long-press → "Save image". For videos, tap Share → Bookmark.',
    facebook: 'Open in Facebook app → tap ••• → Save video/photo.',
    linkedin: 'Open in LinkedIn → tap ••• → Save.',
    threads: 'Open in Threads → tap Share → Save.'
  };

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      downloadUrl: null,
      openUrl: url,
      platform,
      instruction: instructions[platform] || 'Open the post and use the built-in save option.',
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

// ── Cobalt API (self-hosted on Railway) ─────────────────────
async function tryCobalt(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);

  try {
    const res = await fetch(COBALT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({ url, videoQuality: 'max', filenameStyle: 'basic' }),
      signal: controller.signal
    });

    const data = await res.json();

    // Cobalt v11 "tunnel" response — returns a proxied download URL
    if (data.status === 'tunnel' && data.url) {
      return {
        downloadUrl: data.url,
        filename: data.filename || null,
        type: data.filename && data.filename.match(/\.(jpg|png|webp)/i) ? 'image' : 'video'
      };
    }

    // Cobalt "redirect" response — direct URL
    if (data.status === 'redirect' && data.url) {
      return {
        downloadUrl: data.url,
        filename: data.filename || null,
        type: data.filename && data.filename.match(/\.(jpg|png|webp)/i) ? 'image' : 'video'
      };
    }

    // Cobalt "stream" response
    if (data.status === 'stream' && data.url) {
      return {
        downloadUrl: data.url,
        filename: data.filename || null,
        type: 'video'
      };
    }

    // Cobalt "picker" response — carousel/multiple items
    if (data.status === 'picker' && data.picker && data.picker.length > 0) {
      const items = data.picker.map(p => ({
        url: p.url,
        type: p.type || (p.url.match(/\.(jpg|png|webp)/i) ? 'image' : 'video'),
        thumb: p.thumb || null
      }));

      return {
        downloadUrl: items[0].url,
        carousel: items,
        filename: data.filename || null,
        type: items[0].type,
        mediaCount: items.length
      };
    }

    // Error responses
    if (data.status === 'error') {
      console.log('Cobalt error:', data.error?.code || 'unknown');
      return null;
    }

    return null;
  } finally {
    clearTimeout(timeout);
  }
}

// ── Twitter syndication: videos + images + carousels ────────
async function tryTwitter(url) {
  const match = url.match(/status\/(\d+)/);
  if (!match) return null;

  const tweetId = match[1];
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

      if (data.mediaDetails && data.mediaDetails.length > 0) {
        if (data.mediaDetails.length > 1) {
          const images = [];
          for (const media of data.mediaDetails) {
            if (media.video_info && media.video_info.variants) {
              const mp4s = media.video_info.variants
                .filter(v => v.content_type === 'video/mp4')
                .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
              if (mp4s.length > 0) images.push({ url: mp4s[0].url, type: 'video' });
            } else if (media.media_url_https) {
              images.push({ url: media.media_url_https + '?name=large', type: 'image' });
            }
          }
          if (images.length > 0) {
            return { downloadUrl: images[0].url, carousel: images, filename: `twitter_${tweetId}`, type: images[0].type, mediaCount: images.length };
          }
        }

        const media = data.mediaDetails[0];
        if (media.video_info && media.video_info.variants) {
          const mp4s = media.video_info.variants.filter(v => v.content_type === 'video/mp4').sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
          if (mp4s.length > 0) return { downloadUrl: mp4s[0].url, filename: `twitter_${tweetId}.mp4`, type: 'video' };
        }
        if (media.media_url_https) {
          return { downloadUrl: media.media_url_https + '?name=large', filename: `twitter_${tweetId}.jpg`, type: 'image' };
        }
      }

      if (data.photos && data.photos.length > 0) {
        if (data.photos.length > 1) {
          const images = data.photos.map(p => ({ url: p.url + '?name=large', type: 'image' }));
          return { downloadUrl: images[0].url, carousel: images, filename: `twitter_${tweetId}`, type: 'image', mediaCount: images.length };
        }
        return { downloadUrl: data.photos[0].url + '?name=large', filename: `twitter_${tweetId}.jpg`, type: 'image' };
      }
    } catch (e) {
      continue;
    }
  }
  return null;
}

// ── Microlink API ───────────────────────────────────────────
async function tryMicrolink(url) {
  const apiUrl = `https://api.microlink.io?url=${encodeURIComponent(url)}&video=true`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch(apiUrl, { signal: controller.signal });
    const data = await res.json();

    if (data.status === 'success' && data.data) {
      if (data.data.video && data.data.video.url) {
        return { downloadUrl: data.data.video.url, filename: null, type: 'video' };
      }
      if (data.data.image && data.data.image.url && !data.data.image.url.startsWith('data:') && data.data.image.url.startsWith('http')) {
        const w = data.data.image.width || 999;
        const h = data.data.image.height || 999;
        if (w > 200 && h > 200) {
          return { downloadUrl: data.data.image.url, filename: null, type: 'image' };
        }
      }
    }
  } finally {
    clearTimeout(timeout);
  }
  return null;
}

// ── OG meta tags ────────────────────────────────────────────
async function tryOgMeta(url) {
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

    const videoPatterns = [
      /property="og:video:secure_url"\s+content="([^"]+)"/,
      /content="([^"]+)"\s+property="og:video:secure_url"/,
      /property="og:video"\s+content="([^"]+)"/,
      /content="([^"]+)"\s+property="og:video"/
    ];

    for (const pattern of videoPatterns) {
      const m = html.match(pattern);
      if (m && m[1] && m[1].startsWith('http') && !m[1].includes('embed')) {
        return { downloadUrl: m[1].replace(/&amp;/g, '&'), filename: 'video.mp4', type: 'video' };
      }
    }

    const imagePatterns = [
      /property="og:image"\s+content="([^"]+)"/,
      /content="([^"]+)"\s+property="og:image"/,
      /name="twitter:image"\s+content="([^"]+)"/
    ];

    for (const pattern of imagePatterns) {
      const m = html.match(pattern);
      if (m && m[1] && m[1].startsWith('http') && !m[1].startsWith('data:')) {
        return { downloadUrl: m[1].replace(/&amp;/g, '&'), filename: 'image.jpg', type: 'image' };
      }
    }
  } finally {
    clearTimeout(timeout);
  }
  return null;
}
