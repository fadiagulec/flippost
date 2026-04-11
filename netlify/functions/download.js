const fetch = require('node-fetch');

const COBALT_INSTANCES = [
  'https://dwnld.nichlov.com/',
  'https://cobalt.eepy.cat/',
  'https://cobalt.api.lostluma.dev/',
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

  try {
    const { url } = JSON.parse(event.body || '{}');
    if (!url) return { statusCode: 400, headers, body: JSON.stringify({ error: 'URL required' }) };

    let lastError = null;

    for (const instance of COBALT_INSTANCES) {
      try {
        const res = await fetch(instance, {
          method: 'POST',
          headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
          body: JSON.stringify({ url }),
          timeout: 8000
        });

        const data = await res.json();

        // Skip dead/error responses
        if (data.status === 'error') {
          lastError = data.text || 'instance error';
          continue;
        }

        return { statusCode: 200, headers, body: JSON.stringify(data) };
      } catch (e) {
        lastError = e.message;
        continue;
      }
    }

    return { statusCode: 502, headers, body: JSON.stringify({ error: lastError || 'All instances failed' }) };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
