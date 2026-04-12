// Netlify function: /download
// This endpoint is deprecated. Media download is now handled client-side
// by opening the original post URL directly (100% reliable).

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  return {
    statusCode: 410,
    headers,
    body: JSON.stringify({
      error: 'This endpoint has been retired. Media saving is now handled by opening the original post directly.'
    })
  };
};
