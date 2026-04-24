exports.handler = async function(event) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };

  let body;
  try { body = JSON.parse(event.body); } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const { url } = body;
  if (!url) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing url' }) };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { statusCode: 503, headers, body: JSON.stringify({ error: 'API key not configured.' }) };
  }

  // Step 1: Fetch the URL and extract text
  let originalText = '';

  // Some platforms block server-side fetching
  const blocked = ['instagram.com', 'tiktok.com', 'facebook.com', 'fb.com', 'fb.watch'];
  const isBlocked = blocked.some(d => url.includes(d));

  if (isBlocked) {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        original: null,
        twisted: null,
        prompt: null,
        warning: 'This platform blocks server-side access. Please copy the caption/script and use the Script Rewrite tab instead.'
      })
    };
  }

  try {
    const fetchResp = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(10000)
    });

    if (!fetchResp.ok) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          original: null, twisted: null, prompt: null,
          warning: `Could not fetch page (status ${fetchResp.status}). Try pasting the text in the Script Rewrite tab.`
        })
      };
    }

    const html = await fetchResp.text();

    // Extract text from HTML
    originalText = html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
      .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
      .replace(/<header[\s\S]*?<\/header>/gi, ' ')
      .replace(/<aside[\s\S]*?<\/aside>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (originalText.length > 3000) {
      originalText = originalText.substring(0, 3000) + '...';
    }

    if (originalText.length < 50) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          original: null, twisted: null, prompt: null,
          warning: 'Could not extract enough text from this page. Try the Script Rewrite tab instead.'
        })
      };
    }

  } catch (err) {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        original: null, twisted: null, prompt: null,
        warning: 'Could not reach this URL. Try pasting the text in the Script Rewrite tab.'
      })
    };
  }

  // Step 2: Use Claude to flip the script
  try {
    const aiResp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        system: 'You are a viral content strategist. You take existing social media content and rewrite it with a fresh, viral angle. Add a scroll-stopping hook, improve the structure, and make it more engaging. Keep the core message but make it irresistible to watch/read.',
        messages: [{
          role: 'user',
          content: `Here is a social media post/script extracted from a URL. Rewrite it with a viral angle:\n\n---\n${originalText}\n---\n\nProvide:\n1. A rewritten viral version\n2. A proven hook line to start with`
        }]
      }),
      signal: AbortSignal.timeout(60000)
    });

    const aiData = await aiResp.json();

    if (!aiResp.ok) {
      return { statusCode: aiResp.status, headers, body: JSON.stringify({ error: aiData.error?.message || 'AI processing failed' }) };
    }

    const aiText = aiData.content?.[0]?.text || '';

    // Try to split response into twisted version and hook
    let twisted = aiText;
    let prompt = null;

    const hookMatch = aiText.match(/(?:hook|Hook|HOOK)[:\s]*(.+?)(?:\n\n|$)/s);
    if (hookMatch) {
      prompt = hookMatch[1].trim();
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        original: originalText,
        twisted: twisted,
        prompt: prompt
      })
    };

  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'AI processing failed: ' + err.message }) };
  }
};
